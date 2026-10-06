-- Editable site text. One row per (key, lang); lang '*' holds language-independent values
-- such as contact links. Values are plain text with a tiny markup subset (see src/render.ts).
CREATE TABLE IF NOT EXISTS content (
  key        TEXT NOT NULL,
  lang       TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (key, lang)
);
