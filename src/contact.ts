/**
 * Contact-form capture: validated, size-bounded, formula-injection-guarded, then forwarded to
 * a Google Apps Script web app that appends a row to a Google Sheet. Optional Telegram ping.
 * No database of visitor data lives in this Worker (D-004).
 */

export type ContactEnv = {
  CONTACT_WEBHOOK_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
};

export type ContactMessage = {
  name: string;
  email: string;
  message: string;
  lang: string;
  created_at: string;
  source: "syuzana.com";
};

export const LIMITS = { name: 120, email: 254, message: 4000 } as const;

export type ContactValidation = { ok: true; value: ContactMessage } | { ok: false; reason: string };

/** Leading = + - @ would be interpreted as formulas by a spreadsheet. */
export function looksLikeFormula(text: string): boolean {
  return /^[=+\-@]/.test(text.trimStart());
}

/**
 * Neutralises a would-be formula by prefixing an apostrophe (the spreadsheet convention for
 * "this is text") instead of rejecting — a message starting with "@handle" or "+7 999…" is a
 * real lead, not an attack.
 */
export function neutralizeFormula(text: string): string {
  return looksLikeFormula(text) ? `'${text}` : text;
}

type FieldValue = string | File | null | undefined;

function clean(raw: FieldValue, max: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.replace(/\r\n/g, "\n").trim();
  if (value.length > max) return null;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 && ch !== "\n" && ch !== "\t") return null; // control characters
  }
  return value;
}

export function validateContact(
  fields: { name?: FieldValue; email?: FieldValue; message?: FieldValue },
  lang: string,
  now: Date,
): ContactValidation {
  const name = clean(fields.name, LIMITS.name);
  const email = clean(fields.email, LIMITS.email)?.toLowerCase() ?? null;
  const message = clean(fields.message, LIMITS.message);

  if (!name || !email || !message) return { ok: false, reason: "all fields are required and bounded" };
  // An address cannot legitimately start with a formula character, so that one is rejected.
  if (looksLikeFormula(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "invalid email" };

  return {
    ok: true,
    value: {
      name: neutralizeFormula(name),
      email,
      message: neutralizeFormula(message),
      lang,
      created_at: now.toISOString(),
      source: "syuzana.com",
    },
  };
}

export type DeliveryResult = { delivered: boolean; status: number };

/** POSTs the message to the Apps Script webhook. Bounded by a timeout; never throws. */
export async function deliverToSheet(env: ContactEnv, message: ContactMessage): Promise<DeliveryResult> {
  const url = env.CONTACT_WEBHOOK_URL?.trim();
  if (!url) return { delivered: false, status: 503 };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      redirect: "follow", // Apps Script answers with a redirect to the result
      signal: AbortSignal.timeout(8000),
    });
    return { delivered: response.ok, status: response.status };
  } catch {
    return { delivered: false, status: 502 };
  }
}

/** Best-effort Telegram notification; call inside ctx.waitUntil(). */
export async function notifyTelegram(env: ContactEnv, message: ContactMessage): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return;
  const text = `syuzana.com — new message\nfrom: ${message.name} <${message.email}> (${message.lang})\n\n${message.message}`;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.log(JSON.stringify({ event: "telegram_delivery", success: false, error: String(error) }));
  }
}
