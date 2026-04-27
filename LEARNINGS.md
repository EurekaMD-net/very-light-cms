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

### Markdown rendering — admin = trusted, no sanitization needed
`marked` v15 dropped the `sanitize` option. A Markdown post containing `<script>alert(1)</script>` will render the tag as-is. This is a deliberate design decision: only authenticated admins can write content, so the trust boundary is enforced at the auth layer, not the render layer. If a public-facing submission flow is ever added (comments, user forms), sanitization must be applied at that boundary before content reaches the renderer. `dompurify` (server-side via jsdom) is the reference implementation.


---

## Phase 5 -- Media Upload + Storage Abstraction

### StorageDriver interface -- 4-method contract
write(filename, buffer, mime), read(filename), delete(filename), url(filename). The interface is the swap point for future S3/R2 drivers. LocalDriver implements all four. Established as the canonical pattern for any storage backend added later.

### sanitizeFilename() runs only on write, not on read
Sanitization at write-time (slug + timestamp) ensures stored filenames are safe. But read() and delete() receive arbitrary client input -- they need their own containment check independent of sanitization. Lesson: "safe on the way in" is NOT "safe on the way out".

### Defense-in-depth path containment -- both layers
Pattern: resolve(join(root, filename)) then assert startsWith(resolve(root) + "/"). Must live in BOTH the driver method (LocalDriver.read, LocalDriver.delete) AND the route handler catch -> 404. Driver guard protects all future consumers; route guard protects the HTTP surface. Neither alone is sufficient.

### URL-encoded path traversal
GET /media/..%2F..%2Fetc%2Fpasswd -- Hono URL-decodes %2F to / before passing to the param handler. The filename arriving at LocalDriver.read() is ../../etc/passwd, not the encoded string. Tests must use the decoded form; the route receives decoded automatically.

### SVG explicitly blocked from ALLOWED_MIME_TYPES
image/svg+xml removed. SVG is XML that executes JavaScript -- if stored and served from the same origin, a crafted SVG can steal cookies and session tokens. Accepted types: raster images (jpeg, png, gif, webp) + application/pdf. If SVG is needed in the future, serve from a separate origin or sanitize with DOMPurify before storing.

### apiAuthGuard belongs inside the router, not at the mount site
Applying app.use("/api/media", apiAuthGuard) at the mount site only guards the exact path, not sub-routes (/api/media/upload, /api/media/:id). Guard must be applied inside the router per-route or as router-level middleware. The test suite was initially wrong here -- fixed by moving the guard into media.ts and removing the external app.use from tests.

### .. in filename not eliminated by slash-to-underscore substitution
replace(/[\/\\]/g, "_") converts slashes but leaves .. intact -- ../evil.png becomes .._evil.png, still a traversal risk if the containment check is ever missed. Added replace(/\.{2,}/g, "_") to remove consecutive dots. Belt-and-suspenders: sanitize on write AND contain on read/delete.

---

## Phase 6 — CLI (`vlcms`) (2026-04-26)

### Contract-first CLI typing — inspect the server before typing the client
The CLI initially typed `client.get<PageListItem[]>()` assuming the server returned a bare array.
The server actually returns `{ items: PageListItem[], pagination: { ... } }` inside the `{ data: ... }` envelope.
One in-process call to the Hono app at the start of the phase would have revealed this in 30 seconds.
**Rule**: before typing any CLI response, grep the server handler or run a curl against the real endpoint.

---

### Integration tests are discovery tools, not just validation
The E2E test (`create → list → media upload → list → delete`) was added at the end of Phase 6, but
if it had existed at T1, it would have immediately caught the `{ items, pagination }` inner shape bug.
**Rule**: write one in-process integration test per phase at the START. It doubles as a spec and a bug trap.

---

### `status` column vs `draft: boolean` — never add a formatter field without a server grep
Added a `status` column to the pages list formatter before confirming the server returned it.
The server uses `draft: 0|1` (integer), not a `status: string` field.
**Rule**: before adding a field to `fmt.table`, run `grep -n "status"` in the relevant server handler.

---

### Bearer + cookie dual-guard — the CLI needs Bearer, the Admin UI needs cookie
`/api/auth/me` only read cookies initially — the CLI (which sends `Authorization: Bearer`) got 401.
Fix: `apiAuthGuard` accepts both. The guard checks `Authorization: Bearer` first, falls back to cookie.
This makes the same route usable from headless clients and browser-based UI without duplication.

---

### Token persistence — `~/.vlcms/config.json`
`vlcms login` persists `{ baseUrl, token }` to `~/.vlcms/config.json`.
Token cascade in `loadConfig()`: `VLCMS_TOKEN` env → `~/.vlcms/config.json` → unauthenticated.
This mirrors the pattern used by `gh`, `kubectl`, and `fly` — env override always wins.

---

### `parseFlags` duplication — shared utility extracted
`parseFlags` was copy-pasted identically in `pages.ts` and `media.ts`.
Extracted to `src/cli/parse-flags.ts`. Any future command imports from there.
**Rule**: if you paste code a second time, extract it before the third paste.

---

### `pagesUpdate` used `client.post` instead of `client.put`
Bug: `pagesUpdate` called `POST /api/pages/:slug` — the server routes that to the write router's root,
not the update handler. The CLI would silently succeed with a wrong status code.
The unit test mocked `client.post` and missed it — mocks that bypass the HTTP layer can mask method bugs.
**Rule**: integration tests (real server in-process) catch HTTP method mismatches; unit mocks don't.

---

### Hono app booted in-process for integration tests — no port, no spawn
`app.request(url, opts)` sends a synthetic request directly to the Hono app without binding a port.
This is the cleanest pattern for integration tests: real routing, real middleware, real DB, no OS socket.
All test mocks target `config` and `getDatabase` — the HTTP layer is exercised end-to-end.


## Phase 6 — CLI

- **CLI = HTTP client, not module importer**: The CLI talks to the server via fetch exclusively. It never imports server or DB code. This keeps the binary portable (point at any URL) and prevents the CLI from becoming a hidden second entry point to the storage layer.

- **`process.argv` at module load for `--json`**: `jsonMode` is evaluated once at import time, not per-call. This is intentional — JSON mode is a global session flag, not per-function. Side effect: tests that import `format.ts` share the module-level value; since tests don't include `--json` in argv, non-JSON path is always tested.

- **`parseFlags` duplicated in pages.ts and media.ts**: Both commands implement the same 20-line flag parser locally. This is intentional duplication — commands are self-contained. If a third command needs it, extract to `src/cli/flags.ts`. YAGNI prevents premature extraction.

- **`postForm` omits Content-Type header**: When sending `FormData`, `fetch` must set the `multipart/form-data` boundary itself. Passing a `Content-Type: application/json` header breaks multipart parsing. The client correctly omits `Content-Type` for `postForm` only.

- **`formatBytes` local to media.ts**: Not worth extracting — only used for one column in one command. If a second command needs it, move to `format.ts`.

- **Mock `process.exit` with `mockImplementation(() => { throw ... })`**: Tests that call code invoking `process.exit(1)` must throw to stop execution. Using `vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit") })` lets the test catch the throw and assert the exit code was 1.

- **`bin` entry in package.json + `chmod +x`**: The shebang `#!/usr/bin/env node` in `dist/cli/index.js` requires the file to be executable. `npm run build:cli` adds `chmod +x dist/cli/index.js` after `tsc`. Without this, `npx vlcms` fails with EACCES on Linux.

