package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/lib/pq"
	"github.com/my-pdf-editor/backend/internal/models"
)

type PostgresDB struct {
	db *sql.DB
}

func NewPostgres(dsn string) (*PostgresDB, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("postgres open: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("postgres ping: %w", err)
	}
	pg := &PostgresDB{db: db}
	if err := pg.Migrate(); err != nil {
		return nil, fmt.Errorf("postgres migrate: %w", err)
	}
	return pg, nil
}

func (p *PostgresDB) Close() error { return p.db.Close() }

func (p *PostgresDB) Migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS pdfs (
			id TEXT PRIMARY KEY, filename TEXT NOT NULL, file_path TEXT, external_url TEXT,
			file_size BIGINT DEFAULT 0, page_count INT DEFAULT 0, source_type TEXT DEFAULT 'upload',
			converted_content TEXT, converted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS highlights (
			id TEXT PRIMARY KEY, pdf_id TEXT NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
			page_number INT NOT NULL, rects TEXT, selected_text TEXT, color TEXT, created_at TIMESTAMPTZ NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS comments (
			id TEXT PRIMARY KEY, highlight_id TEXT REFERENCES highlights(id) ON DELETE SET NULL,
			pdf_id TEXT NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
			page_number INT NOT NULL, content TEXT, author TEXT, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
		)`,
	}
	for _, q := range queries {
		if _, err := p.db.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func (p *PostgresDB) CreatePDF(pdf *models.PDF) error {
	now := time.Now().UTC()
	pdf.CreatedAt = now
	pdf.UpdatedAt = now
	return p.db.QueryRow(
		`INSERT INTO pdfs (id, filename, file_path, external_url, file_size, page_count, source_type, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
		pdf.ID, pdf.Filename, pdf.FilePath, pdf.ExternalURL, pdf.FileSize, pdf.PageCount, pdf.SourceType, now, now,
	).Scan(&pdf.ID)
}

func (p *PostgresDB) GetPDFByID(id string) (*models.PDF, error) {
	var pdf models.PDF
	var ca sql.NullTime
	err := p.db.QueryRow(
		`SELECT id, filename, file_path, external_url, file_size, page_count, source_type,
		        COALESCE(converted_content,''), converted_at, created_at, updated_at FROM pdfs WHERE id=$1`, id,
	).Scan(&pdf.ID, &pdf.Filename, &pdf.FilePath, &pdf.ExternalURL, &pdf.FileSize, &pdf.PageCount, &pdf.SourceType,
		&pdf.ConvertedContent, &ca, &pdf.CreatedAt, &pdf.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if ca.Valid {
		pdf.ConvertedAt = &ca.Time
	}
	return &pdf, nil
}

func (p *PostgresDB) ListPDFs() ([]models.PDF, error) {
	rows, err := p.db.Query(`SELECT id, filename, file_path, external_url, file_size, page_count, source_type,
		COALESCE(converted_content,''), converted_at, created_at, updated_at FROM pdfs ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []models.PDF
	for rows.Next() {
		var pdf models.PDF
		var ca sql.NullTime
		if err := rows.Scan(&pdf.ID, &pdf.Filename, &pdf.FilePath, &pdf.ExternalURL, &pdf.FileSize, &pdf.PageCount,
			&pdf.SourceType, &pdf.ConvertedContent, &ca, &pdf.CreatedAt, &pdf.UpdatedAt); err != nil {
			return nil, err
		}
		if ca.Valid {
			pdf.ConvertedAt = &ca.Time
		}
		list = append(list, pdf)
	}
	return list, nil
}

func (p *PostgresDB) UpdatePDF(id string, pageCount int) error {
	_, err := p.db.Exec(`UPDATE pdfs SET page_count=$1, updated_at=NOW() WHERE id=$2`, pageCount, id)
	return err
}

func (p *PostgresDB) UpdatePDFContent(id string, content string) error {
	_, err := p.db.Exec(`UPDATE pdfs SET converted_content=$1, converted_at=NOW(), updated_at=NOW() WHERE id=$2`, content, id)
	return err
}

func (p *PostgresDB) DeletePDF(id string) error {
	_, err := p.db.Exec(`DELETE FROM pdfs WHERE id=$1`, id)
	return err
}

func (p *PostgresDB) GetHighlightsByPDFID(pdfID string) ([]models.Highlight, error) {
	rows, err := p.db.Query(`SELECT id, pdf_id, page_number, COALESCE(rects,''), COALESCE(selected_text,''), COALESCE(color,''), created_at FROM highlights WHERE pdf_id=$1 ORDER BY page_number`, pdfID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanHighlights(rows)
}

func (p *PostgresDB) ReplaceHighlights(pdfID string, highlights []models.Highlight) error {
	tx, err := p.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM comments WHERE pdf_id=$1`, pdfID); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM highlights WHERE pdf_id=$1`, pdfID); err != nil {
		return err
	}
	now := time.Now().UTC()
	for _, h := range highlights {
		rectsJSON, _ := json.Marshal(h.Rects)
		if _, err := tx.Exec(
			`INSERT INTO highlights (id, pdf_id, page_number, rects, selected_text, color, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			h.ID, pdfID, h.PageNumber, string(rectsJSON), h.SelectedText, h.Color, now,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (p *PostgresDB) GetCommentsByPDFID(pdfID string) ([]models.Comment, error) {
	rows, err := p.db.Query(`SELECT id, highlight_id, pdf_id, page_number, COALESCE(content,''), COALESCE(author,''), created_at, updated_at FROM comments WHERE pdf_id=$1 ORDER BY page_number, created_at`, pdfID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCommentsPG(rows)
}

func (p *PostgresDB) GetCommentsByHighlightID(highlightID string) ([]models.Comment, error) {
	rows, err := p.db.Query(`SELECT id, highlight_id, pdf_id, page_number, COALESCE(content,''), COALESCE(author,''), created_at, updated_at FROM comments WHERE highlight_id=$1 ORDER BY created_at`, highlightID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCommentsPG(rows)
}

func (p *PostgresDB) CreateComment(c *models.Comment) error {
	now := time.Now().UTC()
	c.CreatedAt = now
	c.UpdatedAt = now
	return p.db.QueryRow(
		`INSERT INTO comments (id, highlight_id, pdf_id, page_number, content, author, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
		c.ID, c.HighlightID, c.PDFID, c.PageNumber, c.Content, c.Author, now, now,
	).Scan(&c.ID)
}

func (p *PostgresDB) UpdateComment(id string, content string) error {
	_, err := p.db.Exec(`UPDATE comments SET content=$1, updated_at=NOW() WHERE id=$2`, content, id)
	return err
}

func (p *PostgresDB) DeleteComment(id string) error {
	_, err := p.db.Exec(`DELETE FROM comments WHERE id=$1`, id)
	return err
}

func scanHighlights(rows *sql.Rows) ([]models.Highlight, error) {
	var list []models.Highlight
	for rows.Next() {
		var h models.Highlight
		var rectsJSON string
		if err := rows.Scan(&h.ID, &h.PDFID, &h.PageNumber, &rectsJSON, &h.SelectedText, &h.Color, &h.CreatedAt); err != nil {
			return nil, err
		}
		if rectsJSON != "" {
			json.Unmarshal([]byte(rectsJSON), &h.Rects)
		}
		list = append(list, h)
	}
	return list, nil
}

func scanCommentsPG(rows *sql.Rows) ([]models.Comment, error) {
	var list []models.Comment
	for rows.Next() {
		var c models.Comment
		if err := rows.Scan(&c.ID, &c.HighlightID, &c.PDFID, &c.PageNumber, &c.Content, &c.Author, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, nil
}
