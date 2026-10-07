import type { FC, PropsWithChildren } from "hono/jsx";
import type { Content } from "../content";
import { type Lang, otherLang, switchLangPath } from "../i18n";
import { renderInline, renderText, safeUrl } from "../render";

export type PageProps = PropsWithChildren<{
  c: Content;
  lang: Lang;
  path: string;
  title: string;
  description?: string;
}>;

/** One-page site: the nav is a row of anchors into the home page. */
const NAV: ReadonlyArray<[string, string]> = [
  ["situations", "nav.situations"],
  ["formats", "nav.formats"],
  ["experience", "nav.experience"],
  ["pricing", "nav.pricing"],
  ["contact", "nav.contact"],
];

/** An admin-entered link, or "" when unset or not http(s)/mailto/relative. */
export function link(c: Content, key: string): string {
  return safeUrl(c.value(key)) ?? "";
}

/** Shared placeholders for {github}, {channel}, … in admin text. */
export function placeholders(c: Content): Record<string, string> {
  return {
    email: c.value("contacts.email"),
    linkedin: link(c, "contacts.linkedin"),
    github: link(c, "contacts.github"),
    channel: link(c, "contacts.channel"),
    booking: link(c, "contacts.booking_url"),
  };
}

/** Admin text as a block of HTML (paragraphs/lists). */
export const Text: FC<{ c: Content; k: string }> = ({ c, k }) => (
  <div dangerouslySetInnerHTML={{ __html: renderText(c.get(k), placeholders(c)) }} />
);

/** Admin text as inline HTML (headings, labels). */
export const Inline: FC<{ c: Content; k: string }> = ({ c, k }) => (
  <span dangerouslySetInnerHTML={{ __html: renderInline(c.get(k), placeholders(c)) }} />
);

export const SectionHead: FC<{ c: Content; titleKey: string; kicker?: string }> = ({ c, titleKey, kicker }) => (
  <>
    {kicker ? <p class="kicker">{kicker}</p> : null}
    <h2>
      <Inline c={c} k={titleKey} />
    </h2>
    <hr class="rule" />
  </>
);

export const Layout: FC<PageProps> = ({ c, lang, path, title, description, children }) => {
  const other = otherLang(lang);
  return (
    <html lang={lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description ?? c.get("site.description")} />
        <link rel="alternate" hreflang={lang} href={`https://syuzana.com${path}`} />
        <link rel="alternate" hreflang={other} href={`https://syuzana.com${switchLangPath(path, other)}`} />
        <link rel="alternate" hreflang="x-default" href={`https://syuzana.com${switchLangPath(path, "en")}`} />
        <link rel="canonical" href={`https://syuzana.com${path}`} />
        <meta property="og:type" content="profile" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description ?? c.get("site.description")} />
        <meta property="og:url" content={`https://syuzana.com${path}`} />
        <meta property="og:image" content="https://syuzana.com/assets/photo" />
        <meta property="og:image:alt" content={c.get("site.name")} />
        <meta property="og:locale" content={lang === "ru" ? "ru_RU" : "en_GB"} />
        <meta name="twitter:card" content="summary" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              name: c.get("site.name"),
              jobTitle: c.get("site.role"),
              description: c.get("site.description"),
              url: "https://syuzana.com/",
              image: "https://syuzana.com/assets/photo",
              email: c.value("contacts.email") ? `mailto:${c.value("contacts.email")}` : undefined,
              sameAs: [link(c, "contacts.linkedin"), link(c, "contacts.github"), link(c, "contacts.channel")].filter(Boolean),
            }),
          }}
        />
        <link rel="preload" href="/fonts/pt-serif-700-cyrillic.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <link rel="preload" href="/fonts/pt-sans-400-cyrillic.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <link rel="stylesheet" href="/fonts.css" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <header class="site-header">
          <div class="wrap">
            <a class="wordmark" href={`/${lang}/`}>
              syuzana.com
            </a>
            <nav class="nav" aria-label="Main">
              {NAV.map(([anchor, labelKey]) => (
                <a href={`/${lang}/#${anchor}`}>{c.get(labelKey)}</a>
              ))}
            </nav>
            <a class="lang-toggle" href={switchLangPath(path, other)} hreflang={other} lang={other}>
              {other.toUpperCase()}
            </a>
          </div>
        </header>
        <main>{children}</main>
        <footer class="site-footer">
          <div class="wrap">
            <div class="links">
              {link(c, "contacts.linkedin") ? (
                <a href={link(c, "contacts.linkedin")} rel="noopener">
                  {c.get("footer.linkedin_label")}
                </a>
              ) : null}
              {link(c, "contacts.github") ? (
                <a href={link(c, "contacts.github")} rel="noopener">
                  {c.get("footer.github_label")}
                </a>
              ) : null}
              {link(c, "contacts.channel") ? (
                <a href={link(c, "contacts.channel")} rel="noopener">
                  {c.get("footer.channel_label")}
                </a>
              ) : null}
              {c.value("contacts.email") ? <a href={`mailto:${c.value("contacts.email")}`}>{c.value("contacts.email")}</a> : null}
            </div>
            {link(c, "contacts.channel") ? (
              <section class="channel-block" aria-label={c.get("footer.channel_title")}>
                <h3>{c.get("footer.channel_title")}</h3>
                <Text c={c} k="footer.channel_body" />
                <a class="btn secondary" href={link(c, "contacts.channel")} rel="noopener">
                  {c.get("footer.channel_cta")}
                </a>
              </section>
            ) : null}
            <p class="note">
              © {new Date().getUTCFullYear()} {c.get("site.name")} · <a href={`/${lang}/privacy`}>{c.get("footer.privacy_label")}</a> ·{" "}
              <a href="#top" class="to-top" aria-label="Top">↑</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
};
