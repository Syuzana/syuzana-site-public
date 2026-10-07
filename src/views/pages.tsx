import type { FC } from "hono/jsx";
import type { Content } from "../content";
import type { Lang } from "../i18n";
import { escapeHtml, listItems, renderInline } from "../render";
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

/** Contact row for the hero — the first thing a visitor from the QR code needs. */
const ContactRow: FC<{ c: Content }> = ({ c }) => {
  const email = c.value("contacts.email");
  const items: Array<[string, string, boolean]> = [
    [email ? `mailto:${email}` : "", email, false],
    [link(c, "contacts.linkedin"), c.get("footer.linkedin_label"), true],
    [link(c, "contacts.channel"), c.get("footer.telegram_label"), true],
    [link(c, "contacts.github"), c.get("footer.github_label"), true],
  ];
  const present = items.filter(([href, label]) => href && label);
  if (present.length === 0) return null;
  return (
    <ul class="contact-row" aria-label={c.get("hero.contacts_label")}>
      {present.map(([href, label, external]) => (
        <li>
          <a href={href} rel={external ? "noopener" : undefined}>
            {label}
          </a>
        </li>
      ))}
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
            {cells.map((cell, i) => (
              // data-label lets the row collapse into a labelled block on narrow screens.
              <td data-label={columns[i] ?? ""} class={i === 0 ? "row-title" : undefined}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const ContactForm: FC<{ c: Content; lang: Lang }> = ({ c, lang }) => (
  <form class="stack" method="post" action="/api/contact">
    <input type="hidden" name="lang" value={lang} />
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
    <button class="btn secondary" type="submit">
      {c.get("contact.form_send")}
    </button>
  </form>
);

export type HomeProps = Props & { hasPhoto: boolean; hasCv: boolean; formEnabled: boolean; sent?: "ok" | "error" };

/** The whole site is one page: a business card first, then everything a visitor scrolls for. */
export const HomePage: FC<HomeProps> = ({ c, lang, path, hasPhoto, hasCv, formEnabled, sent }) => {
  const email = c.value("contacts.email");
  return (
    <Layout c={c} lang={lang} path={path} title={`${c.get("site.name")} — ${c.get("site.role")}`}>
      <section class="hero" id="top">
        <div class={`wrap hero-grid${hasPhoto ? "" : " no-photo"}`}>
          <div class="hero-id">
            <p class="kicker">{c.get("hero.role")}</p>
            <h1>{c.get("site.name")}</h1>
            <ContactRow c={c} />
          </div>
          {hasPhoto ? (
            <img class="portrait hero-portrait" src="/assets/photo" alt={c.get("site.name")} width="720" height="960" fetchpriority="high" />
          ) : null}
          <div class="hero-body">
            <hr class="rule" />
            <p class="tagline">
              <Inline c={c} k="hero.title" />
            </p>
            <p class="lead">
              <Inline c={c} k="hero.lead" />
            </p>
            <div class="actions">
              <BookButton c={c} lang={lang} labelKey="hero.cta" />
              <span class="note">{c.get("hero.note")}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="section" id="situations">
        <div class="wrap">
          <SectionHead c={c} titleKey="problems.title" />
          <div class="problems">
            <Text c={c} k="problems.items" />
          </div>
        </div>
      </section>

      <section class="section" id="formats">
        <div class="wrap">
          <SectionHead c={c} titleKey="formats.title" />
          <p class="lead">
            <Inline c={c} k="formats.intro" />
          </p>
          <h3 class="group-title">{c.get("formats.group_project")}</h3>
          <div class="cards">
            {PROJECT_FORMATS.map((id) => (
              <FormatCard c={c} id={id} />
            ))}
          </div>
          <h3 class="group-title">{c.get("formats.group_team")}</h3>
          <div class="cards cards-one">
            {TEAM_FORMATS.map((id) => (
              <FormatCard c={c} id={id} />
            ))}
          </div>

        </div>
      </section>

      <section class="section" id="process">
        <div class="wrap">
          <SectionHead c={c} titleKey="process.title" />
          <div class="one-list">
            <Text c={c} k="process.steps" />
            <Text c={c} k="process.principles" />
          </div>
        </div>
      </section>

      <section class="section" id="experience">
        <div class="wrap">
          <SectionHead c={c} titleKey="experience.title" />
          <p class="lead">
            <Inline c={c} k="experience.intro" />
          </p>
          <Text c={c} k="experience.items" />
          <Text c={c} k="experience.types" />
          {hasCv ? (
            <p>
              <a class="btn secondary" href="/cv.pdf">
                {c.get("about.cv_label")}
              </a>
            </p>
          ) : null}
        </div>
      </section>

      <section class="section" id="pricing">
        <div class="wrap">
          <SectionHead c={c} titleKey="pricing.title" />
          <Text c={c} k="pricing.intro" />
          <div class="table-wrap">
            <PricingTable c={c} />
          </div>
          <p class="note mt">
            <Inline c={c} k="pricing.note" />
          </p>
        </div>
      </section>

      <section class="section" id="contact">
        <div class="wrap cols">
          <div>
            <SectionHead c={c} titleKey="contact.title" />
            <Text c={c} k="contact.body" />
            <div class="actions">
              <BookButton c={c} lang={lang} labelKey="contact.booking_label" />
            </div>
            {email ? (
              <p class="mt">
                {c.get("contact.email_label")}: <a href={`mailto:${email}`}>{email}</a>
              </p>
            ) : null}
          </div>
          {/* The form only appears once a delivery webhook is configured: a form that goes nowhere is worse than none. */}
          {formEnabled ? (
            <div>
              <h3>{c.get("contact.form_title")}</h3>
              {sent === "ok" ? <p class="flash ok">{c.get("contact.form_ok")}</p> : null}
              {sent === "error" ? <p class="flash error">{c.get("contact.form_error")}</p> : null}
              <ContactForm c={c} lang={lang} />
            </div>
          ) : null}
        </div>
      </section>
    </Layout>
  );
};

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
