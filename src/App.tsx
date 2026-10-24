import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import {
  Activity,
  LayoutDashboard,
  CalendarDays,
  Coffee,
  FileCheck2,
  Users,
  Settings2,
  BarChart3,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  CheckCircle2,
  RefreshCw,
  Palmtree,
  ArrowRight,
  Mail,
  UserRound,
} from "lucide-react";
import {
  allRows,
  applyPreferences,
  cacheKey,
  clearCache,
  configured,
  db,
  displayDate,
  initials,
  readCache,
  readPreferences,
  result,
  rpc,
  setTimeZone,
  supabaseKey,
  supabaseUrl,
  timeZoneLabel,
  timeZoneOffsetLabel,
  today,
  writeCache,
  type Row,
} from "./lib";
import { Context } from "./context";
import { ErrorBox, Loading, UserAvatar } from "./ui";
import { SetupWizard } from "./setup";
import { ProfilePage } from "./profile";
import {
  Dashboard,
  Attendance,
  Leaves,
  Weekoffs,
  Corrections,
} from "./employee";
import {
  Employees,
  Approvals,
  Holidays,
  Settings,
  Audit,
  Balances,
} from "./manager";
import { Analytics } from "./reports";

const nav = [
  ["dashboard", "Overview", LayoutDashboard],
  ["attendance", "Attendance", CalendarDays],
  ["holidays", "Holidays", CalendarDays],
  ["reports", "Reports", BarChart3],
] as const;
const accountNav = [["profile", "My profile", UserRound]] as const;
const adminNav = [
  ["approvals", "Approvals", FileCheck2],
  ["employees", "People", Users],
  ["weekoffs", "Week-offs", Coffee],
  ["balances", "Leave balances", Palmtree],
  ["settings", "Settings", Settings2],
  ["audit", "Audit log", ShieldCheck],
] as const;
const titles: Record<string, string> = {
  dashboard: "Attendance overview",
  attendance: "Attendance calendar",
  leaves: "Leave management",
  weekoffs: "Week-off schedule",
  corrections: "Attendance regularization",
  holidays: "Holiday calendar",
  reports: "Reports and analytics",
  profile: "My profile",
  approvals: "Approval inbox",
  employees: "People directory",
  balances: "Leave balances",
  settings: "Workspace settings",
  audit: "Audit trail",
};
const subs: Record<string, string> = {
  dashboard: "Your attendance, leave and schedule at a glance.",
  attendance: "Review daily attendance and correction history.",
  leaves: "Apply for leave and track available balances.",
  weekoffs: "Plan flexible week-offs and fixed off days.",
  corrections: "Fix a missing punch or break with a request.",
  holidays: "Company holidays for the selected year.",
  reports: "Attendance and leave data across the team.",
  profile: "Your profile, requests and personal preferences.",
  approvals: "Review leave, week-off and regularization requests.",
  employees: "Manage people, roles and schedules.",
  balances: "Adjust annual leave entitlements.",
  settings: "Organization identity, policies and leave types.",
  audit: "A permanent record of application changes.",
};
export type Branding = {
  company_name?: string;
  product_name?: string;
  tagline?: string;
  login_headline?: string;
  login_message?: string;
  login_footer?: string;
  support_email?: string;
  logo_url?: string;
  timezone?: string;
};
const defaultBranding: Branding = {
  company_name: "",
  product_name: "Workforce",
  tagline: "Attendance, leave, and team schedules in one place.",
  login_headline: "Attendance and leave, without the admin overhead.",
  login_message: "Sign in to manage attendance and leave.",
  login_footer: "Secure workspace access",
  support_email: "",
  logo_url: "",
  timezone: "Asia/Kolkata",
};
function Brand({ branding, size = 24 }: { branding: Branding; size?: number }) {
  return (
    <div className="brand">
      <div className="brand-mark">
        {branding.logo_url ? (
          <img src={branding.logo_url} alt="" />
        ) : (
          <Activity size={size} />
        )}
      </div>
      <span>{branding.product_name || "Workforce"}</span>
    </div>
  );
}
function friendlyAuth(m: string) {
  if (/email not confirmed/i.test(m))
    return "Email not confirmed yet — click the link in your inbox, then sign in.";
  if (/invalid login credentials/i.test(m))
    return "Wrong email or password. New here? Create your account below.";
  if (/user already registered/i.test(m))
    return "This email already has an account. Just sign in.";
  if (
    /signups? not allowed|sign ups? (are )?disabled|new user signups/i.test(m)
  )
    return "Ask your workspace administrator to add your email first, then create your account.";
  if (/password/i.test(m) && /short|length|weak/i.test(m))
    return "Password must be at least 6 characters.";
  return m;
}
function LoginPanel({ googleOn }: { googleOn: boolean }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false),
    [info, setInfo] = useState(""),
    [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setInfo("");
    try {
      const em = email.trim().toLowerCase();
      if (mode === "up") {
        if (!name.trim()) throw new Error("Please enter your full name.");
        const { data, error } = await db.auth.signUp({
          email: em,
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: location.origin,
          },
        });
        if (error) throw error;
        if (!data.session)
          setInfo(
            "Account created. If email confirmation is on, check your inbox for the link, then sign in.",
          );
      } else {
        const { error } = await db.auth.signInWithPassword({
          email: em,
          password,
        });
        if (error) throw error;
      }
    } catch (e: any) {
      setErr(friendlyAuth(e.message));
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setErr("");
    try {
      const { error } = await db.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: location.origin,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (e: any) {
      setErr(friendlyAuth(e.message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="segmented auth-toggle">
        <button
          type="button"
          className={mode === "in" ? "selected" : ""}
          onClick={() => {
            setMode("in");
            setErr("");
            setInfo("");
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "up" ? "selected" : ""}
          onClick={() => {
            setMode("up");
            setErr("");
            setInfo("");
          }}
        >
          Create account
        </button>
      </div>
      <form onSubmit={submit} className="auth-form">
        {mode === "up" && (
          <label>
            Full name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Keshav Sharma"
              autoComplete="name"
            />{" "}
          </label>
        )}
        <label>
          Work email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              mode === "up"
                ? "Choose a password (min 6 characters)"
                : "Your password"
            }
            autoComplete={mode === "up" ? "new-password" : "current-password"}
          />
        </label>
        {err && <ErrorBox error={err} />}
        {info && (
          <div className="info-strip">
            <CheckCircle2 size={18} />
            <p>{info}</p>
          </div>
        )}
        <button disabled={busy} type="submit">
          {busy
            ? mode === "up"
              ? "Creating account…"
              : "Signing in…"
            : mode === "up"
              ? "Create account"
              : "Sign in"}
          <ArrowRight size={18} />
        </button>
      </form>
      {googleOn && (
        <>
          <div className="or-divider">
            <span>or</span>
          </div>
          <button className="google" disabled={busy} onClick={google}>
            <Mail size={21} />
            Continue with Google
            <ArrowRight size={18} />
          </button>
        </>
      )}
    </>
  );
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [boot, setBoot] = useState(true),
    [profile, setProfile] = useState<Row | null>(null),
    [settings, setSettings] = useState<Row | null>(null),
    [people, setPeople] = useState<Row[]>([]),
    [branding, setBranding] = useState<Branding>(
      () => readCache<Branding>("branding") ?? defaultBranding,
    ),
    [error, setError] = useState("");
  const [page, setPage] = useState("dashboard"),
    [profileTab, setProfileTab] = useState("overview"),
    [requestTab, setRequestTab] = useState("leave"),
    [mobile, setMobile] = useState(false),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [googleOn, setGoogleOn] = useState(false);
  useEffect(() => {
    if (!configured) {
      setBoot(false);
      return;
    }
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setBoot(false);
    });
    db.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setSession(data.session);
        setBoot(false);
      })
      .catch((e) => {
        setError(e.message);
        setBoot(false);
      });
    const p = new URLSearchParams(location.search),
      h = new URLSearchParams(location.hash.slice(1));
    const e = p.get("error_description") || h.get("error_description");
    if (e) setError(e);
    rpc<Row[]>("branding")
      .then((rows) => {
        const next = { ...defaultBranding, ...(rows?.[0] ?? {}) };
        setBranding(next);
        setTimeZone(next.timezone);
        writeCache("branding", next);
      })
      .catch(() => {});
    fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseKey },
    })
      .then((r) => r.json())
      .then((j) => setGoogleOn(Boolean(j?.external?.google)))
      .catch(() => {});
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let alive = true;
    if (!session) {
      setProfile(null);
      setSettings(null);
      setPeople([]);
      return;
    }
    const uid = session.user.id;
    // Paint the last known shell instantly; revalidate from Supabase in the
    // background. Sensitive writes still always go to the server.
    const cachedProfile = readCache<Row>(cacheKey("profile", uid));
    const cachedSettings = readCache<Row>("settings");
    const cachedPeople = readCache<Row[]>(cacheKey("people", uid));
    if (cachedProfile) setProfile(cachedProfile);
    if (cachedSettings) {
      setSettings(cachedSettings);
      setTimeZone(cachedSettings.timezone);
    }
    if (cachedPeople) setPeople(cachedPeople);
    result<Row>(db.from("profiles").select("*").eq("user_id", uid).single())
      .then(async (p) => {
        if (!alive) return;
        setProfile(p);
        writeCache(cacheKey("profile", uid), p);
        if (!p.active) return;
        const [s, ps] = await Promise.all([
          result<Row>(db.from("settings").select("*").single()),
          p.role === "manager" ? allRows("profiles") : Promise.resolve([p]),
        ]);
        if (alive) {
          const sorted = ps.sort((a, b) => a.name.localeCompare(b.name));
          setSettings(s);
          setPeople(sorted);
          setTimeZone(s.timezone);
          writeCache("settings", s);
          writeCache(cacheKey("people", uid), sorted);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [session?.user.id, version]);
  useEffect(() => {
    if (!settings) return;
    setBranding((prev) => {
      const next: Branding = { ...prev, ...settings };
      writeCache("branding", next);
      return next;
    });
  }, [settings]);
  useEffect(() => {
    const name = settings?.product_name || branding.product_name || "Workforce";
    document.title = `${name} · Attendance and leave`;
    setTimeZone(settings?.timezone || branding.timezone);
  }, [
    settings?.product_name,
    settings?.timezone,
    branding.product_name,
    branding.timezone,
  ]);
  useEffect(() => {
    applyPreferences(readPreferences());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyPreferences(readPreferences());
    media.addEventListener("change", sync);
    window.addEventListener("workforce:preferences", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("workforce:preferences", sync);
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  async function act(job: () => Promise<any>, message = "Saved successfully") {
    if (busy) return false;
    setBusy(true);
    try {
      await job();
      setToast({ text: message });
      setVersion((v) => v + 1);
      return true;
    } catch (e: any) {
      setToast({ text: e.message, error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => setVersion((v) => v + 1);
  const navigate = (id: string, tab?: string, request?: string) => {
    setPage(id);
    if (tab) setProfileTab(tab);
    if (request) setRequestTab(request);
    setMobile(false);
  };
  const appBrand: Branding = {
    ...defaultBranding,
    ...branding,
    ...(settings ?? {}),
  };
  const product = appBrand.product_name || "Workforce";
  const signOut = () =>
    act(async () => {
      const { error } = await db.auth.signOut();
      if (error) throw error;
      setPage("dashboard");
      setProfileTab("overview");
      setRequestTab("leave");
      setProfile(null);
      setSettings(null);
      clearCache(["branding"]);
    }, "Signed out");
  if (boot)
    return (
      <div className="full-center">
        <Loading />
      </div>
    );
  if (!session)
    return (
      <div className="login">
        <div className="login-story">
          <Brand branding={appBrand} />
          <div className="story-body">
            <span className="eyebrow light">WORKFORCE MANAGEMENT</span>
            <h1>{appBrand.login_headline || defaultBranding.login_headline}</h1>
            <p>{appBrand.tagline}</p>
            <div className="story-card">
              <span className="live-dot" /> Live attendance overview
              <div className="mini-bars">
                {[45, 72, 58, 90, 68, 100, 82, 94, 65, 86, 76, 98].map(
                  (h, i) => (
                    <i key={i} style={{ height: h }} />
                  ),
                )}
              </div>
              <div className="story-card-foot">
                <span>Accurate time. Clear records.</span>
                <ArrowRight size={18} />
              </div>
            </div>
          </div>
          <small>{appBrand.login_footer || defaultBranding.login_footer}</small>
        </div>
        <div className="login-form">
          <div className="login-mobile-brand">
            <Brand branding={appBrand} size={22} />
          </div>
          <div className="login-box">
            <span className="eyebrow">SECURE SIGN-IN</span>
            <h2>Welcome to {product}</h2>
            <p>{appBrand.login_message}</p>
            {error && <ErrorBox error={error} />}{" "}
            {!configured ? (
              <div className="setup-box">
                <h3>Connect your workspace</h3>
                <p>
                  Add your Supabase URL and public key to <code>.env</code>,
                  then restart the dev server.
                </p>
                <ol>
                  <li>
                    Run <code>supabase/schema.sql</code>
                  </li>
                  <li>Configure the bootstrap manager in Supabase</li>
                  <li>
                    Follow the steps in <code>README.md</code>
                  </li>
                </ol>
              </div>
            ) : (
              <LoginPanel googleOn={googleOn} />
            )}
            <div className="login-note">
              <ShieldCheck size={17} /> Encrypted sign-in · Role-based access
            </div>
            {appBrand.support_email && (
              <div className="login-note">
                Support: {appBrand.support_email}
              </div>
            )}
          </div>
          <small className="login-footer">
            {product}
            {appBrand.company_name ? ` · ${appBrand.company_name}` : ""}
          </small>
        </div>
      </div>
    );
  if (error && !settings)
    return (
      <div className="full-center">
        <div className="panel padded">
          <h2>Workspace setup needs attention</h2>
          <ErrorBox error={error} retry={refresh} />
          <p>Check schema setup and your profile in Supabase. See README.md.</p>
          <button onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  if (profile && !profile.active)
    return (
      <div className="full-center">
        <div className="panel padded">
          <h2>Account deactivated</h2>
          <p>Please contact your manager to restore access.</p>
          <button onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  if (!profile || !settings)
    return (
      <div className="full-center">
        <Loading />
      </div>
    );
  const manager = profile.role === "manager";
  const appContext = {
    profile,
    settings,
    people,
    version,
    busy,
    refresh,
    act,
    navigate,
    profileTab,
    setProfileTab,
    requestTab,
    setRequestTab,
  };
  if (manager && !settings.setup_complete)
    return (
      <Context.Provider value={appContext}>
        <SetupWizard />
      </Context.Provider>
    );
  if (!manager && !settings.setup_complete)
    return (
      <div className="full-center">
        <div className="panel padded">
          <h2>Workspace setup in progress</h2>
          <p>
            Your administrator is completing the workspace setup. Please sign in
            again shortly.
          </p>
          <button onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  const content: Record<string, React.ReactNode> = {
    dashboard: <Dashboard />,
    attendance: <Attendance />,
    leaves: <Leaves />,
    weekoffs: <Weekoffs />,
    corrections: <Corrections />,
    holidays: <Holidays />,
    reports: <Analytics />,
    profile: <ProfilePage />,
    approvals: <Approvals />,
    employees: <Employees />,
    balances: <Balances />,
    settings: <Settings />,
    audit: <Audit />,
  };
  return (
    <Context.Provider value={appContext}>
      <div className="app-shell">
        {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
        <aside className={mobile ? "sidebar open" : "sidebar"}>
          <Brand branding={appBrand} size={22} />
          <div className="workspace">
            <span className="workspace-icon">
              {initials(settings.company_name || product)}
            </span>
            <div>
              <strong>{settings.company_name || product}</strong>
              <small>People workspace</small>
            </div>
          </div>
          <span className="nav-caption">WORKSPACE</span>
          <nav>
            {nav.map(([id, label, Icon]) => (
              <button
                className={page === id ? "nav-item active" : "nav-item"}
                key={id}
                onClick={() => navigate(id)}
              >
                <Icon size={19} />
                {label}
                {page === id && <i />}
              </button>
            ))}
          </nav>
          {manager && (
            <>
              <span className="nav-caption">MANAGEMENT</span>
              <nav>
                {adminNav.map(([id, label, Icon]) => (
                  <button
                    className={page === id ? "nav-item active" : "nav-item"}
                    key={id}
                    onClick={() => navigate(id)}
                  >
                    <Icon size={19} />
                    {label}
                  </button>
                ))}
              </nav>
            </>
          )}
          <span className="nav-caption">ACCOUNT</span>
          <nav>
            {accountNav.map(([id, label, Icon]) => (
              <button
                className={page === id ? "nav-item active" : "nav-item"}
                key={id}
                onClick={() => navigate(id, "overview")}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button
              className="sidebar-user"
              onClick={() => navigate("profile", "overview")}
            >
              <UserAvatar person={profile} />
              <span>
                <strong>{profile.name}</strong>
                <small>{manager ? "Manager" : "Employee"}</small>
              </span>
            </button>
            <button
              className="icon-btn"
              onClick={signOut}
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="row">
              <button
                className="icon-btn mobile-toggle"
                onClick={() => setMobile(!mobile)}
                aria-label="Open navigation"
              >
                <Menu />
              </button>
              <span className="breadcrumb">
                Workspace <span>/</span>{" "}
                <strong>
                  {[...nav, ...accountNav, ...adminNav].find(
                    (n) => n[0] === page,
                  )?.[1]}
                </strong>
              </span>
            </div>
            <div className="row">
              <span className="top-date">
                {displayDate(today())}{" "}
                <span className="muted">· {timeZoneLabel()}</span>
              </span>
              <button
                className="icon-btn"
                aria-label="Refresh data"
                onClick={refresh}
              >
                <RefreshCw size={17} />
              </button>
              <button
                className="avatar-btn"
                onClick={() => navigate("profile", "overview")}
                aria-label="Open my profile"
              >
                <UserAvatar person={profile} size="small" />
              </button>
            </div>
          </header>
          <main>
            {page !== "profile" &&
              page !== "settings" &&
              page !== "dashboard" &&
              !(page === "approvals" && manager) && (
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {page === "dashboard"
                      ? `HELLO, ${profile.name.split(" ")[0].toUpperCase()}`
                      : `${product.toUpperCase()} WORKSPACE`}
                  </span>
                  <h1>{titles[page]}</h1>
                  <p>{subs[page]}</p>
                </div>
                <span className="workspace-badge">
                  <span className="live-dot" />
                  {manager ? "Manager workspace" : "Employee workspace"}
                </span>
              </div>
            )}
            {error && <ErrorBox error={error} retry={refresh} />}
            <div key={page}>
              {!manager && adminNav.some((x) => x[0] === page) ? (
                <Dashboard />
              ) : (
                content[page]
              )}
            </div>
            <footer className="page-footer">
              {product}{" "}
              <span>
                All times in {timeZoneLabel()} ({timeZoneOffsetLabel()})
              </span>
            </footer>
          </main>
        </div>
        {toast &&
          createPortal(
            <div
              className={`toast ${toast.error ? "toast-error" : ""}`}
              role={toast.error ? "alert" : "status"}
            >
              {toast.error ? <X size={19} /> : <CheckCircle2 size={19} />}
              <span>{toast.text}</span>
              <button
                className="icon-btn"
                onClick={() => setToast(null)}
                aria-label="Dismiss notification"
              >
                <X size={15} />
              </button>
            </div>,
            document.querySelector("dialog[open]") ?? document.body,
          )}
      </div>
    </Context.Provider>
  );
}
