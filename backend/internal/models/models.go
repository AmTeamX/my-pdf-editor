package models

import "time"

type PDF struct {
	ID               string     `json:"id"`
	Filename         string     `json:"filename"`
	FilePath         string     `json:"file_path,omitempty"`
	ExternalURL      string     `json:"external_url,omitempty"`
	FileSize         int64      `json:"file_size"`
	PageCount        int        `json:"page_count"`
	SourceType       string     `json:"source_type"`
	ConvertedContent string     `json:"converted_content,omitempty"`
	ConvertedAt      *time.Time `json:"converted_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type PDFUploadRequest struct {
	Filename    string `json:"filename"`
	ExternalURL string `json:"external_url"`
	PageCount   int    `json:"page_count"`
}

type HighlightRect struct {
	Top    float64 `json:"top"`
	Left   float64 `json:"left"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type Highlight struct {
	ID              string          `json:"id"`
	PDFID           string          `json:"pdf_id"`
	PageNumber      int             `json:"page_number"`
	Rects           []HighlightRect `json:"rects,omitempty"`
	SelectedText    string          `json:"selected_text"`
	Color           string          `json:"color"`
	TextToHighlight string          `json:"text_to_highlight,omitempty"`
	Occurrence      int             `json:"occurrence,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
}

type Comment struct {
	ID          string    `json:"id"`
	HighlightID *string   `json:"highlight_id,omitempty"`
	PDFID       string    `json:"pdf_id"`
	PageNumber  int       `json:"page_number"`
	Content     string    `json:"content"`
	Author      string    `json:"author"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateCommentRequest struct {
	HighlightID *string `json:"highlight_id,omitempty"`
	PDFID       string  `json:"pdf_id"`
	PageNumber  int     `json:"page_number"`
	Content     string  `json:"content"`
	Author      string  `json:"author"`
}

type UpdateCommentRequest struct {
	Content string `json:"content"`
}

type SaveHighlightsRequest struct {
	Highlights []Highlight `json:"highlights"`
}

type ContentBlock struct {
	Type        string    `json:"type"`
	PageNumber  int       `json:"page_number"`
	BoundingBox []float64 `json:"bounding_box"`
	Content     string    `json:"content"`
}

type ConvertedDocument struct {
	TotalBlocks int            `json:"total_blocks"`
	Blocks      []ContentBlock `json:"blocks"`
	PageHeight  float64        `json:"page_height,omitempty"`
	PageWidth   float64        `json:"page_width,omitempty"`
}
