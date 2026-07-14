package database

import "github.com/my-pdf-editor/backend/internal/models"

type Database interface {
	Close() error
	Migrate() error

	CreatePDF(pdf *models.PDF) error
	GetPDFByID(id string) (*models.PDF, error)
	ListPDFs() ([]models.PDF, error)
	UpdatePDF(id string, pageCount int) error
	UpdatePDFContent(id string, content string) error
	DeletePDF(id string) error

	GetHighlightsByPDFID(pdfID string) ([]models.Highlight, error)
	ReplaceHighlights(pdfID string, highlights []models.Highlight) error

	GetCommentsByPDFID(pdfID string) ([]models.Comment, error)
	GetCommentsByHighlightID(highlightID string) ([]models.Comment, error)
	CreateComment(comment *models.Comment) error
	UpdateComment(id string, content string) error
	DeleteComment(id string) error
}
