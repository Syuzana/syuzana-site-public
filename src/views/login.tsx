import type { FC } from "hono/jsx";

/** Minimal password form for /admin/login. No JavaScript, no autocomplete of the username. */
export const LoginPage: FC<{ error?: string }> = ({ error }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex, nofollow" />
      <title>Admin — syuzana.com</title>
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <link rel="icon" href="/favicon.ico" sizes="32x32" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body>
      <main class="section">
        <div class="wrap">
          <p class="kicker">syuzana.com</p>
          <h1>Admin</h1>
          <hr class="rule" />
          {error ? <p class="flash error">{error}</p> : null}
          <form class="stack" method="post" action="/admin/login">
            <label>
              Password
              <input type="password" name="password" required autofocus autocomplete="current-password" maxlength={200} />
            </label>
            <button class="btn" type="submit">
              Sign in
            </button>
          </form>
        </div>
      </main>
    </body>
  </html>
);
