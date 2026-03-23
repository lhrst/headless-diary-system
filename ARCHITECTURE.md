# Headless Diary System — Architecture

## Overview

Self-hosted, API-first diary system with AI agent integration, multimedia support, and swappable frontends.

## System Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Next.js   │────▶│    Nginx     │────▶│   FastAPI    │
│   (Web)     │     │ (Reverse     │     │   (API)      │
│   :3000     │     │  Proxy)      │     │   :8000      │
└─────────────┘     │  :80/:443    │     └──────┬───────┘
                    └──────────────┘            │
┌─────────────┐                          ┌─────┴───────┐
│  iOS Client │──────────────────────────│  PostgreSQL  │
│  (SwiftUI)  │                          │   :5432      │
└─────────────┘                          └─────────────┘
                                               │
                    ┌──────────────┐     ┌─────┴───────┐
                    │   Celery     │────▶│    Redis     │
                    │   Worker     │     │   :6379      │
                    └──────────────┘     └─────────────┘
```

## Key Components

### Backend (`api/`)
- **Framework**: FastAPI (Python 3.12, async)
- **ORM**: SQLAlchemy 2.0 (async) + Alembic migrations
- **Auth**: JWT (access 30min + refresh 7d)
- **Task Queue**: Celery + Redis broker
- **LLM**: OpenRouter API (Claude models) for agent & auto-title
- **Storage**: Dual storage — `.md` files on disk + PostgreSQL for queries

### Frontend (`web/`)
- **Framework**: Next.js 15 (App Router)
- **Editor**: TipTap v2 with `#tag` and `[[reference]]` suggestion plugins
- **Themes**: CSS variable-based theming (default, minimal, journal)
- **PWA**: Service worker for offline reading

### Database
- **PostgreSQL 16**: Users, diary entries, tags, references, comments, agent tasks, media
- **Full-text search**: `tsvector` index on diary text + media text
- **Trigram**: `pg_trgm` for fuzzy title search

### Agent System
- Celery async tasks triggered by `@agent` commands in diary text
- Context-aware: fetches related entries by tags, references, date range
- Claude Sonnet for complex reasoning, Haiku for summaries/titles
- Results stored as comments with `author_role='agent'`

### Multimedia (`diary-system-spec-multimedia-v2.md`)
- Photo: HEIC→WebP conversion, Claude Vision captioning + OCR
- Audio: faster-whisper local transcription (cloud fallback)
- Video: keyframe extraction + Vision + Whisper
- All media generates searchable `media_text`

## Data Flow

```
User writes diary → Parse #tags, [[refs]], @agent commands
                  → Save .md file to disk
                  → Store raw_text in DB for search
                  → Upsert tags & references
                  → Dispatch agent tasks to Celery
                  → Generate auto-title (async)

User uploads media → Store file, generate thumbnail
                   → Dispatch captioning task (async)
                   → Update media_text for search
```

## File Organization

```
api/app/
├── main.py              # FastAPI app entry
├── config.py            # Settings from env (pydantic-settings)
├── database.py          # Async SQLAlchemy engine
├── models/              # ORM models
├── schemas/             # Pydantic request/response
├── routers/             # API route handlers
├── services/            # Business logic
├── tasks/               # Celery async tasks
├── middleware/           # JWT auth
└── utils/               # Markdown parser, file storage, media
```

## API Base URL

`/api/v1` — all endpoints prefixed

## Auth Flow

1. `POST /auth/register` → create user
2. `POST /auth/login` → JWT pair (access + refresh)
3. `POST /auth/refresh` → new access token
4. All other endpoints require `Authorization: Bearer <access_token>`
