import type { FC } from "hono/jsx";
import type { Content } from "../content";
import type { Lang } from "../i18n";
import { escapeHtml, listItems, renderInline } from "../render";
import { Inline, Layout, SectionHead, Text, link, placeholders } from "./layout";

type Props = { c: Content; lang: Lang; path: string };

/** The free-call button: the booking link when set, otherwise a mailto, otherwise the contact page. */
const BookButton: FC<{ c: Content; lang: Lang; labelKey: string; class?: string }> = ({ c, lang, labelKey, class: cls }) => {
  const booking = link(c, "contacts.booking_url");
  const email = c.value("contacts.email");
  const href = booking || (email ? `mailto:${email}` : `/${lang}/contact`);
  return (
    <a class={cls ?? "btn"} href={href} rel={booking ? "noopener" : undefined}>
      {c.get(labelKey)}
    </a>
  );
};

const FormatCard: FC<{ c: Content; id: "audit" | "discovery" | "fractional" }> = ({ c, id }) => (
  <article class="card">
    <h3>
      <Inline c={c} k={`formats.${id}.title`} />
    </h3>
    <p class="meta">{c.get(`formats.${id}.duration`)}</p>
    <Text c={c} k={`formats.${id}.body`} />
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
    <p class="price">{c.get(`formats.${id}.price`)}</p>
  </article>
);

export const HomePage: FC<Props> = ({ c, lang, path }) => (
  <Layout c={c} lang={lang} path={path} active="home" title={`${c.get("site.name")} — ${c.get("site.role")}`}>
    <section class="hero">
      <div class="wrap">
        <p class="kicker">{c.get("hero.kicker")}</p>
        <h1>
          <Inline c={c} k="hero.title" />
        </h1>
        <hr class="rule" />
        <p class="lead">
          <Inline c={c} k="hero.lead" />
        </p>
        <div class="actions">
          <BookButton c={c} lang={lang} labelKey="hero.cta" />
          <span class="note">{c.get("hero.note")}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <SectionHead c={c} titleKey="problems.title" />
        <Text c={c} k="problems.items" />
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <SectionHead c={c} titleKey="formats.title" />
        <div class="cards">
          <FormatCard c={c} id="audit" />
          <FormatCard c={c} id="discovery" />
          <FormatCard c={c} id="fractional" />
        </div>
        <p class="note mt">
          <Inline c={c} k="formats.footnote" />
        </p>
      </div>
    </section>

    <section class="section band">
      <div class="wrap cols">
        <div>
          <SectionHead c={c} titleKey="process.title" />
          <Text c={c} k="process.steps" />
        </div>
        <div>
          <p class="kicker">&nbsp;</p>
          <Text c={c} k="process.principles" />
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <SectionHead c={c} titleKey="fit.title" />
        <Text c={c} k="fit.body" />
        <Text c={c} k="fit.not" />
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <h2>
          <Inline c={c} k="cta.title" />
        </h2>
        <hr class="rule" />
        <Text c={c} k="cta.body" />
        <div class="actions">
          <BookButton c={c} lang={lang} labelKey="hero.cta" />
          <a class="btn secondary" href={`/${lang}/contact`}>
            {c.get("nav.contact")}
          </a>
        </div>
      </div>
    </section>
  </Layout>
);

export const PricingPage: FC<Props> = ({ c, lang, path }) => {
  const columns = c.get("pricing.columns").split("|").map((s) => s.trim());
  const rows = c
    .get("pricing.rows")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("|").map((s) => s.trim()));
  return (
    <Layout c={c} lang={lang} path={path} active="pricing" title={`${c.get("pricing.title")} — ${c.get("site.name")}`}>
      <section class="section">
        <div class="wrap">
          <h1>
            <Inline c={c} k="pricing.title" />
          </h1>
          <hr class="rule" />
          <p class="lead">
            <Inline c={c} k="pricing.intro" />
          </p>
          <div class="table-wrap">
            <table>
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
                      <td class={i === cells.length - 1 ? "price" : undefined}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="note mt">
            <Inline c={c} k="pricing.note" />
          </p>
          <div class="actions">
            <BookButton c={c} lang={lang} labelKey="hero.cta" />
          </div>
        </div>
      </section>
    </Layout>
  );
};

export const AboutPage: FC<Props & { hasPhoto: boolean; hasCv: boolean }> = ({ c, lang, path, hasPhoto, hasCv }) => (
  <Layout c={c} lang={lang} path={path} active="about" title={`${c.get("about.title")} — ${c.get("site.name")}`}>
    <section class="section">
      <div class="wrap cols">
        <div>
          <p class="kicker">{c.get("about.credentials")}</p>
          <h1>{c.get("site.name")}</h1>
          <hr class="rule" />
          <Text c={c} k="about.bio" />
          <div class="actions">
            {hasCv ? (
              <a class="btn" href="/cv.pdf">
                {c.get("about.cv_label")}
              </a>
            ) : null}
            <BookButton c={c} lang={lang} labelKey="hero.cta" class="btn secondary" />
          </div>
        </div>
        <div>{hasPhoto ? <img class="portrait" src="/assets/photo" alt={c.get("site.name")} width="360" height="360" /> : null}</div>
      </div>
    </section>
  </Layout>
);

export const ContactPage: FC<Props & { sent?: "ok" | "error" }> = ({ c, lang, path, sent }) => {
  const email = c.value("contacts.email");
  return (
    <Layout c={c} lang={lang} path={path} active="contact" title={`${c.get("contact.title")} — ${c.get("site.name")}`}>
      <section class="section">
        <div class="wrap cols">
          <div>
            <h1>
              <Inline c={c} k="contact.title" />
            </h1>
            <hr class="rule" />
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
          <div>
            <h2>{c.get("contact.form_title")}</h2>
            {sent === "ok" ? <p class="flash ok">{c.get("contact.form_ok")}</p> : null}
            {sent === "error" ? <p class="flash error">{c.get("contact.form_error")}</p> : null}
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
              <button class="btn" type="submit">
                {c.get("contact.form_send")}
              </button>
            </form>
          </div>
        </div>
      </section>
    </Layout>
  );
};

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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/styles.css"></head><body><main class="section"><div class="wrap"><h1>${escapeHtml(title)}</h1><hr class="rule"><p>${escapeHtml(body)}</p></div></main></body></html>`;
}
