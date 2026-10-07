import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { verifyAccess } from "../src/access";
import { MAX_ATTEMPTS, SESSION_COOKIE, createSession, hashPassword, verifyPassword, verifySession } from "../src/auth";
import { looksLikeFormula, neutralizeFormula, validateContact } from "../src/contact";
import { detectLang, parseAcceptLanguage, switchLangPath } from "../src/i18n";
import app from "../src/index";
import { renderText, safeUrl } from "../src/render";
import { validateUpload } from "../src/uploads";

// Explicitly blank every secret so local .dev.vars can never leak into test behaviour.
const noSecrets = { ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "", ADMIN_EMAIL: "", CONTACT_WEBHOOK_URL: "", CONTACT_WEBHOOK_SECRET: "", TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "" };
const prodEnv = { ...env, ...noSecrets, ENVIRONMENT: "production", ADMIN_DEV_BYPASS: "" } as Env;
const devEnv = { ...env, ...noSecrets, ENVIRONMENT: "development", ADMIN_DEV_BYPASS: "true" } as Env;
const sameOrigin = { Origin: "https://syuzana.com" };

async function request(path: string, init: RequestInit = {}, bindings: Env = prodEnv) {
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request(`https://syuzana.com${path}`, init), bindings, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

const adminPost = (path: string, body: BodyInit, bindings: Env = devEnv) => request(path, { method: "POST", headers: sameOrigin, body }, bindings);

describe("language detection (D-005)", () => {
  it("orders Accept-Language by quality", () => {
    expect(parseAcceptLanguage("en;q=0.5, ru, de;q=0.8")).toEqual(["ru", "de", "en"]);
  });
  it("defaults to English, Russian only when the browser prefers it", () => {
    expect(detectLang("de-DE,de;q=0.9", undefined)).toBe("en");
    expect(detectLang("ru-RU,ru;q=0.9,en;q=0.8", undefined)).toBe("ru");
    expect(detectLang(null, undefined)).toBe("en");
  });
  it("lets a remembered cookie win", () => {
    expect(detectLang("ru-RU", "en")).toBe("en");
  });
  it("redirects / to the detected language without caching", async () => {
    const ru = await request("/", { headers: { "Accept-Language": "ru" }, redirect: "manual" });
    expect(ru.status).toBe(302);
    expect(ru.headers.get("Location")).toBe("/ru/");
    expect(ru.headers.get("Cache-Control")).toBe("no-store");
    const en = await request("/", { headers: { "Accept-Language": "fr" }, redirect: "manual" });
    expect(en.headers.get("Location")).toBe("/en/");
  });
  it("swaps the prefix when toggling", () => {
    expect(switchLangPath("/ru/pricing", "en")).toBe("/en/pricing");
    expect(switchLangPath("/en/", "ru")).toBe("/ru/");
  });
});

describe("public pages render from D1", () => {
  it("serves the Russian home with the seeded hero, a doctype and security headers", async () => {
    const res = await request("/ru/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Я руководитель продукта с техническим опытом");
    expect(html).toContain('lang="ru"');
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src 'self' https://static.cloudflareinsights.com");
    expect(res.headers.get("Content-Security-Policy")).not.toContain("googleapis");
    expect(res.headers.get("Content-Security-Policy")).not.toContain("unsafe-inline");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
  it("accepts the language prefix with or without a trailing slash", async () => {
    expect((await request("/ru")).status).toBe(200);
    expect((await request("/ru/")).status).toBe(200);
  });
  it("redirects the old sub-pages to anchors on the one page", async () => {
    const res = await request("/en/pricing", { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/en/#pricing");
    expect((await request("/ru/about/", { redirect: "manual" })).headers.get("Location")).toBe("/ru/#experience");
  });
  it("leads with the name, the role and the positioning line — it is a business card", async () => {
    const html = await (await request("/ru/")).text();
    expect(html).toContain("<h1>Сюзана Тевдорадзе</h1>");
    expect(html).toContain("Technical Product Owner");
    expect(html).toContain('<p class="kicker">Technical Product Owner</p>');
    expect(html).toContain('<p class="role">AI и дата-продукты</p>');
    // No package totals anywhere: the page prices by rate and hours.
    expect(html).not.toMatch(/€\s?\d\s?\d{3}/);
  });
  it("is the card and three sections — the formats page is not part of it", async () => {
    const html = await (await request("/en/")).text();
    for (const id of ["experience", "pricing", "contact"]) {
      expect(html).toContain(`id="${id}"`);
    }
    for (const id of ["situations", "formats", "process"]) {
      expect(html).not.toContain(`id="${id}"`);
    }
    // The copy still lives in D1; it is simply not rendered on the card.
    expect(html).not.toContain("Work inside the team");
  });
  it("prices by rate and hours, not by package totals", async () => {
    const html = await (await request("/en/")).text();
    expect(html).toContain("from €100 an hour");
    expect(html).toContain("from 20 hours");
    expect(html).toContain("€150");
    expect(html).not.toContain("€3,500");
  });
  it("hides contact links while they are still placeholders", async () => {
    const html = await (await request("/en/")).text();
    expect(html).not.toContain("SET_IN_ADMIN");
    expect(html).not.toContain('class="channels"');
  });
  it("shows the form layout but enables sending only with delivery configured", async () => {
    for (const lang of ["en", "ru"]) {
      const html = await (await request(`/${lang}/?sent=ok`)).text();
      expect(html).toContain('action="/api/contact"');
      expect(html).toContain('name="name" required');
      expect(html).toContain('name="email" type="email" required');
      expect(html).toContain('textarea id="f-msg" name="message" required');
      expect(html).toContain('type="submit" disabled');
      expect(html).toContain('id="enquiry-unavailable"');
      expect(html).not.toContain('class="flash ok"');
    }
    const withHook = { ...prodEnv, CONTACT_WEBHOOK_URL: "https://script.google.com/macros/s/x/exec", CONTACT_WEBHOOK_SECRET: "test-webhook-secret" } as Env;
    const ready = await (await request("/en/", {}, withHook)).text();
    expect(ready).toContain('action="/api/contact"');
    expect(ready).not.toContain('type="submit" disabled');
    expect(ready).not.toContain('id="enquiry-unavailable"');
  });
  it("renders personal Telegram in contacts, footer and form fallback, and the channel handle", async () => {
    const telegram = new URL("/demo_person", "https://t.me").href;
    const channel = new URL("/demo_channel", "https://t.me").href;
    await env.DB.batch([
      env.DB.prepare("UPDATE content SET value=?1 WHERE key='contacts.telegram' AND lang='*'").bind(telegram),
      env.DB.prepare("UPDATE content SET value=?1 WHERE key='contacts.channel' AND lang='*'").bind(channel),
    ]);
    try {
      for (const lang of ["en", "ru"]) {
        const html = await (await request(`/${lang}/`)).text();
        expect(html.match(new RegExp(`href="${telegram}"`, "g"))).toHaveLength(3);
        expect(html).toContain('<span class="channel-value">@demo_person</span>');
        expect(html).toContain('<span class="channel-value">@demo_channel</span>');
      }
    } finally {
      await env.DB.prepare("UPDATE content SET value='{{SET_IN_ADMIN}}' WHERE key IN ('contacts.telegram','contacts.channel') AND lang='*'").run();
    }
  });
  it("serves a privacy notice in both languages and links it from the footer", async () => {
    const res = await request("/ru/privacy");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Конфиденциальность");
    expect(await (await request("/en/")).text()).toContain('href="/en/privacy"');
  });
  it("redirects www to the apex host", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("https://www.syuzana.com/ru/?x=1"), prodEnv, ctx);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://syuzana.com/ru/?x=1");
    const http = await app.fetch(new Request("http://syuzana.com/en/"), prodEnv, createExecutionContext());
    expect(http.status).toBe(301);
    expect(http.headers.get("Location")).toBe("https://syuzana.com/en/");
    // Exactly once: the https target itself is served, not redirected again.
    const target = await app.fetch(new Request(http.headers.get("Location") ?? ""), prodEnv, createExecutionContext());
    expect(target.status).toBe(200);
  });
  it("does not force https in local development, where wrangler dev presents the custom domain over http", async () => {
    const res = await app.fetch(new Request("http://syuzana.com/en/"), devEnv, createExecutionContext());
    expect(res.status).toBe(200);
  });
  it("returns a 404 in the language of the path", async () => {
    const res = await request("/ru/nope", { headers: { "Accept-Language": "en" } });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Такой страницы нет");
  });
});

describe("admin gate (fails closed)", () => {
  const configured = { ...prodEnv, ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "aud-1", ADMIN_EMAIL: "owner@example.com" } as Env;

  it("denies without Access configured in production", async () => {
    expect((await request("/admin")).status).toBe(503);
  });
  it("denies when ADMIN_EMAIL is missing even if Access is configured", async () => {
    expect((await request("/admin", {}, { ...configured, ADMIN_EMAIL: "" } as Env)).status).toBe(503);
  });
  it("denies a request without a token when Access is configured", async () => {
    expect((await request("/admin", {}, configured)).status).toBe(403);
  });
  it("ignores the dev bypass outside development", async () => {
    expect((await request("/admin", {}, { ...prodEnv, ADMIN_DEV_BYPASS: "true" } as Env)).status).toBe(503);
  });
  it("opens with the explicit local bypass and lists editable keys", async () => {
    const res = await request("/admin?lang=en", {}, devEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toContain("hero.title");
  });
  it("rejects cross-origin, null-origin and origin-less POSTs", async () => {
    const body = () => new URLSearchParams({ lang: "en" });
    expect((await request("/admin/content", { method: "POST", headers: { Origin: "https://evil.example" }, body: body() }, devEnv)).status).toBe(403);
    expect((await request("/admin/content", { method: "POST", headers: { Origin: "null" }, body: body() }, devEnv)).status).toBe(403);
    expect((await request("/admin/content", { method: "POST", body: body() }, devEnv)).status).toBe(403);
  });
  it("saves an edit, confirms it, and renders it escaped on the public page", async () => {
    const body = new URLSearchParams({ lang: "en", "v:about.bio": 'Edited <script>alert(1)</script> "title"' });
    const res = await adminPost("/admin/content", body);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/admin?lang=en&saved=1");
    const html = await (await request("/en/")).text();
    expect(html).toContain("Edited &lt;script&gt;alert(1)&lt;/script&gt; &quot;title&quot;");
    expect(html).not.toContain("<script>alert");
    const flash = await (await request("/admin?lang=en&saved=1", {}, devEnv)).text();
    expect(flash).toContain("1 value(s) changed");
  });
  it("puts the channel list in the card once contacts are set", async () => {
    const body = new URLSearchParams({ lang: "en", "v:contacts.email": "me@example.com", "v:contacts.linkedin": "https://profile.example.org/me" });
    expect((await adminPost("/admin/content", body)).status).toBe(303);
    const html = await (await request("/en/")).text();
    const row = html.indexOf('class="channels"');
    expect(row).toBeGreaterThan(-1);
    // Contact-first: the channels come before the first section below the card.
    expect(row).toBeLessThan(html.indexOf('id="experience"'));
    expect(html).toContain("mailto:me@example.com");
    // Each row is labelled, so the value is never the only thing read out.
    expect(html).toContain('class="channel-label"');
    expect(html).toContain("data-copy-email");
    expect(html).toContain('data-copied="Copied"');
  });
  it("ignores keys that do not exist", async () => {
    await adminPost("/admin/content", new URLSearchParams({ lang: "en", "v:evil.key": "x" }));
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM content WHERE key = 'evil.key'").first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
  it("refuses an over-long value with an error flash instead of dropping it silently", async () => {
    const res = await adminPost("/admin/content", new URLSearchParams({ lang: "en", "v:hero.note": "x".repeat(20_001) }));
    expect(res.headers.get("Location")).toBe("/admin?lang=en&error=toolong");
  });
});

describe("Access JWT verification (real signatures, local keys)", () => {
  const team = "team.cloudflareaccess.com";
  const accessEnv = { ENVIRONMENT: "production", ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: "aud-1", ADMIN_EMAIL: "Owner@Example.com" };

  async function keys() {
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const sign = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(opts.iss ?? `https://${team}`)
        .setAudience(opts.aud ?? "aud-1")
        .setIssuedAt()
        .setExpirationTime(opts.exp ?? "5m")
        .sign(privateKey);
    return { jwks, sign };
  }
  const withToken = (token: string) => new Request("https://syuzana.com/admin", { headers: { "Cf-Access-Jwt-Assertion": token } });

  it("admits a valid token for the allowed email (case-insensitive)", async () => {
    const { jwks, sign } = await keys();
    const result = await verifyAccess(withToken(await sign({ email: "owner@example.com" })), accessEnv, () => jwks);
    expect(result).toEqual({ ok: true, email: "owner@example.com", via: "access" });
  });
  it("rejects wrong audience, wrong issuer, expiry, wrong or missing email", async () => {
    const { jwks, sign } = await keys();
    const cases = [
      await sign({ email: "owner@example.com" }, { aud: "other" }),
      await sign({ email: "owner@example.com" }, { iss: "https://evil.cloudflareaccess.com" }),
      await sign({ email: "owner@example.com" }, { exp: "-1m" }),
      await sign({ email: "intruder@example.com" }),
      await sign({}),
    ];
    for (const token of cases) {
      const result = await verifyAccess(withToken(token), accessEnv, () => jwks);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    }
  });
  it("rejects a token signed with a different key", async () => {
    const a = await keys();
    const b = await keys();
    const result = await verifyAccess(withToken(await b.sign({ email: "owner@example.com" })), accessEnv, () => a.jwks);
    expect(result.ok).toBe(false);
  });
});

describe("password login for /admin (D-019)", () => {
  const PASSWORD = "a-long-enough-test-password-42";
  let pwEnv: Env;

  // Fewer iterations here only to keep the suite fast; the count lives in the stored hash.
  beforeAll(async () => {
    pwEnv = { ...prodEnv, ADMIN_PASSWORD_HASH: await hashPassword(PASSWORD, 10_000), SESSION_SECRET: "test-session-secret" } as Env;
  });

  const login = (password: string, ip: string, env: Env = pwEnv) =>
    request(
      "/admin/login",
      { method: "POST", headers: { ...sameOrigin, "CF-Connecting-IP": ip }, body: new URLSearchParams({ password }), redirect: "manual" },
      env,
    );

  it("verifies a correct password and rejects everything else", async () => {
    const stored = await hashPassword(PASSWORD, 10_000);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
    expect(await verifyPassword(PASSWORD, "")).toBe(false);
    expect(await verifyPassword(PASSWORD, "pbkdf2$10000$notbase64")).toBe(false);
    expect(await verifyPassword(PASSWORD, "plain$1$a$b")).toBe(false);
  });

  it("accepts only sessions it signed, and only before they expire", async () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const token = await createSession("s3cret", now, 3600);
    expect(await verifySession("s3cret", token, now)).toBe(true);
    expect(await verifySession("other-secret", token, now)).toBe(false);
    expect(await verifySession("s3cret", token, new Date(now.getTime() + 3601_000))).toBe(false);
    const [exp, sig] = token.split(".");
    expect(await verifySession("s3cret", `${Number(exp) + 9999}.${sig}`, now)).toBe(false);
    expect(await verifySession("s3cret", "garbage", now)).toBe(false);
    expect(await verifySession(undefined, token, now)).toBe(false);
  });

  it("sends an anonymous visitor to the login form", async () => {
    const res = await request("/admin", { redirect: "manual" }, pwEnv);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin/login");
    const form = await request("/admin/login", {}, pwEnv);
    expect(form.status).toBe(200);
    expect(await form.text()).toContain('name="password"');
  });

  it("refuses a state-changing request without a session", async () => {
    const res = await request("/admin/content", { method: "POST", headers: sameOrigin, body: new URLSearchParams({ lang: "en" }) }, pwEnv);
    expect(res.status).toBe(403);
  });

  it("rejects a wrong password and admits the right one", async () => {
    const bad = await login("nope", "203.0.113.10");
    expect(bad.status).toBe(401);
    expect(await bad.text()).toContain("Wrong password");

    const good = await login(PASSWORD, "203.0.113.10");
    expect(good.status).toBe(303);
    expect(good.headers.get("Location")).toBe("/admin");
    const cookie = good.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain(SESSION_COOKIE);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
  });

  it("opens the admin with the issued session cookie", async () => {
    const good = await login(PASSWORD, "203.0.113.11");
    const token = (good.headers.get("Set-Cookie") ?? "").match(/admin_session=([^;]+)/)?.[1] ?? "";
    expect(token).not.toBe("");
    const res = await request("/admin?lang=en", { headers: { Cookie: `${SESSION_COOKIE}=${token}` } }, pwEnv);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("hero.title");
    expect(html).toContain("Sign out");
  });

  it("ignores a forged session cookie", async () => {
    const res = await request("/admin", { headers: { Cookie: `${SESSION_COOKIE}=9999999999.ZmFrZQ==` }, redirect: "manual" }, pwEnv);
    expect(res.status).toBe(302);
  });

  it("locks an address out after repeated failures", async () => {
    const ip = "203.0.113.20";
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect((await login("nope", ip)).status).toBe(401);
    const blocked = await login("nope", ip);
    expect(blocked.status).toBe(429);
    // The limit holds even once the password is right.
    expect((await login(PASSWORD, ip)).status).toBe(429);
    // A different address is unaffected.
    expect((await login(PASSWORD, "203.0.113.21")).status).toBe(303);
  });

  it("still returns 503 when neither password nor Access is configured", async () => {
    expect((await request("/admin", {}, prodEnv)).status).toBe(503);
  });

  it("clears the cookie on sign-out", async () => {
    const res = await request("/admin/logout", { method: "POST", headers: sameOrigin, redirect: "manual" }, pwEnv);
    expect(res.status).toBe(303);
    expect(res.headers.get("Set-Cookie") ?? "").toMatch(/admin_session=;|Max-Age=0/);
  });
});

describe("uploads are validated by magic bytes", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7 fake");
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const upload = (path: string, bytes: Uint8Array, name: string) => {
    const form = new FormData();
    form.set("file", new File([bytes], name, { type: "text/plain" }));
    return adminPost(path, form);
  };

  it("accepts a PDF as CV and an image as photo", () => {
    expect(validateUpload("cv", pdf)).toEqual({ ok: true, contentType: "application/pdf" });
    expect(validateUpload("photo", png)).toEqual({ ok: true, contentType: "image/png" });
  });
  it("rejects the wrong kind, empty and oversize files", () => {
    expect(validateUpload("cv", png).ok).toBe(false);
    expect(validateUpload("photo", pdf).ok).toBe(false);
    expect(validateUpload("cv", new Uint8Array()).ok).toBe(false);
    expect(validateUpload("cv", new Uint8Array(6 * 1024 * 1024)).ok).toBe(false);
  });
  it("stores a CV through the admin and serves it at /cv.pdf with a 304 on revalidation", async () => {
    expect((await upload("/admin/upload/cv", pdf, "whatever.exe")).status).toBe(200);
    const res = await request("/cv.pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("Syuzana_Tevdoradze_CV.pdf");
    const etag = res.headers.get("ETag");
    expect(etag).toBeTruthy();
    const again = await request("/cv.pdf", { headers: { "If-None-Match": etag ?? "" } });
    expect(again.status).toBe(304);
  });
  it("rejects a PNG uploaded as the CV over HTTP and keeps the old file", async () => {
    const res = await upload("/admin/upload/cv", png, "cv.pdf");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Upload rejected");
    expect((await request("/cv.pdf")).headers.get("Content-Type")).toBe("application/pdf");
  });
  it("serves the photo and refreshes hero and social image URLs after replacing it", async () => {
    await upload("/admin/upload/photo", png, "me.png");
    const res = await request("/assets/photo");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    const home = await (await request("/ru/")).text();
    expect(home).toContain('class="portrait card-portrait"');
    const version = res.headers.get("ETag")!.replaceAll('"', "");
    const photoUrl = `/assets/photo?v=${version}`;
    expect(home).toContain(`src="${photoUrl}"`);
    expect(home).toContain(`property="og:image" content="https://syuzana.com${photoUrl}"`);
    expect(home).toContain(`name="twitter:image" content="https://syuzana.com${photoUrl}"`);
    expect(home).toContain(`"image":"https://syuzana.com${photoUrl}"`);
    const cached = await request(photoUrl, { headers: { "If-None-Match": res.headers.get("ETag")! } });
    expect(cached.status).toBe(304);

    await upload("/admin/upload/photo", new Uint8Array([...png, 1]), "replacement.png");
    const replacement = await request("/assets/photo");
    const newVersion = replacement.headers.get("ETag")!.replaceAll('"', "");
    expect(newVersion).not.toBe(version);
    for (const lang of ["ru", "en"]) {
      const updated = await (await request(`/${lang}/`)).text();
      expect(updated).not.toContain(photoUrl);
      expect(updated).toContain(`src="/assets/photo?v=${newVersion}"`);
      expect(updated).toContain(`property="og:image" content="https://syuzana.com/assets/photo?v=${newVersion}"`);
    }
  });
  it("caps the request body before buffering", async () => {
    const res = await upload("/admin/upload/cv", new Uint8Array(6 * 1024 * 1024), "big.pdf");
    expect(res.status).toBe(413);
  });
});

describe("contact form", () => {
  it("returns a JSON validation error for an in-page submission", async () => {
    const res = await request("/api/contact", {
      method: "POST", headers: { Accept: "application/json" },
      body: new URLSearchParams({ lang: "en", name: "A", email: "invalid", message: "hi" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false });
    expect(res.headers.get("Location")).toBeNull();
  });
  it("does not acknowledge delivery when the webhook is unavailable", async () => {
    const res = await request("/api/contact", {
      method: "POST", headers: { Accept: "application/json" },
      body: new URLSearchParams({ lang: "en", name: "A", email: "a@b.co", message: "hi" }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
  it("acknowledges an in-page submission only after webhook delivery", async () => {
    const delivery = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true, stored: true, notified: true }));
    try {
      const res = await request("/api/contact", {
        method: "POST", headers: { Accept: "application/json" },
        body: new URLSearchParams({ lang: "en", name: "A", email: "a@b.co", message: "hi" }),
      }, { ...prodEnv, CONTACT_WEBHOOK_URL: "https://delivery.example.org/contact", CONTACT_WEBHOOK_SECRET: "test-webhook-secret" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(delivery).toHaveBeenCalledTimes(1);
      const forwarded = JSON.parse(String(delivery.mock.calls[0]?.[1]?.body));
      expect(forwarded).toMatchObject({ token: "test-webhook-secret", name: "A", email: "a@b.co", message: "hi" });
      expect(forwarded.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(delivery).toHaveBeenCalledWith("https://delivery.example.org/contact", expect.objectContaining({ method: "POST" }));
    } finally {
      delivery.mockRestore();
    }
  });
  it.each([
    ["Google login HTML", "<html>Sign in</html>"],
    ["saved row with failed mail", JSON.stringify({ ok: false, stored: true, notified: false })],
    ["HTTP success without receipts", JSON.stringify({ ok: true })],
  ])("rejects %s as a delivery receipt", async (_name, body) => {
    const delivery = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body));
    try {
      const res = await request("/api/contact", {
        method: "POST", headers: { Accept: "application/json" },
        body: new URLSearchParams({ lang: "en", name: "A", email: "a@b.co", message: "hi" }),
      }, { ...prodEnv, CONTACT_WEBHOOK_URL: "https://delivery.example.org/contact", CONTACT_WEBHOOK_SECRET: "test-webhook-secret" });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ ok: false });
    } finally {
      delivery.mockRestore();
    }
  });
  it("keeps a submission ID across retries and rejects invalid IDs", async () => {
    const id = "01010101-0101-4101-8101-010101010101";
    expect(validateContact({ id, name: "A", email: "a@b.co", message: "hi" }, "en", new Date())).toMatchObject({ ok: true, value: { id } });
    const res = await request("/api/contact", {
      method: "POST", headers: { Accept: "application/json" },
      body: new URLSearchParams({ id: "invalid", name: "A", email: "a@b.co", message: "hi" }),
    });
    expect(res.status).toBe(400);
  });
  const now = new Date("2026-10-07T00:00:00Z");
  it("neutralises spreadsheet formulas instead of losing the lead", () => {
    expect(looksLikeFormula("=HYPERLINK()")).toBe(true);
    expect(looksLikeFormula("  +1")).toBe(true);
    expect(looksLikeFormula("hello")).toBe(false);
    expect(neutralizeFormula("@handle")).toBe("'@handle");
    const result = validateContact({ name: "=x", email: "a@b.co", message: "+7 999 call me" }, "en", now);
    expect(result).toMatchObject({ ok: true, value: { name: "'=x", message: "'+7 999 call me" } });
  });
  it("bounds fields and requires a plausible email", () => {
    expect(validateContact({ name: "A", email: "nope", message: "hi" }, "en", now).ok).toBe(false);
    expect(validateContact({ name: "A", email: "=a@b.co", message: "hi" }, "en", now).ok).toBe(false);
    expect(validateContact({ name: "A", email: "a@b.co", message: "x".repeat(5000) }, "en", now).ok).toBe(false);
    expect(validateContact({ name: "A", email: "A@B.co", message: "hi" }, "ru", now)).toMatchObject({ ok: true, value: { email: "a@b.co", lang: "ru" } });
  });
  it("reports an error when no webhook is configured", async () => {
    const res = await request("/api/contact", { method: "POST", body: new URLSearchParams({ lang: "en", name: "A", email: "a@b.co", message: "hi" }), redirect: "manual" });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/en/?sent=error#contact");
  });
  it("caps the public body size", async () => {
    const res = await request("/api/contact", { method: "POST", body: new URLSearchParams({ lang: "en", name: "A", email: "a@b.co", message: "x".repeat(20_000) }) });
    expect(res.status).toBe(413);
  });
});

describe("renderer never emits raw admin HTML", () => {
  it("escapes markup and supports the tiny subset", () => {
    const html = renderText("<script>x</script> **b** [go](/en/) [bad](javascript:alert(1))\n\n- one\n- two");
    expect(html).not.toContain("<script>");
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain('<a href="/en/">go</a>');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
  });
  it("escapes link URLs exactly once", () => {
    expect(renderText("[b](https://x.com/?a=1&b=2)")).toContain('href="https://x.com/?a=1&amp;b=2"');
  });
  it("only allows http(s), mailto and site-relative links", () => {
    expect(safeUrl("https://x.y")).toBe("https://x.y");
    expect(safeUrl("//evil")).toBeNull();
    expect(safeUrl("data:text/html,x")).toBeNull();
  });
});
