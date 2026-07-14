# PDF Audit Tool — Design Document

## Overview

A microservices-based document audit platform where AI agents upload PDFs, extract structured content, create highlights with reasoning comments, and generate shareable preview links.

## Architecture

```
┌──────────┐     ┌──────────┐     ┌───────────────┐
│ Frontend │────▶│ Backend  │────▶│  PostgreSQL   │
│ :3000    │     │ :8080    │     │  :5432        │
└──────────┘     └──────────┘     └───────────────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Standard │ │ Hybrid   │ │ Typhoon  │
   │ :8000    │ │ :5002    │ │ :8100    │
   └──────────┘ └──────────┘ └──────────┘
                      │
                 ┌──────────┐
                 │  MinIO   │
                 │  :9000   │
                 └──────────┘
```

## Services

| Service | Tech | Port | Purpose |
|---------|------|------|---------|
| Frontend | Next.js 15, React 19 | 3000 | Document viewer + audit UI |
| Backend | Go, chi router | 8080 | REST API, business logic |
| PostgreSQL | Postgres 16 Alpine | 5432 | Primary database |
| MinIO | MinIO S3 | 9000 | File storage |
| Converter Std | Python, opendataloader | 8000 | Text-based PDF extraction |
| Converter Hyb | Python, opendataloader hybrid | 5002 | OCR + AI for image-based PDFs |
| Typhoon OCR | Python, FastAPI | 8100 | Vision model OCR (optional) |

## Data Flow

### PDF Audit Flow
1. AI Agent uploads PDF → `POST /api/pdfs` (multipart)
2. Backend stores file in MinIO/local FS
3. AI calls `POST /api/pdfs/{id}/convert` → pipeline runs
4. AI reads `GET /api/pdfs/{id}/content` → gets structured blocks
5. AI analyzes content, creates findings
6. AI calls `POST /api/pdfs/{id}/highlights` with `text_to_highlight`
7. Backend resolves text to bounding box coordinates
8. AI calls `POST /api/pdfs/{id}/comments` with reasoning
9. AI returns preview link to user

### Converter Pipeline
- **Standard**: Fast, uses opendataloader Python library, handles text-based PDFs
- **Hybrid**: Slower, uses opendataloader CLI with `--hybrid docling-fast --hybrid-mode full`, handles image-based PDFs with OCR
- **Typhoon**: Optional fallback, uses vision LLM for OCR

### Quality Assessment
Standard results pass if:
- ≥ 5 meaningful blocks (content > 20 chars, not captions)
- ≥ 300 total characters

Otherwise falls back to hybrid.

## Database

### Schema
```
pdfs (id TEXT PK, filename, file_path, external_url, file_size, page_count, source_type,
      converted_content JSON, converted_at, created_at, updated_at)

highlights (id TEXT PK, pdf_id FK, page_number, rects JSON, selected_text, color, created_at)

comments (id TEXT PK, highlight_id FK nullable, pdf_id FK, page_number, content, author, created_at, updated_at)
```

### Auto-switch
- `DATABASE_URL` env set → PostgreSQL
- `DATABASE_URL` empty → SQLite (development)

## Security

- Write endpoints require `X-API-Key` header
- Read endpoints are public
- API key configured via `API_KEY` env var
- PDF files stored in MinIO S3 (docker) or local filesystem (dev)

## Frontend Routes

| Route | Auth | Description |
|-------|------|-------------|
| `/` | — | Landing page |
| `/manage-files` | — | PDF list, upload, management |
| `/editor?pdfId={id}` | — | PDF viewer with highlights + comments |
| `/preview/{id}` | — | Shareable preview with findings |
