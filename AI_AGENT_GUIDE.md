# PDF Audit Tool — AI Agent Guide

An API-first document audit platform. AI agents upload PDFs, extract structured content, create highlights with reasoning comments, and generate shareable preview links for human review.

## Quick Start (AI Agent)

```bash
API="http://localhost:8080/api"
KEY="dev-api-key-change-me"

# 1. Upload PDF
PDF_ID=$(curl -s -X POST -H "X-API-Key: $KEY" \
  -F "pdfFile=@document.pdf" \
  $API/pdfs | jq -r '.id')

# 2. Convert to structured content (extracts text + bounding boxes)
curl -s -X POST -H "X-API-Key: $KEY" \
  $API/pdfs/$PDF_ID/convert

# 3. Read content blocks (AI analyzes this)
curl -s -H "X-API-Key: $KEY" \
  $API/pdfs/$PDF_ID/content | jq '.blocks[] | {page: .page_number, type: .type, text: .content}'

# 4. Create highlights (AI sends TEXT — backend resolves coordinates automatically)
curl -s -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "highlights": [
      {"id":"f1","page_number":1,"text_to_highlight":"critical finding","occurrence":1,"selected_text":"Security issue","color":"rgba(255,0,0,0.3)"},
      {"id":"f2","page_number":2,"text_to_highlight":"missing signature","occurrence":1,"selected_text":"Compliance gap","color":"rgba(255,165,0,0.35)"}
    ]
  }' \
  $API/pdfs/$PDF_ID/highlights

# 5. Add reasoning comments
curl -s -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"highlight_id":"f1","pdf_id":"'$PDF_ID'","page_number":1,"content":"**Finding:** Critical vulnerability\n\n**Reasoning:** Missing authorization signatures.","author":"AI Auditor"}' \
  $API/pdfs/$PDF_ID/comments

# 6. Preview link
echo "http://localhost:3000/preview/$PDF_ID"
```

---

## API Reference

**Base URL:** `http://localhost:8080/api`  
**Auth:** Write endpoints require `X-API-Key: <key>`. Default: `dev-api-key-change-me`

### PDFs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/pdfs` | — | List all PDFs |
| `POST` | `/pdfs` | Key | Upload PDF (multipart `pdfFile`) or register URL (JSON) |
| `DELETE` | `/pdfs/{id}` | Key | Delete PDF + all data |
| `POST` | `/pdfs/{id}/convert` | Key | Extract structured content |
| `GET` | `/pdfs/{id}/content` | Key | Get content blocks with bounding boxes |
| `GET` | `/pdfs/{id}/download` | — | Download original PDF |

### Highlights (text-based — AI-friendly)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/pdfs/{id}/highlights` | Key | Get all highlights |
| `POST` | `/pdfs/{id}/highlights` | Key | **Replace all** highlights |

#### Highlight Object

```json
{
  "id": "finding-1",
  "page_number": 3,
  "text_to_highlight": "exact text from document",
  "occurrence": 1,
  "selected_text": "Security vulnerability found",
  "color": "rgba(255,0,0,0.3)"
}
```

#### Highlight Colors

| Color | Use Case |
|-------|----------|
| `rgba(255,0,0,0.3)` | 🔴 Critical risk |
| `rgba(255,165,0,0.35)` | 🟠 Flag |
| `rgba(255,255,0,0.4)` | 🟡 Note |
| `rgba(59,130,246,0.25)` | 🔵 Info |

### Comments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/pdfs/{id}/comments` | Key | Get all comments |
| `POST` | `/pdfs/{id}/comments` | Key | Create comment |
| `PUT` | `/pdfs/{id}/comments/{commentId}` | Key | Update comment |
| `DELETE` | `/pdfs/{id}/comments/{commentId}` | Key | Delete comment |

---

## Content Block Format

`GET /pdfs/{id}/content` returns:
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
      "content": "COMMERCIAL LOAN APPLICATION"
    }
  ]
}
```

Bounding boxes: `[left, bottom, right, top]` in PDF points (72pt = 1 inch).

---

## Python Example

```python
import requests, json

API = "http://localhost:8080/api"
KEY = "dev-api-key-change-me"
HEADERS = {"X-API-Key": KEY}

def audit_pdf(filepath: str) -> str:
    with open(filepath, "rb") as f:
        r = requests.post(f"{API}/pdfs", headers=HEADERS, files={"pdfFile": f})
    pdf_id = r.json()["id"]

    requests.post(f"{API}/pdfs/{pdf_id}/convert", headers=HEADERS)
    r = requests.get(f"{API}/pdfs/{pdf_id}/content", headers=HEADERS)
    blocks = r.json()["blocks"]

    findings = [
        {"id":"f1","page_number":1,"text_to_highlight":"Unaudited","occurrence":1,
         "selected_text":"Unaudited P&L","color":"rgba(255,0,0,0.3)"}
    ]
    requests.post(f"{API}/pdfs/{pdf_id}/highlights", headers=HEADERS, json={"highlights": findings})

    for f in findings:
        requests.post(f"{API}/pdfs/{pdf_id}/comments", headers=HEADERS, json={
            "highlight_id": f["id"], "pdf_id": pdf_id, "page_number": f["page_number"],
            "content": "**Finding:** ...\n**Reasoning:** ...", "author": "AI Auditor"
        })

    return f"http://localhost:3000/preview/{pdf_id}"
```

---

## Architecture

```
AI Agent → POST /api/pdfs/{id}/highlights (text_to_highlight)
                ↓
         Backend resolves text → bbox coordinates
                ↓
         User opens /preview/{id} → sees highlights + comments
```

### Converter Pipeline (automatic)

```
POST /api/pdfs/{id}/convert
  ├─ 1. opendataloader standard (fast, text-based PDFs)
  │     └─ quality check: ≥5 blocks, ≥300 chars → use it
  ├─ 2. opendataloader hybrid (AI + OCR, image-based PDFs)
  │     └─ requires hybrid server on port 5002
  └─ 3. Typhoon OCR (last resort, optional)
```

### Database: Auto-switch

- `DATABASE_URL` set → PostgreSQL
- `DATABASE_URL` empty → SQLite

### Storage: Auto-switch

- `MINIO_ENDPOINT` set → MinIO S3
- `MINIO_ENDPOINT` empty → local filesystem

---

## Deployment

```bash
# Docker (all services)
docker compose up -d --build

# Services
# postgres:5432   - Database
# minio:9000      - S3 Storage  
# backend:8080    - Go API
# frontend:3000   - Next.js UI
# converter-std:8000  - Standard PDF extraction
# converter-hyb:5002  - Hybrid OCR (image-based PDFs)
```
