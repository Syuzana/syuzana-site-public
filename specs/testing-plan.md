# Testing plan — syuzana.com

Status: **proposal**. Scope matched to the risk: a tiny site where the only things that can
really hurt are **a broken admin gate**, **a leaked secret**, and **a bad upload**. Those get
the most tests; the marketing pages get smoke coverage.

## 1. Layers

**Unit** — Vitest with `@cloudflare/vitest-pool-workers` (runs in the real Workers runtime):

- Rendering: each page renders from D1 content fixtures (RU + EN); missing key falls back, never 500s.
- Admin auth guard: request without a valid `Cf-Access-Jwt-Assertion` → 403; valid JWT → 200.
- Content update: `POST /admin/content` writes the right D1 row and bumps `updated_at`.
- Upload validation: PDF accepted for CV; PNG/JPEG/WebP accepted for photo; wrong type, zero-byte,
  and over-size rejected; R2 key is fixed (uploaded filename ignored — no path traversal).
- Contact sanitisation: leading `= + - @` stripped/rejected before forward; body size bounded;
  unknown JSON fields rejected (mireno parity).

**Integration** — local D1 + R2 via `wrangler dev`/Miniflare:

- Seed load populates D1; home renders the seeded copy.
- Edit→render loop: change `hero.lead` in admin → public page reflects it.
- CV swap: upload a new PDF → `/cv.pdf` streams the new bytes with correct headers.
- Photo swap: upload → `/assets/photo` serves it.

**Security** (gate on these — see §3):

- `/admin/*` unreachable without Access, including on the raw `*.workers.dev` origin.
- Response headers present: HSTS, `nosniff`, `Referrer-Policy`, CSP (self + Calendar + fonts only).
- No secret appears in the built bundle (`grep` the `dist` for token patterns in CI).
- Contact form formula-injection guard holds.

**End-to-end** — Playwright (MCP already configured):

- Public: RU and EN home load, nav works, CV downloads, booking embed mounts, 404 is friendly.
- Responsive: no horizontal scroll at 360 px; keyboard-only path through nav and CTA.
- Admin happy path: behind an Access **service token** in CI (not a bypass of the gate).

**Performance & accessibility** — Lighthouse + the `web-perf` skill:

- Budget: Performance ≥ 95, Accessibility ≥ 95, Best-practices ≥ 95 on the home page.
- Core Web Vitals: LCP < 2.0s, CLS < 0.05, INP < 200ms; fonts load without layout shift.

## 2. CI

GitHub Actions on the **private** repo: typecheck → unit → integration on every push; Playwright +
Lighthouse on PRs; red blocks merge. Secrets (Access service token, webhook URLs) live only in the
private repo's Actions secrets. The **public** repo ships the same workflow file as a showcase, with
no secrets and E2E marked "requires secrets".

## 3. Definition of done (ties to bead acceptance)

A bead is done when: its unit + integration tests pass locally and in CI; any security item it
touches is covered by a test in the Security layer; and, for user-visible beads, the Playwright
smoke for that page is green. No merge on red. "If a result can't be verified, it isn't a result."
