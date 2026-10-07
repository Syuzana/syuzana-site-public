# syuzana.com

The personal site of Syuzana Tevdoradze — technical product lead and fractional CPO.
Public pages, a downloadable CV, a booking link, and a private admin panel where the
site’s owner edits every text block, swaps the CV, and swaps the photo without
redeploying.

> Release 2.0.0: the front end implements visit-card mockup v14. The tracked
> [HTML reference and build specification](specs/mockup/SPEC.md) are part of the
> requirements. Photo, CV and actual contact values are stored outside git.

## Architecture

Serverless, on Cloudflare, costing nothing to run for a personal site:

- **Cloudflare Worker** (TypeScript, [Hono](https://hono.dev)) renders the pages at the
  edge.
- **D1** (SQLite) holds the editable text, in Russian and English.
- **R2** (object storage, zero egress) holds the CV PDF and the photo.
- **Cloudflare Access** (Zero Trust) gates `/admin` to a single Google identity; the
  Worker re-verifies the Access token, so the admin is sealed even on the raw origin.
- **Booking** is a Google Calendar appointment schedule; **contact messages** go to a
  Google Sheet via Apps Script — no database to run for captured data.

It runs standalone on Cloudflare — its own zone, Worker, bucket, and database.
Full rationale and the cost breakdown are in
[specs/architecture.md](specs/architecture.md).

## How this was built

The interest here is the method, not just the result:

- **Spec-driven.** Every part was specified before it was coded — see
  [`specs/`](specs/): architecture, design system, content plan, and the testing plan.
  The design is derived from a conference talk, so the look carries the positioning.
- **Decisions are recorded, not assumed.** `knowledge/decisions.md` logs each choice
  with its status (assumption / proposal / decision), who proposed it, and what verified
  it.
- **Tracked as beads.** Work is planned as a dependency-ordered epic of small,
  acceptance-tested tasks, each carrying its own model/effort binding.
- **Multi-agent, deliberately.** A coordinator plans and writes the specs; specialist
  subagents do design extraction, content, and implementation; review runs on a
  *different* model than the author.
  Judgement work goes to the strongest model, retrieval to a cheaper one.
- **Tested where it matters.** The admin gate, secret handling, and uploads carry the
  most tests; marketing pages get smoke coverage.
  Nothing merges on red.
  See [specs/testing-plan.md](specs/testing-plan.md).

## Repository layout

```
src/              Worker: routes, SSR templates, admin, styles
content/seed/     RU + EN marketing copy (contact values are placeholders)
specs/            architecture · design-system · content-plan · testing · repo-and-publishing
knowledge/        decisions log and method notes
scripts/          publish-public.sh (allowlist copy into this public repo)
.github/          CI (typecheck · unit · integration · E2E)
```

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars        # local admin bypass is on in the example
npm run db:migrate:local              # schema + default copy into local D1
npm run dev                           # http://localhost:8787 → redirects to /en/ or /ru/
npm test                              # vitest inside the Workers runtime (local D1 + R2)
npm run typecheck
```

Open `http://localhost:8787/admin` to edit text or upload a CV/photo locally.
Default copy lives in `content/seed/*.json`; after editing it run `npm run seed:build`
to regenerate the seed migration (CI checks they are in sync).

## First deploy

```bash
npx wrangler login                                   # or export CLOUDFLARE_API_TOKEN
npx wrangler d1 create syuzana-site-content          # paste the returned id into wrangler.jsonc
npx wrangler r2 bucket create syuzana-site-assets
npm run db:migrate:remote
npx wrangler secret put ACCESS_TEAM_DOMAIN           # <team>.cloudflareaccess.com
npx wrangler secret put ACCESS_AUD                   # the Access application's Audience tag
npx wrangler secret put ADMIN_EMAIL                  # the one Google identity allowed in
npx wrangler secret put CONTACT_WEBHOOK_URL          # Apps Script web-app URL (optional)
npm run deploy
```

Then in Cloudflare Zero Trust create a self-hosted Access application for
`syuzana.com/admin*` with a policy allowing only that email.
Upload the CV and photo, and set the contact links and booking URL, in `/admin`.

## Security & privacy

No secrets, CV, photo, or contact details live in this repository.
At runtime those are held in R2, D1, and Cloudflare Worker secrets.
The admin panel is reachable only to the owner’s verified Google identity.
See [specs/repo-and-publishing.md](specs/repo-and-publishing.md) for how the public view
is kept clean.

## License

[MIT](LICENSE).

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
