# Deploy guide — go live without installing anything

You only need a web browser and three free accounts: GitHub, Supabase, and Netlify. Nothing runs on your own computer.

Total time: about 15 minutes. There is no separate backend server to deploy. Supabase **is** the backend (database + login system). You connect your code copy to Supabase once, and Supabase builds the whole database for you automatically.

## What you will do

1. Copy this code to your own GitHub account.
2. Create a database on Supabase and connect it to your code copy. The database builds itself.
3. Put the website online with Netlify and type in two keys.
4. Open your website and sign in.

## Step 1 — Copy the code (2 minutes)

1. Open this repository on GitHub.
2. Click **Use this template → Create a new repository** (recommended), or **Fork**. Give it any name, for example `my-workforce`.
3. You can keep it **Private**. Nobody can see your code, and everything still works.

> If you own the original repository and want others to see a `Use this template` button: open **Settings → General → Template repository** and tick the box.

## Step 2 — Create the database, it builds itself (5 minutes)

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project**. Pick any name and a database password (save the password somewhere safe). Wait about one minute until the project is ready.
2. Inside your project, open **Project Settings** (the gear icon) **→ Integrations**.
3. Under **GitHub Integration**, click **Authorize GitHub**, then click **Authorize Supabase** on the GitHub page.
4. Back in Supabase, choose your copied repository from the list.
5. Set **Working directory** to `.` (just a single dot).
6. Turn on **Deploy to production** and click **Enable integration**.
7. That is all. Supabase now finds the file `supabase/migrations/20261024000000_init.sql` in your code and runs it by itself. All tables, rules, and login logic are created automatically. You never open the SQL Editor and never paste any code.

You can watch it finish under **Project Settings → Integrations** (deployment status), it usually takes under a minute.

## Step 3 — Tell the database who the manager is (2 minutes, no code)

Before anyone can sign in, the database must know the manager's email address.

1. In Supabase, open **Table Editor** (the table icon on the left).
2. Open the **`settings`** table. There is exactly one row — click it to edit.
3. Fill in two fields:
   - `bootstrap_email` — for example `manager@yourcompany.com`. This person **must sign in first**. Their account automatically becomes the Manager.
   - `allowed_domains` — for example `{yourcompany.com}` (with the curly brackets). Only people with an email address from these companies can create an account. Leave it empty `{}` to allow everybody after the manager exists.
4. Click **Save**.

## Step 4 — Put the website online with Netlify (5 minutes)

1. Go to [netlify.com](https://netlify.com), sign in, and click **Add new site → Import an existing project**.
2. Connect GitHub and pick your copied repository.
3. The build settings are already saved in the file `netlify.toml`. Just check that you see:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Before you deploy, open **Site settings → Environment variables → Add a variable** and add these two (get both from Supabase **Project Settings → API**):
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — your `anon` (publishable) key. Never use the `service_role` key here.
5. Click **Deploy site**. You will get an address like `https://your-site.netlify.app`.

> These two keys replace the `.env` file developers use on their own computers. That is why your repository can stay private and you never type secrets into your code.

## Step 5 — Connect the website address back to Supabase (2 minutes)

1. In Supabase, open **Authentication → URL Configuration**.
2. In **Site URL**, paste your Netlify address (for example `https://your-site.netlify.app`). Add the same address to **Redirect URLs**.
3. Open your Netlify address in the browser and sign in with the manager email address from Step 3.
4. The **setup wizard** opens: type your organization name, product name, welcome text, logo, support email, time zone, and allowed email domains. You can change all of this later in **Settings**.
5. Finished. Add your people under **People**, add holidays under **Holidays**, then ask your team to create their accounts.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Tables are missing / "Connect your workspace" | The automatic database build did not finish. Check Supabase **Project Settings → Integrations** for a failed deployment, then disable and re-enable the integration. |
| Login page keeps coming back after sign-in | Your Netlify address is missing in Supabase **Authentication → URL Configuration**. Add it (Step 5). |
| "The configured bootstrap manager must sign in first" | Sign in with the `bootstrap_email` address from Step 3, or fix it in the `settings` table. |
| "Your email domain is not allowed" | Add the email ending (for example `yourcompany.com`) to `allowed_domains` in the `settings` table. |
| "Email not confirmed yet" | Click the confirmation link in the email, or turn off **Confirm email** in Supabase **Authentication → Providers → Email**. |
| Netlify build fails | Check the deploy log. The `netlify.toml` file already selects the correct Node version, so a failure usually means an environment variable is misspelled. |
| "Connect your workspace" on your own computer | Your local `.env` file is missing. Copy `.env.example` to `.env` and fill in the two keys, then restart with `npm run dev`. |

## Getting future updates

Short answer: the website and the database update themselves **when you push new code to your own copy** — but new versions I publish do **not** jump into your copy by themselves. Here is exactly how it works:

- **Netlify is automatic.** Netlify watches *your* repository. Every time new code arrives in your repository, Netlify rebuilds and republishes the website within a few minutes. You do nothing.
- **Supabase is automatic.** With the GitHub integration and **Deploy to production** turned on, every new migration file that arrives in *your* repository is applied to your database automatically. Your people, attendance, and settings data is never touched — updates only add new structure.
- **My new versions need one click from you.** Your copy and my repository are separate. New versions appear in *my* repository first. How they reach you depends on how you copied the code:
  - **Fork:** open your fork on GitHub and click **Sync fork → Update branch**. That pulls my new version into your copy. Netlify and Supabase then update themselves automatically as described above.
  - **Template copy (private):** GitHub gives template copies **no** sync button — this is a GitHub limitation, not this project's. To update, copy the changed files over manually, or ask someone technical to connect the copies once with `git remote add upstream` so updates can be pulled.
- **Recommendation:** if you want the easiest updates, use a **Fork**. If you must keep the code private and one-click, use a **template copy** and accept manual updates.

## For developers (local setup)

```bash
cp .env.example .env   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev            # http://localhost:5173
```

```bash
npm test        # PostgreSQL logic tests with PGlite
npm run build   # type-check and production build
npm run smoke   # preview build, login page check in Chromium, no JS errors
npm run shots   # regenerate the README screenshots with mock data
```

Database changes always go in as new timestamped files in `supabase/migrations/` (never edit the `init` file after people use it) — the GitHub integration applies them automatically.
