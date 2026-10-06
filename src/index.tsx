import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { secureHeaders } from "hono/secure-headers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { verifyAccess } from "./access";
import { deliverToSheet, notifyTelegram, validateContact } from "./contact";
import { editableKeys, loadContent, saveContent } from "./content";
import { DEFAULT_LANG, LANG_COOKIE, detectLang, isLang, type Lang } from "./i18n";
import { ASSET_KEYS, MAX_BYTES, validateUpload, type AssetKind } from "./uploads";
import { AdminPage } from "./views/admin";
import { AboutPage, ContactPage, HomePage, NotFoundPage, PricingPage, plainErrorHtml } from "./views/pages";

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
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      scriptSrc: ["'none'"],
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

/* ---------- Public pages (SSR from D1) ---------- */

app.get("/:lang{(?:ru|en)}", async (c: AppContext) => {
  const lang = c.get("lang");
  const content = await loadContent(c.env.DB, lang);
  return page(c, <HomePage c={content} lang={lang} path={`/${lang}/`} />);
});

app.get("/:lang{(?:ru|en)}/pricing", async (c: AppContext) => {
  const lang = c.get("lang");
  const content = await loadContent(c.env.DB, lang);
  return page(c, <PricingPage c={content} lang={lang} path={c.req.path} />);
});

app.get("/:lang{(?:ru|en)}/about", async (c: AppContext) => {
  const lang = c.get("lang");
  const [content, cv, photo] = await Promise.all([
    loadContent(c.env.DB, lang),
    c.env.ASSETS_BUCKET.head(ASSET_KEYS.cv),
    c.env.ASSETS_BUCKET.head(ASSET_KEYS.photo),
  ]);
  return page(c, <AboutPage c={content} lang={lang} path={c.req.path} hasCv={cv !== null} hasPhoto={photo !== null} />);
});

app.get("/:lang{(?:ru|en)}/contact", async (c: AppContext) => {
  const lang = c.get("lang");
  const content = await loadContent(c.env.DB, lang);
  const sentParam = c.req.query("sent");
  const sent = sentParam === "ok" || sentParam === "error" ? sentParam : undefined;
  return page(c, <ContactPage c={content} lang={lang} path={c.req.path} sent={sent} />);
});

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
  const back = (state: "ok" | "error") => c.redirect(`/${lang}/contact?sent=${state}`, 303);

  const validation = validateContact({ name: form["name"], email: form["email"], message: form["message"] }, lang, new Date());
  if (!validation.ok) {
    console.log(JSON.stringify({ event: "contact", outcome: "invalid", reason: validation.reason }));
    return back("error");
  }

  const delivery = await deliverToSheet(c.env, validation.value);
  console.log(JSON.stringify({ event: "contact", outcome: delivery.delivered ? "delivered" : "failed", status: delivery.status }));
  if (delivery.delivered) c.executionCtx.waitUntil(notifyTelegram(c.env, validation.value));
  return back(delivery.delivered ? "ok" : "error");
});

/* ---------- Admin (Cloudflare Access + JWT re-check) ---------- */

type AdminVariables = { who: string; via: string };
type AdminContext = Context<{ Bindings: Env; Variables: AdminVariables }>;

const admin = new Hono<{ Bindings: Env; Variables: AdminVariables }>({ strict: false });

admin.use("*", async (c, next) => {
  const result = await verifyAccess(c.req.raw, c.env);
  if (!result.ok) {
    console.log(JSON.stringify({ event: "admin_denied", status: result.status, reason: result.reason }));
    return c.text(result.status === 503 ? "Admin is not configured." : "Forbidden", result.status);
  }
  c.set("who", result.email);
  c.set("via", result.via);
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Cache-Control", "no-store");
  await next();
});

// Same-origin check for state-changing requests (Access cookies make CSRF the one remaining vector).
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
  await next();
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
