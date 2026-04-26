# LEARNINGS — Very Light CMS

Engineering decisions, gotchas, and lessons captured during development.
Updated continuously. Newest entries at the top.

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
