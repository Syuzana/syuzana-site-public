/**
 * Password login for /admin.
 *
 * Chosen over Cloudflare Access at Syuzana's request (D-019): no Zero Trust setup, no
 * per-login email code. The Access path in access.ts still works and takes precedence when
 * it is configured, so the stronger gate can be switched on later without touching this.
 *
 * Design notes:
 * - The password is never stored. A PBKDF2-SHA256 digest lives in the ADMIN_PASSWORD_HASH
 *   secret as `pbkdf2$<iterations>$<saltB64>$<hashB64>`.
 * - Iterations are kept modest because Workers bill CPU time per request; the defence that
 *   actually matters here is a long random password plus the D1-backed attempt limit below.
 * - Sessions are stateless: an expiry signed with HMAC-SHA256 under SESSION_SECRET.
 * - Every comparison of secret material goes through crypto.subtle.timingSafeEqual.
 */

export type PasswordEnv = {
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
};

export const PBKDF2_ITERATIONS = 50_000;
export const SESSION_COOKIE = "admin_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  // Cloudflare's timing-safe comparison; requires equal byte lengths.
  return crypto.subtle.timingSafeEqual(a, b);
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** Produces the value to store in the ADMIN_PASSWORD_HASH secret. */
export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(iterations) || iterations < 1_000 || iterations > 1_000_000) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(parts[2] ?? "");
    expected = fromBase64(parts[3] ?? "");
  } catch {
    return false;
  }
  const actual = await derive(password, salt, iterations);
  return equal(actual, expected);
}

/* ---------- Stateless sessions ---------- */

async function sign(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return new Uint8Array(mac);
}

export async function createSession(secret: string, now: Date, ttlSeconds = SESSION_TTL_SECONDS): Promise<string> {
  const expiry = String(Math.floor(now.getTime() / 1000) + ttlSeconds);
  return `${expiry}.${toBase64(await sign(secret, expiry))}`;
}

export async function verifySession(secret: string | undefined, token: string | undefined, now: Date): Promise<boolean> {
  if (!secret || !token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expiry = token.slice(0, dot);
  if (!/^\d{1,15}$/.test(expiry)) return false;
  let presented: Uint8Array;
  try {
    presented = fromBase64(token.slice(dot + 1));
  } catch {
    return false;
  }
  // Signature first, then expiry: an unsigned token never reaches the clock check.
  if (!equal(presented, await sign(secret, expiry))) return false;
  return Number.parseInt(expiry, 10) > Math.floor(now.getTime() / 1000);
}

/* ---------- Attempt limiting (D1-backed, per client IP) ---------- */

export const MAX_ATTEMPTS = 8;
export const ATTEMPT_WINDOW_SECONDS = 15 * 60;

function windowStart(now: Date): string {
  return new Date(now.getTime() - ATTEMPT_WINDOW_SECONDS * 1000).toISOString();
}

export async function tooManyAttempts(db: D1Database, ip: string, now: Date): Promise<boolean> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM login_attempt WHERE ip = ?1 AND at > ?2")
    .bind(ip, windowStart(now))
    .first<{ n: number }>();
  return (row?.n ?? 0) >= MAX_ATTEMPTS;
}

export async function recordFailure(db: D1Database, ip: string, now: Date): Promise<void> {
  await db.batch([
    db.prepare("INSERT INTO login_attempt (ip, at) VALUES (?1, ?2)").bind(ip, now.toISOString()),
    // Opportunistic cleanup so the table cannot grow without bound.
    db.prepare("DELETE FROM login_attempt WHERE at < ?1").bind(windowStart(now)),
  ]);
}

export async function clearAttempts(db: D1Database, ip: string): Promise<void> {
  await db.prepare("DELETE FROM login_attempt WHERE ip = ?1").bind(ip).run();
}

/** Client IP as Cloudflare reports it; "unknown" keeps the limiter working if the header is absent. */
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
}
