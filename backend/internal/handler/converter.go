package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/my-pdf-editor/backend/internal/config"
	"github.com/my-pdf-editor/backend/internal/database"
	"github.com/my-pdf-editor/backend/internal/models"
)

var cloger = log.New(os.Stderr, "[converter] ", log.LstdFlags)

type ConverterHandler struct {
	db              database.Database
	cfg             *config.Config
	converterStdURL string
	converterHybURL string
	typhoonOCRURL   string
	typhoonAPIKey   string
}

func NewConverterHandler(db database.Database, cfg *config.Config) *ConverterHandler {
	stdURL := os.Getenv("CONVERTER_STD_URL")
	if stdURL == "" {
		stdURL = "http://localhost:8000"
	}
	hybURL := os.Getenv("CONVERTER_HYB_URL")
	if hybURL == "" {
		hybURL = "http://localhost:5002"
	}
	return &ConverterHandler{
		db: db, cfg: cfg,
		converterStdURL: stdURL,
		converterHybURL: hybURL,
		typhoonOCRURL:   os.Getenv("TYPHOON_OCR_URL"),
		typhoonAPIKey:   os.Getenv("TYPHOON_API_KEY"),
	}
}

func (h *ConverterHandler) ConvertPDF(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	pdf, err := h.db.GetPDFByID(id)
	if err != nil || pdf == nil {
		writeError(w, http.StatusNotFound, "PDF not found", nil)
		return
	}

	pdfPath := h.resolvePDFPath(pdf)
	if pdfPath == "" {
		writeError(w, http.StatusBadRequest, "No file available for conversion", nil)
		return
	}

	// Step 1: Standard converter (auto-wraps images as PDF)
	blocks, engine := h.callConverterHTTP(h.converterStdURL, pdfPath, "standard")

	// Step 2: Hybrid converter
	if engine == "" {
		cloger.Printf("standard insufficient, trying hybrid...")
		blocks, engine = h.callConverterHybrid(pdfPath)
	}

	// Step 3: Typhoon OCR
	if engine == "" && h.typhoonOCRURL != "" {
		cloger.Printf("converters insufficient, trying Typhoon OCR...")
		blocks, engine = h.tryTyphoonOCR(pdfPath)
	}

	if engine == "" {
		writeError(w, http.StatusInternalServerError, "Failed to extract content — all converters failed", nil)
		return
	}

	contentJSON, _ := json.Marshal(blocks)
	h.db.UpdatePDFContent(id, string(contentJSON))
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":      "PDF converted",
		"total_blocks": blocks["total_blocks"],
		"engine":       engine,
	})
}

func (h *ConverterHandler) GetContent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	pdf, err := h.db.GetPDFByID(id)
	if err != nil || pdf == nil {
		writeError(w, http.StatusNotFound, "PDF not found", nil)
		return
	}
	if pdf.ConvertedContent == "" {
		writeJSON(w, http.StatusOK, map[string]interface{}{"converted": false, "message": "Not converted yet"})
		return
	}
	var content interface{}
	json.Unmarshal([]byte(pdf.ConvertedContent), &content)
	writeJSON(w, http.StatusOK, content)
}

func (h *ConverterHandler) resolvePDFPath(pdf *models.PDF) string {
	if pdf.SourceType == "upload" && pdf.FilePath != "" {
		absPath, _ := filepath.Abs(filepath.Join(h.cfg.UploadDir, pdf.FilePath))
		return absPath
	}
	if pdf.SourceType == "url" && pdf.ExternalURL != "" {
		return pdf.ExternalURL
	}
	return ""
}

// callConverterHTTP calls a converter HTTP endpoint.
func (h *ConverterHandler) callConverterHTTP(url, pdfPath, mode string) (map[string]interface{}, string) {
	reqBody, _ := json.Marshal(map[string]string{"pdf_path": pdfPath})
	resp, err := http.Post(url+"/convert", "application/json", strings.NewReader(string(reqBody)))
	if err != nil {
		cloger.Printf("converter %s unreachable: %v", mode, err)
		return nil, ""
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		cloger.Printf("converter %s returned %d", mode, resp.StatusCode)
		return nil, ""
	}

	var result struct {
		TotalBlocks int `json:"total_blocks"`
		Blocks      []struct {
			Type        string    `json:"type"`
			Content     string    `json:"content"`
			PageNumber  int       `json:"page_number"`
			BoundingBox []float64 `json:"bounding_box"`
		} `json:"blocks"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		cloger.Printf("converter %s parse: %v", mode, err)
		return nil, ""
	}

	if !assessQuality(result.TotalBlocks, result.Blocks) {
		return nil, ""
	}

	blocks := []map[string]interface{}{}
	for _, b := range result.Blocks {
		blocks = append(blocks, map[string]interface{}{
			"type": b.Type, "page_number": b.PageNumber,
			"bounding_box": b.BoundingBox, "content": b.Content,
		})
	}
	return map[string]interface{}{
		"total_blocks": len(blocks), "page_width": 612, "page_height": 792,
		"blocks": blocks, "engine": "opendataloader",
	}, "opendataloader"
}

// callConverterHybrid sends the file to the hybrid converter (opendataloader-pdf-hybrid).
func (h *ConverterHandler) callConverterHybrid(pdfPath string) (map[string]interface{}, string) {
	file, err := os.Open(pdfPath)
	if err != nil {
		cloger.Printf("hybrid: cannot open: %v", err)
		return nil, ""
	}
	defer file.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, _ := writer.CreateFormFile("files", filepath.Base(pdfPath))
	io.Copy(part, file)
	writer.Close()

	client := &http.Client{Timeout: 120 * time.Second}

	resp, err := client.Post(h.converterHybURL+"/v1/convert/file", writer.FormDataContentType(), &body)
	if err != nil {
		cloger.Printf("hybrid unreachable: %v", err)
		return nil, ""
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		cloger.Printf("hybrid returned %d", resp.StatusCode)
		return nil, ""
	}

	// Hybrid returns {status, document: {json_content: <opendataloader tree>}}
	var hybridResp struct {
		Status   string `json:"status"`
		Document struct {
			JSONContent json.RawMessage `json:"json_content"`
		} `json:"document"`
	}
	if err := json.Unmarshal(respBody, &hybridResp); err != nil {
		cloger.Printf("hybrid parse: %v", err)
		return nil, ""
	}

	if hybridResp.Document.JSONContent == nil {
		cloger.Printf("hybrid: no json_content in response")
		return nil, ""
	}

	// Flatten opendataloader tree
	blocks := flattenFromHybrid(hybridResp.Document.JSONContent)
	if len(blocks) == 0 {
		cloger.Printf("hybrid: 0 blocks after flattening")
		return nil, ""
	}

	cloger.Printf("hybrid: %d blocks extracted", len(blocks))
	return map[string]interface{}{
		"total_blocks": len(blocks), "page_width": 612, "page_height": 792,
		"blocks": blocks, "engine": "opendataloader-hybrid",
	}, "opendataloader-hybrid"
}

func flattenFromHybrid(data []byte) []map[string]interface{} {
	var blocks []map[string]interface{}
	var raw interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil
	}
	flatten(raw, 0, &blocks)
	return blocks
}

func flatten(node interface{}, pageNum int, blocks *[]map[string]interface{}) {
	switch n := node.(type) {
	case []interface{}:
		for _, item := range n {
			flatten(item, pageNum, blocks)
		}
	case map[string]interface{}:
		if pn, ok := n["page number"].(float64); ok {
			pageNum = int(pn)
		}
		for _, key := range []string{"kids", "children", "elements"} {
			if v, ok := n[key]; ok {
				flatten(v, pageNum, blocks)
			}
		}
		t, _ := n["type"].(string)
		c, _ := n["content"].(string)
		if c != "" && t != "" && t != "page" && t != "document" {
			var bb []float64
			if bv, ok := n["bounding box"].([]interface{}); ok {
				for _, v := range bv {
					if fv, ok := v.(float64); ok {
						bb = append(bb, fv)
					}
				}
			}
			*blocks = append(*blocks, map[string]interface{}{
				"type": t, "page_number": pageNum, "bounding_box": bb, "content": c,
			})
		}
	}
}

// tryTyphoonOCR calls the Typhoon OCR HTTP service.
func (h *ConverterHandler) tryTyphoonOCR(pdfPath string) (map[string]interface{}, string) {
	reqBody, _ := json.Marshal(map[string]interface{}{"pdf_path": pdfPath, "language": "auto"})
	req, _ := http.NewRequest("POST", h.typhoonOCRURL+"/ocr", strings.NewReader(string(reqBody)))
	req.Header.Set("Content-Type", "application/json")
	if h.typhoonAPIKey != "" {
		req.Header.Set("X-API-Key", h.typhoonAPIKey)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		cloger.Printf("typhoon OCR unreachable: %v", err)
		return nil, ""
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, ""
	}
	var ocrResp struct {
		TotalPages int `json:"total_pages"`
		Pages      []struct {
			PageNumber  int    `json:"page_number"`
			Content     string `json:"content"`
			RawMarkdown string `json:"raw_markdown"`
		} `json:"pages"`
	}
	if err := json.Unmarshal(body, &ocrResp); err != nil {
		return nil, ""
	}
	blocks := []map[string]interface{}{}
	for _, page := range ocrResp.Pages {
		blocks = append(blocks, map[string]interface{}{
			"type": "ocr_text", "page_number": page.PageNumber, "content": page.RawMarkdown,
		})
	}
	return map[string]interface{}{
		"total_blocks": len(blocks), "page_width": 595, "page_height": 842,
		"blocks": blocks, "ocr_engine": "typhoon-ocr",
	}, "typhoon-ocr"
}

func assessQuality(totalBlocks int, blocks []struct {
	Type        string    `json:"type"`
	Content     string    `json:"content"`
	PageNumber  int       `json:"page_number"`
	BoundingBox []float64 `json:"bounding_box"`
}) bool {
	if totalBlocks == 0 {
		return false
	}
	meaningful, totalChars, hasBboxes := 0, 0, 0
	for _, b := range blocks {
		totalChars += len(b.Content)
		if len(b.Content) > 20 && b.Type != "caption" {
			meaningful++
		}
		if len(b.BoundingBox) == 4 {
			hasBboxes++
		}
	}
	return (meaningful >= 8 && totalChars >= 500 && hasBboxes >= 4) ||
		(meaningful >= 5 && totalChars >= 300)
}
