/* Screenshot harness: serves the mock-env build with a fake Supabase backend.
 * Run: npx vite build --mode screenshots && node scripts/shots.mjs
 * Output: docs/images/*.png (used by README.md). Not part of tests. */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const IMG = path.join(ROOT, "docs", "images");
mkdirSync(IMG, { recursive: true });
const shot = (n) => path.join(IMG, `${n}.png`);

const ADMIN_UID = "00000000-0000-0000-0000-000000000001";
const EMP_UID = "00000000-0000-0000-0000-000000000002";
const ADMIN_ID = "10000000-0000-0000-0000-000000000001";
const EMP1_ID = "10000000-0000-0000-0000-000000000002";
const EMP2_ID = "10000000-0000-0000-0000-000000000003";
const EMP3_ID = "10000000-0000-0000-0000-000000000004";

const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (base, n) => {
  const d = new Date(base + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};
const T = isoDay(new Date());

const SETTINGS = {
  id: 1,
  company_name: "Acme Services",
  product_name: "Workforce",
  tagline: "Attendance, leave, and team schedules in one place.",
  login_headline: "Attendance and leave, without the admin overhead.",
  login_message: "Sign in to manage attendance and leave.",
  login_footer: "Secure workspace access",
  support_email: "support@acme.example.com",
  logo_url: "",
  timezone: "Asia/Kolkata",
  full_minutes: 480,
  half_minutes: 240,
  break_minutes: 60,
  late_cutoff: "12:00:00",
  regularization_days: 7,
  weekoff_planning: "request",
  workweek_days: 5,
  bootstrap_email: "manager@acme.example.com",
  allowed_domains: ["acme.example.com"],
  setup_complete: true,
};

const PROFILES = [
  { id: ADMIN_ID, user_id: ADMIN_UID, email: "manager@acme.example.com", name: "Rishav Sharma", role: "manager", active: true, employee_code: "ACM-001", department: "Operations", designation: "Operations Manager", joining_date: "2023-04-01", exit_date: null, fixed_off: [0], phone: "+91 90000 00001", dob: "1990-05-14", avatar_url: null },
  { id: EMP1_ID, user_id: EMP_UID, email: "priya@acme.example.com", name: "Priya Nair", role: "employee", active: true, employee_code: "ACM-014", department: "Support", designation: "Support Executive", joining_date: "2024-01-15", exit_date: null, fixed_off: [0], phone: "+91 90000 00014", dob: "1995-09-02", avatar_url: null },
  { id: EMP2_ID, user_id: "00000000-0000-0000-0000-000000000003", email: "arjun@acme.example.com", name: "Arjun Mehta", role: "employee", active: true, employee_code: "ACM-021", department: "Engineering", designation: "Technician", joining_date: "2024-06-03", exit_date: null, fixed_off: [0], phone: "+91 90000 00021", dob: "1993-11-22", avatar_url: null },
  { id: EMP3_ID, user_id: "00000000-0000-0000-0000-000000000004", email: "sana@acme.example.com", name: "Sana Khan", role: "employee", active: true, employee_code: "ACM-027", department: "Support", designation: "Support Executive", joining_date: "2025-02-10", exit_date: null, fixed_off: [6], phone: "+91 90000 00027", dob: "1997-03-30", avatar_url: null },
];

const LEAVE_TYPES = [
  { id: "t-cl", name: "Casual Leave", code: "CL", annual_quota: 12, active: true, tag: "paid", unlimited: false },
  { id: "t-sl", name: "Sick Leave", code: "SL", annual_quota: 10, active: true, tag: "paid", unlimited: false },
  { id: "t-lop", name: "Loss of Pay", code: "LOP", annual_quota: 0, active: true, tag: "unpaid", unlimited: true },
];

const LEAVES = [
  { id: "l-1", profile_id: EMP1_ID, type_id: "t-cl", start_date: addDays(T, 3), end_date: addDays(T, 4), half_day: false, days: 2, reason: "Family function out of town", status: "pending", created_at: `${T}T08:10:00Z` },
  { id: "l-2", profile_id: EMP2_ID, type_id: "t-sl", start_date: addDays(T, 1), end_date: addDays(T, 1), half_day: true, days: 0.5, reason: "Fever, doctor visit", status: "pending", created_at: `${T}T07:40:00Z` },
  { id: "l-3", profile_id: EMP3_ID, type_id: "t-cl", start_date: addDays(T, -12), end_date: addDays(T, -12), half_day: false, days: 1, reason: "Bank work", status: "approved", created_at: `${addDays(T, -14)}T09:00:00Z` },
];
const LEAVE_DAYS = [
  { leave_id: "l-1", day: addDays(T, 3), amount: 1 },
  { leave_id: "l-1", day: addDays(T, 4), amount: 1 },
  { leave_id: "l-2", day: addDays(T, 1), amount: 0.5 },
  { leave_id: "l-3", day: addDays(T, -12), amount: 1 },
];
const REGULARIZATIONS = [
  { id: "r-1", profile_id: EMP2_ID, day: addDays(T, -1), kind: "check_out", requested_in: null, requested_out: `${addDays(T, -1)}T13:05:00+05:30`, break_minutes: 0, reason: "Forgot to check out after field visit", status: "pending", created_at: `${T}T08:20:00Z` },
];
const WEEKOFFS = [
  { id: "w-1", profile_id: EMP1_ID, day: addDays(T, 6), status: "pending", reason: "Cousin wedding", created_by: EMP1_ID, created_at: `${T}T06:30:00Z`, reviewed_by: null, reviewed_at: null, review_note: null },
  { id: "w-2", profile_id: EMP2_ID, day: addDays(T, -6), status: "approved", reason: "", created_by: ADMIN_ID, created_at: `${addDays(T, -8)}T10:00:00Z`, reviewed_by: ADMIN_ID, reviewed_at: `${addDays(T, -8)}T11:00:00Z`, review_note: null },
];
const HOLIDAYS = [
  { id: "h-1", day: addDays(T, 5), name: "Diwali Break" },
  { id: "h-2", day: addDays(T, 19), name: "Company Foundation Day" },
  { id: "h-3", day: addDays(T, 41), name: "Winter Holiday" },
];
const ATTENDANCE = [
  { id: "a-admin", profile_id: ADMIN_ID, day: T, check_in: `${T}T09:28:00+05:30`, check_out: null, full_minutes: 480, half_minutes: 240, allowed_break: 60, late_cutoff: "12:00:00", timezone: "Asia/Kolkata", source: "app", breaks: [{ id: "b-1", attendance_id: "a-admin", started_at: `${T}T12:30:00+05:30`, ended_at: `${T}T13:00:00+05:30` }] },
  { id: "a-emp", profile_id: EMP1_ID, day: T, check_in: `${T}T09:35:00+05:30`, check_out: null, full_minutes: 480, half_minutes: 240, allowed_break: 60, late_cutoff: "12:00:00", timezone: "Asia/Kolkata", source: "app", breaks: [] },
];
const TABLES = {
  profiles: PROFILES, settings: [SETTINGS], leaves: LEAVES, leave_days: LEAVE_DAYS,
  leave_types: LEAVE_TYPES, regularizations: REGULARIZATIONS, weekoffs: WEEKOFFS,
  holidays: HOLIDAYS, attendance: ATTENDANCE, breaks: [], overrides: [],
  leave_balances: [], audit: [],
};

function applyFilters(rows, params) {
  let out = rows.filter((r) => {
    for (const [col, raw] of params) {
      if (["select", "order", "offset", "limit"].includes(col)) continue;
      if (col === "or") continue;
      const dot = raw.indexOf(".");
      if (dot < 0) continue;
      const op = raw.slice(0, dot);
      let val = raw.slice(dot + 1);
      const cell = r[col];
      const num = (v) => (v === null || v === undefined ? v : isNaN(Number(v)) ? String(v) : Number(v));
      if (op === "eq") {
        if (Array.isArray(cell) ? !cell.map(String).includes(val) : String(cell ?? "") !== val) return false;
      } else if (op === "neq") {
        if (String(cell ?? "") === val) return false;
      } else if (op === "in") {
        const list = val.replace(/[()]/g, "").split(",");
        if (!list.includes(String(cell))) return false;
      } else if (op === "is") {
        if (val === "null" && cell !== null) return false;
        if (val === "not_null" && cell === null) return false;
      } else if (["gte", "lte", "gt", "lt"].includes(op)) {
        const c = num(cell), v = num(val);
        if (op === "gte" && !(c >= v)) return false;
        if (op === "lte" && !(c <= v)) return false;
        if (op === "gt" && !(c > v)) return false;
        if (op === "lt" && !(c < v)) return false;
      }
    }
    return true;
  });
  const limit = params.get("limit");
  if (limit) out = out.slice(0, Number(limit));
  return out;
}

function calendarRows(p_from, p_to) {
  const rows = [];
  const d = new Date(p_from + "T12:00:00Z");
  const end = new Date(p_to + "T12:00:00Z");
  while (d <= end) {
    const day = isoDay(d);
    const dow = d.getUTCDay();
    const off = Math.round((d.getTime() - new Date(T + "T12:00:00Z").getTime()) / 86400000);
    let status = "present", wm = 480 + ((off % 3) * 12), tag = null, late = false, ci = `${day}T09:32:00+05:30`, co = `${day}T18:05:00+05:30`;
    if (dow === 0 || dow === 6) { status = "weekoff"; wm = 0; ci = null; co = null; }
    if (off === -3) { status = "leave"; tag = "Casual Leave"; wm = 0; ci = null; co = null; }
    if (off === -9) { status = "half_day"; wm = 265; ci = `${day}T12:20:00+05:30`; co = `${day}T18:00:00+05:30`; late = true; }
    if (off === -15) { status = "absent"; wm = 0; ci = null; co = null; }
    if (off > 0) { status = "upcoming"; wm = 0; ci = null; co = null; }
    if (day === T) { status = "in_progress"; wm = 200; co = null; }
    rows.push({ day, status, leave_tag: tag, holiday: null, check_in: ci, check_out: co, work_minutes: wm, break_minutes: 30, late, excess_break: false, missing_checkout: false, override_reason: null, source: "app", half_required: 240 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return rows;
}

async function mockHandler(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (url.pathname === "/auth/v1/settings")
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ external: {} }) });
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "rest" && parts[1] === "v1" && parts[2] === "rpc") {
    const fn = parts[3];
    const body = req.postDataJSON?.() ?? {};
    if (fn === "branding") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([SETTINGS]) });
    if (fn === "calendar") {
      const cal = calendarRows(body.p_from ?? addDays(T, -30), body.p_to ?? T);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cal) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  }
  if (req.method() !== "GET" && req.method() !== "HEAD")
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  if (parts[0] === "rest" && parts[1] === "v1") {
    const table = parts[2];
    const rows = applyFilters(TABLES[table] ?? [], url.searchParams);
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? (rows[0] ?? {}) : rows) });
  }
  return route.continue();
}

function seedSession({ uid, email }) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const session = { access_token: "mock-jwt", token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "mock-refresh", user: { id: uid, email, role: "authenticated" } };
  window.localStorage.setItem("sb-mock-auth-token", JSON.stringify(session));
}

let server = null;
async function main() {
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", "4174", "--strictPort"], { cwd: ROOT });
  let ready = false;
  server.stdout.on("data", (d) => { if (String(d).includes("4174")) ready = true; });
  for (let i = 0; i < 60 && !ready; i++) await new Promise((r) => setTimeout(r, 500));
  if (!ready) throw new Error("preview server did not start");
  const browser = await chromium.launch();
  try {
    // ---- Admin ----
    const actx = await browser.newContext({ viewport: { width: 1360, height: 850 } });
    await actx.addInitScript(seedSession, { uid: ADMIN_UID, email: "manager@acme.example.com" });
    const a = await actx.newPage();
    await a.route("https://mock.supabase.co/**", mockHandler);
    await a.goto("http://localhost:4174", { waitUntil: "networkidle" });
    try {
      await a.getByText("TEAM OPERATIONS").waitFor({ timeout: 15000 });
    } catch (e) {
      const body = await a.textContent("body");
      console.log("ADMIN BODY:", (body ?? "").slice(0, 500));
      await a.screenshot({ path: shot("_debug-admin") });
      throw e;
    }
    await a.waitForTimeout(800);
    await a.screenshot({ path: shot("admin-dashboard") });
    await a.getByRole("button", { name: "Attendance", exact: true }).first().click();
    await a.getByText("Attendance calendar").waitFor({ timeout: 15000 });
    await a.waitForTimeout(800);
    await a.screenshot({ path: shot("attendance") });
    await a.getByRole("button", { name: "Approvals", exact: true }).click();
    await a.getByText("Awaiting review").waitFor({ timeout: 15000 });
    await a.waitForTimeout(800);
    await a.screenshot({ path: shot("approvals") });
    await a.getByRole("button", { name: "Settings", exact: true }).click();
    await a.getByText("ORGANIZATION SETTINGS").waitFor({ timeout: 15000 });
    await a.waitForTimeout(800);
    await a.screenshot({ path: shot("settings") });
    await actx.close();
    // ---- Employee ----
    const ectx = await browser.newContext({ viewport: { width: 1360, height: 850 } });
    await ectx.addInitScript(seedSession, { uid: EMP_UID, email: "priya@acme.example.com" });
    const e = await ectx.newPage();
    await e.route("https://mock.supabase.co/**", mockHandler);
    await e.goto("http://localhost:4174", { waitUntil: "networkidle" });
    await e.getByText("MY WORKSPACE").waitFor({ timeout: 15000 });
    await e.waitForTimeout(800);
    await e.screenshot({ path: shot("employee-dashboard") });
    await ectx.close();
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log("SHOTS OK");
}
main().catch((e) => { console.error(e); if (server) server.kill(); process.exit(1); });
