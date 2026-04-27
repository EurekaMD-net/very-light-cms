# ARCHITECTURE.md — Very Light CMS

> **Principle**: Solid, functional, powerful — but minimal. Every line of code must earn its place.
> Inspired by the spirit of VLMP: no bloat, no magic, no hidden complexity.

---

## Philosophy

Very Light CMS is NOT a framework. It is a **content engine** with a deliberate scope:

- Accept structured content (Markdown + frontmatter)
- Render it fast, with zero JavaScript by default
- Expose a clean admin UI for non-technical editors
- Provide a read/write API for headless usage
- Never do anything the user didn't ask for

**Non-goals** (explicitly out of scope):
- Plugin ecosystems
- Multi-tenancy
- Real-time collaboration
- Visual page builders
- Built-in e-commerce

---

## Stack

| Layer       | Technology                  | Reason                                     |
|-------------|-----------------------------|--------------------------------------------|
| Runtime     | Node.js (ESM, TypeScript)   | Ecosystem, typing, familiar                |
| HTTP        | Hono                        | Lightweight, fast, edge-compatible         |
| Database    | SQLite (better-sqlite3)     | Zero-infra, file-portable, fast reads      |
| Templates   | Eta (or plain HTML strings) | Minimal, no build step, server-side only   |
| Auth        | JWT (jsonwebtoken)          | Stateless, simple, no session store needed |
| Storage     | Local filesystem (+ S3 opt) | Start simple, swap without refactor        |
| Content     | Markdown + YAML frontmatter | Human-readable, git-friendly               |
| Build/Dev   | tsx (dev), tsc (prod)       | Consistent with agent-controller pattern   |

---

## Directory Structure

```
very-light-cms/
│
├── src/
│   ├── index.ts               # Entry point — Hono app, routes, server start
│   ├── config.ts              # Central config (env vars, defaults)
│   │
│   ├── content/               # Content engine
│   │   ├── parser.ts          # Markdown + frontmatter → ContentNode
│   │   ├── resolver.ts        # Slug → file path resolution
│   │   ├── renderer.ts        # ContentNode → HTML string
│   │   └── types.ts           # ContentNode, FrontMatter interfaces
│   │
│   ├── db/                    # Persistence layer
│   │   ├── schema.sql         # DDL — pages, media, users, settings
│   │   ├── database.ts        # getDatabase() singleton
│   │   └── migrations/        # Additive-only migration files
│   │
│   ├── api/                   # REST API (headless usage)
│   │   ├── pages.ts           # GET /api/pages, POST /api/pages, etc.
│   │   ├── media.ts           # GET /api/media, POST /api/media/upload
│   │   └── auth.ts            # POST /api/auth/login, POST /logout, GET /me
│   │
│   ├── admin/                 # Admin UI (server-rendered)
│   │   ├── router.ts          # Admin route definitions
│   │   ├── views/             # HTML template strings (or .eta files)
│   │   │   ├── layout.ts      # Base layout with nav
│   │   │   ├── pages-list.ts  # Content list view
│   │   │   ├── page-edit.ts   # Markdown editor + frontmatter form
│   │   │   └── media-list.ts  # Media gallery with upload form + delete
│   │   └── middleware.ts      # Auth guard for /admin/* routes
│   │
│   ├── public/                # Public site renderer (Phase 4)
│   │   ├── router.ts          # GET / (homepage) + GET /:slug (single page)
│   │   └── themes/            # Pluggable HTML themes (default: minimal)
│   │       └── minimal/
│   │           ├── layout.ts  # HTML shell — head, nav, footer, inline CSS
│   │           ├── home.ts    # Homepage: list of published pages
│   │           ├── page.ts    # Single page: title, date, tags, HTML body
│   │           └── styles.ts  # CSS string (inline, no static file serving)
│   │
│   └── lib/                   # Shared utilities
│       ├── auth.ts            # JWT sign/verify helpers
│       ├── slugify.ts         # Title → URL slug
│       ├── escape.ts          # HTML entity escaping (single source of truth)
│       ├── storage.ts         # StorageDriver interface + LocalDriver (write/read/delete/url)
│       └── errors.ts          # AppError class + HTTP status mapping
│
├── content/                   # Default content directory (git-trackable)
│   └── pages/                 # .md files with YAML frontmatter
│
├── public/                    # Static assets served directly
│   ├── css/
│   └── fonts/
│
├── data/
│   └── cms.db                 # SQLite database (gitignored)
│
├── tests/
│   ├── content/               # Unit tests for parser, renderer
│   ├── api/                   # Integration tests for REST API
│   └── fixtures/              # Sample .md files for tests
│
├── ARCHITECTURE.md            # This file
├── README.md                  # Setup + usage
├── .env.example               # Required env vars with comments
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## Data Model

### Page (SQLite + Markdown file)

```
pages
  id           TEXT  PRIMARY KEY  (UUID)
  slug         TEXT  UNIQUE NOT NULL
  title        TEXT  NOT NULL
  status       TEXT  CHECK(status IN ('draft','published','archived'))
  file_path    TEXT  NOT NULL     (relative to /content/pages/)
  created_at   INTEGER            (unixepoch)
  updated_at   INTEGER            (unixepoch)
  published_at INTEGER
```

### User

```
users
  id           TEXT  PRIMARY KEY  (UUID)
  email        TEXT  UNIQUE NOT NULL
  password_hash TEXT NOT NULL     (bcrypt)
  role         TEXT  CHECK(role IN ('admin','editor'))
  created_at   INTEGER
```

### Media

```
media
  id           TEXT  PRIMARY KEY  (UUID)
  filename     TEXT  NOT NULL
  mime_type    TEXT  NOT NULL
  size_bytes   INTEGER
  storage_path TEXT  NOT NULL
  uploaded_at  INTEGER
```

---

## Request Flow

```
Browser / API Client
        │
        ▼
  Hono Router (index.ts)
        │
   ┌────┴──────────┐
   │               │
/api/*    /admin/*    /*
   │          │        │
REST API  Admin UI  Public Site
   │          │        │
   └────┬─────┘        │
        │              │
   DB layer         Content engine
   (SQLite)         (parse → render)
```

---

## API Contracts (v1)

| Method | Path                    | Auth    | Description               |
|--------|-------------------------|---------|---------------------------|
| GET    | /api/pages              | Bearer  | List all pages            |
| GET    | /api/pages/:slug        | Bearer  | Get single page           |
| POST   | /api/pages              | Bearer  | Create page               |
| PUT    | /api/pages/:slug        | Bearer  | Update page               |
| DELETE | /api/pages/:slug        | Bearer  | Delete (soft) page        |
| POST   | /api/media/upload       | Bearer  | Upload media file (10MB max, rasters + PDF only) |
| GET    | /api/media              | Bearer  | List uploaded media       |
| DELETE | /api/media/:id          | Bearer  | Delete media by ID        |
| GET    | /media/:filename        | Public  | Serve uploaded file       |
| POST   | /api/auth/login         | Public  | Login → JWT               |
| GET    | /api/auth/me            | Cookie/Bearer | Current authenticated user |

---

## Configuration (ENV)

```bash
# Server
PORT=3000
NODE_ENV=production

# Auth
JWT_SECRET=change_this_in_production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Storage
CONTENT_DIR=./content         # Directory for .md page files
UPLOAD_DIR=./uploads          # Directory for uploaded media files

# Database
DB_PATH=./data/cms.db

# Public site
SITE_TITLE=My Site            # HTML <title> and <h1> on the homepage

# S3 (Phase 6+, not yet implemented)
# S3_ACCESS_KEY=
# S3_SECRET_KEY=
```

---

## Guiding Constraints

1. **No ORM** — raw SQL via better-sqlite3. Queries are readable and auditable.
2. **No client-side JS** — admin UI is server-rendered. Progressive enhancement only.
3. **No plugin system** — extend by forking, not by hooking. Simplicity > extensibility.
4. **Additive migrations only** — schema changes never delete columns. Backward compatible always.
5. **Single process** — no worker threads, no message queues. Scale vertically first.
6. **Zero magic** — no decorators, no DI containers, no reflection. Explicit wiring only.

---


## CLI (vlcms)

The `vlcms` binary is a thin HTTP client over the REST API. It does NOT import server code — it
communicates exclusively via fetch. Config is injected via environment variables:

| Env var      | Default               | Purpose                              |
|--------------|-----------------------|--------------------------------------|
| `VLCMS_URL`  | `http://localhost:3000` | Base URL of the running CMS server |
| `VLCMS_TOKEN`| (none)                | JWT from `POST /api/auth/login`      |

### Commands

```
vlcms pages list
vlcms pages get <slug>
vlcms pages create --title T [--file F] [--description D] [--publish]
vlcms pages update <slug> [--title T] [--file F] [--description D] [--publish] [--draft]
vlcms pages delete <slug>
vlcms media list
vlcms media upload <file> [--alt T]
vlcms media delete <id>
vlcms whoami
```

All commands accept `--json` for machine-readable output (piping to `jq`, etc.).

### Source layout

```
src/cli/
  index.ts            Entry point — dispatch by entity (pages/media/whoami)
  client.ts           ApiClient — fetch wrapper, auth header, ApiError
  format.ts           fmt.table / fmt.detail / fmt.success / fmt.error
  commands/
    pages.ts          pages subcommands
    media.ts          media subcommands
    auth.ts           whoami
```

### Running

```bash
# Dev (no build needed)
VLCMS_URL=http://localhost:3000 VLCMS_TOKEN=<jwt> npx tsx src/cli/index.ts pages list

# After build
npm run build
VLCMS_URL=http://localhost:3000 VLCMS_TOKEN=<jwt> node dist/cli/index.js pages list

# After npm link / npm install -g
vlcms pages list
```

## Security Notes

### Markdown rendering — admin = trusted model

`marked` v15 removed the `sanitize` option. HTML embedded in Markdown (e.g. `<script>alert(1)</script>`) renders as-is. This is intentional: Very Light CMS operates on an **admin = trusted** model. Only authenticated users with a valid JWT can `POST /api/pages` or write via the admin UI. Untrusted user input never reaches the content pipeline.

If you add a public-facing submission flow (comments, user-generated content), you **must** add sanitization at that boundary — `dompurify` (server-side via jsdom) or a whitelist filter. Do not assume the current architecture handles untrusted input safely.

### SVG uploads — explicitly blocked

`image/svg+xml` is **not** in `ALLOWED_MIME_TYPES` (`src/lib/storage.ts`). SVG is XML that can contain `<script>` tags and event handlers. When served from the same origin, a malicious SVG executes JavaScript under the app's origin — enabling **persistent XSS** and **same-origin cookie theft** (including the admin session JWT). The risk exists even for trusted admins uploading user-supplied assets.

Rasterized formats (JPEG, PNG, GIF, WebP) and PDF are accepted. If SVG support is needed in the future, serve SVG from a separate cookieless origin or run it through a sanitizer (e.g. `svgo` + strip `<script>` / `on*` attributes) before storage.

---

## Phase Plan

| Phase | Scope                                              | Status   |
|-------|----------------------------------------------------|-----------| 
| 0     | Repo init, ARCHITECTURE.md, base scaffolding       | ✅ Done  |
| 1     | Content engine (parser + renderer), SQLite schema  | ✅ Done  |
| 2     | REST API (pages read + write, no auth yet)         | ✅ Done  |
| 3     | Auth (JWT + bcrypt) + Admin UI (server-rendered)   | ✅ Done  |
| 4     | Public site renderer + default theme               | ✅ Done  |
| 5     | Media upload + storage abstraction                 | ✅ Done  |
| 6     | CLI (vlcms admin commands)                         | ✅ Done  |

---

*Last updated: 2026-04-26 — Phase 5 complete*
