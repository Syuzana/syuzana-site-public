import type { FC } from "hono/jsx";
import type { Content } from "../content";
import type { Lang } from "../i18n";
import { escapeHtml, listItems, renderInline } from "../render";
import { qrSvg, vcard } from "../vcard";
import { Inline, Layout, SectionHead, Text, link, placeholders } from "./layout";

type Props = { c: Content; lang: Lang; path: string };

/** The free-call button: the booking link when set, otherwise a mailto, otherwise the contact anchor. */
const BookButton: FC<{ c: Content; lang: Lang; labelKey: string; class?: string }> = ({ c, lang, labelKey, class: cls }) => {
  const booking = link(c, "contacts.booking_url");
  const email = c.value("contacts.email");
  const href = booking || (email ? `mailto:${email}` : `/${lang}/#contact`);
  return (
    <a class={cls ?? "btn"} href={href} rel={booking ? "noopener" : undefined}>
      {c.get(labelKey)}
    </a>
  );
};

/** The five channels, full size: the card's whole job is who she is and how to reach her. */
const ContactList: FC<{ c: Content }> = ({ c }) => {
  const email = c.value("contacts.email");
  const rows: Array<[string, string, string, boolean]> = [
    ["contacts.email", email ? `mailto:${email}` : "", c.get("contact.email_label"), false],
    ["contacts.linkedin", link(c, "contacts.linkedin"), c.get("footer.linkedin_label"), true],
    ["contacts.telegram", link(c, "contacts.telegram"), c.get("footer.telegram_label"), true],
    ["contacts.github", link(c, "contacts.github"), c.get("footer.github_label"), true],
    ["contacts.channel", link(c, "contacts.channel"), c.get("footer.channel_label"), true],
  ];
  const present = rows.filter(([, href, label]) => href && label);
  if (present.length === 0) return null;
  return (
    <ul class="channels" aria-label={c.get("hero.contacts_label")}>
      {present.map(([key, href, label, external]) => (
        <li>
          {key === "contacts.email" ? (
            <div class="channel-row">
              <span class="channel-label">{label}</span>
              <a class="channel-value email-value" id="contact-email" href={href}>{email}</a>
              <button class="copy" type="button" data-copy-email data-copied={c.get("contact.copy_ok")} data-selected={c.get("contact.copy_selected")} aria-live="polite">
                {c.get("contact.copy_label")}
              </button>
            </div>
          ) : (
            <a href={href} rel={external ? "noopener" : undefined}>
              <span class="channel-label">{label}</span>
              <span class="channel-value">{hostPath(href)}</span>
              <span class="channel-go" aria-hidden="true">&#8594;</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
};

/** Show a link as the reader would say it: "/in/handle", "@handle" — never the full URL. */
function hostPath(href: string): string {
  try {
    const u = new URL(href);
    const path = u.pathname.replace(/\/$/, "");
    if (/t\.me$/.test(u.hostname)) return `@${path.replace(/^\//, "")}`;
    if (/github\.com$/.test(u.hostname)) return `@${path.replace(/^\//, "")}`;
    return path || u.hostname;
  } catch {
    return href;
  }
}

/** The vCard code: the one thing on the card that works when the screen is someone else's. */
const VCard: FC<{ c: Content; origin: string }> = ({ c, origin }) => {
  if (!c.value("contacts.email")) return null;
  return (
    <div class="vcard">
      <div dangerouslySetInnerHTML={{ __html: qrSvg(vcard(c, origin), c.get("card.qr_title")) }} />
      <p>
        <b>{c.get("card.qr_title")}</b>
        {c.get("card.qr_note")}
      </p>
    </div>
  );
};

/** A result reads as an entry, not a bullet: a crimson dateline, then the number. */
const Results: FC<{ c: Content }> = ({ c }) => {
  const items = listItems(c.get("experience.items"));
  if (items.length === 0) return null;
  return (
    <ul class="results">
      {items.map((item) => {
        const split = item.indexOf(":");
        const what = split > 0 ? item.slice(0, split).trim() : "";
        const rest = split > 0 ? item.slice(split + 1).trim() : item;
        return (
          <li>
            {what ? <span class="what">{what}</span> : null}
            <p>{rest.charAt(0).toUpperCase() + rest.slice(1)}</p>
          </li>
        );
      })}
    </ul>
  );
};

const PROJECT_FORMATS = ["evaluate", "audit"] as const;
const TEAM_FORMATS = ["fractional"] as const;
const FORMAT_IDS = [...PROJECT_FORMATS, ...TEAM_FORMATS] as const;
type FormatId = (typeof FORMAT_IDS)[number];

/** A format card states the result, the timeline and what the client contributes — never a price. */
const FormatCard: FC<{ c: Content; id: FormatId }> = ({ c, id }) => (
  <article class="card" id={`format-${id}`}>
    <h3>
      <Inline c={c} k={`formats.${id}.title`} />
    </h3>
    <p class="meta">{c.get(`formats.${id}.duration`)}</p>
    <Text c={c} k={`formats.${id}.body`} />
    {c.get(`formats.${id}.result`) ? (
      <p class="card-result">
        <strong>{c.get("formats.result_label")}.</strong> <Inline c={c} k={`formats.${id}.result`} />
      </p>
    ) : null}
    {c.get(`formats.${id}.involvement`) ? (
      <p class="card-involvement">
        <strong>{c.get("formats.involvement_label")}.</strong> <Inline c={c} k={`formats.${id}.involvement`} />
      </p>
    ) : null}
    {c.get(`formats.${id}.inside`) ? (
      <details>
        <summary>{c.get("formats.inside_label")}</summary>
        <ul>
          {listItems(c.get(`formats.${id}.inside`)).map((item) => (
            <li dangerouslySetInnerHTML={{ __html: renderInline(item, placeholders(c)) }} />
          ))}
        </ul>
      </details>
    ) : null}
  </article>
);

const PricingTable: FC<{ c: Content }> = ({ c }) => {
  const columns = c.get("pricing.columns").split("|").map((s) => s.trim());
  const rows = c
    .get("pricing.rows")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("|").map((s) => s.trim()));
  return (
    <table class="pricing">
      <thead>
        <tr>
          {columns.map((col) => (
            <th scope="col">{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells) => (
          <tr>
            {cells.map((cell, i) => {
              // A dash means "not applicable"; on a phone the row reads better without that line.
              const empty = i > 0 && (cell === "" || cell === "—" || cell === "-");
              const cls = [i === 0 ? "row-title" : "", empty ? "is-empty" : ""].filter(Boolean).join(" ");
              return (
                <td data-label={columns[i] ?? ""} class={cls || undefined}>
                  {cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const ContactForm: FC<{ c: Content; lang: Lang }> = ({ c, lang }) => (
  <form class="stack enquiry" method="post" action="/api/contact" data-success={c.get("contact.form_ok")} data-error={c.get("contact.form_error")} data-sending={c.get("contact.form_sending")}>
    <input type="hidden" name="lang" value={lang} />
    <input type="hidden" name="id" value={crypto.randomUUID()} />
    <label>
      {c.get("contact.form_name")}
      <input name="name" required maxlength={120} autocomplete="name" />
    </label>
    <label>
      {c.get("contact.form_email")}
      <input name="email" type="email" required maxlength={254} autocomplete="email" />
    </label>
    <label>
      {c.get("contact.form_message")}
      <textarea name="message" required maxlength={4000}></textarea>
    </label>
    <button class="btn" type="submit">
      {c.get("contact.form_send")}
    </button>
    <p class="form-status" role="status" aria-live="polite" hidden></p>
  </form>
);

export type HomeProps = Props & { hasPhoto: boolean; hasCv: boolean; formEnabled: boolean; sent?: "ok" | "error"; origin: string };

/** The whole site is one page: a business card first, then everything a visitor scrolls for. */
export const HomePage: FC<HomeProps> = ({ c, lang, path, hasPhoto, hasCv, formEnabled, sent, origin }) => (
  <Layout c={c} lang={lang} path={path} title={`${c.get("site.name")} — ${c.get("site.role")}`}>
    <section class="hero" id="top">
      <div class={`wrap card-grid${hasPhoto ? "" : " no-photo"}`}>
        {hasPhoto ? (
          <img class="portrait card-portrait" src="/assets/photo" alt={c.get("site.name")} width="720" height="960" fetchpriority="high" />
        ) : null}
        <div class="card-id">
          <p class="kicker">{c.get("site.role").split("·")[0]?.trim()}</p>
          <h1>{c.get("site.name")}</h1>
          <p class="role">{c.get("site.role").split("·").slice(1).join("·").trim()}</p>
        </div>
      </div>
      <div class="wrap">
        <p class="tagline">
          <Inline c={c} k="about.bio" />
        </p>
        <div class="actions two">
          <BookButton c={c} lang={lang} labelKey="hero.cta" />
          {hasCv ? (
            <a class="btn secondary" href="/cv.pdf">
              {c.get("about.cv_label")}
            </a>
          ) : null}
        </div>
        <p class="hero-note">{c.get("hero.action_note")}</p>
        <ContactList c={c} />
        <VCard c={c} origin={origin} />
      </div>
    </section>

    <section class="section" id="experience">
      <div class="wrap">
        <SectionHead c={c} titleKey="experience.title" />
        <p class="aside">
          <Inline c={c} k="experience.types" />
        </p>
        <Results c={c} />
        <p class="aside">
          <Inline c={c} k="experience.intro" />
        </p>
      </div>
    </section>

    <section class="section" id="pricing">
      <div class="wrap">
        <SectionHead c={c} titleKey="pricing.title" />
        <Text c={c} k="pricing.intro" />
        <div class="table-wrap">
          <PricingTable c={c} />
        </div>
        <p class="aside">
          <Inline c={c} k="pricing.note" />
        </p>
      </div>
    </section>

    <section class="section" id="contact">
      <div class="wrap">
        <SectionHead c={c} titleKey="contact.title" />
        <Text c={c} k="contact.body" />
        {formEnabled ? (
          <>
            {sent === "ok" ? <p class="flash ok">{c.get("contact.form_ok")}</p> : null}
            {sent === "error" ? <p class="flash error">{c.get("contact.form_error")}</p> : null}
            <ContactForm c={c} lang={lang} />
          </>
        ) : null}
        <div class="closing">
          <BookButton c={c} lang={lang} labelKey="hero.cta" />
          <p class="hero-note">{c.get("hero.note")}</p>
        </div>
      </div>
    </section>
  </Layout>
);

export const PrivacyPage: FC<Props> = ({ c, lang, path }) => (
  <Layout c={c} lang={lang} path={path} title={`${c.get("privacy.title")} — ${c.get("site.name")}`}>
    <section class="section">
      <div class="wrap">
        <h1>{c.get("privacy.title")}</h1>
        <hr class="rule" />
        <Text c={c} k="privacy.body" />
      </div>
    </section>
  </Layout>
);

export const NotFoundPage: FC<Props> = ({ c, lang, path }) => (
  <Layout c={c} lang={lang} path={path} title={`404 — ${c.get("site.name")}`}>
    <section class="section">
      <div class="wrap">
        <h1>{c.get("notfound.title")}</h1>
        <hr class="rule" />
        <Text c={c} k="notfound.body" />
      </div>
    </section>
  </Layout>
);

/** Used by the Layout-less error path so even a D1 outage shows a readable page. */
export function plainErrorHtml(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="stylesheet" href="/styles.css"></head><body><main class="section"><div class="wrap"><h1>${escapeHtml(title)}</h1><hr class="rule"><p>${escapeHtml(body)}</p></div></main></body></html>`;
}
