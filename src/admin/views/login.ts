import { layout } from "./layout.js";

export function loginView(opts: { error?: string } = {}): string {
  const body = `
    <section style="max-width:380px;margin:4rem auto;">
      <h1 style="margin-bottom:1.5rem;">Very Light CMS</h1>
      ${opts.error ? `<p class="flash">${opts.error}</p>` : ""}
      <form method="POST" action="/admin/login" style="display:flex;flex-direction:column;gap:1rem;">
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" required autocomplete="username" />
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" name="password" required autocomplete="current-password" />
        </div>
        <button type="submit" class="btn btn-primary">Sign in</button>
      </form>
    </section>
  `;
  return layout("Login", body);
}
