# Deployment Guide — PDF Audit Tool

## Prerequisites

- Docker & Docker Compose
- 4GB+ RAM (8GB recommended for hybrid OCR)
- 10GB+ disk space

## Quick Start

```bash
# Clone and start
git clone <repo>
cd my-pdf-editor
cp .env.example .env
docker compose up -d --build
```

Services available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080/api
- MinIO Console: http://localhost:9001

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `API_KEY` | `dev-api-key-change-me` | Yes | API key for write endpoints |
| `DB_PASSWORD` | `pdfeditor123` | Yes | PostgreSQL password |
| `MINIO_USER` | `minioadmin` | No | MinIO access key |
| `MINIO_PASSWORD` | `minioadmin123` | No | MinIO secret key |
| `TYPHOON_API_KEY` | — | No | Typhoon OCR API key (optional) |
| `TYPHOON_API_URL` | `https://api.opentyphoon.ai/v1` | No | Typhoon API endpoint |

## Production Deployment

### 1. Change Default Credentials
```bash
# .env
API_KEY=<random-64-char-string>
DB_PASSWORD=<strong-password>
MINIO_USER=<random-user>
MINIO_PASSWORD=<strong-password>
```

### 2. Enable HTTPS
Use nginx or Caddy as reverse proxy:
```nginx
server {
    listen 443 ssl;
    server_name pdf-audit.example.com;

    location /api/ {
        proxy_pass http://localhost:8080;
    }
    location / {
        proxy_pass http://localhost:3000;
    }
}
```

### 3. Resource Limits
Add to `docker-compose.yml`:
```yaml
converter-hybrid:
  deploy:
    resources:
      limits:
        memory: 4G
```

### 4. Backup
```bash
# PostgreSQL backup
docker exec pdf-postgres pg_dump -U pdfeditor pdfeditor > backup.sql

# MinIO backup
docker exec pdf-minio mc mirror /data/ s3/backup/
```

## Local Development

```bash
# Backend (Go)
cd backend && go run .

# Frontend (Next.js)
npm run dev

# Converter (optional, for testing)
cd services/pdf-converter && python server_std.py
```

Without `DATABASE_URL`, backend uses SQLite at `data/pdfeditor.db`.
Without `MINIO_ENDPOINT`, files are stored locally in `uploads/`.
