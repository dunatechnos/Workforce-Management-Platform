# HV Attendance

Zoho-style attendance system. Frontend: React + Vite. Backend: Supabase PostgreSQL (Auth + RLS + RPC business logic). Times in IST (Asia/Kolkata).

## What is built

- Google login, roles: **Manager** and **Employee** (first bootstrap manager set in DB; domain restriction enforced in DB, not just UI)
- Check-in / Check-out with multiple breaks (open shift = 1 per person; checkout auto-closes open break; 20-hour shift cap)
- Calendar: present / half-day / absent / leave / half-leave / weekoff / holiday / missing-checkout / not-checked-in
- Leave: custom types + tags, annual quotas, pending requests reserve balance, manager approve/reject, cancel rules
- Week-off: fixed days per employee + flexible weekly quota (manager can exceed quota, employee cannot)
- Regularization: employee requests correction with actual in/out + break minutes; manager approval replaces punches (old values stay in audit trail)
- Manager: People (pre-add by email before first login), Approval inbox, Leave balances, Holidays, Organization settings, Audit trail
- Analytics: monthly/yearly staff-wise charts + CSV exports (summary, daily register, leave report)
- Long-term safety: RLS everywhere, validated RPCs only (no direct punch/balance writes), per-day rule snapshots, schedule history, immutable audit log

## 1. Supabase setup (do once)

1. Create a **new** Supabase project.
2. Open **SQL Editor**, paste the full `supabase/schema.sql`, run it **once**. Re-running on the same project will error — that is intentional. Future changes must be small versioned migrations, never a reset.
3. Before anyone logs in, set the bootstrap manager (run in SQL Editor, replace values):
   ```sql
   update public.settings
   set bootstrap_email = 'manager@yourcompany.com',
       allowed_domains = array['yourcompany.com'],
       company_name = 'Your Company';
   ```
   - `bootstrap_email`: the Google email that must sign in first (becomes Manager).
   - `allowed_domains`: e.g. `array['yourcompany.com']`. Empty array = any Google domain allowed after bootstrap.
4. **Login works out of the box with Supabase built-in email + password auth** (enabled by default — no external service needed). Optional: **Authentication → Providers → Google → Enable** if you later want a "Continue with Google" button too — it appears automatically once enabled. You need a Google OAuth Client ID/Secret (Google Cloud Console → APIs & Services → Credentials → OAuth client, type Web). Add Supabase's callback URL (shown on that Supabase Auth page) as an authorized redirect URI in Google.
5. **Authentication → URL Configuration:** add your URLs:
   - Local: `http://localhost:5173`
   - Netlify: `https://YOUR-SITE.netlify.app`
6. Never expose the `service_role` key. Frontend uses only the publishable/anon key.

## First login (no Google Cloud needed)

1. Open the app → **Create account** tab → sign up with the `bootstrap_email` address and any password (min 6 characters).
2. If Supabase email confirmation is on (default), click the link in your inbox, then **Sign in**. Company-domain and bootstrap rules are enforced by the database itself.
3. You become Manager. Then add employees in **People** before they create their accounts.

## 2. Frontend .env

```bash
cp .env.example .env
```

Fill:

```ini
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

## 3. Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, sign in with the bootstrap manager Google account first.

## 4. Manager first-run checklist

1. Sign in as bootstrap manager → Organization settings → verify policy (default: 480 min full day, 240 min half day, 60 min break, 12:00 half-day cutoff).
2. People → Add employee (company Google email, joining date, weekly quota, fixed offs) **before** they log in.
3. Add Holidays for the year.
4. Leave types are seeded (CL/SL/LOP) — edit/add tags as needed; archive, don't delete, old types.
5. Leave balances: per-employee yearly entitlement override (incl. carry-forward/adjustment), else type default applies.

## 5. Netlify deploy (frontend only)

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `netlify.toml` already has the SPA redirect (`/* → /index.html`) and secure headers. No backend to host — Supabase is the backend.

## 6. Attendance rules (defaults, manager-editable)

- Full day: 8h (480 min) net work + up to 1h break. Check-in after 12:00 PM caps the day at half-day.
- Half day: 4h+ net work after late check-in, or 4–8h normally. Below 4h = absent.
- Excess break flagged beyond allowed break. Missing checkout flagged after 20h open shift.
- Rule changes snapshot at first check-in — history is never rewritten.
- No cron needed: absences derive at query time (past working day, no punch, no leave/weekoff/holiday = absent).

## 7. Verify

```bash
npm test        # Postgres logic tests (PGlite): auth, RLS, punches, quota, leave, corrections, audit
npm run build   # production build → dist/
npm run smoke   # boots dist/ in preview, checks login page in real Chromium, zero JS errors
```

## Troubleshooting

| Problem | Fix |
|---|---|
| "The configured bootstrap manager must sign in first" | Sign in with `bootstrap_email` first, or update it in `settings` |
| "Your company email domain is not allowed" | Add the domain to `settings.allowed_domains` |
| "Email not confirmed yet" | Click the confirmation link in your inbox, then sign in (or turn off Confirm Email in Supabase Auth settings) |
| Login redirects back / session error | Check Supabase URL config includes your site URL |
| Blank app with "Connect your workspace" | `.env` missing/wrong — copy `.env.example`, restart dev server |
| "Last active manager cannot be removed" | Promote/deactivate correctly — at least one active manager must remain |
