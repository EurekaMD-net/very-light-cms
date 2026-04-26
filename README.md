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
| Auth       | JWT (Phase 2) |
| Runtime    | Node.js 20+ ESM, TypeScript |

---

## Project Status

| Phase | Scope                                    | Status      |
|-------|------------------------------------------|-------------|
| 0     | Repo init, architecture, base scaffolding | ✅ Done     |
| 1     | Content engine (parser + renderer + DB)  | ✅ Done     |
| 2     | REST API (read + write, no auth yet)     | ✅ Done     |
| 3     | Auth (JWT) + Admin UI (server-rendered)  | 🔜 Next     |
| 4     | Public site renderer + default theme     | Pending     |
| 5     | Media upload + storage abstraction       | Pending     |
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
  index.ts            ← Hono app entry, route stubs, server start
  config.ts           ← ENV vars → typed config object
  content/
    types.ts          ← FrontMatter, ContentNode interfaces
    parser.ts         ← raw Markdown string → ContentNode
    resolver.ts       ← slug → absolute file path (path-traversal safe)
    renderer.ts       ← ContentNode → semantic HTML fragment
  db/
    schema.sql        ← DDL: pages, media, users, settings
    database.ts       ← getDatabase() singleton + schema init
  lib/
    errors.ts         ← AppError → NotFoundError / ValidationError
    slugify.ts        ← title → URL-safe slug (no deps)
content/pages/        ← .md files (git-trackable content)
data/cms.db           ← SQLite database (gitignored)
tests/
  content/
    parser.test.ts    ← 5 unit tests
    renderer.test.ts  ← 12 unit tests
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

### Pages — write (no auth — Phase 3 adds JWT)

```bash
# Create a page (draft=true by default — safe default)
POST /api/pages
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
