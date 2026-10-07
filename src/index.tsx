import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { isDevBypass, verifyAccess } from "./access";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  clearAttempts,
  clientIp,
  createSession,
  recordFailure,
  tooManyAttempts,
  verifyPassword,
  verifySession,
} from "./auth";
import { LoginPage } from "./views/login";
import { deliverToSheet, notifyTelegram, validateContact } from "./contact";
import { editableKeys, loadContent, saveContent } from "./content";
import { DEFAULT_LANG, LANG_COOKIE, detectLang, isLang, type Lang } from "./i18n";
import { ASSET_KEYS, MAX_BYTES, validateUpload, type AssetKind } from "./uploads";
import { AdminPage } from "./views/admin";
import { HomePage, NotFoundPage, PrivacyPage, plainErrorHtml } from "./views/pages";

type Variables = { lang: Lang };
type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

// strict:false — /ru/pricing and /ru/pricing/ are the same page.
const app = new Hono<{ Bindings: Env; Variables: Variables }>({ strict: false });

/** Every HTML response goes through here so no page can miss the doctype (quirks mode). */
function page(c: Context, body: unknown, status: ContentfulStatusCode = 200) {
  return c.html(html`<!doctype html>${body}`, status);
}

/* ---------- Security headers (specs/architecture.md §5) ---------- */

app.use(
  "*",
  secureHeaders({
    strictTransportSecurity: "max-age=63072000; includeSubDomains",
    referrerPolicy: "strict-origin-when-cross-origin",
    xFrameOptions: "DENY",
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      // Cloudflare Web Analytics is injected by the platform (cookieless); allow only that origin.
      scriptSrc: ["'self'", "https://static.cloudflareinsights.com"],
      connectSrc: ["'self'", "https://cloudflareinsights.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: [],
    },
  }),
);

app.onError((error, c) => {
  // Deliberate HTTP errors (e.g. 413 from bodyLimit) keep their status; only real bugs become 500.
  if (error instanceof HTTPException) return error.getResponse();
  const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
  console.error(JSON.stringify({ event: "unhandled_error", path: c.req.path, ...err }));
  return c.html(plainErrorHtml("Something went wrong", "Please try again in a minute."), 500);
});

/* ---------- One canonical host: https, apex (www and http → 301) ---------- */

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const isWww = url.hostname === "www.syuzana.com";
  // `wrangler dev` rewrites the request URL to the custom domain over plain http, so forcing
  // https there loops forever (syusite-g4e2). Behind Cloudflare the Worker always sees https.
  const isHttp = url.protocol === "http:" && url.hostname.endsWith("syuzana.com") && c.env.ENVIRONMENT !== "development";
  if (isWww || isHttp) {
    url.hostname = "syuzana.com";
    url.protocol = "https:";
    return c.redirect(url.toString(), 301);
  }
  await next();
});

/* ---------- Language ---------- */

/** Language from the URL prefix when present, else cookie/Accept-Language (D-005). */
function langFor(c: Context): Lang {
  const fromPath = c.req.path.match(/^\/(ru|en)(?:\/|$)/)?.[1];
  if (isLang(fromPath)) return fromPath;
  return detectLang(c.req.header("Accept-Language") ?? null, getCookie(c, LANG_COOKIE));
}

// First visit: pick a language and redirect.
app.get("/", (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Vary", "Accept-Language, Cookie");
  return c.redirect(`/${langFor(c)}/`, 302);
});

app.use("/:lang{(?:ru|en)}/*", async (c, next) => {
  const lang = c.req.param("lang");
  if (!isLang(lang)) return c.notFound();
  c.set("lang", lang);
  setCookie(c, LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "Lax", secure: true, httpOnly: true });
  await next();
});

/* ---------- Public page (one page, SSR from D1) ---------- */

app.get("/:lang{(?:ru|en)}", async (c: AppContext) => {
  const lang = c.get("lang");
  const [content, photo, cv] = await Promise.all([
    loadContent(c.env.DB, lang),
    c.env.ASSETS_BUCKET.head(ASSET_KEYS.photo),
    c.env.ASSETS_BUCKET.head(ASSET_KEYS.cv),
  ]);
  const sentParam = c.req.query("sent");
  const sent = sentParam === "ok" || sentParam === "error" ? sentParam : undefined;
  const formEnabled = Boolean(c.env.CONTACT_WEBHOOK_URL?.trim());
  return page(c, <HomePage c={content} lang={lang} path={`/${lang}/`} hasPhoto={photo !== null} hasCv={cv !== null} formEnabled={formEnabled} sent={sent} origin={new URL(c.req.url).origin} />);
});

app.get("/:lang{(?:ru|en)}/privacy", async (c: AppContext) => {
  const lang = c.get("lang");
  return page(c, <PrivacyPage c={await loadContent(c.env.DB, lang)} lang={lang} path={c.req.path} />);
});

// The former sub-pages live on as anchors, so old links and the QR code keep working.
for (const [sub, anchor] of [
  ["pricing", "pricing"],
  ["about", "experience"],
  ["contact", "contact"],
] as const) {
  app.get(`/:lang{(?:ru|en)}/${sub}`, (c: AppContext) => c.redirect(`/${c.get("lang")}/#${anchor}`, 301));
}

/* ---------- Files from R2 ---------- */

async function serveAsset(c: AppContext, kind: AssetKind, downloadName?: string): Promise<Response> {
  // onlyIf lets R2 evaluate If-None-Match / If-Modified-Since; a match returns metadata without a body.
  const object = await c.env.ASSETS_BUCKET.get(ASSET_KEYS[kind], { onlyIf: c.req.raw.headers });
  if (!object) return c.text("Not found", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=300, must-revalidate");
  if (downloadName) headers.set("Content-Disposition", `inline; filename="${downloadName}"`);
  if (!("body" in object) || !object.body) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}

app.get("/cv.pdf", (c) => serveAsset(c, "cv", "Syuzana_Tevdoradze_CV.pdf"));
app.get("/assets/photo", (c) => serveAsset(c, "photo"));

/* ---------- Contact form → Google Sheet (+ Telegram) ---------- */

app.post("/api/contact", bodyLimit({ maxSize: 16 * 1024 }), async (c) => {
  const form = await c.req.parseBody();
  const langRaw = form["lang"];
  const lang: Lang = typeof langRaw === "string" && isLang(langRaw) ? langRaw : DEFAULT_LANG;
  const back = (state: "ok" | "error") => c.redirect(`/${lang}/?sent=${state}#contact`, 303);
  const wantsJson = c.req.header("Accept")?.includes("application/json");
  const result = (ok: boolean, status: 200 | 400 | 502 | 503) => wantsJson ? c.json({ ok }, status) : back(ok ? "ok" : "error");

  const validation = validateContact({ name: form["name"], email: form["email"], message: form["message"] }, lang, new Date());
  if (!validation.ok) {
    console.log(JSON.stringify({ event: "contact", outcome: "invalid", reason: validation.reason }));
    return result(false, 400);
  }

  const delivery = await deliverToSheet(c.env, validation.value);
  console.log(JSON.stringify({ event: "contact", outcome: delivery.delivered ? "delivered" : "failed", status: delivery.status }));
  if (delivery.delivered) c.executionCtx.waitUntil(notifyTelegram(c.env, validation.value));
  return result(delivery.delivered, delivery.delivered ? 200 : delivery.status === 503 ? 503 : 502);
});

/* ---------- Admin (Cloudflare Access + JWT re-check) ---------- */

type AdminVariables = { who: string; via: string };
type AdminContext = Context<{ Bindings: Env; Variables: AdminVariables }>;

const admin = new Hono<{ Bindings: Env; Variables: AdminVariables }>({ strict: false });

// Same-origin check for every state-changing admin request, login included — session and
// Access cookies both ride along automatically, so CSRF is the remaining vector.
admin.use("*", async (c, next) => {
  if (c.req.method === "POST") {
    const origin = c.req.header("Origin");
    let originHost: string | null = null;
    try {
      originHost = origin && origin !== "null" ? new URL(origin).host : null;
    } catch {
      originHost = null;
    }
    if (!originHost || originHost !== new URL(c.req.url).host) return c.text("Forbidden", 403);
  }
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Cache-Control", "no-store");
  await next();
});

/** Paths reachable without a session; everything else under /admin is gated. */
const OPEN_ADMIN_PATHS = new Set(["/admin/login", "/admin/logout"]);

function adminPath(c: Context): string {
  const path = new URL(c.req.url).pathname;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** Password session first (D-019), Cloudflare Access second when it is configured. */
admin.use("*", async (c, next) => {
  if (OPEN_ADMIN_PATHS.has(adminPath(c))) return next();

  if (isDevBypass(c.env)) {
    c.set("who", "dev@localhost");
    c.set("via", "dev-bypass");
    return next();
  }

  const passwordReady = Boolean(c.env.ADMIN_PASSWORD_HASH && c.env.SESSION_SECRET);
  const accessReady = Boolean(c.env.ACCESS_TEAM_DOMAIN && c.env.ACCESS_AUD && c.env.ADMIN_EMAIL);
  if (!passwordReady && !accessReady) {
    console.log(JSON.stringify({ event: "admin_denied", reason: "not configured" }));
    return c.text("Admin is not configured.", 503);
  }

  if (passwordReady && (await verifySession(c.env.SESSION_SECRET, getCookie(c, SESSION_COOKIE), new Date()))) {
    c.set("who", c.env.ADMIN_EMAIL || "owner");
    c.set("via", "password");
    return next();
  }

  if (accessReady) {
    const result = await verifyAccess(c.req.raw, c.env);
    if (result.ok) {
      c.set("who", result.email);
      c.set("via", result.via);
      return next();
    }
    if (!passwordReady) {
      console.log(JSON.stringify({ event: "admin_denied", status: result.status, reason: result.reason }));
      return c.text("Forbidden", result.status);
    }
  }

  console.log(JSON.stringify({ event: "admin_denied", reason: "no session" }));
  if (c.req.method !== "GET") return c.text("Forbidden", 403);
  return c.redirect("/admin/login", 302);
});

/* ---------- Login / logout ---------- */

admin.get("/login", (c) => page(c, <LoginPage />));

admin.post("/login", bodyLimit({ maxSize: 4 * 1024 }), async (c) => {
  const now = new Date();
  const ip = clientIp(c.req.raw);

  if (await tooManyAttempts(c.env.DB, ip, now)) {
    console.log(JSON.stringify({ event: "admin_login", outcome: "rate_limited", ip }));
    return page(c, <LoginPage error="Too many attempts. Try again in 15 minutes." />, 429);
  }

  const form = await c.req.parseBody();
  const password = typeof form["password"] === "string" ? form["password"] : "";
  if (!(await verifyPassword(password, c.env.ADMIN_PASSWORD_HASH))) {
    await recordFailure(c.env.DB, ip, now);
    console.log(JSON.stringify({ event: "admin_login", outcome: "failed", ip }));
    return page(c, <LoginPage error="Wrong password." />, 401);
  }

  await clearAttempts(c.env.DB, ip);
  setCookie(c, SESSION_COOKIE, await createSession(c.env.SESSION_SECRET ?? "", now), {
    path: "/admin",
    httpOnly: true,
    // Local dev runs on http://localhost, where a Secure cookie would be dropped.
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    maxAge: SESSION_TTL_SECONDS,
  });
  console.log(JSON.stringify({ event: "admin_login", outcome: "ok", ip }));
  return c.redirect("/admin", 303);
});

admin.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/admin" });
  return c.redirect("/admin/login", 303);
});

function adminLang(raw: string | undefined): Lang {
  return isLang(raw) ? raw : "ru";
}

type Flash = { kind: "ok" | "error"; text: string };

async function renderAdmin(c: AdminContext, flash?: Flash): Promise<Response> {
  const lang = adminLang(c.req.query("lang"));
  const [content, keys, cv, photo] = await Promise.all([
    loadContent(c.env.DB, lang),
    editableKeys(c.env.DB, lang),
    c.env.ASSETS_BUCKET.head(ASSET_KEYS.cv),
    c.env.ASSETS_BUCKET.head(ASSET_KEYS.photo),
  ]);
  const describe = (o: R2Object | null) => (o ? `${Math.round(o.size / 1024)} KB, ${o.uploaded.toISOString().slice(0, 10)}` : null);
  return page(
    c,
    <AdminPage c={content} lang={lang} keys={keys} who={c.get("who")} via={c.get("via")} flash={flash} assets={{ cv: describe(cv), photo: describe(photo) }} />,
  );
}

admin.get("/", (c) => {
  const saved = c.req.query("saved");
  const error = c.req.query("error");
  const flash: Flash | undefined =
    error === "toolong"
      ? { kind: "error", text: "One value was longer than 20,000 characters and was not saved." }
      : saved !== undefined
        ? { kind: "ok", text: `Saved — ${saved} value(s) changed.` }
        : undefined;
  return renderAdmin(c, flash);
});

const MAX_VALUE_LENGTH = 20_000;

admin.post("/content", bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
  const form = await c.req.parseBody({ all: false });
  const langRaw = form["lang"];
  const lang = adminLang(typeof langRaw === "string" ? langRaw : undefined);
  const allowed = new Set(await editableKeys(c.env.DB, lang));
  const updates = new Map<string, string>();
  for (const [field, value] of Object.entries(form)) {
    if (!field.startsWith("v:") || typeof value !== "string") continue;
    const key = field.slice(2);
    if (!allowed.has(key)) continue; // the editor cannot invent rows
    if (value.length > MAX_VALUE_LENGTH) return c.redirect(`/admin?lang=${lang}&error=toolong`, 303);
    updates.set(key, value.replace(/\r\n/g, "\n"));
  }
  const changed = await saveContent(c.env.DB, lang, updates, new Date().toISOString());
  console.log(JSON.stringify({ event: "admin_content_saved", lang, changed, by: c.get("who") }));
  return c.redirect(`/admin?lang=${lang}&saved=${changed}`, 303);
});

async function handleUpload(c: AdminContext, kind: AssetKind): Promise<Response> {
  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) return renderAdmin(c, { kind: "error", text: "No file received." });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateUpload(kind, bytes);
  if (!validation.ok) return renderAdmin(c, { kind: "error", text: `Upload rejected: ${validation.reason}.` });
  await c.env.ASSETS_BUCKET.put(ASSET_KEYS[kind], bytes, {
    httpMetadata: { contentType: validation.contentType },
    customMetadata: { uploadedBy: c.get("who"), uploadedAt: new Date().toISOString() },
  });
  console.log(JSON.stringify({ event: "admin_asset_replaced", kind, bytes: bytes.byteLength, by: c.get("who") }));
  return renderAdmin(c, { kind: "ok", text: `${kind === "cv" ? "CV" : "Photo"} replaced (${Math.round(bytes.byteLength / 1024)} KB).` });
}

// The stream is capped slightly above the file limit (multipart framing) before anything is buffered.
admin.post("/upload/cv", bodyLimit({ maxSize: MAX_BYTES.cv + 64 * 1024 }), (c) => handleUpload(c, "cv"));
admin.post("/upload/photo", bodyLimit({ maxSize: MAX_BYTES.photo + 64 * 1024 }), (c) => handleUpload(c, "photo"));

app.route("/admin", admin);

/* ---------- 404 ---------- */

app.notFound(async (c) => {
  const lang = langFor(c);
  try {
    const content = await loadContent(c.env.DB, lang);
    return page(c, <NotFoundPage c={content} lang={lang} path={c.req.path} />, 404);
  } catch {
    return c.html(plainErrorHtml("Not found", "There is no such page."), 404);
  }
});

export default app;
