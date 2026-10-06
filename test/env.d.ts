import type { D1Migration } from "@cloudflare/vitest-pool-workers";

// The test runtime exposes the wrangler.jsonc bindings as `Cloudflare.Env`; add the one
// extra binding vitest.config.ts injects (the migrations list applied in setup).
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
