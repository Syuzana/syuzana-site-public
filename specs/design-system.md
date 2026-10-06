# Design system — syuzana.com

Status: **proposal**. Source: the Cyprus deck *«По ту сторону ИИ-хайпа»*
(`Conference Cyprus 2026/Syuzana Tevdoradze - Beyond the AI Hype.pdf`) and the syuzana.com QR.
Exact hex/fonts below are read from the rendered slides and **confirmed against the `.pptx`
at the design bead** before they ship.

## 1. Voice of the design

Editorial, calm, "anti-hype". Warm paper, generous whitespace, a bold serif headline, one
confident crimson accent, a short rule under the title. It should read like a thoughtful essay,
not a SaaS splash page — the look *is* the positioning (decide before you build).

## 2. Color tokens

Light is the primary theme (paper); charcoal is for occasional full-bleed sections, as in the deck.

| Token | Value ⚠ | Role |
| --- | --- | --- |
| `--paper` | `#F3EEE6` | page background (warm off-white) |
| `--paper-2` | `#E9E2D6` | muted panel on paper |
| `--ink` | `#1E1A19` | primary text / charcoal section bg |
| `--ink-soft` | `#4A4542` | secondary text |
| `--crimson` | `#BE1E2D` | accent: kicker, rule, links, CTA (matches the QR) |
| `--crimson-deep` | `#7E1620` | hover / gradient low end |
| `--purple` | `#6E5A86` | secondary accent, used sparingly (quote chips) |
| `--cream` | `#F3EEE6` | text on charcoal |

Dark sections invert: `--ink` background, `--cream` text, `--crimson`/`--purple` blocks.
A full `prefers-color-scheme: dark` variant (charcoal-first) is defined at the design bead;
tokens are declared on `:root` and overridden under the dark guards.

## 3. Type

Authentic Cyrillic pairing matching the deck's bookish feel (ParaType family, Google-hosted):

- **Display / headings:** **PT Serif**, bold — large, high-contrast titles. (Alt: Lora.)
- **Body / UI / kicker:** **PT Sans** — clean humanist sans. (Alt: Inter.)
- Kicker: PT Sans, bold, **UPPERCASE**, letter-spacing `0.08em`, `--crimson`.

Scale (fluid, `clamp()`): display 2.5–4rem · h2 1.6–2.2rem · lead 1.2–1.4rem · body 1rem/1.6 ·
small 0.875rem. Measure capped at ~68ch for reading comfort.

## 4. Signature components

- **Section header:** crimson kicker → serif heading → **short crimson rule** (`width: 3rem;
  height: 3px; background: var(--crimson)`), exactly as every deck slide opens.
- **Package card:** paper panel, serif title, duration chip, body, "от €X" price line, soft border.
- **Quote / callout:** charcoal panel, cream text, crimson or purple label chip (the deck's quote
  treatment) — for principles and the one honest line.
- **CTA button:** solid `--crimson`, cream text, generous padding; hover → `--crimson-deep`.
- **Chevrons:** crimson `«` `»` as the deck uses them, for secondary nav/accents only.
- **Header/footer:** wordmark `SYUZANA.COM` in crimson caps; footer carries contacts + the
  data-ethics channel line.

## 5. Accessibility

WCAG AA: ink-on-paper and cream-on-charcoal both exceed 4.5:1; crimson on paper is used for
bold/large text and components, not body copy. Visible focus rings, full keyboard paths,
`prefers-reduced-motion` honoured, images carry alt text.

## 6. Delivery

Tokens as CSS custom properties in one `tokens.css`; fonts self-hosted or via Google Fonts with
`preconnect` (confirm licensing at build). No UI framework — hand-written CSS keeps the showcase
repo legible. Lighthouse budget and font-loading strategy live in `specs/testing-plan.md`.
