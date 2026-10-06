# Architecture — syuzana.com

Status: **proposal** (awaiting Syuzana's GO on the platform choice — see `knowledge/decisions.md` D-001).
Owner bead: `syusite` epic. Last updated: 2026-10-06.

## 1. What this is

A small personal site for Syuzana Tevdoradze — technical product lead / fractional CPO.
Public pages (home, services, pricing, about, contact), a downloadable CV, a booking link,
and a private admin panel where **she** edits every text block, swaps the CV, and swaps the
photo without touching code or redeploying.

Hard constraints from the brief:

1. **Reuse mirenoapp's infrastructure, but stay fully divisible** from it.
2. **Serverless backend**, must still hold a **PDF (CV)** and a **photo**.
3. **Secure** admin, reachable at a stable URL (not a custom port — see §5).
4. **Cheap** — no meaningful new spend.
5. **Public repo** that shows clean engineering; **no CV, photo, or contacts** committed.
6. **Easy to support and update** from this project.

## 2. Platform decision — Cloudflare Workers (not Fly)

syuzana.com is a **standalone** site on **Cloudflare Workers**. It shares only Syuzana's existing
**Cloudflare account** (where she already manages DNS); it reuses no other project's runtime,
data, or deploy — mireno is not involved (D-001). The Apps Script → Sheet and Telegram-notify
techniques (§3) are generic patterns, not a dependency on anything else.

| Criterion (ranked) | Workers + R2 + D1 (chosen) | New Fly app (mireno's Go pattern) |
| --- | --- | --- |
| 1. Reuse + full separation | Same Cloudflare account; zero Fly coupling; deleting it touches nothing of mireno | Reuses Fly pattern, but adds a second thing on Fly to keep divided |
| 2. Serverless + holds PDF/photo | Yes — R2 holds binaries, D1 holds text, Worker is serverless | A VM with a volume — not serverless |
| 3. Security (admin) | Cloudflare Access (Zero Trust) + JWT verify, free | Same Access possible, but IP/proxy chain needs rework |
| 4. Cost | **€0/mo** within free tiers (§6) | ~€2/mo for a warm machine, or cold starts |
| 5. Maintainability / showcase | One modern TS codebase, edge-native, clean repo | Reuses hardened Go, but a heavier runtime to run |

**Why the PDF + photo are not a problem on serverless:** Cloudflare **R2** is object storage
with **zero egress fees**. The CV (~100 KB) and photo (~1–2 MB) live as R2 objects; the admin
replaces them with an upload; the Worker streams them back at `/<cv>` and `/<photo>` with
cache headers. Editable text lives in **D1** (Cloudflare's SQLite). Neither needs a server
process — the Worker runs only when a request arrives.

## 3. Runtime shape

```
                    ┌──────────────────────── Cloudflare (Syuzana's account) ─────────────────────────┐
  visitor  ─────►   │  syuzana.com  ──►  Worker (TypeScript, Hono)                                     │
                    │                      ├─ GET /            SSR public pages  ◄─ D1 (content, RU/EN) │
                    │                      ├─ GET /en/*        English pages     ◄─ D1                  │
                    │                      ├─ GET /cv.pdf      stream            ◄─ R2 (assets bucket)  │
                    │                      ├─ GET /assets/photo stream           ◄─ R2                  │
                    │                      ├─ POST /api/contact → Apps Script → Google Sheet (+ TG)     │
  Syuzana  ─────►   │  syuzana.com/admin ──►  [Cloudflare Access gate: her Google identity only]       │
                    │                      └─ /admin/*         edit D1 text · upload CV/photo to R2     │
                    └──────────────────────────────────────────────────────────────────────────────────┘
  booking:  Google Calendar appointment schedule (its own form, auto-Meet) — embedded/linked, no server
```

Nothing above shares a process, bucket, database, or DNS zone with `mirenoapp.com`. The only
common ground is the Cloudflare login and two *reused patterns* (Apps Script → Sheet, and the
Telegram notifier), lifted from mireno's `landing/main.go`.

## 4. Data model

**D1 — `content`** (the only table the admin writes text to):

| column | type | note |
| --- | --- | --- |
| `key` | TEXT | block id, e.g. `hero.lead`, `packages.audit.body`, `contacts.email` |
| `lang` | TEXT | `ru` \| `en` |
| `value` | TEXT | Markdown or plain text |
| `updated_at` | TEXT | ISO 8601 |
| PK | (`key`,`lang`) | |

Optional `content_history` (same columns + `version`) for one-click revert — cheap insurance,
decided at the storage bead.

**R2 — bucket `syuzana-site-assets`**: `cv.pdf`, `photo.<ext>`. Versioned by R2 natively.

**Seed vs runtime (keeps secrets out of git):** the committed repo ships `content/seed/ru.json`
and `en.json` with the **marketing copy** (public anyway) but **contact values are placeholders**
(`contacts.email = "{{SET_IN_ADMIN}}"`). On first deploy the seed loads into D1; Syuzana then
sets real email / LinkedIn / Telegram / booking URL via `/admin`, where they live in D1 only —
never in the repo. This is how requirement 5 ("no contacts committed") is met without losing them.

## 5. Admin & security

- **Reachability:** `syuzana.com/admin` — a normal HTTPS path, **not** a custom port. (A custom
  port can't be relied on through Cloudflare's proxy and is not a security control anyway.)
- **Authentication:** **Cloudflare Access** (Zero Trust, free ≤50 users) policy allows exactly
  Syuzana's Google account. Access challenges at the edge before the Worker runs.
- **Defence in depth:** the Worker also verifies the `Cf-Access-Jwt-Assertion` header (team
  domain + AUD against Access public keys), so the admin is sealed even on the raw `*.workers.dev`
  origin. No passwords to store or rotate.
- **Upload safety (reused from mireno):** `MaxBytes` request cap, strict content-type allow-list
  (PDF for CV, PNG/JPEG/WebP for photo), size ceilings, filename ignored (fixed R2 keys).
- **Contact form safety (reused from mireno):** bounded JSON, `DisallowUnknownFields` equivalent,
  spreadsheet-formula-injection guard (`= + - @` leading chars) before anything reaches a Sheet.
- **Headers:** HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, a tight CSP (self +
  Google Calendar embed origin + fonts), `-Server`.
- **Secrets:** Apps Script webhook URL, Telegram token/chat id → Wrangler secrets, never committed.

## 6. Cost (the "won't it cost more?" answer)

Within Cloudflare free tiers, **€0/month**, and nothing is added to mireno's Fly bill:

| Service | Free allowance | This site uses |
| --- | --- | --- |
| Workers | 100,000 requests/day | a personal landing — far under |
| Workers Static Assets | unlimited asset requests | CSS, fonts, static images |
| R2 | 10 GB storage, 0 egress fees | CV + photo ≈ 2 MB |
| D1 | 5 GB, 5M row-reads/day, 100k writes/day | a few dozen text rows |
| Cloudflare Access | ≤ 50 users | 1 user (Syuzana) |
| Custom domain | free (zone already hers) | syuzana.com |

If traffic ever exceeded the free Workers tier, the Workers Paid plan is $5/mo — not expected
for a personal site. **These limits are from the Cloudflare docs as of 2026-01 and will be
re-confirmed against live docs at the scaffold bead** (the `cloudflare` skill biases to current
docs).

## 7. Stack

TypeScript · [Hono](https://hono.dev) router with SSR (hono/jsx or template literals) ·
Wrangler · D1 (raw SQL + `wrangler d1 migrations`) · R2 · Cloudflare Access ·
Vitest (`@cloudflare/vitest-pool-workers`) · Playwright (E2E). No framework heavier than Hono —
the site is small and must stay legible as a showcase.

## 8. Out of scope (v1)

Blog/CMS beyond the fixed blocks, multi-user admin, analytics dashboards, A/B tests, payments.
Booking analytics come from Google Calendar; contact volume from the Google Sheet.

## 9. Open items feeding other specs

- Content gaps & the ⚠ pricing/credential decisions → `specs/content-plan.md`.
- Visual tokens → `specs/design-system.md`.
- Test matrix → `specs/testing-plan.md`.
- Private-vs-public repo split & Linear → `specs/repo-and-publishing.md`.
