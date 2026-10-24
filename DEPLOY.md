# Deploy guide — go live without installing anything

You need only a browser: a GitHub account, a Supabase account, and a Netlify account. Nothing runs on your PC.

Total time: ~15 minutes. The app backend is Supabase itself, so there is no separate backend server to deploy — you create the database once, then host the frontend on Netlify.

## Step 1 — Copy this repo (2 min)

1. Open this repository on GitHub.
2. Click **Use this template → Create a new repository** (recommended), or **Fork**. Name it anything, e.g. `my-workforce`.
3. Visibility: **Private** is fine and recommended. Netlify reads the code through your linked GitHub account, and secrets are stored in Netlify — never in the repo.

> To enable the `Use this template` button for others: repo **Settings → General → Template repository** → check it.

## Step 2 — Create the backend on Supabase (5 min)

1. Go to [supabase.com](https://supabase.com) → **New project**. Note the database password.
2. Open **SQL Editor → New query**, paste the full contents of `supabase/schema.sql` from this repo, and **Run**. Run it exactly once.
3. In the same SQL Editor, run:
   ```sql
   update public.settings
   set bootstrap_email = 'manager@yourcompany.com',
       allowed_domains = array['yourcompany.com'];
   ```
   - `bootstrap_email` must sign in **first** — that account becomes the Manager.
   - `allowed_domains` restricts who can register. Empty array `array[]::text[]` allows any domain after the manager exists.
4. Go to **Project Settings → API** and copy:
   - Project URL → this is `VITE_SUPABASE_URL`
   - `anon` / `publishable` key → this is `VITE_SUPABASE_ANON_KEY`
   - Never use the `service_role` key in the frontend.
5. Go to **Authentication → Providers → Email**: enabled by default. Optional: enable **Google** and add the Supabase callback URL to your Google OAuth client.

## Step 3 — Host the frontend on Netlify (5 min)

1. Go to [netlify.com](https://netlify.com) → **Add new site → Import an existing project** → connect GitHub → pick your copied repo.
2. Build settings are preconfigured in `netlify.toml`, verify they show:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Before deploying, open **Site settings → Environment variables → Add a variable**:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon/publishable key
4. **Deploy site**. You get a URL like `https://your-site.netlify.app`.

> This replaces the `.env` file — that is why the repo works while staying private or public. Never commit real keys.

## Step 4 — Connect the site URL back to Supabase (2 min)

1. Supabase → **Authentication → URL Configuration** → **Site URL**: paste your Netlify URL. Add it to **Redirect URLs** too.
2. Open your Netlify URL → sign in with the `bootstrap_email` account → the **setup wizard** opens: organization name, product name, sign-in copy, logo, support email, time zone, allowed domains.
3. Done. Add people under **People**, holidays under **Holidays**, then invite employees to create accounts.

## Updating later

Push to your repo's main branch (or merge a pull request) → Netlify rebuilds and redeploys automatically. No database change is needed for normal updates. If a release notes says a new migration exists (`supabase/migrations/00XX_*.sql`), run it once in the Supabase SQL Editor, in numeric order.

## Upgrading an old database

If your Supabase project was created from an older version of this repo, run the missing migrations in order — `0003`, then `0004`, then `0005` — instead of `schema.sql`. Never rerun `schema.sql` on an existing database.

## Common mistakes

| Symptom | Cause / fix |
| --- | --- |
| "Connect your workspace" screen | Netlify env vars missing or misspelled — check Site settings → Environment variables, then **Deploys → Trigger deploy** |
| Login loops back / session fails | Netlify URL not added under Supabase URL Configuration |
| "Your email domain is not allowed" | Domain missing from `public.settings.allowed_domains` |
| "Email not confirmed yet" | Click the confirmation email, or disable **Confirm email** in Supabase Auth |
| Build fails on Netlify | Must use Node 22 (`netlify.toml` already sets it); check the deploy log |
