# PDF Audit Tool

AI-powered document audit platform. Upload PDFs, extract structured content, create highlights with reasoning comments, and share preview links.

## Quick Start

```bash
cp .env.example .env
docker compose up -d --build
```

- **Frontend:** http://localhost:3000
- **API:** http://localhost:8080/api
- **MinIO Console:** http://localhost:9001

## Architecture

```
AI Agent → API (text_to_highlight) → Backend resolves coordinates → Preview link
```

## Services

| Service | Port | Tech |
|---------|------|------|
| Frontend | 3000 | Next.js 15 |
| Backend | 8080 | Go, chi |
| PostgreSQL | 5433 | Postgres 16 |
| MinIO | 9000 | S3 Storage |
| Converter Std | 8000 | opendataloader |
| Converter Hyb | 5002 | opendataloader hybrid OCR |

## For AI Agents

See [AI_AGENT_GUIDE.md](./AI_AGENT_GUIDE.md) for complete API documentation.

## Docs

- [Design Document](./docs/design.md)
- [Security Review](./docs/security-review.md)
- [Deployment Guide](./docs/deployment.md)
