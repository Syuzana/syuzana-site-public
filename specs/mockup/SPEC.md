# Visit card — build specification

A personal visit-card page for a technical product owner.
`visit-card-v14-nophoto.html` in this folder is the reference: open it, and build what
it shows. This file states the rules the file cannot state about itself.

The tracked reference, `visit-card-v14-nophoto.html`, uses a grey portrait placeholder
and placeholder contact values.
The owner’s copy with the real portrait stays outside source control.
This HTML file is part of the requirements for release 2.0.0.

For visual geometry, the HTML reference takes precedence over conflicting prose: its
38rem sheet includes the side inset, and its content exceeds one viewport at 375px.
Production fonts are self-hosted; the QR is generated server-side.
Form delivery is the next release, 2.1.0; the form stays hidden until its backend is
configured.

## The job of the page

A visitor must see who this is and how to reach her in the opening card.
The page follows the reference’s spacing and order; small screens may require scrolling
to reach all contact rows.

## Tokens

Colour, light theme:

| token | value | use |
| --- | --- | --- |
| `--bg` | `#f3eee6` | page ground, warm paper |
| `--surface` | `#e9e2d6` | the one muted panel (photo frame) |
| `--fg` | `#1e1a19` | body text |
| `--fg-soft` | `#4a4542` | labels, captions, secondary text |
| `--accent-deep` | `#7e1620` | buttons, kickers, datelines |
| `--accent` | `#be1e2d` | links and hover |
| `--rule` | `rgba(30,26,25,.14)` | hairline separators |
| `--rule-firm` | `rgba(30,26,25,.3)` | the heavier rule that opens a list |

Dark theme redefines the same tokens: `--bg #1e1a19`, `--surface #2a2524`,
`--fg #f3eee6`, `--fg-soft #cfc6ba`, `--accent #e0565f`, `--accent-deep #c9414b`, rules
at 16% and 30% white.
Define every token on bare `:root` first, then redefine under
`@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and
again under `:root[data-theme="dark"]`. No colour may exist only inside a dark block.

Type: **PT Serif** for the name, the headline and contact values; **PT Sans** for
everything that labels or acts.
Body 1.0625rem/1.6. Uppercase micro-labels 0.6875rem, letter-spacing 0.14–0.2em. The
name is `clamp(1.9rem, 6.5vw, 3rem)`.

## Layout

One column, **38rem** wide, centred, with a side gutter of at least 16px at every width.
The column is fixed in `rem`. Do not express it in `ch`: `ch` resolves against each
element’s own font size, so a serif headline and a sans paragraph given the same `ch`
measure end in different places.
Every block on the page ends on the same right edge — headline, body, buttons, contact
rows, table. This is checkable, so check it.

Square corners everywhere.
No fills, no shadows, no cards.
Separation is done with hairline rules.

Running prose is justified with automatic hyphenation.
Headings, labels, buttons, table cells and captions stay ragged-right and unhyphenated.

## Page order

1. **Language switch** — `EN | RU` as one control, top right.
   The current language is shown as state, not offered as a link.
2. **Card** — portrait left (4:5, `object-fit: cover`), and beside it: kicker (job
   title, uppercase, accent), name (h1, serif), role line (the positioning sentence,
   small, `--fg-soft`).
3. **About** — one paragraph, serif, around 40 words.
   Not a list of services.
4. **Two actions** — primary filled (book a call), secondary outlined (download CV).
   Equal width, equal height (52px), side by side; full width and stacked below 480px.
   One line of context under them.
5. **Channels** — email, LinkedIn, Telegram, GitHub, the Telegram channel.
   One row each, full size, 52px tap target, label left in uppercase micro-type and the
   value in serif. A channel with no value set renders no row.
6. **vCard QR** — with the caption “Scan to save my contact” and one line saying what it
   does. The tile stays light in both themes; inverted codes fail on many scanners.
7. **Experience** — a domains line, then four results.
   Each result is a crimson uppercase dateline and a sentence that contains a number.
   Not a bullet list.
8. **Pricing** — intro, then a table of format / scope / duration.
   Tabular figures, hairline rows, the free first row in accent.
   The table scrolls inside its own container on a phone and never widens the page.
9. **Contact** — one line, the enquiry form, then the booking button repeated as the
   closing action.
10. **Footer** — the channels again as uppercase links, and a copyright line.

Section headings are small uppercase sans labels with a hairline under them.
They label the block; they never compete with the name.

## Behaviour

- The language switch replaces every string on the page, including the table and the
  results, and remembers the choice per viewer.
- The email row has a copy button.
  Call `navigator.clipboard.writeText` inside the click handler, catch the rejection,
  and fall back to selecting the text.
- The enquiry form validates and submits in the page; it never posts to a third party.
- Respect `prefers-reduced-motion`.

## Constraints

- **No third-party scripts.** The reference file loads `qrcode.js` from a CDN because it
  is a standalone demo.
  A real implementation generates the QR server-side as inline SVG. Admitting a script
  host to a content security policy for a 112px image is not a trade worth making.
- **No real contact value in source control.** Contacts come from a store the owner
  edits; the template renders whatever is set and hides the rows that are not.
- **The portrait is served from object storage**, not embedded.
  The base64 image in the reference file is a demo convenience.
- **Downloads must actually work.** The CV button in the reference file is inert because
  artifact sandboxes block downloads.

## Acceptance

- Identity and contact channels follow the reference layout at 375px.
- Every block ends on the same right edge; no horizontal page scroll at 375, 768, 1024
  and 1440.
- The three buttons are identical in width and height.
- Both themes legible; the QR tile light in both.
- The QR scans on one iOS and one Android device and saves a contact.
  Test this on real hardware; a valid SVG is not evidence that a code scans.

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
