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
  active?: "home" | "pricing" | "about" | "contact";
}>;

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

export const Layout: FC<PageProps> = ({ c, lang, path, title, description, active, children }) => {
  const other = otherLang(lang);
  const navItem = (key: PageProps["active"], href: string, labelKey: string) => (
    <a href={`/${lang}${href}`} aria-current={active === key ? "page" : undefined}>
      {c.get(labelKey)}
    </a>
  );
  return (
    <html lang={lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description ?? c.get("site.description")} />
        <link rel="alternate" hreflang={other} href={switchLangPath(path, other)} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&family=PT+Serif:wght@400;700&display=swap"
        />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <header class="site-header">
          <div class="wrap">
            <a class="wordmark" href={`/${lang}/`}>
              syuzana.com
            </a>
            <nav class="nav" aria-label="Main">
              {navItem("home", "/", "nav.home")}
              {navItem("pricing", "/pricing", "nav.pricing")}
              {navItem("about", "/about", "nav.about")}
              {navItem("contact", "/contact", "nav.contact")}
              <a class="lang-toggle" href={switchLangPath(path, other)} hreflang={other} lang={other}>
                {other.toUpperCase()}
              </a>
            </nav>
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
            {link(c, "contacts.github") && link(c, "contacts.channel") ? <Text c={c} k="footer.playful" /> : null}
            {link(c, "contacts.channel") ? <Text c={c} k="footer.channel_line" /> : null}
            <p class="note">© {new Date().getUTCFullYear()} {c.get("site.name")}</p>
          </div>
        </footer>
      </body>
    </html>
  );
};
