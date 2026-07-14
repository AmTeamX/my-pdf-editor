package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/my-pdf-editor/backend/internal/models"
)

type SQLiteDB struct {
	db *sql.DB
}

func NewSQLite(path string) (*SQLiteDB, error) {
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("sqlite open: %w", err)
	}
	db.SetMaxOpenConns(1)
	sq := &SQLiteDB{db: db}
	if err := sq.Migrate(); err != nil {
		return nil, fmt.Errorf("sqlite migrate: %w", err)
	}
	return sq, nil
}

func (s *SQLiteDB) Close() error { return s.db.Close() }

func (s *SQLiteDB) Migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS pdfs (
			id TEXT PRIMARY KEY,
			filename TEXT NOT NULL,
			file_path TEXT,
			external_url TEXT,
			file_size INTEGER DEFAULT 0,
			page_count INTEGER DEFAULT 0,
			source_type TEXT DEFAULT 'upload',
			converted_content TEXT,
			converted_at TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS highlights (
			id TEXT PRIMARY KEY,
			pdf_id TEXT NOT NULL,
			page_number INTEGER NOT NULL,
			rects TEXT,
			selected_text TEXT,
			color TEXT,
			created_at TEXT NOT NULL,
			FOREIGN KEY (pdf_id) REFERENCES pdfs(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS comments (
			id TEXT PRIMARY KEY,
			highlight_id TEXT,
			pdf_id TEXT NOT NULL,
			page_number INTEGER NOT NULL,
			content TEXT,
			author TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE SET NULL,
			FOREIGN KEY (pdf_id) REFERENCES pdfs(id) ON DELETE CASCADE
		)`,
	}
	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

// --- PDFs ---

func (s *SQLiteDB) CreatePDF(pdf *models.PDF) error {
	now := time.Now().UTC().Format(time.RFC3339)
	pdf.CreatedAt = time.Now().UTC()
	pdf.UpdatedAt = pdf.CreatedAt
	_, err := s.db.Exec(
		`INSERT INTO pdfs (id, filename, file_path, external_url, file_size, page_count, source_type, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		pdf.ID, pdf.Filename, pdf.FilePath, pdf.ExternalURL, pdf.FileSize, pdf.PageCount, pdf.SourceType, now, now,
	)
	return err
}

func (s *SQLiteDB) GetPDFByID(id string) (*models.PDF, error) {
	var p models.PDF
	var ca, ua string
	err := s.db.QueryRow(
		`SELECT id, filename, file_path, external_url, file_size, page_count, source_type,
		        COALESCE(converted_content,''), converted_at, created_at, updated_at FROM pdfs WHERE id=?`, id,
	).Scan(&p.ID, &p.Filename, &p.FilePath, &p.ExternalURL, &p.FileSize, &p.PageCount, &p.SourceType,
		&p.ConvertedContent, &ca, &ua, &ua)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.ConvertedAt = parseTime(ca)
	p.CreatedAt, _ = time.Parse(time.RFC3339, ua)
	p.UpdatedAt = p.CreatedAt
	return &p, nil
}

func (s *SQLiteDB) ListPDFs() ([]models.PDF, error) {
	rows, err := s.db.Query(`SELECT id, filename, file_path, external_url, file_size, page_count, source_type,
		COALESCE(converted_content,''), converted_at, created_at, updated_at FROM pdfs ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []models.PDF
	for rows.Next() {
		var p models.PDF
		var ca, cr, up string
		if err := rows.Scan(&p.ID, &p.Filename, &p.FilePath, &p.ExternalURL, &p.FileSize, &p.PageCount,
			&p.SourceType, &p.ConvertedContent, &ca, &cr, &up); err != nil {
			return nil, err
		}
		p.ConvertedAt = parseTime(ca)
		p.CreatedAt, _ = time.Parse(time.RFC3339, cr)
		p.UpdatedAt, _ = time.Parse(time.RFC3339, up)
		list = append(list, p)
	}
	return list, nil
}

func (s *SQLiteDB) UpdatePDF(id string, pageCount int) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`UPDATE pdfs SET page_count=?, updated_at=? WHERE id=?`, pageCount, now, id)
	return err
}

func (s *SQLiteDB) UpdatePDFContent(id string, content string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`UPDATE pdfs SET converted_content=?, converted_at=?, updated_at=? WHERE id=?`, content, now, now, id)
	return err
}

func (s *SQLiteDB) DeletePDF(id string) error {
	_, err := s.db.Exec(`DELETE FROM pdfs WHERE id=?`, id)
	return err
}

// --- Highlights ---

func (s *SQLiteDB) GetHighlightsByPDFID(pdfID string) ([]models.Highlight, error) {
	rows, err := s.db.Query(`SELECT id, pdf_id, page_number, COALESCE(rects,''), COALESCE(selected_text,''), COALESCE(color,''), created_at FROM highlights WHERE pdf_id=? ORDER BY page_number`, pdfID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []models.Highlight
	for rows.Next() {
		var h models.Highlight
		var rectsJSON, ca string
		if err := rows.Scan(&h.ID, &h.PDFID, &h.PageNumber, &rectsJSON, &h.SelectedText, &h.Color, &ca); err != nil {
			return nil, err
		}
		if rectsJSON != "" {
			json.Unmarshal([]byte(rectsJSON), &h.Rects)
		}
		h.CreatedAt, _ = time.Parse(time.RFC3339, ca)
		list = append(list, h)
	}
	return list, nil
}

func (s *SQLiteDB) ReplaceHighlights(pdfID string, highlights []models.Highlight) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM comments WHERE pdf_id=?`, pdfID); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM highlights WHERE pdf_id=?`, pdfID); err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	for _, h := range highlights {
		rectsJSON, _ := json.Marshal(h.Rects)
		if _, err := tx.Exec(
			`INSERT INTO highlights (id, pdf_id, page_number, rects, selected_text, color, created_at) VALUES (?,?,?,?,?,?,?)`,
			h.ID, pdfID, h.PageNumber, string(rectsJSON), h.SelectedText, h.Color, now,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// --- Comments ---

func (s *SQLiteDB) GetCommentsByPDFID(pdfID string) ([]models.Comment, error) {
	rows, err := s.db.Query(`SELECT id, highlight_id, pdf_id, page_number, COALESCE(content,''), COALESCE(author,''), created_at, updated_at FROM comments WHERE pdf_id=? ORDER BY page_number, created_at`, pdfID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanComments(rows)
}

func (s *SQLiteDB) GetCommentsByHighlightID(highlightID string) ([]models.Comment, error) {
	rows, err := s.db.Query(`SELECT id, highlight_id, pdf_id, page_number, COALESCE(content,''), COALESCE(author,''), created_at, updated_at FROM comments WHERE highlight_id=? ORDER BY created_at`, highlightID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanComments(rows)
}

func (s *SQLiteDB) CreateComment(c *models.Comment) error {
	now := time.Now().UTC().Format(time.RFC3339)
	c.CreatedAt = time.Now().UTC()
	c.UpdatedAt = c.CreatedAt
	_, err := s.db.Exec(
		`INSERT INTO comments (id, highlight_id, pdf_id, page_number, content, author, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
		c.ID, c.HighlightID, c.PDFID, c.PageNumber, c.Content, c.Author, now, now,
	)
	return err
}

func (s *SQLiteDB) UpdateComment(id string, content string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`UPDATE comments SET content=?, updated_at=? WHERE id=?`, content, now, id)
	return err
}

func (s *SQLiteDB) DeleteComment(id string) error {
	_, err := s.db.Exec(`DELETE FROM comments WHERE id=?`, id)
	return err
}

// --- Helpers ---

func scanComments(rows *sql.Rows) ([]models.Comment, error) {
	var list []models.Comment
	for rows.Next() {
		var c models.Comment
		var ca, ua string
		if err := rows.Scan(&c.ID, &c.HighlightID, &c.PDFID, &c.PageNumber, &c.Content, &c.Author, &ca, &ua); err != nil {
			return nil, err
		}
		c.CreatedAt, _ = time.Parse(time.RFC3339, ca)
		c.UpdatedAt, _ = time.Parse(time.RFC3339, ua)
		list = append(list, c)
	}
	return list, nil
}

func parseTime(s string) *time.Time {
	if s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil
	}
	return &t
}
