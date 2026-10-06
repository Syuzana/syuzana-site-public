/**
 * Tiny, safe text → HTML renderer for admin-edited copy. Supports exactly:
 *   blank-line paragraphs · "- " bullet lists · **bold** · [text](url) links · {placeholder}
 * Everything is HTML-escaped first, so admin text can never inject markup.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

const UNESCAPES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function unescapeHtml(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => UNESCAPES[entity] ?? entity);
}

/** Only http(s), mailto and site-relative links survive; anything else is dropped. */
export function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return null;
}

function inline(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
      // `url` arrives already escaped (the whole line was); undo that so it is escaped exactly once.
      const href = safeUrl(unescapeHtml(url));
      if (!href) return text;
      const external = /^https?:\/\//i.test(href) ? ' rel="noopener"' : "";
      return `<a href="${escapeHtml(href)}"${external}>${text}</a>`;
    });
}

/** Replaces {name} with values; unknown placeholders become empty strings. */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/g, (_m, name: string) => values[name] ?? "");
}

export function renderText(text: string, placeholders: Record<string, string> = {}): string {
  const filled = fillPlaceholders(text, placeholders);
  const blocks = filled.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").filter((line) => line.trim() !== "");
      if (lines.length === 0) return "";
      if (lines.every((line) => line.trimStart().startsWith("- "))) {
        const items = lines
          .map((line) => `<li>${inline(escapeHtml(line.trimStart().slice(2)))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${inline(escapeHtml(lines.join(" ")))}</p>`;
    })
    .join("");
}

/** A single line (headings, labels): inline markup only, no block wrapper. */
export function renderInline(text: string, placeholders: Record<string, string> = {}): string {
  return inline(escapeHtml(fillPlaceholders(text, placeholders)));
}

/** "- a\n- b" → ["a", "b"] for templates that lay list items out themselves. */
export function listItems(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}
