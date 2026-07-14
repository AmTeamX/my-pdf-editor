package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/my-pdf-editor/backend/internal/config"
	"github.com/my-pdf-editor/backend/internal/database"
	"github.com/my-pdf-editor/backend/internal/handler"
	"github.com/my-pdf-editor/backend/internal/middleware"
)

func New(db database.Database, cfg *config.Config) http.Handler {
	r := chi.NewRouter()

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "X-API-Key"},
		ExposedHeaders:   []string{"Link", "Content-Disposition"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	pdfHandler := handler.NewPDFHandler(db, cfg)
	highlightHandler := handler.NewHighlightHandler(db)
	commentHandler := handler.NewCommentHandler(db)
	converterHandler := handler.NewConverterHandler(db, cfg)

	// Public
	r.Get("/api/pdfs", pdfHandler.ListPDFs)
	r.Get("/api/pdfs/{id}", pdfHandler.GetPDF)
	r.Get("/api/pdfs/{id}/download", pdfHandler.DownloadPDF)

	// API-key protected
	r.Group(func(r chi.Router) {
		r.Use(middleware.APIKeyAuth(cfg.APIKey))
		r.Post("/api/pdfs", pdfHandler.UploadPDF)
		r.Put("/api/pdfs/{id}", pdfHandler.UpdatePDF)
		r.Delete("/api/pdfs/{id}", pdfHandler.DeletePDF)

		r.Get("/api/pdfs/{id}/highlights", highlightHandler.GetHighlights)
		r.Post("/api/pdfs/{id}/highlights", highlightHandler.SaveHighlights)

		r.Get("/api/pdfs/{id}/comments", commentHandler.GetComments)
		r.Post("/api/pdfs/{id}/comments", commentHandler.CreateComment)
		r.Put("/api/pdfs/{id}/comments/{commentId}", commentHandler.UpdateComment)
		r.Delete("/api/pdfs/{id}/comments/{commentId}", commentHandler.DeleteComment)

		r.Post("/api/pdfs/{id}/convert", converterHandler.ConvertPDF)
		r.Get("/api/pdfs/{id}/content", converterHandler.GetContent)
	})

	return r
}
