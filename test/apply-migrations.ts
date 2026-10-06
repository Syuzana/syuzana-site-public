import { applyD1Migrations, env } from "cloudflare:test";

// Runs once per test file: schema + seed, so every test sees the default copy.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
