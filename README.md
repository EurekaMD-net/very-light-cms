# Very Light CMS

> Solid, functional, powerful — but minimal. Every line earns its place.

A headless CMS engine built on the same principles as VLMP: zero bloat, no magic, no hidden complexity. Markdown files on disk, SQLite for metadata, Hono for the server, zero client-side JavaScript.

---

## Stack

| Layer      | Technology              |
|------------|-------------------------|
| HTTP       | Hono + @hono/node-server |
| Database   | SQLite (better-sqlite3) |
| Content    | Markdown + YAML frontmatter (gray-matter + marked) |
| Templates  | Server-rendered HTML strings (no client JS) |
| Auth       | JWT + httpOnly cookie (Phase 3) |
| Runtime    | Node.js 20+ ESM, TypeScript |

---

## Project Status

| Phase | Scope                                    | Status      |
|-------|------------------------------------------|-------------|
| 0     | Repo init, architecture, base scaffolding | ✅ Done     |
| 1     | Content engine (parser + renderer + DB)  | ✅ Done     |
| 2     | REST API (read + write, no auth yet)     | ✅ Done     |
| 3     | Auth (JWT) + Admin UI (server-rendered)  | ✅ Done     |
| 4     | Public site renderer + default theme     | ✅ Done     |
| 5     | Media upload + storage abstraction       | ✅ Done     |
| 6     | CLI (vlcms admin commands)               | Pending     |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/EurekaMD-net/very-light-cms.git
cd very-light-cms

# 2. Install
npm install

# 3. Configure
cp env.example .env
# Edit .env — at minimum set PORT, DB_PATH, CONTENT_DIR

# 4. Dev mode
npm run dev

# 5. Production
npm run build
node dist/index.js
```

---

## Directory Structure

```
src/
  index.ts            ← Hono app entry, all routes wired, server start
  config.ts           ← ENV vars → typed config object (lazy getters)
  content/
    types.ts          ← FrontMatter, ContentNode interfaces
    parser.ts         ← raw Markdown string → ContentNode
    resolver.ts       ← slug → absolute file path (path-traversal safe)
    renderer.ts       ← ContentNode → semantic HTML fragment
  db/
    schema.sql        ← DDL: pages, media, users, settings
    database.ts       ← getDatabase() singleton + schema init
  api/
    pages.ts          ← REST API: pages CRUD
    media.ts          ← REST API: media upload + list + delete
    auth.ts           ← REST API: login / logout / me
  admin/
    router.ts         ← Admin UI routes (pages + media)
    views/            ← Server-rendered HTML templates
  public/
    router.ts         ← GET / (homepage) + GET /:slug (single page)
    themes/minimal/   ← Default theme (layout, home, page, styles)
  lib/
    errors.ts         ← AppError → NotFoundError / ValidationError
    slugify.ts        ← title → URL-safe slug (no deps)
    escape.ts         ← HTML entity escaping (single source of truth)
    storage.ts        ← StorageDriver interface + LocalDriver
content/pages/        ← .md files (git-trackable content)
uploads/              ← uploaded media files (gitignored)
data/cms.db           ← SQLite database (gitignored)
tests/
  content/            ← parser + renderer unit tests
  api/                ← pages, auth, media integration tests (85 total)
  public/             ← public renderer tests
  fixtures/           ← sample .md files
```

---

## Content Format

Pages are plain Markdown files with YAML frontmatter:

```markdown
---
title: About
description: What this site is about
tags: [meta, about]
date: 2026-04-26
---

Content body in **Markdown**.
```

Files live in `CONTENT_DIR` (default `./content/pages/`). The slug is derived from `frontmatter.slug` → `frontmatter.title` → filename (in that order).

---

## Environment Variables

```bash
PORT=3000
NODE_ENV=development
DB_PATH=./data/cms.db
CONTENT_DIR=./content/pages
UPLOAD_DIR=./uploads          # where media files are stored
SITE_TITLE=My Site            # public homepage title
JWT_SECRET=change_this_in_production
```

See `env.example` for the full reference.

---

## Scripts

```bash
npm run dev         # tsx watch — hot reload
npm run build       # tsc → dist/
npm run typecheck   # tsc --noEmit (zero errors required)
npm test            # vitest run
npm run seed:admin  # create admin user (ADMIN_EMAIL + ADMIN_PASSWORD)
```

---

## API Reference

All endpoints return JSON with a consistent envelope:

```json
// Success
{ "data": { ... } }

// Error
{ "error": "message", "code": 404 }
```

### Pages — read (public)

```bash
# List published pages (paginated)
GET /api/pages?limit=20&offset=0

# Get a single published page with rendered HTML
GET /api/pages/:slug
```

### Auth

```bash
# Login — returns httpOnly cookie + JSON { data: { ok: true } }
POST /api/auth/login
Content-Type: application/json
{ "email": "admin@example.com", "password": "secret" }

# Logout — clears the token cookie
POST /api/auth/logout

# Whoami — reads cookie, returns current user
GET /api/auth/me
```

### Pages — write (JWT required — Bearer or cookie)

```bash
# All write routes require Authorization: Bearer <token>  (or the httpOnly cookie)

# Create a page (draft=true by default — safe default)
POST /api/pages
Authorization: Bearer <token>
Content-Type: application/json
{
  "title": "Hello World",
  "slug": "hello-world",      # optional — derived from title if omitted
  "description": "...",       # optional
  "tags": ["intro"],          # optional
  "draft": false,             # optional, default: true
  "body": "Markdown content." # optional
}

# Update a page (slug is immutable)
PUT /api/pages/:slug
Content-Type: application/json
{ "title": "New Title", "body": "Updated body.", "draft": false }

# Soft-delete (sets draft=1, invisible in public API)
DELETE /api/pages/:slug

# Hard-delete (removes file + DB row — irreversible)
DELETE /api/pages/:slug?permanent=true
```

### Admin UI

Server-rendered, no client-side JavaScript. Auth via httpOnly JWT cookie.

```
GET  /admin/login          → Login form
POST /admin/login          → Authenticate → set cookie → redirect /admin
GET  /admin/logout         → Clear cookie → redirect /admin/login
GET  /admin                → Pages list (auth required)
GET  /admin/pages/new      → New page form (auth required)
POST /admin/pages          → Create page → redirect /admin
GET  /admin/pages/:slug/edit  → Edit form (auth required)
POST /admin/pages/:slug       → Update page → redirect /admin
POST /admin/pages/:slug/publish   → Set draft=0 → redirect /admin
POST /admin/pages/:slug/unpublish → Set draft=1 → redirect /admin
POST /admin/pages/:slug/delete    → Soft-delete → redirect /admin
POST /admin/media/upload   → Upload file → redirect /admin/media
GET  /admin/media          → Media gallery (auth required)
POST /admin/media/:id/delete → Delete file + DB row → redirect /admin/media
```

**First-run setup** — create the admin user before accessing the UI:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret npm run seed:admin
```

### Media (JWT required)

```bash
# List uploaded files
GET /api/media
Authorization: Bearer <token>

# Upload a file (multipart/form-data, field name: "file")
# Max 10MB. Accepted: image/jpeg, image/png, image/gif, image/webp, application/pdf
# image/svg+xml is explicitly blocked (persistent XSS risk)
POST /api/media/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
# body: file=<binary>

# Delete a media item by ID (removes file + DB row)
DELETE /api/media/:id
Authorization: Bearer <token>

# Serve an uploaded file (public, no auth)
GET /media/:filename
```

### Health

```bash
GET /health
# → { "status": "ok", "version": "0.1.0" }
```

---

## Design Constraints

1. **No ORM** — raw SQL, auditable and portable
2. **No client-side JS** — admin UI will be server-rendered
3. **No plugin system** — extend by forking
4. **Additive migrations only** — schema changes never remove columns
5. **Single process** — scale vertically first
6. **Zero magic** — no decorators, no DI, explicit wiring

---

## License

MIT — EurekaMD-net / Very Light project family.

## CLI (`vlcms`)

Manage your CMS from the terminal:

```bash
# Set env vars
export VLCMS_URL=http://localhost:3000
export VLCMS_TOKEN=<jwt-from-login>

# Pages
vlcms pages list
vlcms pages get my-slug
vlcms pages create --title "Hello" --file content.md --publish
vlcms pages update my-slug --title "Updated" --draft
vlcms pages delete my-slug

# Media
vlcms media list
vlcms media upload photo.jpg --alt "A photo"
vlcms media delete 5

# Auth
vlcms whoami

# JSON output (for piping)
vlcms pages list --json | jq '.[].slug'
```

**Run without installing:**
```bash
VLCMS_TOKEN=<jwt> npx tsx src/cli/index.ts pages list
```

