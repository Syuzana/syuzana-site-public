import qrcode from "qrcode-generator";

import type { Content } from "./content";

/** Escape the five characters vCard treats as structure. */
function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * A vCard built from the contacts already in D1. Only fields with a value are
 * written: a card with empty lines reads as broken in a phone's address book.
 */
export function vcard(c: Content, origin: string): string {
  const name = c.get("site.name");
  const parts = name.split(/\s+/);
  const family = parts.length > 1 ? (parts[parts.length - 1] ?? name) : name;
  const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";

  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${esc(family)};${esc(given)};;;`, `FN:${esc(name)}`];
  const title = c.get("site.role");
  if (title) lines.push(`TITLE:${esc(title)}`);
  const email = c.value("contacts.email");
  if (email) lines.push(`EMAIL;TYPE=INTERNET:${esc(email)}`);
  if (origin) lines.push(`URL:${esc(origin)}`);
  for (const key of ["contacts.linkedin", "contacts.telegram", "contacts.github"] as const) {
    const url = c.value(key);
    if (url) lines.push(`URL:${esc(url)}`);
  }
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/**
 * The code as inline SVG. Drawn server-side on purpose: the page loads no
 * third-party script, and the CSP has no reason to admit one.
 */
export function qrSvg(text: string, label: string): string {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const count = q.getModuleCount();
  const quiet = 2;
  const size = count + quiet * 2;

  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (q.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  return (
    `<svg class="qr" viewBox="0 0 ${size} ${size}" width="112" height="112" role="img" ` +
    `aria-label="${label.replace(/"/g, "&quot;")}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#f3eee6"/>` +
    `<path d="${path}" fill="#1e1a19"/></svg>`
  );
}
