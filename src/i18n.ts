export type Lang = "ru" | "en";

export const LANGS: readonly Lang[] = ["ru", "en"] as const;
export const DEFAULT_LANG: Lang = "en";
export const LANG_COOKIE = "lang";

export function isLang(value: string | undefined | null): value is Lang {
  return value === "ru" || value === "en";
}

/**
 * Picks the language for a first visit: a remembered cookie wins; otherwise Russian only
 * when the browser's most-preferred language is Russian, English for everyone else (D-005).
 */
export function detectLang(acceptLanguage: string | null, cookieLang: string | undefined): Lang {
  if (isLang(cookieLang)) return cookieLang;
  const first = parseAcceptLanguage(acceptLanguage)[0];
  return first?.toLowerCase().startsWith("ru") ? "ru" : DEFAULT_LANG;
}

/** Returns language tags ordered by quality, highest first. */
export function parseAcceptLanguage(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.tag);
}

export function otherLang(lang: Lang): Lang {
  return lang === "ru" ? "en" : "ru";
}

/** Swaps the language prefix on a path like /ru/pricing → /en/pricing. */
export function switchLangPath(path: string, to: Lang): string {
  const rest = path.replace(/^\/(ru|en)(?=\/|$)/, "");
  return `/${to}${rest || "/"}`;
}
