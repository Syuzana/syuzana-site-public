import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

/**
 * Cloudflare Access (Zero Trust) verification for /admin.
 *
 * Access challenges at the edge and forwards a signed JWT in `Cf-Access-Jwt-Assertion`.
 * We verify it again here so the admin stays sealed even on the raw workers.dev origin
 * (specs/architecture.md §5). Fails closed: anything unconfigured → denied, except an
 * explicit local bypass that only works when ENVIRONMENT=development.
 */

export type AccessEnv = {
  ENVIRONMENT?: string;
  ADMIN_DEV_BYPASS?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAIL?: string;
};

export type AccessResult =
  | { ok: true; email: string; via: "access" | "dev-bypass" }
  | { ok: false; status: 401 | 403 | 503; reason: string };

export type JwksResolver = (teamDomain: string) => JWTVerifyGetKey;

// Keyed by team domain (config-derived, not request state); jose caches the fetched keys.
const jwksByTeam = new Map<string, JWTVerifyGetKey>();

export const remoteJwks: JwksResolver = (teamDomain) => {
  let set = jwksByTeam.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeam.set(teamDomain, set);
  }
  return set;
};

export function isDevBypass(env: AccessEnv): boolean {
  return env.ENVIRONMENT === "development" && env.ADMIN_DEV_BYPASS === "true";
}

export async function verifyAccess(request: Request, env: AccessEnv, resolveJwks: JwksResolver = remoteJwks): Promise<AccessResult> {
  if (isDevBypass(env)) return { ok: true, email: "dev@localhost", via: "dev-bypass" };

  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.ACCESS_AUD?.trim();
  const allowed = env.ADMIN_EMAIL?.trim().toLowerCase();
  // All three are required: without ADMIN_EMAIL any identity Access lets through (including a
  // service token, which carries no email) would be admitted.
  if (!teamDomain || !audience || !allowed) {
    return { ok: false, status: 503, reason: "admin not configured" };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, status: 403, reason: "missing access token" };

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, resolveJwks(teamDomain), {
      audience,
      issuer: `https://${teamDomain}`,
      algorithms: ["RS256"],
    }));
  } catch {
    return { ok: false, status: 403, reason: "invalid access token" };
  }

  const email = typeof payload["email"] === "string" ? payload["email"].trim().toLowerCase() : "";
  if (!email || email !== allowed) return { ok: false, status: 403, reason: "identity not allowed" };

  return { ok: true, email, via: "access" };
}
