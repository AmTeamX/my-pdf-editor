package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/my-pdf-editor/backend/internal/database"
	"github.com/my-pdf-editor/backend/internal/models"
)

type CommentHandler struct {
	db database.Database
}

func NewCommentHandler(db database.Database) *CommentHandler {
	return &CommentHandler{db: db}
}

func (h *CommentHandler) GetComments(w http.ResponseWriter, r *http.Request) {
	pdfID := chi.URLParam(r, "id")
	comments, err := h.db.GetCommentsByPDFID(pdfID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get comments", err)
		return
	}
	if comments == nil {
		comments = []models.Comment{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"comments": comments})
}

func (h *CommentHandler) CreateComment(w http.ResponseWriter, r *http.Request) {
	pdfID := chi.URLParam(r, "id")
	var req models.CreateCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON body", err)
		return
	}
	comment := &models.Comment{
		ID:          uuid.New().String(),
		HighlightID: req.HighlightID,
		PDFID:       pdfID,
		PageNumber:  req.PageNumber,
		Content:     req.Content,
		Author:      req.Author,
	}
	if err := h.db.CreateComment(comment); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create comment", err)
		return
	}
	writeJSON(w, http.StatusCreated, comment)
}

func (h *CommentHandler) UpdateComment(w http.ResponseWriter, r *http.Request) {
	commentID := chi.URLParam(r, "commentId")
	var req models.UpdateCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON body", err)
		return
	}
	if err := h.db.UpdateComment(commentID, req.Content); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update comment", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Comment updated"})
}

func (h *CommentHandler) DeleteComment(w http.ResponseWriter, r *http.Request) {
	commentID := chi.URLParam(r, "commentId")
	if err := h.db.DeleteComment(commentID); err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to delete comment", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Comment deleted"})
}
