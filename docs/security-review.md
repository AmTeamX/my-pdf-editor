# Security Review — PDF Audit Tool

## Overview

The PDF Audit Tool is an API-first platform for AI-driven document auditing. This review covers authentication, authorization, data storage, and API security.

## Authentication

- **Single API key** model for all write operations
- Key passed via `X-API-Key` header
- Configured through `API_KEY` environment variable
- Default key: `dev-api-key-change-me` (must be changed in production)

## Authorization

| Endpoint Group | Auth Required | Notes |
|---------------|---------------|-------|
| List/Get PDFs | No | Public read access |
| Download PDF | No | Public download |
| Upload/Delete PDF | Yes | API key |
| Highlights CRUD | Yes | API key |
| Comments CRUD | Yes | API key |
| Content conversion | Yes | API key |

## Data Storage

### Database (PostgreSQL)
- All tables use TEXT primary keys (support arbitrary IDs from AI agents)
- Foreign keys with CASCADE deletes (deleting a PDF removes all highlights + comments)
- No sensitive data stored in plain text (API key is env-only, not in DB)

### File Storage (MinIO / Local FS)
- PDFs stored in MinIO bucket (docker) or local filesystem (dev)
- MinIO uses static credentials (configurable)
- Bucket created automatically on startup if missing

## API Security

### Input Validation
- Upload size limited to 50MB
- File type validated (`.pdf` extension required)
- JSON body parsed with strict struct mapping

### CORS
- All origins allowed (`*`)
- Methods: GET, POST, PUT, DELETE, OPTIONS
- Headers: Accept, Content-Type, X-API-Key

### SQL Injection
- Parameterized queries used throughout (PostgreSQL `$1`, SQLite `?`)
- No string concatenation for SQL

## Recommendations for Production

1. **Change default API key** — set strong random key
2. **Add HTTPS** — use reverse proxy (nginx/Caddy) with TLS
3. **Restrict CORS** — limit to known origins
4. **Add rate limiting** — prevent abuse of conversion endpoints
5. **Rotate MinIO credentials** — use secrets manager
6. **Add audit logging** — track who/what/when for compliance
7. **Consider OAuth2/API key rotation** for multi-tenant scenarios
8. **Scan uploaded PDFs** for malware (ClamAV integration)
9. **Set MinIO bucket policy** to private + presigned URLs instead of public

## Dependency Security

### Go Backend
- chi v5 — widely used, maintained
- minio-go v7 — official MinIO SDK
- lib/pq — PostgreSQL driver
- go-sqlite3 — SQLite driver (CGO disabled in Docker)

### Python Services
- opendataloader-pdf — PDF extraction engine
- fastapi/uvicorn — HTTP server
- httpx — HTTP client for Typhoon OCR

### Frontend
- Next.js 15, React 19
- pdfjs-dist — Mozilla PDF.js
- react-pdf — React wrapper for PDF.js
