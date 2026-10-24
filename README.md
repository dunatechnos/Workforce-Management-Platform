# Workforce

Self-hosted attendance, leave, and week-off management for small and mid-size teams. React + Vite frontend, Supabase (PostgreSQL, Auth, RLS, RPC) backend. One deployment serves one organization, fully rebrandable from the setup wizard.

## Screenshots

### Manager command center

Live team status, KPIs, approval queue, holidays, personal attendance, and policy snapshot.

![Manager dashboard](docs/images/admin-dashboard.png)

### Employee workspace

Time-aware greeting, live shift card, monthly stats, personal request status, weekly hours, and holidays — employee access only, no admin controls.

![Employee dashboard](docs/images/employee-dashboard.png)

### Attendance calendar

Present, half day, absent, leave, week-off, holiday, and missing-checkout states with correction requests.

![Attendance calendar](docs/images/attendance.png)

### Approval inbox

Leave, week-off, and regularization requests with approve/reject and review notes.

![Approval inbox](docs/images/approvals.png)

### Organization settings

Branding, time zone, attendance policy, workweek pattern, week-off workflow, leave types, and email domains.

![Organization settings](docs/images/settings.png)

> Screenshots are captured from demo data with `npm run shots`. See [DEPLOY.md](DEPLOY.md) to go live in ~15 minutes without installing anything locally.

## Features

- Email/password sign-in, optional Google sign-in, Manager and Employee roles
- Check-in, check-out, and multiple breaks with instant optimistic feedback
- Attendance calendar: present, half day, absent, leave, half leave, week off, holiday, missing checkout, not checked in
- Flexible regularization: check-in only, check-out only, break correction, or full-day correction; multiple partial requests allowed on the same day
- Leave management: custom types and tags, annual quotas, pending requests reserve balance, manager approval, cancellation rules
- Week-offs with three policies: employee self-service, employee request with manager approval, or admin-only scheduling
- Configurable workweek: 5 working days (2 offs/week), 5.5 days (alternating 6-day and 5-day weeks), or 6 days (1 off/week). Fixed weekdays count toward the weekly allowance; flexible week-offs fill the remainder
- Employee profile workspace: photo, birthday, job title, department, contact details, personal appearance preferences, and all requests in one place
- Manager command center, approval inbox, people directory, leave balances, holidays, organization settings, immutable audit trail
- Monthly/yearly analytics with CSV exports
- Configurable time zone (default `Asia/Kolkata`), fully editable product branding, professional dark theme
- First-run setup wizard: organization name, product name, sign-in copy, logo, support email, time zone, allowed domains

## Deploy in ~15 minutes (no local install)

Full step-by-step guide: **[DEPLOY.md](DEPLOY.md)** — fork/template the repo, create the Supabase backend, connect Netlify, set two environment variables, sign in.

Short version:

1. Create a Supabase project → connect your repo copy under **Project Settings → Integrations → GitHub Integration** (working directory `.`, enable **Deploy to production**) → the database builds itself from `supabase/migrations/20261024000000_init.sql`, no SQL to paste.
2. Fork this repo (or `Use this template`, private is fine) → Netlify `Add new site → Import an existing project` → build `npm run build`, publish `dist`.
3. Netlify `Site settings → Environment variables`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. Supabase `Authentication → URL Configuration`: add the Netlify site URL.
5. Open the site → sign in as the bootstrap manager → complete the setup wizard.

Never commit `.env` — secrets live in Netlify environment variables, so the repo can stay private or public.

## Local development

```bash
cp .env.example .env   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev            # http://localhost:5173
```

### Profile photos

The initial migration creates a public Storage bucket `avatars` (2 MB, owner-only write). If your project blocks bucket creation, create it manually: name `avatars`, public **on**, MIME types `image/png, image/jpeg, image/webp`.

## First-run checklist

1. Complete the setup wizard (org name, product name, copy, logo, time zone, domains).
2. Settings → attendance policy (defaults: 480 min full day, 240 min half day, 60 min break, 12:00 half-day cutoff).
3. Settings → week-off policy + workweek pattern (self-service / approval-required / admin-only).
4. People → add employees before they sign up; set fixed weekdays per employee.
5. Add holidays; review seeded leave types (CL, SL, LOP); set entitlements.

## Attendance rules

- Full day: 8 h net work + up to 1 h break; check-in after cutoff caps the day at half day.
- Half day: 4+ h net after a late check-in, or 4–8 h on a normal day; below 4 h is absent.
- Excess break flagged; open shift flagged as missing checkout after 20 h.
- Rule values are snapshotted per record — policy changes never rewrite history.
- Absences are derived at query time; no cron job needed.

## Regularization

Separate requests for check-in only, check-out only, break correction (optional full break replacement), or full-day correction. Managers approve/reject with a note; approvals recalculate the day, originals stay in the audit trail.

## Verify

```bash
npm test        # PostgreSQL logic tests with PGlite
npm run build   # type-check and production build
npm run smoke   # preview build, login page check in Chromium, no JS errors
npm run shots   # regenerate docs/images screenshots with mock data
```

## Troubleshooting

| Problem                                               | Fix                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| "The configured bootstrap manager must sign in first" | Sign in with `bootstrap_email`, or update it in `public.settings`              |
| "Your email domain is not allowed"                    | Add the domain to `public.settings.allowed_domains`                            |
| "Email not confirmed yet"                             | Open the confirmation link, or disable **Confirm email** in Supabase Auth      |
| Login redirects back or the session fails             | Check the Supabase URL configuration includes your site URL                    |
| "Connect your workspace" screen                       | `.env` is missing or incorrect; copy `.env.example` and restart the dev server |
| "Last active manager cannot be removed"               | Keep at least one active manager                                               |
| `weekoffs.status does not exist`                      | The initial migration has not been applied — check the GitHub integration deployment status in Supabase |

## Stack

React 19 · Vite 7 · Supabase (Postgres + Auth + RLS + RPC) · Tailwind 4 · Recharts · PGlite (tests) · Playwright (smoke + screenshots) · Netlify (static hosting).
