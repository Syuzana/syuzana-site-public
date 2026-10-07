import type { FC } from "hono/jsx";
import type { Content } from "../content";
import { isSharedKey } from "../content";
import type { Lang } from "../i18n";

export type AdminProps = {
  c: Content;
  lang: Lang;
  keys: string[];
  who: string;
  via: string;
  flash?: { kind: "ok" | "error"; text: string };
  assets: { cv: string | null; photo: string | null };
};

const MULTILINE = /(\.body|\.items|\.steps|\.principles|\.inside|\.rows|\.bio|\.note|\.intro|\.lead|\.playful|_line)$/;

/**
 * Server-rendered admin. Reachable only behind Cloudflare Access (+ JWT re-check in the Worker).
 * One textarea per content key; two upload forms. No JavaScript needed.
 */
export const AdminPage: FC<AdminProps> = ({ c, lang, keys, who, via, flash, assets }) => {
  const shared = keys.filter(isSharedKey);
  const perLang = keys.filter((k) => !isSharedKey(k));
  const field = (key: string) => {
    const value = c.rows.get(key) ?? "";
    const multi = MULTILINE.test(key) || value.includes("\n") || value.length > 90;
    return (
      <div class="field">
        <label>
          <span class="key">{key}</span>
          {multi ? (
            <textarea name={`v:${key}`} rows={Math.min(14, Math.max(3, value.split("\n").length + 1))}>
              {"\n" + value /* the parser drops one leading newline, so a value starting with "\n" survives */}
            </textarea>
          ) : (
            <input name={`v:${key}`} value={value} />
          )}
        </label>
      </div>
    );
  };
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Admin — syuzana.com</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body class="admin">
        <header class="site-header">
          <div class="wrap">
            <a class="wordmark" href={`/${lang}/`}>
              syuzana.com / admin
            </a>
            <nav class="nav">
              <a href="/admin?lang=ru" aria-current={lang === "ru" ? "page" : undefined}>
                RU
              </a>
              <a href="/admin?lang=en" aria-current={lang === "en" ? "page" : undefined}>
                EN
              </a>
              <span class="note">
                {who} · {via}
              </span>
              {via === "password" ? (
                <form method="post" action="/admin/logout" class="inline-form">
                  <button class="lang-toggle" type="submit">
                    Sign out
                  </button>
                </form>
              ) : null}
            </nav>
          </div>
        </header>
        <main class="section">
          <div class="wrap">
            {flash ? <p class={`flash ${flash.kind}`}>{flash.text}</p> : null}

            <h2>Files</h2>
            <div class="cols">
              <form class="stack" method="post" action="/admin/upload/cv" enctype="multipart/form-data">
                <label>
                  CV (PDF, ≤ 5 MB){assets.cv ? <span class="note"> — current: {assets.cv}</span> : <span class="note"> — none yet</span>}
                  <input type="file" name="file" accept="application/pdf" required />
                </label>
                <button class="btn" type="submit">
                  Replace CV
                </button>
              </form>
              <form class="stack" method="post" action="/admin/upload/photo" enctype="multipart/form-data">
                <label>
                  Photo (PNG/JPEG/WebP, ≤ 8 MB)
                  {assets.photo ? <span class="note"> — current: {assets.photo}</span> : <span class="note"> — none yet</span>}
                  <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required />
                </label>
                <button class="btn" type="submit">
                  Replace photo
                </button>
              </form>
            </div>

            <form method="post" action="/admin/content">
              <input type="hidden" name="lang" value={lang} />
              <h2>Contacts & links (shared by both languages)</h2>
              <p class="note">
                Leave a value as <code>{"{{SET_IN_ADMIN}}"}</code> to hide that link. Booking URL = your Google Calendar appointment page.
              </p>
              {shared.map(field)}

              <h2>Text — {lang.toUpperCase()}</h2>
              <p class="note">
                Markup: blank line = new paragraph · lines starting with "- " = list · **bold** · [text](url) · {"{github} {channel} {email}"}.
              </p>
              {perLang.map(field)}

              <div class="row">
                <button class="btn" type="submit">
                  Save {lang.toUpperCase()}
                </button>
                <a class="btn secondary" href={`/${lang}/`} target="_blank" rel="noopener">
                  Open site
                </a>
              </div>
            </form>
          </div>
        </main>
      </body>
    </html>
  );
};
