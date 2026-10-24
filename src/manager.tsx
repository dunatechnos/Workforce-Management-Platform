import { useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  Coffee,
  Edit3,
  Globe2,
  Palmtree,
  Plus,
  Search,
  ShieldCheck,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useApp } from "./context";
import {
  allRows,
  db,
  displayDate,
  saveWeekoff,
  weekoffsByStatus,
  labels,
  regularizationDetail,
  result,
  rpc,
  setTimeZone,
  time,
  timeZoneLabel,
  timeZoneOptionLabel,
  timeZoneOptions,
  today,
  useData,
  validTimeZone,
  type Row,
} from "./lib";
import { ProfileSelect } from "./employee";
import {
  Badge,
  ErrorBox,
  Fields,
  FormModal,
  Loading,
  Modal,
  Panel,
  Stat,
  Table,
  UserAvatar,
  type Field,
} from "./ui";

export function Employees() {
  const { people, act, busy } = useApp(),
    [edit, setEdit] = useState<Row | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("active");
  const rows = people.filter(
    (p) =>
      (filter === "all" || p.active) &&
      `${p.name} ${p.email} ${p.employee_code ?? ""} ${p.department}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const fields: Field[] = [
    { name: "name", label: "Full name", value: edit?.name },
    {
      name: "email",
      label: "Work email",
      type: "email",
      value: edit?.email,
    },
    {
      name: "employee_code",
      label: "Employee code",
      value: edit?.employee_code,
      required: false,
    },
    {
      name: "role",
      label: "Role",
      type: "select",
      value: edit?.role ?? "employee",
      options: [
        { value: "employee", label: "Employee" },
        { value: "manager", label: "Manager" },
      ],
    },
    {
      name: "department",
      label: "Department",
      value: edit?.department,
      required: false,
    },
    {
      name: "designation",
      label: "Designation",
      value: edit?.designation,
      required: false,
    },
    {
      name: "joining_date",
      label: "Joining date",
      type: "date",
      value: edit?.joining_date ?? today(),
    },
    {
      name: "exit_date",
      label: "Last working date",
      type: "date",
      value: edit?.exit_date,
      required: false,
      clearable: true,
    },
    {
      name: "active",
      label: "Active employee",
      type: "checkbox",
      value: edit?.active ?? true,
    },
    ...[
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ].map((name, n) => ({
      name: `off${n}`,
      label: `Fixed off: ${name}`,
      type: "checkbox",
      value: edit?.fixed_off?.includes(n),
    })),
  ];
  return (
    <>
      <div className="stats-grid three">
        <Stat label="People in your workspace" value={people.length} />
        <Stat
          label="Active employees"
          value={people.filter((p) => p.active).length}
        />
        <Stat
          label="Managers"
          value={people.filter((p) => p.active && p.role === "manager").length}
        />
      </div>
      <div className="toolbar">
        <div className="row">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Search people"
              placeholder="Search name, email or department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Employee status filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="active">Active only</option>
            <option value="all">All people</option>
          </select>
        </div>
        <button onClick={() => setEdit({})}>
          <Plus size={17} /> Add employee
        </button>
      </div>
      <Panel
        title="People directory"
        sub="Add an email before the first login to pre-configure role, joining date and week-offs."
      >
        <Table
          rows={rows}
          columns={[
            {
              title: "Employee",
              render: (r) => (
                <div className="person">
                  <UserAvatar person={r} />
                  <div>
                    <strong>{r.name}</strong>
                    <small>{r.email}</small>
                  </div>
                </div>
              ),
            },
            {
              title: "Code / Department",
              render: (r) => (
                <>
                  {r.employee_code || "—"}
                  <small className="block muted">{r.department || "—"}</small>
                </>
              ),
            },
            { title: "Role", render: (r) => <Badge value={r.role} /> },
            { title: "Joined", render: (r) => displayDate(r.joining_date) },
            {
              title: "Status",
              render: (r) => <Badge value={r.active ? "active" : "inactive"} />,
            },
            {
              title: "Account",
              render: (r) => (r.user_id ? "Connected" : "Awaiting first login"),
            },
            {
              title: "Manage",
              render: (r) => (
                <button
                  className="icon-btn"
                  aria-label={`Edit ${r.name}`}
                  onClick={() => setEdit(r)}
                >
                  <Edit3 size={17} />
                </button>
              ),
            },
          ]}
        />
      </Panel>
      {edit && (
        <FormModal
          title={edit.id ? "Edit employee" : "Add employee"}
          fields={fields}
          busy={busy}
          onClose={() => setEdit(null)}
          onSave={async (v) => {
            const fixed_off = Array.from({ length: 7 }, (_, i) => i).filter(
              (i) => v[`off${i}`],
            );
            const data: Row = {
              name: v.name,
              email: v.email.toLowerCase().trim(),
              employee_code: v.employee_code || null,
              role: v.role,
              department: v.department,
              designation: v.designation,
              joining_date: v.joining_date,
              exit_date: v.exit_date || null,
              active: v.active,
              fixed_off,
            };
            if (
              await act(() =>
                result(
                  edit.id
                    ? db.from("profiles").update(data).eq("id", edit.id)
                    : db.from("profiles").insert(data),
                ),
              )
            )
              setEdit(null);
          }}
        >
          <p className="hint">
            Fixed days are recurring weekly offs. Flexible week-offs follow the
            workweek pattern in Organization settings. Deactivate an employee
            to revoke application access while retaining their history. The
            last active manager cannot be deactivated.
          </p>
        </FormModal>
      )}
    </>
  );
}

export function Approvals() {
  const { people, version, act, busy } = useApp(),
    [status, setStatus] = useState("pending"),
    [review, setReview] = useState<Row | null>(null);
  const q = useData(
    async () => {
      const [leaves, corrections, types, weekoffs] = await Promise.all([
        allRows("leaves", (q) => q.eq("status", status)),
        allRows("regularizations", (q) => q.eq("status", status)),
        allRows("leave_types"),
        weekoffsByStatus(status),
      ]);
      return [
        ...leaves.map<Row>((l) => ({
          ...l,
          kind: "leave",
          title: types.find((t) => t.id === l.type_id)?.name ?? "Leave",
        })),
        ...corrections.map<Row>((c) => ({
          ...c,
          regularization_kind: c.kind ?? "full_day",
          kind: "correction",
          title: labels[c.kind ?? "full_day"] ?? "Regularization",
        })),
        ...weekoffs.map<Row>((w) => ({
          ...w,
          kind: "weekoff",
          title: "Week off",
        })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    [status, version],
    `approvals:${status}`,
  );
  return (
    <>
      <div className="toolbar">
        <div>
          <h2>
            {status === "pending" ? "Awaiting review" : "Request history"}
          </h2>
          <p className="muted">
            Leave, week-off and attendance regularization requests, newest
            first.
          </p>
        </div>
        <select
          value={status}
          aria-label="Request status"
          onChange={(e) => setStatus(e.target.value)}
        >
          {["pending", "approved", "rejected", "cancelled"].map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <Panel>
        {q.loading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={q.reload} />
        ) : (
          <Table
            rows={q.data!}
            empty="No requests in this view"
            columns={[
              {
                title: "Employee",
                render: (r) => (
                  <strong>
                    {people.find((p) => p.id === r.profile_id)?.name ??
                      "Unknown"}
                  </strong>
                ),
              },
              {
                title: "Request",
                render: (r) => (
                  <>
                    {r.title}
                    <small className="block muted">
                      {r.kind === "leave"
                        ? `${displayDate(r.start_date)} to ${displayDate(r.end_date)} · ${r.days} days`
                        : r.kind === "weekoff"
                          ? `${displayDate(r.day)}${r.reason ? ` · ${r.reason}` : ""}`
                          : `${displayDate(r.day)} · ${regularizationDetail({ ...r, kind: r.regularization_kind })}`}
                    </small>
                  </>
                ),
              },
              {
                title: "Reason",
                render: (r) => (
                  <div className="wrap">
                    {r.reason}
                    {r.review_note && (
                      <small className="block muted">
                        Review: {r.review_note}
                      </small>
                    )}
                  </div>
                ),
              },
              { title: "Status", render: (r) => <Badge value={r.status} /> },
              {
                title: "Review",
                render: (r) =>
                  r.status === "pending" ? (
                    <div className="row">
                      <button
                        className="approve-btn"
                        onClick={() => setReview({ ...r, approve: true })}
                      >
                        <Check size={16} /> Approve
                      </button>
                      <button
                        className="reject-btn"
                        onClick={() => setReview({ ...r, approve: false })}
                      >
                        <X size={16} /> Reject
                      </button>
                    </div>
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        )}
      </Panel>
      {review && (
        <FormModal
          title={`${review.approve ? "Approve" : "Reject"} · ${people.find((p) => p.id === review.profile_id)?.name}`}
          fields={[
            {
              name: "note",
              label: "Review note",
              type: "textarea",
              required: !review.approve,
            },
          ]}
          busy={busy}
          onClose={() => setReview(null)}
          onSave={async (v) => {
            if (
              await act(
                () =>
                  rpc(
                    review.kind === "leave"
                      ? "review_leave"
                      : review.kind === "weekoff"
                        ? "review_weekoff"
                        : "review_correction",
                    {
                      p_id: review.id,
                      p_approve: review.approve,
                      p_note: v.note,
                    },
                  ),
                review.approve ? "Request approved" : "Request rejected",
              )
            )
              setReview(null);
          }}
        >
          <div className="hint">
            {review.kind === "weekoff"
              ? review.approve
                ? "Approving adds this date to the employee's week-off schedule."
                : "Rejecting keeps the date as a normal working day. The employee can submit a new request later."
              : review.kind === "correction" && review.approve
                ? review.regularization_kind === "break"
                  ? "Approving recalculates the day using the requested break. Previous values remain in the audit trail."
                  : "Approving updates the requested punch on this day and recalculates work and break time. Previous values remain in the audit trail."
                : "The employee will see the decision and your note in their request history."}
          </div>
        </FormModal>
      )}
    </>
  );
}

export function Holidays() {
  const { profile, version, act, busy } = useApp(),
    [year, setYear] = useState(Number(today().slice(0, 4))),
    [edit, setEdit] = useState<Row | null>(null),
    [remove, setRemove] = useState<Row | null>(null);
  const q = useData(
    () =>
      allRows("holidays", (q) =>
        q.gte("day", `${year}-01-01`).lte("day", `${year}-12-31`),
      ),
    [year, version],
    `holidays:${year}`,
  );
  return (
    <>
      <div className="toolbar">
        <input
          type="number"
          min="2000"
          max="2200"
          aria-label="Holiday year"
          value={year}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 2000 && n <= 2200) setYear(n);
          }}
        />
        {profile.role === "manager" && (
          <button onClick={() => setEdit({})}>
            <Plus size={17} /> Add holiday
          </button>
        )}
      </div>
      <Panel
        title={`${year} company holidays`}
        sub="Shared with everyone in the organization. Holiday work is recorded as attendance."
      >
        {q.loading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={q.reload} />
        ) : (
          <Table
            rows={q.data!.sort((a, b) => a.day.localeCompare(b.day))}
            columns={[
              { title: "Holiday", render: (r) => <strong>{r.name}</strong> },
              { title: "Date", render: (r) => displayDate(r.day) },
              {
                title: "Day",
                render: (r) =>
                  new Date(r.day + "T00:00:00").toLocaleDateString("en", {
                    weekday: "long",
                  }),
              },
              ...(profile.role === "manager"
                ? [
                    {
                      title: "Manage",
                      render: (r: Row) => (
                        <div className="row">
                          <button
                            className="icon-btn"
                            aria-label="Edit holiday"
                            onClick={() => setEdit(r)}
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            className="icon-btn danger"
                            aria-label="Remove holiday"
                            onClick={() => setRemove(r)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Panel>
      {edit && (
        <FormModal
          title={edit.id ? "Edit holiday" : "Add holiday"}
          busy={busy}
          onClose={() => setEdit(null)}
          fields={[
            { name: "name", label: "Holiday name", value: edit.name },
            {
              name: "day",
              label: "Date",
              type: "date",
              value: edit.day ?? today(),
            },
          ]}
          onSave={async (v) => {
            if (
              await act(() =>
                result(
                  edit.id
                    ? db.from("holidays").update(v).eq("id", edit.id)
                    : db.from("holidays").insert(v),
                ),
              )
            )
              setEdit(null);
          }}
        />
      )}
      {remove && (
        <Modal title="Remove holiday?" onClose={() => setRemove(null)}>
          <div className="padded">
            <p>
              {remove.name} · {displayDate(remove.day)}
            </p>
            <p className="hint">
              This removes the holiday from everyone’s calendar.
            </p>
            <button
              className="danger-fill"
              disabled={busy}
              onClick={async () => {
                if (
                  await act(
                    () =>
                      result(db.from("holidays").delete().eq("id", remove.id)),
                    "Holiday removed",
                  )
                )
                  setRemove(null);
              }}
            >
              Remove holiday
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Settings() {
  const { settings, version, act, busy, navigate } = useApp(),
    [edit, setEdit] = useState<Row | null>(null),
    [tab, setTab] = useState("overview");
  const q = useData(
    () => allRows("leave_types"),
    [version],
    "settings:leave-types",
  );
  const workweek = Number(settings.workweek_days ?? 5);
  const identityFields: Field[] = [
    {
      name: "company_name",
      label: "Organization name",
      value: settings.company_name,
      help: "Your company or team name. Shown in the sidebar.",
    },
    {
      name: "product_name",
      label: "Product name",
      value: settings.product_name,
      help: "App name shown in the sidebar, browser tab and sign-in screen.",
    },
    {
      name: "tagline",
      label: "Tagline",
      value: settings.tagline,
      required: false,
      help: "Short line shown under the sign-in headline.",
    },
    {
      name: "login_headline",
      label: "Sign-in headline",
      value: settings.login_headline,
      required: false,
      help: "Main heading on the left side of the sign-in screen.",
    },
    {
      name: "login_message",
      label: "Sign-in message",
      value: settings.login_message,
      required: false,
      help: "Text shown below “Welcome to …” on the sign-in form.",
    },
    {
      name: "login_footer",
      label: "Sign-in footer",
      value: settings.login_footer,
      required: false,
      help: "Small line at the bottom of the sign-in panel.",
    },
    {
      name: "support_email",
      label: "Support email",
      type: "email",
      value: settings.support_email,
      required: false,
      help: "Shown on the sign-in screen when set.",
    },
    {
      name: "logo_url",
      label: "Logo URL",
      type: "url",
      value: settings.logo_url,
      required: false,
      help: "Square image, at least 64×64 px.",
    },
    {
      name: "timezone",
      label: "Time zone",
      type: "select",
      value: settings.timezone || "Asia/Kolkata",
      options: timeZoneOptions().map((z) => ({
        value: z,
        label: timeZoneOptionLabel(z),
      })),
      help: `Times, calendars and late calculations use ${timeZoneOptionLabel(
        settings.timezone,
      )}.`,
    },
  ];
  const accessFields: Field[] = [
    {
      name: "allowed_domains",
      label: "Allowed email domains",
      value: (settings.allowed_domains ?? []).join(", "),
      required: false,
      help: "Comma-separated, without @. Leave blank to allow any domain after the first manager signs in.",
    },
  ];
  const policyFields: Field[] = [
    {
      name: "full_minutes",
      label: "Full-day net work (minutes)",
      type: "number",
      value: settings.full_minutes,
      min: 1,
      max: 1440,
    },
    {
      name: "half_minutes",
      label: "Half-day minimum work (minutes)",
      type: "number",
      value: settings.half_minutes,
      min: 1,
      max: 1440,
    },
    {
      name: "break_minutes",
      label: "Daily allowed break (minutes)",
      type: "number",
      value: settings.break_minutes,
      min: 0,
      max: 480,
    },
    {
      name: "late_cutoff",
      label: `Half-day check-in cutoff (${timeZoneLabel(settings.timezone)})`,
      type: "time",
      value: settings.late_cutoff.slice(0, 5),
    },
    {
      name: "regularization_days",
      label: "Correction request lookback (days)",
      type: "number",
      value: settings.regularization_days,
      min: 1,
      max: 365,
    },
    {
      name: "weekoff_planning",
      label: "Week-off planning",
      type: "select",
      value: settings.weekoff_planning || "employee",
      options: [
        {
          value: "employee",
          label: "Self-service — employees choose, approved instantly",
        },
        {
          value: "request",
          label: "Approval required — employees request, admin approves",
        },
        {
          value: "manager",
          label: "Admin only — employees cannot add week offs",
        },
      ],
      help: "Controls whether employees can plan directly, request approval, or only view admin-scheduled offs.",
    },
    {
      name: "workweek_days",
      label: "Workweek pattern",
      type: "select",
      value: String(workweek),
      options: [
        { value: "5", label: "5 working days - 2 off days per week" },
        {
          value: "5.5",
          label: "5.5 working days — alternating 6-day and 5-day weeks",
        },
        { value: "6", label: "6 working days - 1 off day per week" },
      ],
      help: "5.5 days means one week has 6 working days and the next has 5, averaging 5.5. Fixed weekdays set in People count toward the same total.",
    },
  ];
  function parseDomains(value: FormDataEntryValue | null) {
    const domains = String(value ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    if (domains.some((d) => !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)))
      throw new Error("Enter valid domains, for example company.com");
    return domains;
  }
  const leaveFields: Field[] = [
    { name: "name", label: "Leave type name", value: edit?.name },
    { name: "tag", label: "Tag / short code", value: edit?.tag },
    {
      name: "color",
      label: "Tag color",
      type: "color",
      value: edit?.color ?? "#6d7cdd",
    },
    {
      name: "annual_quota",
      label: "Default annual entitlement (days)",
      type: "number",
      value: edit?.annual_quota ?? 12,
      min: 0,
      max: 9999,
      step: 0.5,
    },
    {
      name: "unlimited",
      label: "Unlimited leave",
      type: "checkbox",
      value: edit?.unlimited ?? false,
    },
    {
      name: "paid",
      label: "Paid leave",
      type: "checkbox",
      value: edit?.paid ?? true,
    },
    {
      name: "active",
      label: "Available for new requests",
      type: "checkbox",
      value: edit?.active ?? true,
    },
  ];
  return (
    <>
      <div className="settings-page-head">
        <div>
          <span className="eyebrow">ORGANIZATION SETTINGS</span>
          <h1>Workspace configuration</h1>
          <p>
            Policy, people and access for your organization. Personal
            preferences live in your profile.
          </p>
        </div>
        <button className="secondary" onClick={() => navigate("employees")}>
          Manage people <ArrowRight size={16} />
        </button>
      </div>
      <div className="org-settings-tabs" role="tablist" aria-label="Organization settings">
        {[
          ["overview", "Overview"],
          ["branding", "Brand & locale"],
          ["policy", "Attendance policy"],
          ["access", "Access & domains"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "branding" && (
      <Panel
        title="Organization identity"
        sub="These details appear on the sign-in screen, in the sidebar and in browser titles."
      >
        <form
          className="padded"
          key={`identity-${settings.updated_at}`}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            await act(async () => {
              const timezone = String(fd.get("timezone") || "Asia/Kolkata");
              if (!validTimeZone(timezone))
                throw new Error("Choose a valid time zone.");
              setTimeZone(timezone);
              return result(
                db
                  .from("settings")
                  .update({
                    company_name: String(fd.get("company_name") ?? "").trim(),
                    product_name: String(fd.get("product_name") ?? "").trim(),
                    tagline: String(fd.get("tagline") ?? "").trim(),
                    login_headline: String(
                      fd.get("login_headline") ?? "",
                    ).trim(),
                    login_message: String(fd.get("login_message") ?? "").trim(),
                    login_footer: String(fd.get("login_footer") ?? "").trim(),
                    support_email: String(fd.get("support_email") ?? "").trim(),
                    logo_url: String(fd.get("logo_url") ?? "").trim(),
                    timezone,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", true),
              );
            }, "Organization identity saved");
          }}
        >
          <Fields fields={identityFields} />
          <div className="info-strip">
            <ShieldCheck size={22} />
            <p>
              Branding changes apply immediately after saving. The time zone
              controls attendance dates, check-in times and reports.
            </p>
          </div>
          <button disabled={busy}>Save organization details</button>
        </form>
      </Panel>
      )}
      {tab === "policy" && (
      <Panel
        title="Attendance policy"
        sub={`Defaults: 8 hours net work + 1 hour break. Times use ${timeZoneLabel(settings.timezone)}.`}
      >
        <form
          className="padded"
          key={`policy-${settings.updated_at}`}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            await act(
              () =>
                result(
                  db
                    .from("settings")
                    .update({
                      full_minutes: Number(fd.get("full_minutes")),
                      half_minutes: Number(fd.get("half_minutes")),
                      break_minutes: Number(fd.get("break_minutes")),
                      late_cutoff: fd.get("late_cutoff"),
                      regularization_days: Number(
                        fd.get("regularization_days"),
                      ),
                      weekoff_planning: fd.get("weekoff_planning"),
                      workweek_days: Number(fd.get("workweek_days") ?? 5),
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", true),
                ),
              "Attendance policy saved",
            );
          }}
        >
          <div className="settings-form-group">
            <div className="settings-form-heading">
              <strong>Working day and corrections</strong>
              <small>
                These thresholds control attendance status, late marks and the
                correction window.
              </small>
            </div>
            <Fields fields={policyFields.slice(0, 5)} />
          </div>
          <div className="settings-form-group">
            <div className="settings-form-heading">
              <strong>Week-offs and workweek</strong>
              <small>
                Decide who plans flexible offs and how many working days make a
                normal week.
              </small>
            </div>
            <Fields fields={policyFields.slice(5)} />
          </div>
          <div className="info-strip">
            <ShieldCheck size={22} />
            <p>
              Attendance rules are saved with each day’s first check-in. Updates
              apply to new attendance records, so historical calculations stay
              unchanged.
            </p>
          </div>
          <button disabled={busy}>Save policy</button>
        </form>
      </Panel>
      )}
      {tab === "overview" && (
      <>
      <Panel
        title="Workspace at a glance"
        sub="The policies and identity currently applied to this workspace."
        actions={
          <button className="secondary" onClick={() => setTab("policy")}>
            Edit policy <ArrowRight size={16} />
          </button>
        }
      >
        <div className="config-list">
          <button
            type="button"
            className="config-row"
            onClick={() => setTab("policy")}
          >
            <span className="config-icon green">
              <Clock3 size={19} />
            </span>
            <span className="config-copy">
              <strong>Attendance and corrections</strong>
              <small>Working hours, breaks and late policy</small>
            </span>
            <span className="config-value">
              {Math.round((Number(settings.full_minutes) / 60) * 10) / 10}h net
              work
              <small>
                Half-day after {settings.late_cutoff.slice(0, 5)} ·{" "}
                {settings.regularization_days}-day correction window
              </small>
            </span>
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="config-row"
            onClick={() => setTab("policy")}
          >
            <span className="config-icon coffee">
              <Coffee size={19} />
            </span>
            <span className="config-copy">
              <strong>Week-offs and workweek</strong>
              <small>Who plans offs and the weekly allowance</small>
            </span>
            <span className="config-value">
              {settings.weekoff_planning === "manager"
                ? "Admin managed"
                : settings.weekoff_planning === "request"
                  ? "Admin approval"
                  : "Self-service"}
              <small>
                {workweek === 6
                  ? "6 working days · 1 off per week"
                  : workweek === 5.5
                    ? "5.5 working days · alternating 1 and 2 offs"
                    : "5 working days · 2 offs per week"}
              </small>
            </span>
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="config-row"
            onClick={() => setTab("access")}
          >
            <span className="config-icon blue">
              <Globe2 size={19} />
            </span>
            <span className="config-copy">
              <strong>Access and domains</strong>
              <small>Who can register for this workspace</small>
            </span>
            <span className="config-value">
              {(settings.allowed_domains ?? []).length
                ? settings.allowed_domains.length +
                  " allowed domain" +
                  (settings.allowed_domains.length === 1 ? "" : "s")
                : "All verified domains"}
              <small>
                {(settings.allowed_domains ?? []).join(", ") ||
                  "Any domain after the first manager signs in"}
              </small>
            </span>
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="config-row"
            onClick={() => setTab("branding")}
          >
            <span className="config-icon amber">
              <Palmtree size={19} />
            </span>
            <span className="config-copy">
              <strong>Brand and locale</strong>
              <small>Product name, sign-in copy and time zone</small>
            </span>
            <span className="config-value">
              {settings.product_name || "Workforce"} ·{" "}
              {timeZoneLabel(settings.timezone)}
              <small>
                {settings.company_name || "Organization name not set"} ·{" "}
                {timeZoneOptionLabel(settings.timezone)}
              </small>
            </span>
            <ArrowRight size={16} />
          </button>
        </div>
      </Panel>

      <Panel
        title="Leave types & tags"
        sub="Archive types instead of deleting them to preserve historical leave records."
        actions={
          <button onClick={() => setEdit({})}>
            <Plus size={16} /> Add leave type
          </button>
        }
      >
        {q.loading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={q.reload} />
        ) : (
          <Table
            rows={q.data!}
            columns={[
              {
                title: "Tag",
                render: (r) => (
                  <span
                    className="custom-tag"
                    style={{ borderColor: r.color, color: r.color }}
                  >
                    {r.tag}
                  </span>
                ),
              },
              { title: "Leave type", render: (r) => <strong>{r.name}</strong> },
              {
                title: "Annual days",
                render: (r) => (r.unlimited ? "Unlimited" : r.annual_quota),
              },
              { title: "Pay", render: (r) => (r.paid ? "Paid" : "Unpaid") },
              {
                title: "Status",
                render: (r) => (
                  <Badge value={r.active ? "active" : "archived"} />
                ),
              },
              {
                title: "Manage",
                render: (r) => (
                  <button
                    className="icon-btn"
                    aria-label="Edit leave type"
                    onClick={() => setEdit(r)}
                  >
                    <Edit3 size={17} />
                  </button>
                ),
              },
            ]}
          />
        )}
      </Panel>
      </>
      )}
      {tab === "access" && (
        <Panel
          title="Access & domains"
          sub="Control who can create an account in this workspace."
        >
          <form
            className="padded"
            key={`access-${settings.updated_at}`}
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await act(async () => {
                const domains = parseDomains(fd.get("allowed_domains"));
                return result(
                  db
                    .from("settings")
                    .update({
                      allowed_domains: domains,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", true),
                );
              }, "Access settings saved");
            }}
          >
            <Fields fields={accessFields} />
            <div className="info-strip">
              <ShieldCheck size={22} />
              <p>
                Domain changes apply to new account registrations. Deactivate
                existing accounts in People to revoke access.
              </p>
            </div>
            <button disabled={busy}>Save access settings</button>
          </form>
        </Panel>
      )}
      {edit && (
        <FormModal
          title={edit.id ? "Edit leave type" : "Create leave type"}
          fields={leaveFields}
          busy={busy}
          onClose={() => setEdit(null)}
          onSave={async (v) => {
            v.tag = v.tag.trim().toUpperCase();
            if (
              await act(() =>
                result(
                  edit.id
                    ? db.from("leave_types").update(v).eq("id", edit.id)
                    : db.from("leave_types").insert(v),
                ),
              )
            )
              setEdit(null);
          }}
        />
      )}
    </>
  );
}

export function Balances() {
  const { profile, version, act, busy } = useApp(),
    [pid, setPid] = useState(profile.id),
    [year, setYear] = useState(Number(today().slice(0, 4))),
    [edit, setEdit] = useState<Row | null>(null);
  const q = useData(
    () => rpc<Row[]>("leave_balance", { p_profile: pid, p_year: year }),
    [pid, year, version],
    `balances:${pid}:${year}`,
  );
  return (
    <>
      <div className="toolbar">
        <ProfileSelect value={pid} onChange={setPid} />
        <input
          aria-label="Balance year"
          type="number"
          min="2000"
          max="2200"
          value={year}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 2000 && n <= 2200) setYear(n);
          }}
        />
      </div>
      <Panel
        title="Annual leave entitlements"
        sub="Set an employee-specific annual total, including any carry-forward or adjustment. Otherwise the leave type’s default quota applies."
      >
        {q.loading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={q.reload} />
        ) : (
          <Table
            rows={q.data!}
            columns={[
              {
                title: "Type",
                render: (r) => (
                  <strong>
                    {r.name} ({r.tag})
                  </strong>
                ),
              },
              {
                title: "Entitlement",
                render: (r) => (r.unlimited ? "Unlimited" : r.entitlement),
              },
              { title: "Approved", render: (r) => r.used },
              { title: "Pending", render: (r) => r.pending },
              {
                title: "Available",
                render: (r) => (r.unlimited ? "∞" : r.available),
              },
              {
                title: "Manage",
                render: (r) => (
                  <button className="secondary" onClick={() => setEdit(r)}>
                    Adjust entitlement
                  </button>
                ),
              },
            ]}
          />
        )}
      </Panel>
      {edit && (
        <FormModal
          title={`${edit.tag} entitlement · ${year}`}
          busy={busy}
          onClose={() => setEdit(null)}
          fields={[
            {
              name: "entitlement",
              label: "Total days for this year",
              type: "number",
              value: edit.entitlement,
              min: 0,
              max: 9999,
              step: 0.5,
            },
          ]}
          onSave={async (v) => {
            if (
              await act(() =>
                result(
                  db.from("leave_balances").upsert(
                    {
                      profile_id: pid,
                      type_id: edit.type_id,
                      year,
                      entitlement: v.entitlement,
                    },
                    { onConflict: "profile_id,type_id,year" },
                  ),
                ),
              )
            )
              setEdit(null);
          }}
        >
          <p className="hint">
            Used and pending leave are deducted from this total. All changes are
            audited. Negative availability requires a manager to increase
            entitlement or cancel a request.
          </p>
        </FormModal>
      )}
    </>
  );
}

export function Audit() {
  const { version, people } = useApp(),
    [page, setPage] = useState(0),
    [table, setTable] = useState("all"),
    [detail, setDetail] = useState<Row | null>(null);
  const q = useData(
    async () => {
      let query = db
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("id", { ascending: false })
        .range(page * 50, page * 50 + 49);
      if (table !== "all") query = query.eq("table_name", table);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
    [page, table, version],
    `audit:${table}:${page}`,
  );
  return (
    <>
      <div className="toolbar">
        <p className="muted">
          Immutable application audit trail · newest first
        </p>
        <select
          aria-label="Audit table"
          value={table}
          onChange={(e) => {
            setTable(e.target.value);
            setPage(0);
          }}
        >
          {[
            "all",
            "profiles",
            "attendance",
            "breaks",
            "leaves",
            "regularizations",
            "weekoffs",
            "overrides",
            "holidays",
            "settings",
            "leave_balances",
            "leave_types",
          ].map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All changes" : t.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <Panel>
        {q.loading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={q.reload} />
        ) : (
          <>
            <Table
              rows={q.data!.rows}
              columns={[
                {
                  title: `When (${timeZoneLabel()})`,
                  render: (r) => (
                    <>
                      {displayDate(r.created_at)}
                      <small className="block muted">
                        {time(r.created_at)}
                      </small>
                    </>
                  ),
                },
                {
                  title: "Actor",
                  render: (r) =>
                    people.find((p) => p.user_id === r.actor)?.name ??
                    (r.actor
                      ? "Former account / " + r.actor.slice(0, 8)
                      : "System / SQL administrator"),
                },
                {
                  title: "Record",
                  render: (r) => r.table_name.replace("_", " "),
                },
                {
                  title: "Action",
                  render: (r) => <Badge value={r.action.toLowerCase()} />,
                },
                {
                  title: "Details",
                  render: (r) => (
                    <button className="text-btn" onClick={() => setDetail(r)}>
                      View changes
                    </button>
                  ),
                },
              ]}
            />
            <div className="pagination">
              <span>
                {q.data!.count} changes · Page {page + 1}
              </span>
              <div className="row">
                <button
                  className="secondary"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  className="secondary"
                  disabled={(page + 1) * 50 >= q.data!.count}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>
      {detail && (
        <Modal
          title={`${detail.action} · ${detail.table_name}`}
          onClose={() => setDetail(null)}
        >
          <div className="padded">
            <h3>Before</h3>
            <pre>{JSON.stringify(detail.old_data, null, 2) ?? "—"}</pre>
            <h3>After</h3>
            <pre>{JSON.stringify(detail.new_data, null, 2) ?? "—"}</pre>
          </div>
        </Modal>
      )}
    </>
  );
}
