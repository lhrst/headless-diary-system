# Implementation Progress Log

## Status Legend
- ✅ Completed
- 🔄 In Progress
- ⬚ Not Started

---

## Phase 1 — MVP Backend + Minimal Web

### Backend Infrastructure
- ✅ FastAPI project setup (`api/app/main.py`, `config.py`)
- ✅ Database connection (`database.py`, async + sync SQLAlchemy)
- ✅ ORM models (users, diary_entries, diary_tags, diary_references, diary_comments, agent_tasks, diary_media)
- ✅ Pydantic schemas (request/response for all entities)
- ✅ Alembic migrations setup + initial migration (001_initial_schema)
- ✅ Auth endpoints (register, login, refresh, me)
- ✅ JWT middleware (access + refresh tokens)
- ✅ Diary CRUD endpoints (create, list, get, update, delete)
- ✅ Markdown parser (`#tags`, `[[refs]]`, `@agent`, `media://` extraction)
- ✅ Tag suggest API
- ✅ File storage utility (save/read/delete .md files)

### Docker & DevOps
- ✅ docker-compose.yml (production)
- ✅ docker-compose.dev.yml (dev overrides)
- ✅ API Dockerfile + Dockerfile.dev
- ✅ Web Dockerfile
- ✅ .env.example
- ✅ Makefile

### Frontend Basics
- ✅ Next.js 15 project setup (App Router, TypeScript, Tailwind)
- ✅ API client with auth (auto-refresh, error handling)
- ✅ Login/Register pages
- ✅ Timeline page (diary list with search & tag filter)
- ✅ Diary detail page (markdown rendering, comments, refs)
- ✅ Diary editor (new + edit)
- ✅ Theme system (CSS variables, default + journal themes)
- ✅ Settings page (theme switcher)

---

## Phase 2 — Rich Editor + References

- ✅ `[[reference]]` parsing + UUID/title resolution
- ✅ Diary suggest API (fuzzy title search)
- ✅ Bidirectional reference queries (references + backlinks)
- ✅ TipTap editor integration (StarterKit, Placeholder, toolbar)
- ✅ `#tag` suggestion component (TagSuggest.tsx)
- ✅ `[[` reference suggestion component (DiarySuggest.tsx)
- ✅ Diary detail page (rendered markdown with tags/refs)
- ✅ Tag cloud page + tag filter page
- ✅ Navbar component with navigation

---

## Phase 3 — Agent + Auto-Title

- ✅ Celery setup + Redis broker config
- ✅ Auto-title generation task (Haiku via OpenRouter)
- ✅ `@agent` command parsing
- ✅ Agent task execution (Sonnet via OpenRouter for complex, Haiku for simple)
- ✅ Agent context building (tags, refs, weekly entries)
- ✅ Agent results → comments (stored as agent comments)
- ✅ Agent task status API (list, get, dispatch, retry)
- ✅ Frontend: AgentStatus component
- ✅ Frontend: CommentThread component (user + agent comments)

---

## Phase 2+ — Multimedia Support

- ✅ `diary_media` model + migration
- ✅ Media storage abstraction (LocalMediaStorage)
- ✅ Upload endpoint (`POST /media/upload`)
- ✅ Photo processing (HEIC→WebP conversion, thumbnail generation)
- ✅ Media retrieve endpoints (file, thumb, info, text)
- ✅ Media manage endpoints (update, delete, list, recaption)
- ✅ Photo captioning task (Claude Vision via OpenRouter)
- ✅ Audio transcription task (faster-whisper local + cloud fallback)
- ✅ Video captioning task (keyframe extraction + vision + whisper)
- ✅ Markdown embed syntax parsing (`media://uuid`)
- ✅ Frontend: MediaEmbed components (PhotoEmbed, AudioEmbed, VideoEmbed)
- ✅ Frontend: MediaTextBadge (status indicator)
- ⬚ Unified search across diary text + media_text (SQL ready, needs router integration)
- ⬚ Frontend: drag-and-drop upload in TipTap editor

---

## Phase 5 — Production Deploy

- ✅ Nginx config (reverse proxy)
- ✅ Health check endpoint (`/health`)
- ✅ PWA manifest
- ✅ Backup scripts (Makefile)
- ⬚ SSL config (Let's Encrypt template)
- ⬚ Rate limiting on auth endpoints

---

## Configuration Notes

- **LLM API**: OpenRouter (key in `.env`)
  - Base URL: `https://openrouter.ai/api/v1`
  - Models: `anthropic/claude-sonnet-4-20250514` (complex), `anthropic/claude-haiku-4-5-20251001` (simple)
- **Database**: PostgreSQL 16 with `pg_trgm` extension
- **Queue**: Celery + Redis
- **Storage**: Dual — `.md` files on disk + PostgreSQL for queries
- **Auth**: JWT (access 30min, refresh 7d)
