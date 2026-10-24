import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

export type Row = Record<string, any>;
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(
  supabaseUrl?.startsWith("https://") &&
    supabaseKey &&
    !supabaseUrl.includes("YOUR_PROJECT") &&
    !supabaseKey.includes("YOUR_SUPABASE"),
);
export const db = createClient(
  configured ? supabaseUrl : "https://unconfigured.supabase.co",
  configured ? supabaseKey : "unconfigured",
  {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
export async function result<T = Row[]>(
  query: PromiseLike<{ data: T | null; error: any }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}
export const rpc = <T = any>(name: string, args: Row = {}) =>
  result<T>(db.rpc(name, args));
export async function calendars(people: Row[], from: string, to: string) {
  const rows: Row[] = [];
  for (let i = 0; i < people.length; i += 5) {
    const batch = await Promise.all(
      people.slice(i, i + 5).map(async (p) =>
        (
          await rpc<Row[]>("calendar", {
            p_profile: p.id,
            p_from: from,
            p_to: to,
          })
        ).map((r) => ({
          ...r,
          profile_id: p.id,
          name: p.name,
          email: p.email,
          employee_code: p.employee_code,
          department: p.department,
        })),
      ),
    );
    rows.push(...batch.flat());
  }
  return rows;
}
export async function allRows(
  table: string,
  setup?: (q: any) => any,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 500) {
    let q: any = db.from(table).select("*").order("id");
    if (setup) q = setup(q);
    const batch = await result<Row[]>(q.range(from, from + 499));
    out.push(...batch);
    if (batch.length < 500) return out;
  }
}

/* Backward compatibility: databases without migration 0005 have no
   weekoffs.status column (all rows are effectively approved). */
export function isMissingStatusColumn(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "");
  return (
    /weekoffs\.status/i.test(msg) ||
    (/status/i.test(msg) &&
      (/does not exist/i.test(msg) ||
        /could not find/i.test(msg) ||
        /column/i.test(msg)))
  );
}

export async function weekoffsByStatus(status: string): Promise<Row[]> {
  try {
    return await allRows("weekoffs", (q) => q.eq("status", status));
  } catch (err) {
    if (!isMissingStatusColumn(err)) throw err;
    const all = await allRows("weekoffs");
    if (status === "pending") return [];
    if (status === "approved") return all;
    return all.filter((w) => (w.status ?? "approved") === status);
  }
}

export async function saveWeekoff(args: Row): Promise<void> {
  try {
    await rpc("set_weekoff", args);
  } catch (err) {
    const msg = String((err as any)?.message ?? "");
    if (!/set_weekoff|p_reason|function|signature|argument/i.test(msg))
      throw err;
    const { p_reason: _drop, ...legacy } = args;
    await rpc("set_weekoff", legacy);
  }
}

/* ------------------------------------------------------------------ */
/* Lightweight browser cache (stale-while-revalidate, local only)      */
/* ------------------------------------------------------------------ */

const CACHE_PREFIX = "workforce.cache.v1.";
const CACHE_TTL = 12 * 60 * 60 * 1000;

export function cacheKey(...parts: (string | number | null | undefined)[]) {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== "")
    .map((p) => String(p).replaceAll(":", "_"))
    .join(":");
}
function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
export function readCache<T = any>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { at: number; value: T };
    if (!saved || Date.now() - saved.at > CACHE_TTL) {
      store.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return saved.value;
  } catch {
    return null;
  }
}
export function writeCache<T = any>(key: string, value: T) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ at: Date.now(), value }),
    );
  } catch {
    /* Storage can be full or disabled. Caching is optional. */
  }
}
export function clearCache(keep: string[] = []) {
  const store = storage();
  if (!store) return;
  const keepFull = keep.map((k) => CACHE_PREFIX + k);
  for (let i = store.length - 1; i >= 0; i--) {
    const key = store.key(i);
    if (key?.startsWith(CACHE_PREFIX) && !keepFull.includes(key)) {
      store.removeItem(key);
    }
  }
}

export function useData<T>(
  load: () => Promise<T>,
  deps: unknown[],
  cache?: string,
) {
  const cached = cache ? readCache<T>(cache) : null;
  const dataRef = useRef<T | null>(cached);
  const cacheRef = useRef(cache);
  const [data, setData] = useState<T | null>(cached),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(cached === null),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    if (cache !== cacheRef.current) {
      cacheRef.current = cache;
      const next = cache ? readCache<T>(cache) : null;
      dataRef.current = next;
      setData(next);
    }
    if (dataRef.current === null) setLoading(true);
    setError("");
    load()
      .then((v) => {
        if (!alive) return;
        dataRef.current = v;
        setData(v);
        if (cache) writeCache(cache, v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [...deps, version, cache]);
  return {
    data,
    error,
    loading,
    reload: useCallback(() => setVersion((v) => v + 1), []),
  };
}

/* ------------------------------------------------------------------ */
/* Time zone helpers                                                   */
/* ------------------------------------------------------------------ */

const FALLBACK_ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];
const ZONE_SHORT: Record<string, string> = {
  "Asia/Kolkata": "IST",
  "Asia/Karachi": "PKT",
  "Asia/Kathmandu": "NPT",
  "Asia/Dubai": "GST",
  "Asia/Singapore": "SGT",
  "Asia/Tokyo": "JST",
  "Asia/Hong_Kong": "HKT",
  "Asia/Seoul": "KST",
  "Asia/Bangkok": "ICT",
  "Asia/Jakarta": "WIB",
  "Asia/Manila": "PHT",
  "Australia/Perth": "AWST",
  "Australia/Sydney": "AET",
  "Europe/London": "UK",
  "Europe/Berlin": "CET",
  "Europe/Paris": "CET",
  "America/New_York": "ET",
  "America/Chicago": "CT",
  "America/Denver": "MT",
  "America/Los_Angeles": "PT",
  UTC: "UTC",
};
const ZONE_LONG: Record<string, string> = {
  UTC: "Coordinated Universal Time",
};
const PREFERRED_ZONES = [
  "Asia/Kolkata",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];
/** Older ICU releases expose this alias instead of Asia/Kolkata. */
const LEGACY_ZONE_ALIASES = new Set(["Asia/Calcutta"]);
let activeTimeZone = "Asia/Kolkata";

function zoneNamePart(
  tz: string,
  type: "shortGeneric" | "longGeneric" | "long",
) {
  try {
    const part = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: type,
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? "";
  } catch {
    return "";
  }
}
export function timeZoneOffsetLabel(tz = activeTimeZone) {
  try {
    const part = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return (part?.value ?? "").replace("GMT", "UTC") || "UTC";
  } catch {
    return "UTC";
  }
}

export function validTimeZone(tz?: string | null) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
export function getTimeZone() {
  return activeTimeZone;
}
export function setTimeZone(tz?: string | null) {
  if (validTimeZone(tz)) activeTimeZone = tz!;
}
export function timeZoneOptions() {
  let zones: string[] = [];
  try {
    zones = ((Intl as any).supportedValuesOf?.("timeZone") as string[]) ?? [];
  } catch {
    zones = [];
  }
  const all = new Set([
    ...FALLBACK_ZONES,
    ...zones.filter((z) => !LEGACY_ZONE_ALIASES.has(z)),
    ...Object.keys(ZONE_SHORT),
    activeTimeZone,
  ]);
  return [
    ...PREFERRED_ZONES.filter((z) => all.has(z)),
    ...[...all].filter((z) => !PREFERRED_ZONES.includes(z)).sort(),
  ];
}
/** Short, friendly label such as IST, PT or MT. */
export function timeZoneLabel(tz = activeTimeZone) {
  if (ZONE_SHORT[tz]) return ZONE_SHORT[tz];
  const generic = zoneNamePart(tz, "shortGeneric");
  if (generic && !/^GMT[+-]/.test(generic)) return generic;
  return timeZoneOffsetLabel(tz);
}
/** Option label such as “IST — India Standard Time (UTC+05:30)”. */
export function timeZoneOptionLabel(tz = activeTimeZone) {
  const short = timeZoneLabel(tz);
  const city = tz.split("/").pop()?.replaceAll("_", " ") ?? tz;
  const long = ZONE_LONG[tz] || zoneNamePart(tz, "longGeneric");
  const name = long && !/^GMT[+-]/.test(long) ? long : city;
  const offset = timeZoneOffsetLabel(tz);
  return ZONE_SHORT[tz]
    ? `${short} — ${name} (${offset})`
    : `${name} (${offset}) — ${city}`;
}
function zoneOffsetMs(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}
/** Build an ISO timestamp with the correct offset for a date + time in a zone. */
export function zonedISO(date: string, clock: string, tz = activeTimeZone) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = clock.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  let offset = zoneOffsetMs(guess, tz);
  offset = zoneOffsetMs(new Date(guess.getTime() - offset), tz);
  const total = Math.round(offset / 60000);
  const sign = total >= 0 ? "+" : "-";
  const abs = Math.abs(total);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  return `${date}T${clock}:00${sign}${oh}:${om}`;
}

/* ------------------------------------------------------------------ */
/* Date / formatting helpers                                           */
/* ------------------------------------------------------------------ */

export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: activeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function addDays(s: string, n: number) {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return [
    month + "-01",
    new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  ];
}
export function displayDate(d: string) {
  if (!d) return "—";
  if (d.length === 10) {
    // Date-only values are calendar dates, not instants. Format at noon UTC
    // so the displayed day never shifts with the viewer's time zone.
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(d + "T12:00:00Z"));
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: activeTimeZone,
  }).format(new Date(d));
}
export function time(d?: string | null) {
  return d
    ? new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: activeTimeZone,
      }).format(new Date(d))
    : "—";
}
export function clockInput(d?: string | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: activeTimeZone,
  }).format(new Date(d));
}
export function zonedDate(d?: string | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: activeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
}
export function duration(m: number = 0) {
  m = Math.max(0, Math.floor(m));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
export function initials(name: string) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
export const labels: Record<string, string> = {
  present: "Present",
  half_day: "Half day",
  absent: "Absent",
  leave: "On leave",
  half_leave: "Half-day leave",
  weekoff: "Week off",
  holiday: "Holiday",
  in_progress: "Working",
  missing_checkout: "Missing checkout",
  not_marked: "Not checked in",
  upcoming: "Upcoming",
  not_employed: "Not employed",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  full_day: "Full day",
  check_in: "Check-in only",
  check_out: "Check-out only",
  break: "Break correction",
};
export function regularizationDetail(r: Row) {
  if (r.kind === "check_in") return `Check-in at ${time(r.requested_in)}`;
  if (r.kind === "check_out") return `Check-out at ${time(r.requested_out)}`;
  if (r.kind === "break")
    return `Break ${time(r.break_start)} → ${time(r.break_end)}${
      r.replace_breaks ? " · replaces existing breaks" : ""
    }`;
  return `${time(r.requested_in)} → ${time(r.requested_out)}${
    r.break_minutes ? ` · ${r.break_minutes} min break` : ""
  }`;
}
export function summary(rows: Row[]) {
  let present = 0,
    absent = 0,
    leave = 0,
    late = 0,
    minutes = 0,
    unresolved = 0;
  for (const r of rows.filter((r) => r.day <= today())) {
    if (r.status === "present") present++;
    if (r.status === "half_day") {
      present += 0.5;
      absent += 0.5;
    }
    if (r.status === "absent") absent++;
    if (r.status === "leave") leave++;
    if (r.status === "half_leave") {
      leave += 0.5;
      if (r.check_out && r.work_minutes >= (r.half_required ?? 240))
        present += 0.5;
      else absent += 0.5;
    }
    if (r.status === "missing_checkout") unresolved++;
    if (r.late) late++;
    if (r.check_out) minutes += r.work_minutes;
  }
  return {
    present,
    absent,
    leave,
    late,
    minutes,
    unresolved,
    rate:
      present + absent + leave
        ? Math.round((present / (present + absent + leave)) * 100)
        : 0,
  };
}
/* ------------------------------------------------------------------ */
/* Personal interface preferences                                      */
/* ------------------------------------------------------------------ */

export type ThemePreference = "light" | "dark" | "system";
export type DensityPreference = "comfortable" | "compact";
export type Preferences = {
  theme: ThemePreference;
  density: DensityPreference;
  reduceMotion: boolean;
};
export const defaultPreferences: Preferences = {
  theme: "dark",
  density: "comfortable",
  reduceMotion: false,
};
const PREFERENCES_KEY = "workforce:preferences";
export function readPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return defaultPreferences;
    const saved = JSON.parse(raw) as Partial<Preferences>;
    return {
      theme: ["light", "dark", "system"].includes(saved.theme ?? "")
        ? (saved.theme as ThemePreference)
        : defaultPreferences.theme,
      density: ["comfortable", "compact"].includes(saved.density ?? "")
        ? (saved.density as DensityPreference)
        : defaultPreferences.density,
      reduceMotion: Boolean(saved.reduceMotion),
    };
  } catch {
    return defaultPreferences;
  }
}
export function resolvedTheme(prefs = readPreferences()): "light" | "dark" {
  if (prefs.theme !== "system") return prefs.theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
export function applyPreferences(prefs = readPreferences()) {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(prefs);
  root.dataset.density = prefs.density;
  root.dataset.reduceMotion = prefs.reduceMotion ? "true" : "false";
  root.style.colorScheme = root.dataset.theme;
}
export function savePreferences(prefs: Preferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Preference persistence is best-effort; the current session still updates.
  }
  applyPreferences(prefs);
  window.dispatchEvent(new Event("workforce:preferences"));
  return prefs;
}
export function csv(name: string, rows: Row[]) {
  if (!rows.length) throw new Error("No records to export");
  const keys = Object.keys(rows[0]);
  const cell = (x: any) => {
    let s = String(x ?? "");
    if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const content =
    "\uFEFF" +
    [
      keys.map(cell).join(","),
      ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
    ].join("\r\n");
  const href = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = href;
  a.download = name + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
