import type { Lang } from "./i18n";
import { otherLang } from "./i18n";

export const PLACEHOLDER = "{{SET_IN_ADMIN}}";

/** Keys that are language-independent (stored with lang '*'). */
export const SHARED_KEYS = [
  "contacts.email",
  "contacts.linkedin",
  "contacts.github",
  "contacts.channel",
  "contacts.booking_url",
] as const;

export type Content = {
  /** Value for `key`, falling back to the other language, then "". */
  get(key: string): string;
  /** Like get(), but "" when the value is the unset placeholder. */
  value(key: string): string;
  has(key: string): boolean;
  readonly lang: Lang;
  /** Raw rows for the admin editor: key → value in this language (shared keys included). */
  readonly rows: ReadonlyMap<string, string>;
};

type Row = { key: string; lang: string; value: string };

export async function loadContent(db: D1Database, lang: Lang): Promise<Content> {
  const fallback = otherLang(lang);
  const { results } = await db
    .prepare("SELECT key, lang, value FROM content WHERE lang IN (?1, ?2, '*')")
    .bind(lang, fallback)
    .all<Row>();

  const primary = new Map<string, string>();
  const secondary = new Map<string, string>();
  for (const row of results) {
    if (row.lang === lang || row.lang === "*") primary.set(row.key, row.value);
    else secondary.set(row.key, row.value);
  }

  const get = (key: string) => primary.get(key) ?? secondary.get(key) ?? "";
  return {
    lang,
    rows: primary,
    get,
    has: (key) => primary.has(key) || secondary.has(key),
    value: (key) => {
      const v = get(key);
      return v === PLACEHOLDER ? "" : v;
    },
  };
}

export function isSharedKey(key: string): boolean {
  return (SHARED_KEYS as readonly string[]).includes(key);
}

/** Upserts admin edits. Keys are validated against what already exists so the editor cannot invent rows. */
export async function saveContent(
  db: D1Database,
  lang: Lang,
  updates: ReadonlyMap<string, string>,
  now: string,
): Promise<number> {
  const statements: D1PreparedStatement[] = [];
  const upsert = db.prepare(
    `INSERT INTO content (key, lang, value, updated_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(key, lang) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
     WHERE content.value <> excluded.value`,
  );
  for (const [key, value] of updates) {
    const rowLang = isSharedKey(key) ? "*" : lang;
    statements.push(upsert.bind(key, rowLang, value, now));
  }
  if (statements.length === 0) return 0;
  const results = await db.batch(statements);
  return results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
}

/** All keys the admin may edit: every row present for this language plus the shared ones. */
export async function editableKeys(db: D1Database, lang: Lang): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT DISTINCT key FROM content WHERE lang IN (?1, '*') ORDER BY key")
    .bind(lang)
    .all<{ key: string }>();
  return results.map((r) => r.key);
}
