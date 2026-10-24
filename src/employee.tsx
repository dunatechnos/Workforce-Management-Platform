import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Coffee,
  FileCheck2,
  LogIn,
  LogOut,
  Palmtree,
  Plus,
  Settings2,
  Users,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApp } from "./context";
import {
  addDays,
  allRows,
  cacheKey,
  calendars,
  csv,
  db,
  displayDate,
  saveWeekoff,
  weekoffsByStatus,
  clockInput,
  duration,
  monthRange,
  regularizationDetail,
  result,
  rpc,
  summary,
  time,
  timeZoneLabel,
  today,
  useData,
  zonedDate,
  zonedISO,
  type Row,
} from "./lib";
import {
  Badge,
  Empty,
  ErrorBox,
  FormModal,
  Loading,
  Modal,
  Panel,
  Stat,
  Table,
  UserAvatar,
  type Field,
} from "./ui";
import { DatePicker, TimePicker } from "./pickers";

export function ProfileSelect({
  value,
  onChange,
  all = false,
}: {
  value: string;
  onChange: (s: string) => void;
  all?: boolean;
}) {
  const { people, profile } = useApp();
  if (profile.role !== "manager") return null;
  return (
    <select
      aria-label="Employee"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {all && <option value="all">All employees</option>}
      {people.map((p) => (
        <option value={p.id} key={p.id}>
          {p.name}
          {p.active ? "" : " (inactive)"}
        </option>
      ))}
    </select>
  );
}
export function Dashboard() {
  const { profile, settings, version, busy, act, navigate, people } = useApp(),
    [tick, setTick] = useState(Date.now()),
    [optimistic, setOptimistic] = useState<{ a: Row; action: string } | null>(
      null,
    );
  const [from, to] = monthRange(today().slice(0, 7));
  const q = useData(
    async () => {
      const [days, att, holidays, team, pending, mine] = await Promise.all([
        rpc<Row[]>("calendar", {
          p_profile: profile.id,
          p_from: from,
          p_to: to,
        }),
        result<Row[]>(
          db
            .from("attendance")
            .select("*,breaks(*)")
            .eq("profile_id", profile.id)
            .or(`day.eq.${today()},check_out.is.null`)
            .order("day", { ascending: false }),
        ),
        result<Row[]>(
          db
            .from("holidays")
            .select("*")
            .gte("day", today())
            .order("day")
            .limit(4),
        ),
        profile.role === "manager"
          ? calendars(
              people.filter((p) => p.active),
              today(),
              today(),
            )
          : Promise.resolve([]),
        profile.role === "manager"
          ? Promise.all([
              allRows("leaves", (q) => q.eq("status", "pending")),
              allRows("regularizations", (q) => q.eq("status", "pending")),
              weekoffsByStatus("pending"),
            ])
          : Promise.resolve(null),
        // Employee's own pending requests (no status filter in query so it
        // also works on databases without migration 0005).
        profile.role === "manager"
          ? Promise.resolve(null)
          : (async () => {
              try {
                const [l, c, w] = await Promise.all([
                  result<Row[]>(
                    db
                      .from("leaves")
                      .select("id,status")
                      .eq("profile_id", profile.id)
                      .order("id", { ascending: false })
                      .limit(50),
                  ),
                  result<Row[]>(
                    db
                      .from("regularizations")
                      .select("id,status")
                      .eq("profile_id", profile.id)
                      .order("id", { ascending: false })
                      .limit(50),
                  ),
                  result<Row[]>(
                    db
                      .from("weekoffs")
                      .select("id,status,day")
                      .eq("profile_id", profile.id)
                      .order("day", { ascending: false })
                      .limit(50),
                  ),
                ]);
                const countPending = (rows: Row[]) =>
                  rows.filter((r) => (r.status ?? "approved") === "pending")
                    .length;
                return {
                  leave: countPending(l),
                  correction: countPending(c),
                  weekoff: countPending(w),
                };
              } catch {
                return null;
              }
            })(),
      ]);
      const a = att.find((a) => !a.check_out) ?? att[0];
      return {
        days,
        a,
        holidays,
        team,
        pending: pending
          ? {
              leave: pending[0].length,
              correction: pending[1].length,
              weekoff: pending[2].length,
            }
          : null,
        mine,
      };
    },
    [profile.id, version],
    cacheKey("dashboard", profile.id, today().slice(0, 7)),
  );
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const server = q.data?.a;
    if (!optimistic || !server) return;
    const fresh =
      optimistic.action === "check_in"
        ? Boolean(server.check_in)
        : optimistic.action === "check_out"
          ? Boolean(server.check_out)
          : optimistic.action === "break_start"
            ? Boolean(server.breaks?.some((b: Row) => !b.ended_at))
            : Boolean(
                server.breaks?.length &&
                  !server.breaks.some((b: Row) => !b.ended_at),
              );
    if (fresh) setOptimistic(null);
  }, [q.data, optimistic]);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} retry={q.reload} />;
  const { days, holidays, team, pending, mine } = q.data!;
  const a = optimistic?.a ?? q.data!.a;
  const s = summary(days),
    openBreak = a?.breaks?.find((b: Row) => !b.ended_at),
    state = !a ? "out" : a.check_out ? "done" : openBreak ? "break" : "working";
  const end = a?.check_out ? new Date(a.check_out).getTime() : tick;
  const breakM =
    a?.breaks?.reduce(
      (n: number, b: Row) =>
        n +
        (new Date(
          b.ended_at ??
            Math.min(tick, new Date(a.check_in).getTime() + 20 * 3600000),
        ).getTime() -
          new Date(b.started_at).getTime()) /
          60000,
      0,
    ) ?? 0;
  const work = a
    ? Math.max(
        0,
        (Math.min(end, new Date(a.check_in).getTime() + 20 * 3600000) -
          new Date(a.check_in).getTime()) /
          60000 -
          breakM,
      )
    : 0;
  const stale =
    a && !a.check_out && tick - new Date(a.check_in).getTime() > 20 * 3600000;
  async function punch(action: string) {
    const at = new Date().toISOString();
    const next: Row = a
      ? { ...a, breaks: [...(a.breaks ?? [])] }
      : {
          id: "optimistic",
          day: today(),
          check_in: at,
          check_out: null,
          breaks: [],
          full_minutes: settings.full_minutes,
          half_minutes: settings.half_minutes,
          allowed_break: settings.break_minutes,
          late_cutoff: settings.late_cutoff,
        };
    if (action === "check_in") {
      next.check_in = at;
      next.check_out = null;
      next.breaks = [];
    } else if (action === "break_start") {
      next.breaks.push({
        id: "optimistic-break",
        started_at: at,
        ended_at: null,
      });
    } else if (action === "break_end") {
      const open = next.breaks.find((b: Row) => !b.ended_at);
      if (open) open.ended_at = at;
    } else if (action === "check_out") {
      const open = next.breaks.find((b: Row) => !b.ended_at);
      if (open) open.ended_at = at;
      next.check_out = at;
    }
    setOptimistic({ a: next, action });
    const ok = await act(
      () => rpc("punch", { p_action: action }),
      {
        check_in: "Check-in saved successfully",
        check_out: "Check-out saved successfully",
        break_start: "Break saved successfully",
        break_end: "Break end saved successfully",
      }[action] ?? "Saved successfully",
    );
    if (!ok) setOptimistic(null);
  }
  if (profile.role === "manager") {
    const present = team.filter((r) =>
      ["present", "half_day", "in_progress"].includes(r.status),
    ).length;
    const away = team.filter((r) =>
      ["leave", "half_leave", "weekoff", "holiday"].includes(r.status),
    ).length;
    const unmarked = team.filter((r) =>
      ["absent", "not_marked"].includes(r.status),
    ).length;
    const pendingTotal =
      (pending?.leave ?? 0) +
      (pending?.correction ?? 0) +
      (pending?.weekoff ?? 0);
    const workweek = Number(settings.workweek_days ?? 5);
    const hour = new Date().getHours();
    const greeting =
      hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const myState =
      state === "working"
        ? "Checked in"
        : state === "break"
          ? "On break"
          : state === "done"
            ? "Day complete"
            : "Not checked in";
    return (
      <>
        <section className="admin-command">
          <div className="admin-command-copy">
            <span className="eyebrow">TEAM OPERATIONS</span>
            <h1>
              {greeting}, {profile.name.split(" ")[0]}.
            </h1>
            <p>
              {displayDate(today())} · {timeZoneLabel()} ·{" "}
              {team.length} active {team.length === 1 ? "person" : "people"}
            </p>
          </div>
          <div className="admin-command-actions">
            <button onClick={() => navigate("approvals")}>
              <FileCheck2 size={17} />
              Review approvals
              {pendingTotal > 0 && (
                <span className="action-count">{pendingTotal}</span>
              )}
            </button>
            <button
              className="secondary"
              onClick={() => navigate("employees")}
            >
              <Users size={17} /> People
            </button>
            <button className="secondary" onClick={() => navigate("weekoffs")}>
              <Coffee size={17} /> Schedules
            </button>
            <button
              className="icon-btn admin-settings-btn"
              aria-label="Organization settings"
              onClick={() => navigate("settings")}
            >
              <Settings2 size={18} />
            </button>
          </div>
        </section>
        <div className="manager-kpis">
          <button
            type="button"
            className="metric-card"
            onClick={() => navigate("employees")}
          >
            <span className="metric-icon green">
              <Users size={18} />
            </span>
            <div>
              <small>ON SITE TODAY</small>
              <strong>
                {present}
                <em>/{team.length}</em>
              </strong>
              <p>Checked in or currently working</p>
            </div>
          </button>
          <button
            type="button"
            className="metric-card"
            onClick={() => navigate("attendance")}
          >
            <span className="metric-icon blue">
              <Palmtree size={18} />
            </span>
            <div>
              <small>AWAY TODAY</small>
              <strong>{away}</strong>
              <p>Leave, holiday or scheduled week off</p>
            </div>
          </button>
          <button
            type="button"
            className="metric-card"
            onClick={() => navigate("approvals")}
          >
            <span className="metric-icon amber">
              <FileCheck2 size={18} />
            </span>
            <div>
              <small> NEEDS ATTENTION</small>
              <strong>{pendingTotal}</strong>
              <p>
                {pending?.leave ?? 0} leave · {pending?.weekoff ?? 0} week off ·{" "}
                {pending?.correction ?? 0} correction
              </p>
            </div>
          </button>
          <button
            type="button"
            className="metric-card"
            onClick={() => navigate("attendance")}
          >
            <span className="metric-icon muted">
              <Clock3 size={18} />
            </span>
            <div>
              <small>NOT MARKED</small>
              <strong>{unmarked}</strong>
              <p>Awaiting a check-in or correction</p>
            </div>
          </button>
        </div>
        <div className="manager-layout">
          <Panel
            title="Today's team"
            sub="Live attendance across the workspace"
            actions={
              <button
                className="secondary"
                onClick={() => navigate("reports")}
              >
                View report <ArrowRight size={16} />
              </button>
            }
          >
            <Table
              rows={[...team].sort((a, b) => a.name.localeCompare(b.name))}
              columns={[
                {
                  title: "Team member",
                  render: (r) => {
                    const person =
                      people.find((p) => p.id === r.profile_id) ?? r;
                    return (
                      <div className="person-cell">
                        <UserAvatar person={person} size="small" />
                        <div>
                          <strong>{r.name}</strong>
                          <small>{r.department || "Team member"}</small>
                        </div>
                      </div>
                    );
                  },
                },
                { title: "Status", render: (r) => <Badge value={r.status} /> },
                {
                  title: "In / Out",
                  render: (r) => `${time(r.check_in)} / ${time(r.check_out)}`,
                },
                {
                  title: "Net work",
                  render: (r) => duration(r.work_minutes),
                },
              ]}
            />
          </Panel>
          <Panel
            title="Needs attention"
            sub="Requests waiting for your decision"
            actions={<Badge value={pendingTotal ? "pending" : "approved"} />}
          >
            <div className="attention-list">
              <button
                className="attention-row"
                onClick={() => navigate("approvals")}
              >
                <span className="attention-icon leave">
                  <Palmtree size={17} />
                </span>
                <span>
                  <strong>Leave requests</strong>
                  <small>{pending?.leave ?? 0} waiting for review</small>
                </span>
                <ArrowRight size={16} />
              </button>
              <button
                className="attention-row"
                onClick={() => navigate("approvals")}
              >
                <span className="attention-icon schedule">
                  <Coffee size={17} />
                </span>
                <span>
                  <strong>Week-off requests</strong>
                  <small>{pending?.weekoff ?? 0} waiting for review</small>
                </span>
                <ArrowRight size={16} />
              </button>
              <button
                className="attention-row"
                onClick={() => navigate("approvals")}
              >
                <span className="attention-icon correction">
                  <Clock3 size={17} />
                </span>
                <span>
                  <strong>Correction requests</strong>
                  <small>{pending?.correction ?? 0} waiting for review</small>
                </span>
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="attention-holidays">
              <div className="attention-title">
                <span>UPCOMING HOLIDAYS</span>
                <button
                  className="text-btn"
                  onClick={() => navigate("holidays")}
                >
                  View all
                </button>
              </div>
              {holidays.length ? (
                holidays.slice(0, 3).map((h) => (
                  <div className="holiday-line compact" key={h.id}>
                    <div className="date-tile">
                      <strong>{h.day.slice(8)}</strong>
                      <small>
                        {new Date(h.day + "T00:00:00").toLocaleDateString(
                          "en",
                          { month: "short" },
                        )}
                      </small>
                    </div>
                    <div>
                      <strong>{h.name}</strong>
                      <p>{displayDate(h.day)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted attention-empty">No upcoming holidays.</p>
              )}
            </div>
          </Panel>
        </div>
        <div className="manager-layout manager-lower">
          <section className="punch-card manager-punch">
            <div className="row between">
              <span className="eyebrow light">MY ATTENDANCE</span>
              <span className="punch-state">
                <span className="live-dot" />
                {myState}
              </span>
            </div>
            <h2>
              {state === "working"
                ? "You are checked in."
                : state === "break"
                  ? "Break in progress."
                  : state === "done"
                    ? "Your workday is complete."
                    : "Start your workday."}
            </h2>
            <div className="timer">
              {duration(work)}
              <span>net working time</span>
            </div>
            <div className="punch-facts">
              <div>
                <Clock3 size={16} />
                <span>
                  Check-in<strong>{time(a?.check_in)}</strong>
                </span>
              </div>
              <div>
                <Coffee size={16} />
                <span>
                  Break<strong>{duration(breakM)}</strong>
                </span>
              </div>
              <div>
                <LogOut size={16} />
                <span>
                  Check-out<strong>{time(a?.check_out)}</strong>
                </span>
              </div>
            </div>
            {stale ? (
              <button
                className="punch-primary"
                onClick={() => navigate("profile", "requests", "correction")}
              >
                Request correction <ArrowRight size={17} />
              </button>
            ) : (
              <div className="punch-actions">
                {state === "out" ? (
                  <button
                    disabled={busy}
                    className="punch-primary"
                    onClick={() => punch("check_in")}
                  >
                    <LogIn size={18} /> Check in <ArrowRight size={18} />
                  </button>
                ) : state === "done" ? (
                  <button
                    className="punch-primary"
                    onClick={() => navigate("attendance")}
                  >
                    View my attendance <ArrowRight size={18} />
                  </button>
                ) : (
                  <>
                    <button
                      disabled={busy}
                      className="punch-primary"
                      onClick={() =>
                        punch(state === "break" ? "break_end" : "break_start")
                      }
                    >
                      <Coffee size={18} />
                      {state === "break" ? "End break" : "Take a break"}
                    </button>
                    <button
                      disabled={busy}
                      className="punch-secondary"
                      onClick={() => punch("check_out")}
                    >
                      <LogOut size={18} /> Check out
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
          <Panel
            title="Policy snapshot"
            sub="Current workspace rules"
            actions={
              <button
                className="icon-btn"
                aria-label="Open organization settings"
                onClick={() => navigate("settings")}
              >
                <Settings2 size={17} />
              </button>
            }
          >
            <div className="policy-snapshot">
              <div>
                <span>Workday</span>
                <strong>
                  {duration(settings.full_minutes)} +{" "}
                  {duration(settings.break_minutes)} break
                </strong>
              </div>
              <div>
                <span>Week-off planning</span>
                <strong>
                  {settings.weekoff_planning === "manager"
                    ? "Admin managed"
                    : settings.weekoff_planning === "request"
                      ? "Admin approval"
                      : "Self-service"}
                </strong>
              </div>
              <div>
                <span>Workweek</span>
                <strong>
                  {workweek === 6
                    ? "6 days · 1 off"
                    : workweek === 5.5
                      ? "5.5 days · alternating"
                      : "5 days · 2 offs"}
                </strong>
              </div>
              <div>
                <span>Time zone</span>
                <strong>{timeZoneLabel(settings.timezone)}</strong>
              </div>
            </div>
            <button className="text-btn" onClick={() => navigate("settings")}>
              Open organization settings <ArrowRight size={16} />
            </button>
          </Panel>
        </div>
      </>
    );
  }
  const week = days
    .filter((r) => r.day <= today())
    .slice(-7)
    .map((r) => ({
      day: new Date(r.day + "T00:00:00").toLocaleDateString("en", {
        weekday: "short",
      }),
      hours: Math.round((r.work_minutes / 60) * 10) / 10,
    }));
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const myState =
    state === "working"
      ? "Working"
      : state === "break"
        ? "On break"
        : state === "done"
          ? "Day complete"
          : "Not checked in";
  const firstName = profile.name.split(" ")[0];
  const mineTotal = (mine?.leave ?? 0) + (mine?.correction ?? 0) + (mine?.weekoff ?? 0);
  return (
    <>
      <section className="admin-command">
        <div className="admin-command-copy">
          <span className="eyebrow">MY WORKSPACE</span>
          <h1>
            {greeting}, {firstName}.
          </h1>
          <p>
            {displayDate(today())} · {timeZoneLabel()} · {myState}
            {mineTotal > 0 &&
              ` · ${mineTotal} request${mineTotal === 1 ? "" : "s"} pending`}
          </p>
        </div>
        <div className="admin-command-actions">
          <button onClick={() => navigate("attendance")}>
            <Clock3 size={17} />
            My attendance
          </button>
          <button
            className="secondary"
            onClick={() => navigate("profile", "requests", "leave")}
          >
            <Palmtree size={17} /> Request leave
          </button>
          <button className="secondary" onClick={() => navigate("holidays")}>
            <CalendarDays size={17} /> Holidays
          </button>
        </div>
      </section>
      <div className="dashboard-grid">
        <section className="punch-card">
          <div className="row between">
            <span className="eyebrow light">TODAY’S ATTENDANCE</span>
            <span className="punch-state">
              <span className="live-dot" />
              {state === "working"
                ? "Working"
                : state === "break"
                  ? "On break"
                  : state === "done"
                    ? "Day complete"
                    : "Not checked in"}
            </span>
          </div>
          <h2>
            {state === "working"
              ? "You are checked in."
              : state === "break"
                ? "Break in progress."
                : state === "done"
                  ? "Workday complete."
                  : "Start your workday."}
          </h2>
          <div className="timer">
            {duration(work)}
            <span>net working time</span>
          </div>
          <div className="punch-facts">
            <div>
              <Clock3 size={16} />
              <span>
                Check-in<strong>{time(a?.check_in)}</strong>
              </span>
            </div>
            <div>
              <Coffee size={16} />
              <span>
                Break time<strong>{duration(breakM)}</strong>
              </span>
            </div>
            <div>
              <LogOut size={16} />
              <span>
                Check-out<strong>{time(a?.check_out)}</strong>
              </span>
            </div>
          </div>
          {stale ? (
            <>
              <p className="punch-warning">
                Your open shift is from {a.day}. Submit a correction to close
                it.
              </p>
              <button
                className="punch-primary"
                onClick={() => navigate("profile", "requests", "correction")}
              >
                Request correction <ArrowRight size={17} />
              </button>
            </>
          ) : (
            <div className="punch-actions">
              {state === "out" ? (
                <button
                  disabled={busy}
                  className="punch-primary"
                  onClick={() => punch("check_in")}
                >
                  <LogIn size={18} /> Check in <ArrowRight size={18} />
                </button>
              ) : state === "done" ? (
                <button
                  className="punch-primary"
                  onClick={() => navigate("attendance")}
                >
                  View your attendance <ArrowRight size={18} />
                </button>
              ) : (
                <>
                  <button
                    disabled={busy}
                    className="punch-primary"
                    onClick={() =>
                      punch(state === "break" ? "break_end" : "break_start")
                    }
                  >
                    <Coffee size={18} />
                    {state === "break" ? "End break" : "Take a break"}
                  </button>
                  <button
                    disabled={busy}
                    className="punch-secondary"
                    onClick={() => punch("check_out")}
                  >
                    <LogOut size={18} /> Check out
                  </button>
                </>
              )}
            </div>
          )}
          <small>
            Target: {duration(settings.full_minutes)} work + up to{" "}
            {duration(settings.break_minutes)} break · after{" "}
            {settings.late_cutoff.slice(0, 5)} → half day
          </small>
        </section>
        <Panel
          title="Monthly attendance"
          sub={new Date(from + "T12:00:00Z").toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        >
          <div className="month-progress">
            <strong>
              {s.rate}
              <span>%</span>
            </strong>
            <div>
              <span className="badge present">Attendance rate</span>
              <p>Based on completed working days</p>
            </div>
          </div>
          <div className="progress-track">
            <i style={{ width: s.rate + "%" }} />
          </div>
          <div className="month-counts">
            <div>
              <strong>{s.present}</strong>
              <span>
                <i className="dot green" />
                Present
              </span>
            </div>
            <div>
              <strong>{s.leave}</strong>
              <span>
                <i className="dot purple" />
                Leave
              </span>
            </div>
            <div>
              <strong>{s.absent}</strong>
              <span>
                <i className="dot coral" />
                Absent
              </span>
            </div>
          </div>
          <button className="text-btn" onClick={() => navigate("attendance")}>
            Open attendance calendar <ArrowRight size={16} />
          </button>
        </Panel>
      </div>
      <div className="stats-grid">
        <Stat
          label="Work this month"
          value={duration(s.minutes)}
          sub="Completed shifts · net hours"
        />
        <Stat
          label="Present days"
          value={s.present}
          sub="Half days count as 0.5"
        />
        <Stat
          label="Late check-ins"
          value={s.late}
          sub={`After ${settings.late_cutoff.slice(0, 5)} ${timeZoneLabel()}`}
        />
        <Stat
          label="Unresolved shifts"
          value={s.unresolved}
          sub="Awaiting a checkout correction"
          tone={s.unresolved ? "warm" : ""}
        />
      </div>
      <Panel
        title="My requests"
        sub={
          mineTotal
            ? `${mineTotal} request${mineTotal === 1 ? "" : "s"} waiting for review`
            : "Leave, week-off and correction requests"
        }
        actions={<Badge value={mineTotal ? "pending" : "approved"} />}
      >
        <div className="attention-list">
          <button
            className="attention-row"
            onClick={() => navigate("profile", "requests", "leave")}
          >
            <span className="attention-icon leave">
              <Palmtree size={17} />
            </span>
            <span>
              <strong>Leave requests</strong>
              <small>{mine?.leave ?? 0} pending</small>
            </span>
            <ArrowRight size={16} />
          </button>
          <button
            className="attention-row"
            onClick={() => navigate("profile", "requests", "weekoff")}
          >
            <span className="attention-icon schedule">
              <Coffee size={17} />
            </span>
            <span>
              <strong>Week-off requests</strong>
              <small>{mine?.weekoff ?? 0} pending</small>
            </span>
            <ArrowRight size={16} />
          </button>
          <button
            className="attention-row"
            onClick={() => navigate("profile", "requests", "correction")}
          >
            <span className="attention-icon correction">
              <FileCheck2 size={17} />
            </span>
            <span>
              <strong>Correction requests</strong>
              <small>{mine?.correction ?? 0} pending</small>
            </span>
            <ArrowRight size={16} />
          </button>
        </div>
      </Panel>
      <div className="two-col">
        <Panel
          title="Weekly hours"
          sub="Net working hours over the last 7 calendar days"
        >
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={week}>
                <defs>
                  <linearGradient id="hours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#48886b" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#48886b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} width={28} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="hours"
                  stroke="#43846a"
                  fill="url(#hours)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel
          title="Upcoming holidays"
          sub="Company holiday calendar"
          actions={<CalendarDays size={20} />}
        >
          {holidays.length ? (
            holidays.map((h) => (
              <div className="holiday-line" key={h.id}>
                <div className="date-tile">
                  <strong>{h.day.slice(8)}</strong>
                  <small>
                    {new Date(h.day + "T00:00:00").toLocaleDateString("en", {
                      month: "short",
                    })}
                  </small>
                </div>
                <div>
                  <strong>{h.name}</strong>
                  <p>{displayDate(h.day)}</p>
                </div>
                <Badge value="holiday" />
              </div>
            ))
          ) : (
            <Empty
              text="No upcoming holidays"
              sub="Your manager can add dates to the calendar."
            />
          )}
          <button
            className="text-btn"
            onClick={() => navigate("profile", "requests", "leave")}
          >
            Request leave <ArrowRight size={16} />
          </button>
        </Panel>
      </div>
      {profile.role === "manager" && (
        <Panel
          title="Team attendance today"
          sub="Latest check-ins and current status"
          actions={
            <button className="secondary" onClick={() => navigate("approvals")}>
              Open approvals <ArrowRight size={16} />
            </button>
          }
        >
          <Table
            rows={team}
            columns={[
              { title: "Employee", render: (r) => <strong>{r.name}</strong> },
              { title: "Status", render: (r) => <Badge value={r.status} /> },
              {
                title: "In / Out",
                render: (r) => `${time(r.check_in)} / ${time(r.check_out)}`,
              },
              { title: "Work time", render: (r) => duration(r.work_minutes) },
              { title: "Break", render: (r) => duration(r.break_minutes) },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

export function Attendance() {
  const { profile, version, busy, act, navigate } = useApp(),
    [pid, setPid] = useState(profile.id),
    [month, setMonth] = useState(today().slice(0, 7)),
    [view, setView] = useState("calendar"),
    [selected, setSelected] = useState<Row | null>(null),
    [override, setOverride] = useState(false);
  const [from, to] = monthRange(month);
  const q = useData(
    () => rpc<Row[]>("calendar", { p_profile: pid, p_from: from, p_to: to }),
    [pid, month, version],
    cacheKey("attendance", pid, month),
  );
  const details = useData(
    async () =>
      selected
        ? result<Row | null>(
            db
              .from("attendance")
              .select("*,breaks(*)")
              .eq("profile_id", pid)
              .eq("day", selected.day)
              .maybeSingle(),
          )
        : null,
    [pid, selected?.day, version],
  );
  const changeMonth = (n: number) => {
    const d = new Date(from + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const row = selected && q.data?.find((r) => r.day === selected.day);
  return (
    <>
      <div className="toolbar">
        <div className="row">
          <button
            className="icon-btn"
            onClick={() => changeMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="month"
            aria-label="Month"
            required
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
          <button
            className="icon-btn"
            onClick={() => changeMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
          <ProfileSelect value={pid} onChange={setPid} />
        </div>
        <div className="row">
          <div className="segmented">
            <button
              className={view === "calendar" ? "selected" : ""}
              onClick={() => setView("calendar")}
            >
              Calendar
            </button>
            <button
              className={view === "list" ? "selected" : ""}
              onClick={() => setView("list")}
            >
              List
            </button>
          </div>
          <button
            className="secondary"
            disabled={!q.data?.length}
            onClick={() =>
              act(
                async () => csv(`attendance-${month}`, q.data!),
                "CSV downloaded",
              )
            }
          >
            <Download size={16} /> Export
          </button>
        </div>
      </div>
      {q.loading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={q.reload} />
      ) : (
        <Panel>
          <div className="legend">
            {[
              "present",
              "half_day",
              "absent",
              "leave",
              "weekoff",
              "holiday",
            ].map((s) => (
              <Badge key={s} value={s} />
            ))}
          </div>
          {view === "calendar" ? (
            <div className="calendar">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div className="weekday" key={d}>
                  {d}
                </div>
              ))}
              {Array.from(
                { length: (new Date(from + "T00:00:00Z").getUTCDay() + 6) % 7 },
                (_, i) => (
                  <div className="calendar-blank" key={"empty" + i} />
                ),
              )}
              {q.data!.map((r) => (
                <button
                  className={`calendar-day ${r.day === today() ? "today" : ""}`}
                  key={r.day}
                  onClick={() => setSelected(r)}
                >
                  <span>
                    {Number(r.day.slice(8))}
                    {r.day === today() && <small>Today</small>}
                  </span>
                  <Badge value={r.status} />
                  {r.check_in && (
                    <small>
                      {time(r.check_in)} · {duration(r.work_minutes)}
                    </small>
                  )}
                  {r.leave_tag && <small>{r.leave_tag}</small>}
                  {r.holiday && <small>{r.holiday}</small>}
                </button>
              ))}
            </div>
          ) : (
            <Table
              rows={q.data!}
              columns={[
                {
                  title: "Date",
                  render: (r) => (
                    <button className="text-btn" onClick={() => setSelected(r)}>
                      {displayDate(r.day)}
                    </button>
                  ),
                },
                { title: "Status", render: (r) => <Badge value={r.status} /> },
                { title: "Check-in", render: (r) => time(r.check_in) },
                { title: "Check-out", render: (r) => time(r.check_out) },
                { title: "Net work", render: (r) => duration(r.work_minutes) },
                { title: "Break", render: (r) => duration(r.break_minutes) },
                {
                  title: "Flags",
                  render: (r) =>
                    [
                      r.late && "Late",
                      r.excess_break && "Excess break",
                      r.missing_checkout && "Missing checkout",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—",
                },
              ]}
            />
          )}
        </Panel>
      )}
      {selected && (
        <Modal
          title={displayDate(selected.day)}
          onClose={() => {
            setSelected(null);
            setOverride(false);
          }}
        >
          {row && (
            <div className="detail-content">
              <Badge value={row.status} />
              <div className="detail-grid">
                <div>
                  Check-in<strong>{time(row.check_in)}</strong>
                </div>
                <div>
                  Check-out<strong>{time(row.check_out)}</strong>
                </div>
                <div>
                  Working time<strong>{duration(row.work_minutes)}</strong>
                </div>
                <div>
                  Break time<strong>{duration(row.break_minutes)}</strong>
                </div>
              </div>
              {row.override_reason && (
                <p>Manager note: {row.override_reason}</p>
              )}
              {row.source === "correction" && (
                <p className="hint">
                  Corrected attendance. Break placement is reconstructed from
                  the approved total; original times are in the audit trail.
                </p>
              )}
              {details.loading ? (
                <Loading />
              ) : details.error ? (
                <ErrorBox error={details.error} />
              ) : (
                <div className="timeline">
                  {details.data?.breaks
                    ?.sort((a: Row, b: Row) =>
                      a.started_at.localeCompare(b.started_at),
                    )
                    .map((b: Row, i: number) => (
                      <div key={b.id}>
                        <Coffee size={15} />
                        <span>Break {i + 1}</span>
                        <strong>
                          {time(b.started_at)} → {time(b.ended_at)}
                        </strong>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
          {profile.role === "manager" ? (
            <>
              <div className="row padded">
                <button
                  className="secondary"
                  onClick={() => setOverride(!override)}
                >
                  Mark attendance
                </button>
                <button
                  className="secondary"
                  onClick={() => navigate("leaves")}
                >
                  Add leave
                </button>
                <button
                  className="text-btn"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        result(
                          db
                            .from("overrides")
                            .delete()
                            .eq("profile_id", pid)
                            .eq("day", selected.day),
                        ),
                      "Manual override cleared",
                    )
                  }
                >
                  Clear override
                </button>
              </div>
              {override && (
                <form
                  className="padded"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    if (
                      await act(() =>
                        result(
                          db.from("overrides").upsert(
                            {
                              profile_id: pid,
                              day: selected.day,
                              status: fd.get("status"),
                              reason: fd.get("reason"),
                              changed_by: profile.id,
                              updated_at: new Date().toISOString(),
                            },
                            { onConflict: "profile_id,day" },
                          ),
                        ),
                      )
                    )
                      setSelected(null);
                  }}
                >
                  <label>
                    Status
                    <select name="status">
                      {["present", "half_day", "absent", "weekoff"].map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Reason
                    <textarea required minLength={3} name="reason" />
                  </label>
                  <p className="hint">
                    An override changes the calendar status. It does not alter
                    punches or leave balances. Use Leave requests to add or
                    cancel leave.
                  </p>
                  <button disabled={busy}>Save attendance</button>
                </form>
              )}
            </>
          ) : (
            <div className="padded">
              <button
                className="secondary"
                onClick={() => navigate("profile", "requests", "correction")}
              >
                Request a correction
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

export function Leaves({ selfOnly = false }: { selfOnly?: boolean } = {}) {
  const { profile, version, busy, act, people } = useApp(),
    [pid, setPid] = useState(profile.id),
    [year, setYear] = useState(Number(today().slice(0, 4))),
    [open, setOpen] = useState(false);
  const q = useData(
    async () => {
      const [types, balances, leaves] = await Promise.all([
        allRows("leave_types"),
        rpc<Row[]>("leave_balance", { p_profile: pid, p_year: year }),
        allRows("leaves", (q) =>
          q
            .eq("profile_id", pid)
            .gte("start_date", `${year}-01-01`)
            .lte("start_date", `${year}-12-31`),
        ),
      ]);
      return {
        types,
        balances,
        leaves: leaves.sort((a, b) => b.created_at.localeCompare(a.created_at)),
      };
    },
    [pid, year, version],
    cacheKey("leaves", pid, year),
  );
  const fields: Field[] = [
    {
      name: "type",
      label: "Leave type",
      type: "select",
      options: q.data?.types
        .filter((t) => t.active)
        .map((t) => ({ value: t.id, label: `${t.name} (${t.tag})` })),
    },
    { name: "start", label: "From", type: "date", value: today() },
    { name: "end", label: "To", type: "date", value: today() },
    { name: "half", label: "Half day (single date only)", type: "checkbox" },
    { name: "reason", label: "Reason", type: "textarea" },
  ];
  return (
    <>
      <div className="toolbar">
        <div className="row">
          {!selfOnly && <ProfileSelect value={pid} onChange={setPid} />}
          <input
            aria-label="Year"
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
        <button
          disabled={!q.data?.types.some((t) => t.active)}
          onClick={() => setOpen(true)}
        >
          <Plus size={17} />{" "}
          {profile.role === "manager" ? "Add leave" : "Apply for leave"}
        </button>
      </div>
      {q.loading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} retry={q.reload} />
      ) : (
        <>
          <div className="balance-grid">
            {q.data!.balances.map((b) => (
              <div className="balance-card" key={b.type_id}>
                <span className="eyebrow">{b.tag}</span>
                <h3>{b.name}</h3>
                <strong>
                  {b.unlimited ? "∞" : Number(b.available)}
                  <small> days available</small>
                </strong>
                <p>
                  {b.used} used · {b.pending} pending ·{" "}
                  {b.unlimited
                    ? "Unlimited"
                    : `${b.entitlement} annual entitlement`}
                </p>
              </div>
            ))}
          </div>
          <Panel
            title="Leave requests"
            sub="Pending requests reserve your balance. Holidays and scheduled week-offs are excluded."
          >
            <Table
              rows={q.data!.leaves}
              columns={[
                {
                  title: "Leave",
                  render: (r) => (
                    <strong>
                      {q.data!.types.find((t) => t.id === r.type_id)?.tag}
                    </strong>
                  ),
                },
                {
                  title: "Dates",
                  render: (r) => (
                    <>
                      {displayDate(r.start_date)}
                      {r.start_date !== r.end_date
                        ? " → " + displayDate(r.end_date)
                        : ""}
                    </>
                  ),
                },
                { title: "Days", render: (r) => r.days },
                {
                  title: "Reason / review",
                  render: (r) => (
                    <div className="wrap">
                      {r.reason}
                      {r.review_note && (
                        <small className="block muted">
                          Manager: {r.review_note}
                        </small>
                      )}
                    </div>
                  ),
                },
                { title: "Status", render: (r) => <Badge value={r.status} /> },
                {
                  title: "Action",
                  render: (r) =>
                    ["approved", "pending"].includes(r.status) ? (
                      <button
                        disabled={busy}
                        className="text-btn danger"
                        onClick={() =>
                          act(
                            () => rpc("cancel_leave", { p_id: r.id }),
                            "Leave cancelled",
                          )
                        }
                      >
                        Cancel
                      </button>
                    ) : (
                      "—"
                    ),
                },
              ]}
            />
          </Panel>
        </>
      )}
      {open && (
        <FormModal
          title={`Leave · ${people.find((p) => p.id === pid)?.name}`}
          fields={fields}
          busy={busy}
          onClose={() => setOpen(false)}
          onSave={async (v) => {
            if (
              await act(
                () =>
                  rpc("apply_leave", {
                    p_profile: pid,
                    p_type: v.type,
                    p_start: v.start,
                    p_end: v.end,
                    p_half: v.half,
                    p_reason: v.reason,
                  }),
                profile.role === "manager"
                  ? "Leave added and approved"
                  : "Leave request sent",
              )
            )
              setOpen(false);
          }}
        >
          <p className="hint">
            Manager-added leave is approved immediately. Annual quotas reset
            each January; submit separate requests for different years.
          </p>
        </FormModal>
      )}
    </>
  );
}

export function Weekoffs({ selfOnly = false }: { selfOnly?: boolean } = {}) {
  const { profile, people, settings, version, busy, act, navigate } = useApp(),
    [pid, setPid] = useState(profile.id),
    [open, setOpen] = useState(false);
  const manager = profile.role === "manager";
  const p = people.find((x) => x.id === pid) ?? profile;
  const mode = settings.weekoff_planning || "employee";
  const workweek = Number(settings.workweek_days ?? 5);
  const canPlan = manager || mode !== "manager";
  const requestMode = !manager && mode === "request";
  const limitText =
    workweek === 6
      ? "6 working days · 1 week off"
      : workweek === 5.5
        ? "5.5 working days · 1 or 2 week offs (alternating)"
        : "5 working days · 2 week offs";
  const q = useData(
    () =>
      allRows("weekoffs", (q) =>
        q
          .eq("profile_id", pid)
          .gte("day", addDays(today(), -90))
          .lte("day", addDays(today(), 365)),
      ),
    [pid, version],
    cacheKey("weekoffs", pid),
  );
  const canRemove = (r: Row) =>
    manager ||
    (canPlan &&
      r.day >= today() &&
      (!r.status || r.status === "pending" || r.status === "approved"));
  return (
    <>
      <div className="toolbar">
        {!selfOnly && <ProfileSelect value={pid} onChange={setPid} />}
        {canPlan && (
          <button onClick={() => setOpen(true)}>
            <Plus size={17} /> {requestMode ? "Request week off" : "Add week off"}
          </button>
        )}
        {manager && mode === "request" && (
          <button className="secondary" onClick={() => navigate("approvals")}>
            Review requests
          </button>
        )}
      </div>
      <div className="info-strip">
        <Coffee size={23} />
        <div>
          <strong>{limitText}</strong>
          <p>
            Fixed off days:{" "}
            {p.fixed_off?.length
              ? p.fixed_off
                  .map(
                    (n: number) =>
                      [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ][n],
                  )
                  .join(", ")
              : "None"}
            . Fixed days count toward the weekly allowance; flexible offs fill
            the remainder.
          </p>
          <p>
            {manager
              ? "Managers can add or remove week offs for anyone. Requests waiting for review appear in the approval inbox."
              : mode === "manager"
                ? "Your administrator plans week offs for the team. You can view the scheduled dates here."
                : requestMode
                  ? "Choose today or a future date within 90 days. Your administrator will approve or reject the request."
                  : "Choose today or a future date within 90 days. Your week off is added immediately."}
          </p>
        </div>
      </div>
      <Panel
        title={requestMode ? "Your week-off requests" : "Week-off schedule"}
        sub="Showing the last 90 days and the next year"
      >
        {q.loading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={q.reload} />
        ) : (
          <Table
            rows={q.data!.sort((a, b) => b.day.localeCompare(a.day))}
            columns={[
              {
                title: "Date",
                render: (r) => (
                  <>
                    <strong>{displayDate(r.day)}</strong>
                    <small className="block muted">
                      {new Date(r.day + "T00:00:00").toLocaleDateString("en", {
                        weekday: "long",
                      })}
                    </small>
                  </>
                ),
              },
              {
                title: "Status",
                render: (r) => <Badge value={r.status ?? "approved"} />,
              },
              {
                title: "Reason / note",
                render: (r) => (
                  <div className="wrap">
                    {r.reason || "—"}
                    {r.review_note && (
                      <small className="block muted">
                        Review: {r.review_note}
                      </small>
                    )}
                  </div>
                ),
              },
              ...(canPlan
                ? [
                    {
                      title: "Action",
                      render: (r: Row) =>
                        canRemove(r) ? (
                          <button
                            disabled={busy}
                            className="text-btn danger"
                            onClick={() =>
                              act(
                                () =>
                                  saveWeekoff({
                                    p_profile: pid,
                                    p_day: r.day,
                                    p_remove: true,
                                  }),
                                manager
                                  ? "Week off removed"
                                  : "Week-off request cancelled",
                              )
                            }
                          >
                            {r.status === "pending" ? "Cancel" : "Remove"}
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Panel>
      {open && canPlan && (
        <FormModal
          title={
            manager
              ? `Add week off for ${p.name}`
              : requestMode
                ? "Request a week off"
                : "Plan a week off"
          }
          busy={busy}
          onClose={() => setOpen(false)}
          fields={[
            {
              name: "day",
              label: "Week-off date",
              type: "date",
              value: today(),
              min: manager ? undefined : today(),
            },
            {
              name: "reason",
              label: requestMode ? "Reason for request" : "Note (optional)",
              type: "textarea",
              required: requestMode,
            },
          ]}
          onSave={async (v) => {
            if (
              await act(
                () =>
                  saveWeekoff({
                    p_profile: pid,
                    p_day: v.day,
                    p_remove: false,
                    p_reason: v.reason ?? "",
                  }),
                requestMode
                  ? "Week-off request sent for approval"
                  : "Week off scheduled",
              )
            )
              setOpen(false);
          }}
        >
          <p className="hint">
            {manager
              ? "Manager additions are approved immediately. Use Approvals for employee requests."
              : requestMode
                ? "Your administrator will review this request. You can cancel it before the date."
                : "This date becomes an approved off day immediately."}
          </p>
        </FormModal>
      )}
    </>
  );
}
const correctionKinds = [
  { value: "full_day", label: "Full day (check-in + check-out)" },
  { value: "check_in", label: "Check-in only" },
  { value: "check_out", label: "Check-out only" },
  { value: "break", label: "Break correction" },
];

function breakTotal(breaks?: Row[]) {
  return Math.round(
    (breaks ?? []).reduce((sum, b) => {
      if (!b.ended_at) return sum;
      return (
        sum +
        (new Date(b.ended_at).getTime() - new Date(b.started_at).getTime()) /
          60000
      );
    }, 0),
  );
}

function CorrectionModal({
  pid,
  onClose,
}: {
  pid: string;
  onClose: () => void;
}) {
  const { version, busy, act } = useApp();
  const [kind, setKind] = useState("full_day");
  const [day, setDay] = useState(today());
  const [inTime, setInTime] = useState("09:30");
  const [outDay, setOutDay] = useState(today());
  const [outTime, setOutTime] = useState("18:30");
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [breakStart, setBreakStart] = useState("13:00");
  const [breakEnd, setBreakEnd] = useState("14:00");
  const [replaceBreaks, setReplaceBreaks] = useState(false);
  const [reason, setReason] = useState("");
  const existing = useData(
    async () =>
      result<Row | null>(
        db
          .from("attendance")
          .select("*,breaks(*)")
          .eq("profile_id", pid)
          .eq("day", day)
          .maybeSingle(),
      ),
    [pid, day, version],
  );
  useEffect(() => {
    const row = existing.data;
    if (!row) return;
    setInTime(clockInput(row.check_in) || "09:30");
    setOutDay(zonedDate(row.check_out || row.check_in) || day);
    setOutTime(clockInput(row.check_out) || "18:30");
    const total = breakTotal(row.breaks);
    if (total) setBreakMinutes(total);
    const first = row.breaks?.[0];
    const last = row.breaks?.[row.breaks.length - 1];
    if (first) setBreakStart(clockInput(first.started_at));
    if (last?.ended_at) setBreakEnd(clockInput(last.ended_at));
  }, [existing.data]);
  const needsAttendance = kind === "check_out" || kind === "break";
  const missing = needsAttendance && !existing.loading && !existing.data;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) return;
    const args: Row = {
      p_profile: pid,
      p_kind: kind,
      p_day: day,
      p_reason: reason.trim(),
    };
    if (kind === "full_day") {
      args.p_in = zonedISO(day, inTime);
      args.p_out = zonedISO(outDay, outTime);
      args.p_break = Number(breakMinutes);
    } else if (kind === "check_in") {
      args.p_in = zonedISO(day, inTime);
    } else if (kind === "check_out") {
      args.p_out = zonedISO(outDay, outTime);
    } else {
      args.p_break_start = zonedISO(day, breakStart);
      args.p_break_end = zonedISO(day, breakEnd);
      args.p_replace_breaks = replaceBreaks;
    }
    if (
      await act(
        () => rpc("request_regularization", args),
        "Regularization request submitted",
      )
    )
      onClose();
  }
  return (
    <Modal title="Request attendance regularization" onClose={onClose}>
      <form className="correction-form" onSubmit={submit}>
        <div className="correction-kind">
          <label>
            <span>What do you need to correct?</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {correctionKinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Work date ({timeZoneLabel()})</span>
            <DatePicker
              value={day}
              max={today()}
              onChange={(value) => {
                setDay(value);
                setOutDay(value);
              }}
            />
          </label>
        </div>
        <div className="existing-punch">
          {existing.loading ? (
            <Loading />
          ) : existing.data ? (
            <>
              <strong>Existing record</strong>
              <span>
                {time(existing.data.check_in)} → {time(existing.data.check_out)}{" "}
                · {breakTotal(existing.data.breaks)} min break
              </span>
            </>
          ) : (
            <span>No attendance record exists for this date.</span>
          )}
        </div>
        {kind === "full_day" && (
          <div className="form-grid">
            <label>
              <span>Check-in ({timeZoneLabel()})</span>
              <TimePicker value={inTime} onChange={setInTime} />
            </label>
            <label>
              <span>Checkout time ({timeZoneLabel()})</span>
              <TimePicker value={outTime} onChange={setOutTime} />
            </label>
            <label>
              <span>Checkout date</span>
              <DatePicker
                value={outDay}
                min={day}
                max={addDays(today(), 1)}
                onChange={setOutDay}
              />
            </label>
            <label>
              <span>Total break minutes</span>
              <input
                required
                type="number"
                min={0}
                max={480}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Number(e.target.value))}
              />
            </label>
          </div>
        )}
        {kind === "check_in" && (
          <div className="form-grid">
            <label>
              <span>Check-in time ({timeZoneLabel()})</span>
              <TimePicker value={inTime} onChange={setInTime} />
            </label>
          </div>
        )}
        {kind === "check_out" && (
          <div className="form-grid">
            <label>
              <span>Check-out time ({timeZoneLabel()})</span>
              <TimePicker value={outTime} onChange={setOutTime} />
            </label>
            <label>
              <span>Checkout date</span>
              <DatePicker
                value={outDay}
                min={day}
                max={addDays(today(), 1)}
                onChange={setOutDay}
              />
            </label>
          </div>
        )}
        {kind === "break" && (
          <div className="form-grid">
            <label>
              <span>Break start ({timeZoneLabel()})</span>
              <TimePicker value={breakStart} onChange={setBreakStart} />
            </label>
            <label>
              <span>Break end ({timeZoneLabel()})</span>
              <TimePicker value={breakEnd} onChange={setBreakEnd} />
            </label>
            <label className="check-line wide">
              <input
                type="checkbox"
                checked={replaceBreaks}
                onChange={(e) => setReplaceBreaks(e.target.checked)}
              />
              Replace all existing break records for this day
            </label>
          </div>
        )}
        <label>
          <span>Reason *</span>
          <textarea
            required
            minLength={3}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain what happened, for example: forgot to check in after arriving at the office."
          />
        </label>
        {missing && (
          <ErrorBox error="No check-in exists for this date. Submit a check-in correction first." />
        )}
        <p className="hint">
          Only the selected part of the day is changed. You can submit separate
          requests for check-in, check-out and breaks on the same date. Every
          change is recorded in the audit trail after manager approval.
        </p>
        <footer className="modal-footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy || missing} type="submit">
            {busy ? "Saving…" : "Submit request"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function Corrections({ selfOnly = false }: { selfOnly?: boolean } = {}) {
  const { profile, version, busy, act } = useApp(),
    [open, setOpen] = useState(false),
    [pid, setPid] = useState(profile.id);
  const q = useData(
    () =>
      allRows("regularizations", (q) =>
        q.eq("profile_id", pid).gte("day", addDays(today(), -365)),
      ),
    [pid, version],
    cacheKey("corrections", pid),
  );
  return (
    <>
      <div className="toolbar">
        <div className="row">
          {!selfOnly && <ProfileSelect value={pid} onChange={setPid} />}
          <p className="muted">
            Fix a missing punch, checkout or break with a partial request.
          </p>
        </div>
        <button onClick={() => setOpen(true)}>
          <Plus size={17} /> Request regularization
        </button>
      </div>
      <Panel
        title="Regularization requests"
        sub="Last 12 months · Only the approved part of the day is replaced"
      >
        {q.loading ? (
          <Loading />
        ) : q.error ? (
          <ErrorBox error={q.error} retry={q.reload} />
        ) : (
          <Table
            rows={q.data!.sort((a, b) =>
              b.created_at.localeCompare(a.created_at),
            )}
            columns={[
              { title: "Work date", render: (r) => displayDate(r.day) },
              {
                title: "Type",
                render: (r) => <Badge value={r.kind || "full_day"} />,
              },
              {
                title: "Requested",
                render: (r) => (
                  <>
                    {regularizationDetail(r)}
                    {r.reason && (
                      <small className="block muted">{r.reason}</small>
                    )}
                  </>
                ),
              },
              {
                title: "Review",
                render: (r) =>
                  r.review_note ? (
                    <span className="wrap">{r.review_note}</span>
                  ) : (
                    "—"
                  ),
              },
              { title: "Status", render: (r) => <Badge value={r.status} /> },
              {
                title: "Action",
                render: (r) =>
                  r.status === "pending" ? (
                    <button
                      className="text-btn danger"
                      disabled={busy}
                      onClick={() =>
                        act(
                          () => rpc("cancel_correction", { p_id: r.id }),
                          "Request cancelled",
                        )
                      }
                    >
                      Cancel
                    </button>
                  ) : (
                    "—"
                  ),
              },
            ]}
          />
        )}
      </Panel>
      {open && <CorrectionModal pid={pid} onClose={() => setOpen(false)} />}
    </>
  );
}
