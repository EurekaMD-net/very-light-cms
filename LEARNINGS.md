# LEARNINGS — Very Light CMS

Engineering decisions, gotchas, and lessons captured during development.
Updated continuously. Newest entries at the top.

---

## Phase 2 — REST API (2026-04-26)

### Mounting read + write routers on the same path
Hono allows two routers (`pages` + `pagesWrite`) to be mounted at the same base path (`/api/pages`). GET routes in one router don't conflict with POST/PUT/DELETE in the other — HTTP method dispatching resolves correctly. Pattern: mount order matters only when routes are identical in both path and method.

---

### Soft delete as safe default
`DELETE /api/pages/:slug` defaults to `draft=1` (soft delete) — the row stays in DB, the file stays on disk. The page simply disappears from the public API. `?permanent=true` triggers hard delete. This matches the "reversible by default" principle and protects against accidental data loss.

---

### Slug immutability — enforced by omission
The PUT handler doesn't accept a `slug` field in `UpdateSchema`. The slug is the URL key and the filename — changing it would break existing links and orphan the file. Immutability is enforced by simply not supporting the field, not by a runtime guard.

---

### Rollback pattern for file + DB writes
POST creates the `.md` file first, then inserts the DB row. If the DB insert fails, the file must be cleaned up:

```typescript
try {
  db.prepare(...).run(...);
} catch {
  try { unlinkSync(filePath); } catch { /* ignore */ }
  return fail(c, "Failed to save page to database", 500);
}
```

The reverse (write file on DB success) would leave a DB row without a file — harder to detect. File-first + rollback is the safer order.

---

### Test isolation: temp dir + in-memory DB per test
Each test gets a fresh `:memory:` DB (schema applied programmatically) and a unique temp dir under `os.tmpdir()`. `afterEach` closes the DB and removes the temp dir. This avoids test pollution without any global state and makes tests order-independent.

---

### `require()` in test helpers — ESM gotcha
One test helper used `require("node:fs")` which fails in ESM. Pattern: always use `await import("node:fs")` or top-level static imports in ESM test files. `require()` is blocked at runtime even inside test utilities.

---

## Phase 1 — Content Engine (2026-04-26)

### `marked.parse()` type ambiguity
`marked` v14+ declares `marked.parse()` as returning `string | Promise<string>` even when called with `{ async: false }`. A naive `as string` cast compiles but hides future API drift. Correct pattern:

```typescript
const result = marked.parse(content, { async: false });
const html = typeof result === "string" ? result : "";
```
**Rule**: never cast away a union type — guard it explicitly.

---

### `gray-matter` behavior on empty frontmatter
When a `.md` file has no YAML block, `matter(raw).data` returns `{}` (not `undefined`). No defaults are injected into `FrontMatter` — missing fields like `title` are intentionally `undefined`. Consumer code must handle the absence.

---

### Path traversal — three-layer guard in `resolver.ts`
Defense in depth against `../../etc/passwd`-style slugs:
1. Strip leading slashes
2. `normalize()` collapses `../` sequences — re-check for leading `..`
3. `startsWith(contentDir + "/")` final containment check

No single layer is sufficient. All three must pass.

---

### `better-sqlite3` singleton + test teardown
`getDatabase()` returns a module-level singleton. Tests must call `closeDatabase()` in `afterEach`/`afterAll` to avoid `SQLITE_BUSY` errors across test files. Pattern established in `database.ts`.

---

### `slugify` — no external dependency
A slug function that handles diacritics (NFD normalize + strip combining marks) + lowercase + hyphenate is ~10 lines of vanilla JS. No `slugify` npm package needed. Dependency count matters.

---

### `FrontMatter.title` — optional, not required
Initially typed as `title: string` (required). Tests revealed the correct contract: frontmatter fields are **optional** by default — the parser doesn't inject defaults. Downstream (renderer, resolver) handles the `undefined` case explicitly.

---

### HTML sanitization deferred to Phase 3
`renderer.ts` injects `node.html` (Markdown-rendered output) directly into the template without re-escaping. This is correct for trusted Markdown files. When Phase 3 introduces a user-facing editor, evaluate `dompurify` or equivalent. Tracked as a known debt item.

---

### Vitest + ESM — `vi.hoisted()` for shared mocks
When mocking modules that need shared variables (e.g., a mock DB instance accessible across `describe` blocks), use `vi.hoisted()`. Arrow functions inside `vi.mock()` break `this` binding — use `function()` declarations.

---

### `import.meta.url` for `__dirname` in ESM
`better-sqlite3` needs an absolute path to `schema.sql`. In ESM modules, `__dirname` doesn't exist. Pattern:

```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "schema.sql");
```

---

## Phase 0 — Scaffolding (2026-04-26)

### Local path must be in authorized write zone
`file_write` and `shell_exec` only work under `/root/claude/` and `/workspace/`. Cloning to a non-authorized path (e.g., `/tmp/`) silently fails or is blocked. Always clone to `/root/claude/projects/<repo>/`.

### Remote must be `EurekaMD-net/` — verified before every push
Protocol: `git remote -v` before `git_push`. Remote must point to `https://github.com/EurekaMD-net/...`. No exceptions.

---

## Phase 3 — Auth + Admin UI (2026-04-26)

### `config` as module-level const breaks test env isolation
When `config` is evaluated at module parse time (ESM), `process.env` overrides set in test files arrive too late — vitest hoists `import` statements above top-level test code. Fix: read env vars lazily inside the function that uses them (e.g., `resolveDbPath()` inside `getDatabase()`), not in a module-level `const config`.

### Hono route mount + trailing slash
`app.route("/admin", admin)` maps `admin.get("/")` to `GET /admin` (no trailing slash). Tests must request `/admin`, not `/admin/` — Hono doesn't auto-redirect trailing slashes by default.

### httpOnly cookie security
For Admin UI auth, cookies are safer than `Authorization` headers — HTML `<form>` submits automatically include cookies, Bearer tokens require JavaScript. `httpOnly: true` prevents XSS from reading the token. `sameSite: "Lax"` blocks CSRF from cross-origin form submissions while allowing top-level navigations.

### Dual auth guard (cookie + Bearer)
`apiAuthGuard` accepts both: `Authorization: Bearer <token>` for headless clients and the httpOnly cookie for same-origin UI requests. This makes the API usable from both contexts without duplicating logic.

### bcrypt in tests — async, slow
`hashPassword()` uses `bcryptjs` with cost factor 10 (~100ms). Test suites that seed multiple users add latency. For large test suites, consider `BCRYPT_ROUNDS=4` env override in test config. For now, the suite is fast enough.

### Slug immutability — admin form pattern
Edit form: render slug as `readonly` input. Don't send it in the PUT body (or ignore it server-side). This prevents slug drift while giving the user visibility of the current URL.

### `buildMarkdown()` helper — keep frontmatter canonical
All writes (create, update, publish/unpublish) go through a single `buildMarkdown()` helper. This ensures frontmatter stays consistent and avoids drift between DB and file states.

---

## Phase 4 — Public Site Renderer

### Config singleton + ESM caching (recurrence)
`contentDir` suffered the same ESM hoisting issue as `jwtSecret` — evaluated once at module parse, not per-call. Pattern confirmed: **any config field that tests need to override must be a getter**, not a top-level property. Fixed by converting `contentDir` to a getter in `config.ts`. Rule: when adding new env-driven config fields, always use getter if the field will be overridden in tests.

### Mount order matters
The public router catches `/*` — it MUST be mounted after all other routes (`/api/*`, `/admin/*`). Mounting it first would shadow everything. Documented explicitly in `index.ts` comments.

### ETag with Hono
`c.html(html, 200, { ETag: etag })` — the third argument to `c.html()` sets response headers. Works cleanly. For 304, `c.body(null, 304)` — no body, no content-type.

### CSS as inline `<style>` string
Zero external dependencies for theming. The CSS string is evaluated once at import time and embedded in every page response. No file serving, no build step, no cache invalidation headaches. Trade-off: no browser CSS caching across pages. Acceptable for Phase 4; a `GET /static/theme.css` route can be added in Phase 5.
