# Headless Diary System — Complete Spec

## 0. Overview

A self-hosted, API-first diary system with tag/reference autocomplete, AI agent integration, and swappable frontends. Designed for fast Docker-based deployment and migration.

**Core philosophy**: Backend is a pure JSON API. Frontend is a separate project that consumes the API. They share nothing except the API contract. You can swap, reskin, or multiply frontends without touching the backend.

---

## 1. Tech Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Backend API | Python + FastAPI | Python 3.12, FastAPI 0.115+ | Async, typed, great for LLM integration |
| Database | PostgreSQL | 16+ | Relational integrity, full-text search, trigram index |
| Cache / Queue broker | Redis | 7+ | Tag suggestion cache, Celery broker |
| Task queue | Celery | 5.4+ | Async agent tasks, auto-title generation |
| File storage | Local filesystem | — | Diary content stored as `.md` files |
| Web frontend | Next.js (React) | 15+ (App Router) | SSR, PWA, theme system |
| Rich text editor | TipTap (ProseMirror) | 2.x | Native mention/suggestion plugin support |
| iOS client | SwiftUI | iOS 17+ | Native experience, URLSession for API |
| Auth | JWT (access + refresh) | — | Stateless, cross-platform |
| Deployment | Docker Compose | — | One-command deploy and migrate |
| Reverse proxy | Nginx | — | SSL termination, static files, routing |
| LLM | Anthropic Claude API | claude-sonnet-4-20250514 / claude-haiku-4-5-20251001 | Agent reasoning / auto-title |

---

## 2. Project Structure

```
diary-system/
├── docker-compose.yml
├── docker-compose.dev.yml          # Local dev overrides (hot reload, no nginx)
├── .env.example                    # Template for secrets
├── Makefile                        # Shortcuts: make dev, make prod, make migrate
│
├── api/                            # Backend (FastAPI)
│   ├── Dockerfile
│   ├── pyproject.toml              # Dependencies (uv or pip)
│   ├── alembic/                    # DB migrations
│   │   ├── alembic.ini
│   │   └── versions/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, lifespan
│   │   ├── config.py               # Settings from env vars (pydantic-settings)
│   │   ├── database.py             # Async SQLAlchemy engine + session
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── diary.py
│   │   │   ├── tag.py
│   │   │   ├── reference.py
│   │   │   └── comment.py
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── diary.py
│   │   │   ├── tag.py
│   │   │   └── comment.py
│   │   ├── routers/                # API route handlers
│   │   │   ├── __init__.py
│   │   │   ├── auth.py             # POST /auth/register, /auth/login, /auth/refresh
│   │   │   ├── diary.py            # CRUD + search + suggest
│   │   │   ├── tag.py              # Tag suggest + stats
│   │   │   ├── comment.py          # Append comments (user + agent)
│   │   │   └── agent.py            # Agent dispatch + status
│   │   ├── services/               # Business logic
│   │   │   ├── diary_service.py    # Parse tags/refs from md, save file + DB
│   │   │   ├── tag_service.py      # Tag extraction, suggestion ranking
│   │   │   ├── reference_service.py # Bidirectional reference resolution
│   │   │   ├── agent_service.py    # @agent command parsing + dispatch
│   │   │   └── title_service.py    # Auto-title generation via LLM
│   │   ├── tasks/                  # Celery async tasks
│   │   │   ├── __init__.py         # Celery app config
│   │   │   ├── agent_tasks.py      # Run agent reasoning
│   │   │   └── title_tasks.py      # Generate auto-title
│   │   ├── middleware/
│   │   │   └── auth.py             # JWT validation dependency
│   │   └── utils/
│   │       ├── markdown.py         # Parse #tags, [[refs]], @agent from md
│   │       └── file_storage.py     # Read/write .md files
│   └── tests/
│       ├── conftest.py
│       ├── test_diary.py
│       ├── test_tags.py
│       └── test_agent.py
│
├── web/                            # Frontend (Next.js)
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.js
│   ├── src/
│   │   ├── app/                    # App Router pages
│   │   │   ├── layout.tsx          # Root layout, theme provider
│   │   │   ├── page.tsx            # Dashboard / timeline
│   │   │   ├── login/page.tsx
│   │   │   ├── diary/
│   │   │   │   ├── [id]/page.tsx   # View single diary
│   │   │   │   └── new/page.tsx    # New diary editor
│   │   │   ├── tags/
│   │   │   │   └── [tag]/page.tsx  # Filter by tag
│   │   │   └── settings/page.tsx
│   │   ├── components/
│   │   │   ├── Editor.tsx          # TipTap editor with suggestion plugins
│   │   │   ├── TagSuggest.tsx      # # autocomplete popup
│   │   │   ├── DiarySuggest.tsx    # [[ autocomplete popup
│   │   │   ├── DiaryCard.tsx       # Timeline card
│   │   │   ├── CommentThread.tsx   # Comments / agent responses
│   │   │   ├── ThemeSwitcher.tsx
│   │   │   └── AgentStatus.tsx     # Shows pending/completed agent tasks
│   │   ├── lib/
│   │   │   ├── api.ts              # API client (fetch wrapper with auth)
│   │   │   ├── auth.ts             # JWT storage, refresh logic
│   │   │   └── types.ts            # TypeScript types matching API schemas
│   │   └── themes/                 # Multiple theme CSS files
│   │       ├── default.css
│   │       ├── minimal.css
│   │       └── journal.css         # Handwriting / warm style
│   └── public/
│       └── manifest.json           # PWA manifest
│
├── nginx/
│   ├── nginx.conf                  # Production: proxy API + serve web
│   └── ssl/                        # SSL certs (mount or Let's Encrypt)
│
└── data/                           # Persistent volumes (gitignored)
    ├── postgres/                   # PG data dir
    ├── redis/
    └── diaries/                    # .md files organized by user/year/month
```

---

## 3. Database Schema

### 3.1 Users

```sql
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(50) UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(100),
    role          VARCHAR(20) DEFAULT 'user',  -- 'user' | 'admin' | 'agent'
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 Diary Entries

```sql
CREATE TABLE diary_entries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    manual_title   VARCHAR(200),                     -- User-set title (optional)
    auto_title     VARCHAR(100),                     -- LLM-generated title
    content_path   VARCHAR(500) NOT NULL,             -- Relative path to .md file
    raw_text       TEXT,                              -- Full text copy for search
    content_hash   VARCHAR(64),                       -- MD5 of raw_text, for change detection
    is_agent_marked BOOLEAN DEFAULT FALSE,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Full-text search index (Chinese support via zhparser or pg_jieba if available)
CREATE INDEX idx_diary_fts ON diary_entries USING gin(to_tsvector('simple', raw_text));

-- Trigram index for title fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_diary_title_trgm ON diary_entries USING gin(
    COALESCE(manual_title, auto_title, '') gin_trgm_ops
);

CREATE INDEX idx_diary_author ON diary_entries(author_id);
CREATE INDEX idx_diary_created ON diary_entries(created_at DESC);
```

### 3.3 Tags

```sql
CREATE TABLE diary_tags (
    id        BIGSERIAL PRIMARY KEY,
    entry_id  UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    tag       VARCHAR(100) NOT NULL,
    UNIQUE(entry_id, tag)
);

CREATE INDEX idx_tag_name ON diary_tags(tag);
CREATE INDEX idx_tag_prefix ON diary_tags(tag varchar_pattern_ops);  -- For LIKE 'xxx%'
CREATE INDEX idx_tag_entry ON diary_tags(entry_id);
```

### 3.4 References (diary-to-diary links)

```sql
CREATE TABLE diary_references (
    id         BIGSERIAL PRIMARY KEY,
    source_id  UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    target_id  UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    UNIQUE(source_id, target_id),
    CHECK(source_id != target_id)
);

CREATE INDEX idx_ref_source ON diary_references(source_id);
CREATE INDEX idx_ref_target ON diary_references(target_id);  -- For "who references me" queries
```

### 3.5 Comments (append-only, supports both user and agent)

```sql
CREATE TABLE diary_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id    UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    author_id   UUID NOT NULL REFERENCES users(id),
    author_role VARCHAR(20) DEFAULT 'user',  -- 'user' | 'agent'
    content     TEXT NOT NULL,
    metadata    JSONB,                        -- For agent: {task_id, model, tokens_used, ...}
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comment_entry ON diary_comments(entry_id, created_at);
```

### 3.6 Agent Tasks

```sql
CREATE TABLE agent_tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id    UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id),
    command     TEXT NOT NULL,                 -- Raw @agent instruction text
    status      VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'running' | 'done' | 'failed'
    result      TEXT,                          -- Agent response text
    error       TEXT,                          -- Error message if failed
    created_at  TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_task_status ON agent_tasks(status);
CREATE INDEX idx_agent_task_entry ON agent_tasks(entry_id);
```

---

## 4. API Endpoints

Base URL: `/api/v1`

### 4.1 Auth

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/auth/register` | Create account | No |
| POST | `/auth/login` | Get JWT pair (access + refresh) | No |
| POST | `/auth/refresh` | Refresh access token | Refresh token |
| GET | `/auth/me` | Current user info | Yes |

**JWT config**: Access token expires in 30min, refresh token in 7 days. Store in httpOnly cookie (web) or Keychain (iOS).

### 4.2 Diary CRUD

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/diary` | Create new diary entry | Yes |
| GET | `/diary` | List entries (paginated, filterable) | Yes |
| GET | `/diary/:id` | Get single entry with content | Yes |
| PUT | `/diary/:id` | Update entry | Yes (owner) |
| DELETE | `/diary/:id` | Soft-delete entry | Yes (owner) |
| GET | `/diary/:id/references` | Get all references (in + out) | Yes |
| GET | `/diary/:id/backlinks` | Get entries that reference this one | Yes |

**POST/PUT `/diary` request body**:

```json
{
  "content": "今天和贺翔讨论了 #牙冠设计 的边缘线问题...\n\n参考了 [[uuid-of-previous-diary]] 的思路...\n\n@agent 帮我总结最近5篇带 #牙冠设计 标签的日记的核心结论",
  "manual_title": null
}
```

**Backend processing on save** (in `diary_service.py`):

1. Write `content` to `.md` file at `data/diaries/{user_id}/{YYYY}/{MM}/{entry_id}.md`
2. Store `raw_text` in DB for full-text search
3. Compute `content_hash` = MD5 of content
4. Parse `#tags` via regex `#([\w\u4e00-\u9fff]+)` → upsert `diary_tags`
5. Parse `[[uuid]]` or `[[uuid|display_text]]` → upsert `diary_references`
6. Parse `@agent ...` commands → create `agent_tasks` rows → dispatch to Celery
7. If `content_hash` changed significantly (>30% diff from previous) → dispatch `title_tasks.generate_auto_title`

**GET `/diary` query params**:

```
?page=1&per_page=20
&tag=牙冠设计                   # Filter by tag
&q=边缘线                      # Full-text search
&start_date=2026-01-01          # Date range
&end_date=2026-03-23
&sort=created_at:desc           # Sort field + direction
```

**GET `/diary/:id` response**:

```json
{
  "id": "uuid",
  "author": {"id": "uuid", "username": "moon", "display_name": "Moon"},
  "title": "牙冠边缘线优化讨论",
  "title_source": "auto",
  "content": "...(raw markdown)...",
  "tags": ["牙冠设计", "边缘线", "创业"],
  "references_out": [
    {"id": "uuid", "title": "上周设计方案", "date": "2026-03-18"}
  ],
  "backlinks": [
    {"id": "uuid", "title": "本周进展汇总", "date": "2026-03-22"}
  ],
  "comments": [...],
  "agent_tasks": [
    {"id": "uuid", "command": "总结最近5篇...", "status": "done"}
  ],
  "is_agent_marked": false,
  "created_at": "2026-03-23T10:30:00Z",
  "updated_at": "2026-03-23T10:30:00Z"
}
```

### 4.3 Suggestions (Autocomplete)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/tags/suggest?q=牙&limit=8` | Tag autocomplete | Yes |
| GET | `/diary/suggest?q=边缘&limit=6` | Diary title autocomplete | Yes |

**GET `/tags/suggest` response**:

```json
{
  "suggestions": [
    {"tag": "牙冠设计", "count": 42},
    {"tag": "牙列分割", "count": 17},
    {"tag": "牙科", "count": 8}
  ]
}
```

**Implementation**: Query `diary_tags` grouped by tag, filtered by `tag LIKE '{q}%'` (prefix) with fallback to `tag % '{q}'` (trigram fuzzy). Order by usage count DESC. Cache top-100 tags in Redis (refresh every 5 min).

**GET `/diary/suggest` response**:

```json
{
  "suggestions": [
    {
      "id": "uuid",
      "title": "牙冠边缘线优化讨论",
      "date": "2026-03-20",
      "preview": "今天和贺翔讨论了边缘线的..."
    }
  ]
}
```

**Implementation**: Search `COALESCE(manual_title, auto_title, LEFT(raw_text, 50))` using trigram similarity `% '{q}'` with threshold 0.15. Order by `similarity DESC, updated_at DESC`. Limit to current user's entries.

### 4.4 Comments

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/diary/:id/comments` | Append a comment | Yes |
| GET | `/diary/:id/comments` | List comments (paginated) | Yes |

Comments are append-only (no edit, no delete). Agent responses are also stored as comments with `author_role: "agent"`.

### 4.5 Agent

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/agent/tasks?status=pending` | List agent tasks | Yes |
| GET | `/agent/tasks/:id` | Get task detail + result | Yes |
| POST | `/agent/retry/:id` | Retry a failed task | Yes |

Agent tasks are created automatically when `@agent` is detected in diary content during save. The API also supports manual dispatch:

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/agent/dispatch` | Manually send a command | Yes |

```json
{
  "entry_id": "uuid",
  "command": "给这篇日记打标签"
}
```

### 4.6 Tags

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/tags` | List all tags with counts | Yes |
| GET | `/tags/:tag/entries` | List entries with this tag | Yes |
| DELETE | `/tags/:tag` | Remove a tag from all entries | Yes (admin) |

---

## 5. Markdown Parsing Rules

The backend parses diary content to extract structured data. All parsing happens in `app/utils/markdown.py`.

### 5.1 Tags: `#tag_name`

**Regex**: `(?<!\w)#([\w\u4e00-\u9fff]{1,50})(?!\w)`

- Matches `#工作`, `#dental_design`, `#2026Q1`
- Does NOT match inside code blocks, URLs, or headings (`## heading`)
- Tags are case-insensitive, stored lowercase
- Max 50 chars per tag
- Strip markdown code fences before parsing

### 5.2 References: `[[...]]`

**Formats supported**:

- `[[uuid]]` — Reference by ID
- `[[uuid|display text]]` — Reference by ID with custom display text
- `[[diary title query]]` — Fuzzy match by title (resolve to UUID on save)

**Regex**: `\[\[([^\]]+)\]\]`

**Resolution logic** (in `reference_service.py`):

1. If content matches UUID format → direct lookup
2. If content contains `|` → split into `uuid|display_text`, use UUID part
3. Otherwise → fuzzy search `diary_entries` by title, pick best match, replace with `[[resolved_uuid|original_text]]` on save
4. Create rows in `diary_references` for all resolved links

### 5.3 Agent commands: `@agent ...`

**Regex**: `@agent\s+(.+?)(?:\n|$)`

- Captures everything after `@agent` until end of line
- Multiple `@agent` commands in one diary create multiple tasks
- Commands are dispatched as separate Celery tasks

**Built-in agent capabilities** (implemented in `agent_service.py`):

| Command pattern | Action |
|----------------|--------|
| `@agent 总结带 #tag 的最近N篇日记` | Fetch entries by tag, send to LLM for summary |
| `@agent 给这篇日记打标签` | Send content to LLM, extract suggested tags, append to entry |
| `@agent 生成周报` | Fetch this week's entries, summarize into a report |
| `@agent 分析 [[ref]] 和这篇日记的关联` | Fetch both entries, send to LLM for comparison |
| (any other text) | Free-form instruction, send diary content + command to LLM |

**Agent execution flow**:

1. Parse `@agent` command from diary content
2. Create `agent_tasks` row (status: pending)
3. Dispatch Celery task `agent_tasks.run_agent`
4. Worker fetches relevant context (current diary, referenced diaries, tagged diaries as needed)
5. Construct prompt with context + command
6. Call Claude API (claude-sonnet-4-20250514 for complex reasoning, claude-haiku-4-5-20251001 for simple summaries)
7. Store result in `agent_tasks.result`
8. Create a `diary_comments` row with `author_role='agent'` containing the result
9. Optionally update diary tags if the agent suggests them
10. Update task status to 'done' (or 'failed' with error)

**Agent system prompt template**:

```
You are a diary assistant. The user is reviewing their personal diary entries.

Current diary entry:
---
{current_diary_content}
---

{additional_context}

User's instruction: {command}

Respond concisely in the user's language. If asked to suggest tags, return them as a JSON array under a "suggested_tags" key along with your explanation.
```

---

## 6. Auto-Title Generation

**Trigger conditions** (in `diary_service.py` on save):

1. Entry has no `auto_title` yet, OR
2. `content_hash` differs from stored hash AND content length changed by >30%

**Task** (`title_tasks.generate_auto_title`):

1. Fetch diary content
2. Call Claude API (claude-haiku-4-5-20251001) with prompt:
   ```
   用一句话（15字以内中文或8个词以内英文）概括这篇日记的核心内容，作为标题用于引用和检索。不要加引号和标点。直接输出标题，不要任何其他内容。
   
   日记内容：
   {content[:2000]}
   ```
3. Store result in `diary_entries.auto_title`
4. Update `content_hash`

**Display priority**: `manual_title > auto_title > first_line_truncated(30) > date_string`

---

## 7. Frontend Spec (Next.js Web)

### 7.1 Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Timeline | Reverse-chronological diary list with infinite scroll |
| `/login` | Login | Username + password, register link |
| `/register` | Register | Create account |
| `/diary/new` | Editor | TipTap editor, new entry |
| `/diary/[id]` | Viewer | Rendered markdown, comments, references graph |
| `/diary/[id]/edit` | Editor | Edit existing entry |
| `/tags` | Tag cloud | All tags with counts, click to filter |
| `/tags/[tag]` | Tag filter | Entries filtered by tag |
| `/settings` | Settings | Theme, profile, export |

### 7.2 TipTap Editor with Suggestion Plugins

The editor is the core UX. Use TipTap v2 with these extensions:

**Base extensions**: StarterKit (bold, italic, lists, code, headings), Placeholder, Markdown (for paste/export)

**Custom suggestion extension — Tag (`#`)**:

```
Trigger: typing '#'
Plugin: @tiptap/suggestion
Config:
  char: '#'
  command: ({ editor, range, props }) => {
    // Replace the #query range with a styled tag node
    editor.chain().focus().deleteRange(range)
      .insertContent(`#${props.tag} `).run()
  }
  items: async ({ query }) => {
    // Debounce 150ms, then GET /api/v1/tags/suggest?q={query}
    return results.suggestions
  }
  render: () => TagSuggestPopup component
```

**Custom suggestion extension — Diary Reference (`[[`)**:

```
Trigger: typing '[['
Plugin: @tiptap/suggestion
Config:
  char: '[['  // Note: TipTap suggestion triggers on single char; 
              // implement as custom InputRule that detects '[[' 
              // and activates suggestion mode
  command: ({ editor, range, props }) => {
    editor.chain().focus().deleteRange(range)
      .insertContent(`[[${props.id}|${props.title}]]`).run()
  }
  items: async ({ query }) => {
    // GET /api/v1/diary/suggest?q={query}
    return results.suggestions
  }
  render: () => DiarySuggestPopup component
```

**Popup component behavior**:

- Appears below cursor (use TipTap's `clientRect` from suggestion plugin)
- Max 6 items visible, scrollable
- Keyboard navigation: arrow keys + Enter to select, Esc to close
- Shows: tag name + count (for tags), title + date + preview (for diary refs)
- Loading state while API request is in flight
- "Create new tag" option at bottom if no exact match

### 7.3 Theme System

CSS-variable based theming. Each theme is a CSS file that overrides variables:

```css
/* themes/default.css */
:root {
  --diary-bg: #ffffff;
  --diary-text: #1a1a1a;
  --diary-accent: #6366f1;
  --diary-card-bg: #f9fafb;
  --diary-border: #e5e7eb;
  --diary-font-body: 'Inter', sans-serif;
  --diary-font-editor: 'Inter', sans-serif;
  --diary-radius: 8px;
}

/* themes/journal.css — warm handwriting style */
:root {
  --diary-bg: #fef9ef;
  --diary-text: #3d3929;
  --diary-accent: #b45309;
  --diary-card-bg: #fffbf0;
  --diary-border: #e8dcc8;
  --diary-font-body: 'Noto Serif SC', serif;
  --diary-font-editor: 'LXGW WenKai', cursive;
  --diary-radius: 4px;
}
```

Theme switching: store preference in localStorage + user settings API. Apply by swapping the CSS file import.

### 7.4 PWA Support

Add `manifest.json` + service worker for:

- Offline reading of cached diary entries
- Background sync for entries written offline
- Push notifications for agent task completion
- "Add to home screen" on iOS Safari

### 7.5 Markdown Rendering

Use `react-markdown` with plugins:

- `remark-gfm` for tables, strikethrough, task lists
- Custom plugin to render `#tag` as clickable pills (link to `/tags/{tag}`)
- Custom plugin to render `[[uuid|title]]` as clickable internal links (link to `/diary/{uuid}`)
- `rehype-highlight` for code syntax highlighting

---

## 8. iOS Client Spec (SwiftUI)

### 8.1 Architecture

- **Pattern**: MVVM with async/await
- **Networking**: URLSession + Codable, wrapping the same REST API
- **Auth**: Store JWT in Keychain via `KeychainAccess` library
- **Offline**: Core Data for local cache, sync on connectivity
- **Editor**: Custom `UITextView` wrapper with `#` and `[[` detection

### 8.2 Screens

| Screen | Description |
|--------|-------------|
| LoginView | Email + password login |
| TimelineView | Scrollable diary list, pull to refresh |
| DiaryDetailView | Rendered markdown + comments |
| EditorView | Write/edit diary, with autocomplete overlay |
| TagCloudView | All tags as tappable pills |
| TagFilterView | Entries filtered by tapped tag |
| SettingsView | Theme, account, export, about |

### 8.3 Editor Autocomplete on iOS

- Wrap `UITextView` in `UIViewRepresentable`
- Monitor `textViewDidChange` delegate, check text before cursor
- Detect `#` → show `TagSuggestSheet` (`.sheet` presentation or inline overlay)
- Detect `[[` → show `DiarySuggestSheet`
- Both sheets call the same suggest APIs as the web frontend
- On selection, insert text programmatically into the UITextView

### 8.4 Push Notifications

- Register for APNs via `UNUserNotificationCenter`
- Backend sends push when agent task completes (via `apns` library or Firebase)
- Tapping notification opens the diary entry with the new agent comment

---

## 9. Agent System Detail

### 9.1 Celery Configuration

```python
# app/tasks/__init__.py
from celery import Celery

celery_app = Celery(
    "diary_agent",
    broker="redis://redis:6379/0",
    backend="redis://redis:6379/1",
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_time_limit=120,        # 2 min max per task
    task_soft_time_limit=100,
    worker_prefetch_multiplier=1,  # One task at a time per worker
    worker_concurrency=2,
)
```

### 9.2 Agent Task Execution

```python
# Pseudocode for agent_tasks.py

@celery_app.task(bind=True, max_retries=2)
def run_agent(self, task_id: str):
    task = db.get(AgentTask, task_id)
    task.status = "running"
    db.commit()
    
    try:
        # 1. Gather context based on command
        context = agent_service.build_context(task.command, task.entry_id)
        
        # 2. Choose model based on complexity
        model = "claude-haiku-4-5-20251001"  # default
        if any(kw in task.command for kw in ["分析", "对比", "规划", "深度"]):
            model = "claude-sonnet-4-20250514"
        
        # 3. Call LLM
        response = anthropic_client.messages.create(
            model=model,
            system=AGENT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": context + "\n\nInstruction: " + task.command}],
            max_tokens=2000,
        )
        
        result_text = response.content[0].text
        
        # 4. Post-process: extract suggested tags if present
        if "suggested_tags" in result_text:
            tags = parse_suggested_tags(result_text)
            tag_service.add_tags(task.entry_id, tags)
            diary_service.mark_agent(task.entry_id)
        
        # 5. Save result as comment
        comment_service.create_comment(
            entry_id=task.entry_id,
            author_id=AGENT_USER_ID,
            author_role="agent",
            content=result_text,
            metadata={"task_id": task_id, "model": model, "tokens": response.usage.output_tokens}
        )
        
        task.status = "done"
        task.result = result_text
        task.completed_at = now()
        
    except Exception as e:
        task.status = "failed"
        task.error = str(e)
        raise self.retry(exc=e, countdown=30)
    
    finally:
        db.commit()
```

### 9.3 Agent Context Building

```python
def build_context(command: str, entry_id: str) -> str:
    """Build LLM context based on command content."""
    
    parts = [f"Current diary:\n{get_diary_content(entry_id)}"]
    
    # If command mentions a tag, fetch recent entries with that tag
    tag_match = re.search(r'#([\w\u4e00-\u9fff]+)', command)
    if tag_match:
        tag = tag_match.group(1)
        entries = get_entries_by_tag(tag, limit=10)
        parts.append(f"\nRecent entries tagged #{tag}:\n")
        for e in entries:
            parts.append(f"---\n[{e.display_title}] ({e.created_at.date()})\n{e.raw_text[:500]}\n")
    
    # If command mentions [[ref]], fetch that diary
    ref_match = re.findall(r'\[\[([^\]]+)\]\]', command)
    for ref in ref_match:
        ref_entry = resolve_reference(ref)
        if ref_entry:
            parts.append(f"\nReferenced diary [{ref_entry.display_title}]:\n{ref_entry.raw_text[:1000]}\n")
    
    # If "周报" or "本周", fetch this week's entries
    if any(kw in command for kw in ["周报", "本周", "这周", "weekly"]):
        week_entries = get_entries_this_week(entry.author_id)
        parts.append(f"\nThis week's entries ({len(week_entries)} total):\n")
        for e in week_entries:
            parts.append(f"- [{e.display_title}] ({e.created_at.date()}): {e.raw_text[:200]}...\n")
    
    return "\n".join(parts)
```

---

## 10. Docker Compose

### 10.1 Production (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  api:
    build: ./api
    env_file: .env
    volumes:
      - ./data/diaries:/data/diaries
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped
    networks:
      - diary-net

  celery-worker:
    build: ./api
    command: celery -A app.tasks worker --loglevel=info --concurrency=2
    env_file: .env
    volumes:
      - ./data/diaries:/data/diaries
    depends_on:
      - api
      - redis
    restart: unless-stopped
    networks:
      - diary-net

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: diary
      POSTGRES_USER: diary_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U diary_user -d diary"]
      interval: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - diary-net

  redis:
    image: redis:7-alpine
    volumes:
      - ./data/redis:/data
    restart: unless-stopped
    networks:
      - diary-net

  web:
    build: ./web
    env_file: .env
    depends_on:
      - api
    restart: unless-stopped
    networks:
      - diary-net

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
      - web
    restart: unless-stopped
    networks:
      - diary-net

networks:
  diary-net:
    driver: bridge
```

### 10.2 Dev (`docker-compose.dev.yml`)

```yaml
version: '3.8'

services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    volumes:
      - ./api/app:/app/app           # Hot reload
      - ./data/diaries:/data/diaries
    ports:
      - "8000:8000"                   # Direct API access
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  web:
    command: npm run dev
    volumes:
      - ./web/src:/app/src            # Hot reload
    ports:
      - "3000:3000"                   # Direct web access
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

  postgres:
    ports:
      - "5432:5432"                   # Direct DB access for debugging

  redis:
    ports:
      - "6379:6379"
```

**Usage**:

```bash
# Local dev (Mac)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Production deploy
docker compose up -d

# Migration to new server
rsync -avz ./data/ newserver:/opt/diary/data/
rsync -avz ./docker-compose.yml .env newserver:/opt/diary/
ssh newserver "cd /opt/diary && docker compose up -d"
```

### 10.3 Makefile

```makefile
.PHONY: dev prod migrate test

dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

prod:
	docker compose up -d --build

stop:
	docker compose down

logs:
	docker compose logs -f

migrate:
	docker compose exec api alembic upgrade head

seed:
	docker compose exec api python -m app.seed  # Create default admin user + agent user

test:
	docker compose exec api pytest -v

backup:
	tar -czf backup-$(shell date +%Y%m%d).tar.gz data/

deploy-to:  # Usage: make deploy-to HOST=/opt/diary SERVER=myserver.com
	rsync -avz --exclude='data/postgres' ./ $(SERVER):$(HOST)/
	rsync -avz data/ $(SERVER):$(HOST)/data/
	ssh $(SERVER) "cd $(HOST) && docker compose up -d --build"
```

---

## 11. Environment Variables (`.env.example`)

```bash
# Database
POSTGRES_PASSWORD=change_me_in_production
DATABASE_URL=postgresql+asyncpg://diary_user:${POSTGRES_PASSWORD}@postgres:5432/diary

# Redis
REDIS_URL=redis://redis:6379/0

# JWT
JWT_SECRET=change_me_random_string_64_chars
JWT_ACCESS_EXPIRE_MINUTES=30
JWT_REFRESH_EXPIRE_DAYS=7

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-...

# File storage
DIARY_STORAGE_PATH=/data/diaries

# Web
NEXT_PUBLIC_API_URL=https://yourdomain.com/api/v1

# Agent
AGENT_USER_ID=00000000-0000-0000-0000-000000000001  # Pre-seeded agent user
```

---

## 12. Nginx Config

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # API
    location /api/ {
        proxy_pass http://api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket (for real-time agent status)
    location /ws/ {
        proxy_pass http://api:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Web frontend
    location / {
        proxy_pass http://web:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 13. Implementation Order

### Phase 1 — MVP Backend + Minimal Web (Target: 1-2 weeks)

1. `api/`: FastAPI project setup, config, database connection
2. DB models + Alembic initial migration
3. Auth endpoints (register, login, JWT)
4. Diary CRUD endpoints (create, list, get, update, delete)
5. Markdown parser: extract `#tags` on save
6. Tag suggest API endpoint
7. Docker Compose (api + postgres + redis)
8. `web/`: Next.js setup, login page, timeline page, basic editor (textarea, no TipTap yet)
9. **Milestone**: Can write, save, list, and search diary entries via web

### Phase 2 — Rich Editor + References (Target: 1-2 weeks)

10. TipTap editor integration with `#tag` suggestion plugin
11. `[[reference]]` parsing + diary suggest API
12. TipTap `[[` suggestion plugin
13. Bidirectional reference queries (references + backlinks)
14. Diary detail page: rendered markdown with clickable tags/refs
15. Tag cloud page + tag filter page
16. **Milestone**: Full tag + reference autocomplete working in browser

### Phase 3 — Agent + Auto-Title (Target: 1 week)

17. Celery setup + Redis broker
18. Auto-title task (Haiku)
19. `@agent` command parsing
20. Agent task execution (Sonnet)
21. Agent results → comments
22. Agent task status API + frontend display
23. **Milestone**: Can @agent in diary and get intelligent responses

### Phase 4 — Polish + iOS (Target: 2-4 weeks)

24. Theme system (3 built-in themes)
25. PWA manifest + service worker
26. Comments UI (view + append)
27. Settings page (theme, profile, export)
28. iOS app: project setup, networking layer, auth
29. iOS: timeline, viewer, editor with autocomplete
30. iOS: push notifications for agent completion
31. **Milestone**: Full system running on web + iOS

### Phase 5 — Production Deploy (Target: 1 week)

32. Nginx config with SSL (Let's Encrypt)
33. Domain setup
34. Backup script (cron + tar)
35. Monitoring (health check endpoint)
36. Rate limiting on auth endpoints
37. **Milestone**: Live on your domain

---

## 14. Key Design Decisions & Rationale

**Why filesystem .md + PostgreSQL (dual storage)?**
The .md files are your escape hatch. If the system ever dies, you still have readable markdown files organized by date. The DB is for fast queries, tags, references, and search. They're kept in sync by the save flow.

**Why TipTap over other editors?**
TipTap's suggestion plugin is purpose-built for mention/autocomplete UX. Alternatives like CodeMirror or Monaco are code-first and lack this. Slate.js could work but TipTap's plugin ecosystem is more mature for this use case.

**Why Celery over simple background threads?**
Agent tasks can take 10-30s (LLM API calls). Celery gives you: retry on failure, task status tracking, concurrency control, and the worker runs in a separate container so a slow agent task never blocks the API. Overkill for 10 users, but the right foundation.

**Why JWT over session cookies?**
Cross-platform. The same token works in the web app, iOS app, and any future client. No server-side session storage needed.

**Why not use Obsidian/Logseq as the frontend?**
They don't support custom user systems, agent integration, or server-side rendering. You'd be fighting their architecture to add features 6, 7, and 8. Building a custom frontend with TipTap gives you full control.

---

## 15. Claude Code Usage Guide

Feed this spec to Claude Code as the project's `SPEC.md`. Recommended workflow:

```bash
# In your project root
mkdir diary-system && cd diary-system
cp /path/to/this/file SPEC.md

# Start Claude Code
claude

# Then tell it:
# "Read SPEC.md and implement Phase 1. Start with the API project setup."
# "Now implement the diary CRUD endpoints per the spec."
# "Now set up Docker Compose for local dev."
# etc.
```

Work through phases sequentially. Each phase builds on the previous one. Don't skip ahead — the data model in Phase 1 is the foundation for everything.
