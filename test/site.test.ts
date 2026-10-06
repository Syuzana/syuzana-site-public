import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { verifyAccess } from "../src/access";
import { looksLikeFormula, neutralizeFormula, validateContact } from "../src/contact";
import { detectLang, parseAcceptLanguage, switchLangPath } from "../src/i18n";
import app from "../src/index";
import { renderText, safeUrl } from "../src/render";
import { validateUpload } from "../src/uploads";

// Explicitly blank every secret so local .dev.vars can never leak into test behaviour.
const noSecrets = { ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "", ADMIN_EMAIL: "", CONTACT_WEBHOOK_URL: "", TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "" };
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
    expect(html).toContain("Понять, что стоит строить");
    expect(html).toContain('lang="ru"');
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src 'none'");
    expect(res.headers.get("Content-Security-Policy")).not.toContain("unsafe-inline");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
  it("accepts the language prefix with or without a trailing slash", async () => {
    expect((await request("/ru")).status).toBe(200);
    expect((await request("/en/pricing/")).status).toBe(200);
  });
  it("shows exactly three format cards on the home page", async () => {
    const html = await (await request("/en/")).text();
    expect(html.match(/class="card"/g)?.length).toBe(3);
  });
  it("serves the English pricing table", async () => {
    const html = await (await request("/en/pricing")).text();
    expect(html).toContain("Build-or-not check");
    expect(html).toContain("€150");
  });
  it("hides contact links while they are still placeholders", async () => {
    const html = await (await request("/en/contact")).text();
    expect(html).not.toContain("SET_IN_ADMIN");
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
    const body = new URLSearchParams({ lang: "en", "v:hero.title": 'Edited <script>alert(1)</script> "title"' });
    const res = await adminPost("/admin/content", body);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/admin?lang=en&saved=1");
    const html = await (await request("/en/")).text();
    expect(html).toContain("Edited &lt;script&gt;alert(1)&lt;/script&gt; &quot;title&quot;");
    expect(html).not.toContain("<script>alert");
    const flash = await (await request("/admin?lang=en&saved=1", {}, devEnv)).text();
    expect(flash).toContain("1 value(s) changed");
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
  it("stores the photo and serves it at /assets/photo", async () => {
    await upload("/admin/upload/photo", png, "me.png");
    const res = await request("/assets/photo");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
  it("caps the request body before buffering", async () => {
    const res = await upload("/admin/upload/cv", new Uint8Array(6 * 1024 * 1024), "big.pdf");
    expect(res.status).toBe(413);
  });
});

describe("contact form", () => {
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
    expect(res.headers.get("Location")).toBe("/en/contact?sent=error");
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
