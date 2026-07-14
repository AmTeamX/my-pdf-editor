package handler

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/my-pdf-editor/backend/internal/database"
	"github.com/my-pdf-editor/backend/internal/models"
)

type HighlightHandler struct {
	db database.Database
}

func NewHighlightHandler(db database.Database) *HighlightHandler {
	return &HighlightHandler{db: db}
}

func (h *HighlightHandler) GetHighlights(w http.ResponseWriter, r *http.Request) {
	pdfID := chi.URLParam(r, "id")
	highlights, err := h.db.GetHighlightsByPDFID(pdfID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get highlights", err)
		return
	}
	if highlights == nil {
		highlights = []models.Highlight{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"highlights": highlights})
}

func (h *HighlightHandler) SaveHighlights(w http.ResponseWriter, r *http.Request) {
	pdfID := chi.URLParam(r, "id")
	pdf, err := h.db.GetPDFByID(pdfID)
	if err != nil || pdf == nil {
		writeError(w, http.StatusNotFound, "PDF not found", err)
		return
	}

	var req models.SaveHighlightsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON body", err)
		return
	}

	for i := range req.Highlights {
		hl := &req.Highlights[i]
		if len(hl.Rects) == 0 && hl.TextToHighlight != "" {
			rects, err := resolveTextToRects(pdf.ConvertedContent, hl.PageNumber, hl.TextToHighlight, hl.Occurrence)
			if err != nil {
				writeError(w, http.StatusBadRequest,
					fmt.Sprintf("Cannot resolve text '%s' on page %d: %v", hl.TextToHighlight, hl.PageNumber, err), err)
				return
			}
			hl.Rects = rects
			if hl.SelectedText == "" {
				hl.SelectedText = hl.TextToHighlight
			}
		}
	}

	if err := h.db.ReplaceHighlights(pdfID, req.Highlights); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save highlights", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Highlights saved"})
}

func resolveTextToRects(contentJSON string, pageNumber int, textToFind string, occurrence int) ([]models.HighlightRect, error) {
	if contentJSON == "" {
		return nil, fmt.Errorf("PDF not converted yet — POST /api/pdfs/{id}/convert first")
	}
	if occurrence <= 0 {
		occurrence = 1
	}

	var doc models.ConvertedDocument
	if err := json.Unmarshal([]byte(contentJSON), &doc); err != nil {
		return nil, fmt.Errorf("invalid content JSON: %w", err)
	}

	searchLower := strings.ToLower(strings.TrimSpace(textToFind))

	type match struct {
		block models.ContentBlock
	}
	var matches []match

	for _, block := range doc.Blocks {
		if block.PageNumber != pageNumber {
			continue
		}
		if strings.Contains(strings.ToLower(block.Content), searchLower) {
			matches = append(matches, match{block: block})
		}
	}

	if len(matches) == 0 {
		// Fuzzy: try first few words
		words := strings.Fields(searchLower)
		if len(words) > 2 {
			partial := strings.Join(words[:min(3, len(words))], " ")
			for _, block := range doc.Blocks {
				if block.PageNumber == pageNumber && strings.Contains(strings.ToLower(block.Content), partial) {
					matches = append(matches, match{block: block})
				}
			}
		}
	}

	if len(matches) == 0 {
		// Full-page fallback for OCR content
		if hasOCRContent(doc.Blocks, pageNumber) {
			return fullPageHighlight(doc, pageNumber), nil
		}
		return nil, fmt.Errorf("text not found on page %d", pageNumber)
	}

	idx := occurrence - 1
	if idx >= len(matches) {
		return nil, fmt.Errorf("occurrence %d not found (%d matches on page %d)", occurrence, len(matches), pageNumber)
	}

	matched := matches[idx].block
	if len(matched.BoundingBox) != 4 {
		return fullPageHighlight(doc, pageNumber), nil
	}

	pageHeight := doc.PageHeight
	if pageHeight <= 0 {
		pageHeight = 842
	}

	bbox := matched.BoundingBox
	pad := 4.0
	left := bbox[0] - pad
	bottom := bbox[1]
	right := bbox[2] + pad
	top := bbox[3]

	rect := models.HighlightRect{
		Top:    math.Max(0, pageHeight-top-pad),
		Left:   math.Max(0, left),
		Width:  right - left,
		Height: top - bottom + pad*2,
	}
	return []models.HighlightRect{rect}, nil
}

func hasOCRContent(blocks []models.ContentBlock, pageNumber int) bool {
	for _, b := range blocks {
		if b.PageNumber == pageNumber && b.Content != "" {
			return true
		}
	}
	return false
}

func fullPageHighlight(doc models.ConvertedDocument, pageNumber int) []models.HighlightRect {
	ph := doc.PageHeight
	pw := doc.PageWidth
	if ph <= 0 {
		ph = 842
	}
	if pw <= 0 {
		pw = 595
	}
	margin := 20.0
	return []models.HighlightRect{{
		Top:    margin,
		Left:   margin,
		Width:  pw - margin*2,
		Height: ph - margin*2,
	}}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
