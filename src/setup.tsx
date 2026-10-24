import { useState } from "react";
import { Building2, CheckCircle2, Globe2, ShieldCheck } from "lucide-react";
import { useApp } from "./context";
import {
  db,
  result,
  setTimeZone,
  timeZoneOptionLabel,
  timeZoneOptions,
  validTimeZone,
  type Row,
} from "./lib";
import { ErrorBox, Loading } from "./ui";

type Draft = {
  company_name: string;
  product_name: string;
  timezone: string;
  allowed_domains: string;
};

export function SetupWizard() {
  const { settings, busy, act } = useApp();
  const [draft, setDraft] = useState<Draft>({
    company_name: settings.company_name ?? "",
    product_name: settings.product_name ?? "Workforce",
    timezone: settings.timezone ?? "Asia/Kolkata",
    allowed_domains: (settings.allowed_domains ?? []).join(", "),
  });
  const [error, setError] = useState("");
  const set = (key: keyof Draft, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const domains = draft.allowed_domains
      .split(",")
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    if (!draft.company_name.trim())
      return setError("Enter your organization name.");
    if (!draft.product_name.trim())
      return setError("Enter the product name people will see.");
    if (!validTimeZone(draft.timezone))
      return setError("Choose a valid time zone.");
    if (domains.some((d) => !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)))
      return setError("Enter valid domains, for example company.com.");
    const ok = await act(async () => {
      const patch: Row = {
        company_name: draft.company_name.trim(),
        product_name: draft.product_name.trim(),
        timezone: draft.timezone,
        allowed_domains: domains,
        setup_complete: true,
        updated_at: new Date().toISOString(),
      };
      setTimeZone(draft.timezone);
      return result(db.from("settings").update(patch).eq("id", true));
    }, "Workspace setup complete");
    if (!ok) return;
  }
  if (!settings) return <Loading />;
  return (
    <div className="setup-shell">
      <div className="setup-card">
        <div className="setup-preview">
          <div className="brand">
            <div className="brand-mark">
              {settings.logo_url ? (
                <img src={settings.logo_url} alt="" />
              ) : (
                <Building2 size={26} />
              )}
            </div>
            <span>{draft.product_name || "Workforce"}</span>
          </div>
          <span className="eyebrow light">WELCOME TO YOUR WORKSPACE</span>
          <h1>
            Set up your organization once. Everyone follows the same rules.
          </h1>
          <p>
            {settings.tagline ||
              "Attendance, leave, and schedules in one place."}
          </p>
          <div className="setup-preview-workspace">
            <span>
              {draft.company_name
                ? draft.company_name
                    .split(" ")
                    .map((x) => x[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : "ORG"}
            </span>
            <div>
              <strong>{draft.company_name || "Your organization"}</strong>
              <small>People workspace</small>
            </div>
          </div>
          <ul>
            <li>
              <CheckCircle2 size={16} /> Your organization name and product name
            </li>
            <li>
              <CheckCircle2 size={16} /> Logo and sign-in copy can be added
              later
            </li>
            <li>
              <CheckCircle2 size={16} /> Attendance policy and time zone
            </li>
            <li>
              <CheckCircle2 size={16} /> Add people after setup
            </li>
          </ul>
        </div>
        <div className="setup-form-wrap">
          <div className="setup-form-head">
            <span className="eyebrow">FIRST-RUN SETUP</span>
            <h2>Organization details</h2>
            <p>
              These details appear across the workspace. You can change them
              later in Workspace settings.
            </p>
          </div>
          <form className="setup-form" onSubmit={save}>
            <div className="form-grid">
              <label>
                <span>Organization name *</span>
                <input
                  required
                  value={draft.company_name}
                  onChange={(e) => set("company_name", e.target.value)}
                  placeholder="Acme Technologies"
                />
              </label>
              <label>
                <span>Product name *</span>
                <input
                  required
                  value={draft.product_name}
                  onChange={(e) => set("product_name", e.target.value)}
                  placeholder="Workforce"
                />
                <small>
                  App name shown in the sidebar, browser tab and sign-in screen.
                </small>
              </label>
              <label>
                <span>Time zone</span>
                <select
                  value={draft.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                >
                  {timeZoneOptions().map((z) => (
                    <option key={z} value={z}>
                      {timeZoneOptionLabel(z)}
                    </option>
                  ))}
                </select>
                <small>
                  Used for attendance dates, check-in times and reports.
                </small>
              </label>
              <label className="wide">
                <span>Allowed email domains</span>
                <input
                  value={draft.allowed_domains}
                  onChange={(e) => set("allowed_domains", e.target.value)}
                  placeholder="company.com, group.com"
                />
                <small>
                  Comma-separated, without @. Leave blank to allow any domain
                  after the bootstrap manager signs in.
                </small>
              </label>
            </div>
            {error && <ErrorBox error={error} />}
            <div className="info-strip">
              <Globe2 size={20} />
              <p>
                Times, calendars and regularization use the selected time zone.
                Attendance rules can be adjusted after setup.
              </p>
            </div>
            <div className="setup-actions">
              <span className="muted">
                <ShieldCheck size={16} /> Only managers can change these
                settings.
              </span>
              <button disabled={busy} type="submit">
                {busy ? "Saving…" : "Complete setup"}
                <CheckCircle2 size={18} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
