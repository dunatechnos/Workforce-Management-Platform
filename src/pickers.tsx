import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
import { clockInput, displayDate, today } from "./lib";

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseYmd(value?: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}
function dateString(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}
function monthCells(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= total; day++)
    cells.push(dateString(year, month, day));
  while (cells.length % 7) cells.push(null);
  return cells;
}
function useAnchoredPopover(open: boolean, onClose: () => void) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [position, setPosition] = useState<CSSProperties>({
    top: 0,
    left: 0,
    visibility: "hidden",
  });
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const popover = popoverRef.current;
      const width = popover?.offsetWidth || 360;
      const height = popover?.offsetHeight || 430;
      const left = Math.max(
        10,
        Math.min(rect.left, window.innerWidth - width - 10),
      );
      const below = rect.bottom + 9;
      const top =
        below + height > window.innerHeight - 10
          ? Math.max(10, rect.top - height - 9)
          : below;
      setPosition({ top, left, visibility: "visible" });
    };
    const timer = window.setTimeout(place, 0);
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      )
        onCloseRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return { triggerRef, popoverRef, position };
}

export function DatePicker({
  value = "",
  onChange,
  name,
  min,
  max,
  disabled,
  placeholder = "Choose a date",
  clearable = false,
}: {
  value?: string;
  onChange: (value: string) => void;
  name?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(value);
  const initial = parseYmd(value) ?? parseYmd(today())!;
  const [view, setView] = useState({
    year: initial.year,
    month: initial.month,
  });
  const { triggerRef, popoverRef, position } = useAnchoredPopover(open, () =>
    setOpen(false),
  );
  useEffect(() => setSelected(value), [value]);
  useEffect(() => {
    if (!open) return;
    const next = parseYmd(selected) ?? parseYmd(today())!;
    setView({ year: next.year, month: next.month });
  }, [open, selected]);
  const cells = useMemo(
    () => monthCells(view.year, view.month),
    [view.year, view.month],
  );
  const currentYear = Number(today().slice(0, 4));
  const maxYear = max ? Number(max.slice(0, 4)) : currentYear + 10;
  const minYear = min ? Number(min.slice(0, 4)) : currentYear - 100;
  const years = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, maxYear - minYear + 1) },
        (_, index) => maxYear - index,
      ),
    [maxYear, minYear],
  );
  const monthLabel = new Date(
    Date.UTC(view.year, view.month, 1),
  ).toLocaleDateString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const choose = (day: string) => {
    setSelected(day);
    onChange(day);
    setOpen(false);
  };
  const moveMonth = (delta: number) => {
    const next = new Date(Date.UTC(view.year, view.month + delta, 1));
    setView({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  };
  const outside = (day: string) =>
    Boolean((min && day < min) || (max && day > max));
  return (
    <div className="picker-field">
      {name && <input type="hidden" name={name} value={selected} />}
      <button
        ref={triggerRef}
        type="button"
        className={`picker-trigger ${selected ? "" : "placeholder"}`}
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={18} />
        <span>{selected ? displayDate(selected) : placeholder}</span>
        <ChevronRight className="picker-chevron" size={15} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="picker-popover date-picker-popover"
            style={position}
            role="dialog"
            aria-label="Choose a date"
          >
            <div className="date-picker-head">
              <div>
                <strong>Pick a date</strong>
                <small>{selected ? displayDate(selected) : "No date selected"}</small>
              </div>
              <div className="date-picker-nav">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => moveMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={19} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => moveMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRight size={19} />
                </button>
              </div>
            </div>
            <div className="date-picker-selects">
              <label>
                <span>Month</span>
                <select
                  aria-label="Month"
                  value={view.month}
                  onChange={(e) =>
                    setView({ ...view, month: Number(e.target.value) })
                  }
                >
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Year</span>
                <select
                  aria-label="Year"
                  value={view.year}
                  onChange={(e) =>
                    setView({ ...view, year: Number(e.target.value) })
                  }
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="date-picker-weekdays">
              {WEEKDAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="date-picker-grid">
              {cells.map((day, index) =>
                day ? (
                  <button
                    key={day}
                    type="button"
                    className={[
                      "date-picker-day",
                      day === selected ? "selected" : "",
                      day === today() ? "today" : "",
                      outside(day) ? "outside" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={outside(day)}
                    onClick={() => choose(day)}
                  >
                    {Number(day.slice(8))}
                  </button>
                ) : (
                  <span key={`blank-${index}`} />
                ),
              )}
            </div>
            <div className="date-picker-foot">
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  const now = parseYmd(today())!;
                  setView({ year: now.year, month: now.month });
                  choose(today());
                }}
              >
                Today
              </button>
              <span className="muted">{monthLabel}</span>
              {clearable && selected ? (
                <button
                  type="button"
                  className="text-btn danger"
                  onClick={() => {
                    setSelected("");
                    onChange("");
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>,
          triggerRef.current?.closest("dialog") ?? document.body,
        )}
    </div>
  );
}

function clockParts(value: string) {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return {
    hour: match ? Number(match[1]) : 9,
    minute: match ? Number(match[2]) : 0,
  };
}
function displayClock(hour: number, minute: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${pad(hour12)}:${pad(minute)} ${suffix}`;
}
const QUICK_TIMES = [
  [9, 0],
  [10, 0],
  [13, 0],
  [14, 0],
  [18, 0],
  [19, 0],
];

export function TimePicker({
  value = "09:00",
  onChange,
  name,
  disabled,
}: {
  value?: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(value);
  const [mode, setMode] = useState<"hour" | "minute">("hour");
  const { triggerRef, popoverRef, position } = useAnchoredPopover(open, () =>
    setOpen(false),
  );
  useEffect(() => setSelected(value), [value]);
  const { hour, minute } = clockParts(selected);
  const update = (nextHour: number, nextMinute: number) => {
    const next = `${pad(nextHour)}:${pad(nextMinute)}`;
    setSelected(next);
    onChange(next);
  };
  const selectHour = (hour12: number) => {
    const suffix = hour >= 12;
    const next =
      hour12 === 12 ? (suffix ? 12 : 0) : suffix ? hour12 + 12 : hour12;
    update(next, minute);
    setMode("minute");
  };
  const setMeridiem = (next: "AM" | "PM") => {
    const hour12 = hour % 12 || 12;
    update(
      next === "PM"
        ? hour12 === 12
          ? 12
          : hour12 + 12
        : hour12 === 12
          ? 0
          : hour12,
      minute,
    );
  };
  const hourTicks = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minuteTicks = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const selectedHour12 = hour % 12 || 12;
  const angle =
    mode === "hour"
      ? (selectedHour12 === 12 ? 0 : selectedHour12) * 30
      : minute * 6;
  return (
    <div className="picker-field">
      {name && <input type="hidden" name={name} value={selected} />}
      <button
        ref={triggerRef}
        type="button"
        className="picker-trigger"
        onClick={() => {
          setMode("hour");
          setOpen((current) => !current);
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Clock3 size={18} />
        <span>{displayClock(hour, minute)}</span>
        <ChevronRight className="picker-chevron" size={15} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="picker-popover clock-popover"
            style={position}
            role="dialog"
            aria-label="Choose a time"
          >
            <div className="clock-head">
              <div>
                <strong>{displayClock(hour, minute)}</strong>
                <small>Tap an hour, then a minute</small>
              </div>
              <div className="clock-tabs">
                <button
                  type="button"
                  className={mode === "hour" ? "selected" : ""}
                  onClick={() => setMode("hour")}
                >
                  Hour
                </button>
                <button
                  type="button"
                  className={mode === "minute" ? "selected" : ""}
                  onClick={() => setMode("minute")}
                >
                  Minute
                </button>
              </div>
            </div>
            <div className="quick-times" aria-label="Quick time picks">
              {QUICK_TIMES.map(([h, m]) => (
                <button
                  key={`${h}:${m}`}
                  type="button"
                  className={hour === h && minute === m ? "selected" : ""}
                  onClick={() => {
                    update(h, m);
                    setOpen(false);
                  }}
                >
                  {displayClock(h, m)}
                </button>
              ))}
            </div>
            <div className={`clock-face ${mode}`}>
              <span className="clock-center" />
              <span
                className="clock-hand"
                style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
              />
              {(mode === "hour" ? hourTicks : minuteTicks).map((tick, index) => {
                const tickAngle = index * 30 - 90;
                const radius = mode === "hour" ? 91 : 94;
                const x = Math.cos((tickAngle * Math.PI) / 180) * radius;
                const y = Math.sin((tickAngle * Math.PI) / 180) * radius;
                const active =
                  mode === "hour" ? tick === selectedHour12 : tick === minute;
                return (
                  <button
                    key={tick}
                    type="button"
                    className={`clock-tick ${active ? "selected" : ""}`}
                    style={{
                      left: `calc(50% + ${x}px)`,
                      top: `calc(50% + ${y}px)`,
                    }}
                    onClick={() => {
                      if (mode === "hour") selectHour(tick);
                      else update(hour, tick);
                    }}
                  >
                    {mode === "hour" ? tick : pad(tick)}
                  </button>
                );
              })}
            </div>
            <div className="clock-controls">
              <div className="meridiem">
                <button
                  type="button"
                  className={hour < 12 ? "selected" : ""}
                  onClick={() => setMeridiem("AM")}
                >
                  AM
                </button>
                <button
                  type="button"
                  className={hour >= 12 ? "selected" : ""}
                  onClick={() => setMeridiem("PM")}
                >
                  PM
                </button>
              </div>
              <div className="minute-stepper">
                <button
                  type="button"
                  onClick={() => update(hour, (minute + 59) % 60)}
                  aria-label="Previous minute"
                >
                  −
                </button>
                <span>{pad(minute)}</span>
                <button
                  type="button"
                  onClick={() => update(hour, (minute + 1) % 60)}
                  aria-label="Next minute"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  const now = clockParts(clockInput(new Date().toISOString()));
                  update(now.hour, now.minute);
                  setOpen(false);
                }}
              >
                Now
              </button>
              <button
                type="button"
                className="clock-done"
                onClick={() => setOpen(false)}
              >
                <Check size={16} /> Done
              </button>
            </div>
          </div>,
          triggerRef.current?.closest("dialog") ?? document.body,
        )}
    </div>
  );
}
