package handler

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/my-pdf-editor/backend/internal/config"
	"github.com/my-pdf-editor/backend/internal/database"
	"github.com/my-pdf-editor/backend/internal/models"
)

type PDFHandler struct {
	db      database.Database
	cfg     *config.Config
	storage *Storage
}

func NewPDFHandler(db database.Database, cfg *config.Config) *PDFHandler {
	storage, err := NewStorage(cfg.UploadDir)
	if err != nil {
		log.Printf("Storage init failed (falling back to local): %v", err)
		os.MkdirAll(cfg.UploadDir, 0755)
		storage = &Storage{useMinIO: false, baseDir: cfg.UploadDir}
	}
	return &PDFHandler{db: db, cfg: cfg, storage: storage}
}

func (h *PDFHandler) ListPDFs(w http.ResponseWriter, r *http.Request) {
	pdfs, err := h.db.ListPDFs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to list PDFs", err)
		return
	}
	if pdfs == nil {
		pdfs = []models.PDF{}
	}
	writeJSON(w, http.StatusOK, pdfs)
}

func (h *PDFHandler) GetPDF(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	pdf, err := h.db.GetPDFByID(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get PDF", err)
		return
	}
	if pdf == nil {
		writeError(w, http.StatusNotFound, "PDF not found", nil)
		return
	}
	writeJSON(w, http.StatusOK, pdf)
}

func (h *PDFHandler) UploadPDF(w http.ResponseWriter, r *http.Request) {
	contentType := r.Header.Get("Content-Type")
	if len(contentType) >= 16 && contentType[:16] == "application/json" {
		h.registerExternalPDF(w, r)
		return
	}
	h.uploadFile(w, r)
}

func (h *PDFHandler) registerExternalPDF(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	defer r.Body.Close()
	var req models.PDFUploadRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON body", err)
		return
	}
	if req.Filename == "" || req.ExternalURL == "" {
		writeError(w, http.StatusBadRequest, "filename and external_url are required", nil)
		return
	}
	pdf := &models.PDF{
		ID:          uuid.New().String(),
		Filename:    req.Filename,
		ExternalURL: req.ExternalURL,
		PageCount:   req.PageCount,
		SourceType:  "url",
	}
	if err := h.db.CreatePDF(pdf); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save PDF record", err)
		return
	}
	writeJSON(w, http.StatusCreated, pdf)
}

func (h *PDFHandler) uploadFile(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 50<<20)
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "File too large (max 50MB)", err)
		return
	}
	file, header, err := r.FormFile("pdfFile")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Missing 'pdfFile' field", err)
		return
	}
	defer file.Close()

	if filepath.Ext(header.Filename) != ".pdf" {
		writeError(w, http.StatusBadRequest, "Only PDF files are allowed", nil)
		return
	}

	storageName := time.Now().Format("20060102_150405") + "_" + sanitizeFilename(header.Filename)

	// Always save locally first (needed for converter access)
	localPath := filepath.Join(h.cfg.UploadDir, storageName)
	dst, err := os.Create(localPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save file", err)
		return
	}
	written, err := io.Copy(dst, file)
	dst.Close()
	if err != nil {
		os.Remove(localPath)
		writeError(w, http.StatusInternalServerError, "Failed to write file", err)
		return
	}

	// Also save to MinIO if configured
	if h.storage != nil {
		f, _ := os.Open(localPath)
		if f != nil {
			h.storage.Save(storageName, f, written, "application/pdf")
			f.Close()
		}
	}

	pdf := &models.PDF{
		ID:         uuid.New().String(),
		Filename:   header.Filename,
		FilePath:   storageName,
		FileSize:   written,
		SourceType: "upload",
	}
	if err := h.db.CreatePDF(pdf); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to save PDF record", err)
		return
	}
	writeJSON(w, http.StatusCreated, pdf)
}

func (h *PDFHandler) UpdatePDF(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		PageCount *int `json:"page_count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON body", err)
		return
	}
	pdf, err := h.db.GetPDFByID(id)
	if err != nil || pdf == nil {
		writeError(w, http.StatusNotFound, "PDF not found", err)
		return
	}
	if body.PageCount != nil {
		h.db.UpdatePDF(id, *body.PageCount)
	}
	writeJSON(w, http.StatusOK, pdf)
}

func (h *PDFHandler) DownloadPDF(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	pdf, err := h.db.GetPDFByID(id)
	if err != nil || pdf == nil {
		writeError(w, http.StatusNotFound, "PDF not found", err)
		return
	}
	if pdf.SourceType == "url" && pdf.ExternalURL != "" {
		http.Redirect(w, r, pdf.ExternalURL, http.StatusTemporaryRedirect)
		return
	}
	if pdf.FilePath == "" {
		writeError(w, http.StatusNotFound, "No file available for download", nil)
		return
	}
	reader, err := h.storage.Open(pdf.FilePath)
	if err != nil {
		writeError(w, http.StatusNotFound, "File not found", err)
		return
	}
	defer reader.Close()
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `inline; filename="`+pdf.Filename+`"`)
	io.Copy(w, reader)
}

func (h *PDFHandler) DeletePDF(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	pdf, err := h.db.GetPDFByID(id)
	if err != nil || pdf == nil {
		writeError(w, http.StatusNotFound, "PDF not found", err)
		return
	}
	if pdf.SourceType == "upload" && pdf.FilePath != "" {
		h.storage.Delete(pdf.FilePath)
	}
	h.db.DeletePDF(id)
	writeJSON(w, http.StatusOK, map[string]string{"message": "PDF deleted"})
}

func sanitizeFilename(name string) string {
	ext := filepath.Ext(name)
	base := name[:len(name)-len(ext)]
	clean := ""
	for _, r := range base {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			clean += string(r)
		} else {
			clean += "_"
		}
	}
	return clean + ext
}
