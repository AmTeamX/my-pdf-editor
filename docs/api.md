# API Reference — PDF Audit Tool

Base URL: `http://localhost:8080/api`

## Authentication

| Header | Required | Description |
|--------|----------|-------------|
| `X-API-Key` | Write endpoints | API key (default: `dev-api-key-change-me`) |

Public endpoints (no auth): `GET /pdfs`, `GET /pdfs/{id}`, `GET /pdfs/{id}/download`

---

## Endpoints

### PDF Management

#### `GET /api/pdfs`
List all PDF records.

Response: `[{id, filename, file_size, page_count, source_type, converted_at, created_at}]`

#### `POST /api/pdfs`
Upload PDF file (multipart) or register external URL (JSON).

**Multipart:** `pdfFile` field with PDF file
**JSON:** `{"filename": "...", "external_url": "...", "page_count": 1}`

Response: `{id, filename, ...}` (201 Created)

#### `GET /api/pdfs/{id}`
Get single PDF record.

#### `PUT /api/pdfs/{id}`
Update PDF metadata.

Body: `{"page_count": 5}`

#### `DELETE /api/pdfs/{id}`
Delete PDF, its file, and all associated highlights/comments.

#### `GET /api/pdfs/{id}/download`
Download the original PDF file.

---

### Content Conversion

#### `POST /api/pdfs/{id}/convert`
Extract structured content from PDF. Runs converter pipeline (standard → hybrid → typhoon).

Response: `{"message": "PDF converted", "total_blocks": 62, "engine": "opendataloader"}`

#### `GET /api/pdfs/{id}/content`
Get extracted content blocks with bounding boxes.

Response:
```json
{
  "total_blocks": 50,
  "page_width": 612,
  "page_height": 792,
  "blocks": [
    {
      "type": "heading",
      "page_number": 1,
      "bounding_box": [90.0, 742.8, 283.1, 753.8],
      "content": "Document Title"
    }
  ]
}
```

---

### Highlights

#### `GET /api/pdfs/{id}/highlights`
Get all highlights for a PDF.

Response: `{"highlights": [{id, pdf_id, page_number, rects, selected_text, color}]}`

#### `POST /api/pdfs/{id}/highlights`
**Replace all** highlights for a PDF. Supports both rect-based and text-based highlights.

Body (rect-based):
```json
{
  "highlights": [{
    "id": "hl-1",
    "page_number": 1,
    "rects": [{"top": 100, "left": 50, "width": 200, "height": 20}],
    "selected_text": "Important clause",
    "color": "rgba(255,0,0,0.3)"
  }]
}
```

Body (text-based — AI friendly):
```json
{
  "highlights": [{
    "id": "f1",
    "page_number": 1,
    "text_to_highlight": "Unaudited financial statements",
    "occurrence": 1,
    "selected_text": "Unaudited P&L",
    "color": "rgba(255,0,0,0.3)"
  }]
}
```

---

### Comments

#### `GET /api/pdfs/{id}/comments`
Get all comments for a PDF.

#### `POST /api/pdfs/{id}/comments`
Create a new comment.

Body:
```json
{
  "highlight_id": "f1",
  "pdf_id": "uuid",
  "page_number": 1,
  "content": "**Finding:** ...\n**Reasoning:** ...",
  "author": "AI Auditor"
}
```

#### `PUT /api/pdfs/{id}/comments/{commentId}`
Update a comment.

Body: `{"content": "Updated reasoning..."}`

#### `DELETE /api/pdfs/{id}/comments/{commentId}`
Delete a comment.

---

## Error Responses

All errors return:
```json
{"error": "Human-readable message"}
```

Status codes: `400` Bad Request, `401` Unauthorized, `404` Not Found, `500` Internal Error
