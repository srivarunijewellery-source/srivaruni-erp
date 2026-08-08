"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, isValidIsoDate, monthEnd, monthStart, prettyDate, todayIso } from "@/lib/dates";

/**
 * A range calendar, replacing two native date inputs.
 *
 * `<input type="date">` hands the calendar to the browser, and the
 * browser draws it its own way: a segmented MM/DD/YYYY field that reads
 * as American on a US machine, a popup that opens under the field and
 * covers the controls beneath it, one month at a time, and no notion of
 * a range — so picking a span meant two separate popups and mentally
 * holding the first date while choosing the second. None of that is
 * styleable. The only way to fix the layout is to stop using it.
 *
 * This shows both ends of the range at once across two months, so the
 * span is visible as a shape rather than as two numbers to compare.
 * Dates are written out in words, which removes the day/month ambiguity
 * that no amount of CSS could fix on the native control.
 */
export function RangeCalendar({
  from,
  to,
  onPick,
  onClose,
  minIso,
  maxIso,
}: {
  from: string;
  to: string;
  onPick: (from: string, to: string) => void;
  onClose: () => void;
  minIso?: string;
  maxIso?: string;
}) {
  const today = todayIso();
  const max = maxIso ?? today;
  const [anchor, setAnchor] = useState(() => monthStart(isValidIsoDate(from) ? from : today));
  // Half-made selections live here so the committed range stays intact
  // until both ends are chosen. Clicking once should never wipe the view.
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function away(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  function click(iso: string) {
    if (!pendingStart) {
      setPendingStart(iso);
      return;
    }
    // Picked backwards? Take it as a range rather than refusing it —
    // people often click the end date first.
    const [a, b] = iso < pendingStart ? [iso, pendingStart] : [pendingStart, iso];
    setPendingStart(null);
    onPick(a, b);
  }

  const selStart = pendingStart ?? from;
  const selEnd = pendingStart ? (hover && hover > pendingStart ? hover : pendingStart) : to;

  return (
    <div
      ref={box}
      className="absolute left-0 z-30 mt-2 w-[min(92vw,34rem)] rounded-card border border-border bg-surface p-3 shadow-raised"
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setAnchor(addDays(anchor, -1).slice(0, 7) + "-01")}
          className="rounded-control border border-border px-2 py-1 text-2xs hover:border-brand"
        >
          ‹
        </button>
        <span className="text-2xs text-text-muted">
          {pendingStart
            ? `${prettyDate(pendingStart)} → pick the end date`
            : `${prettyDate(from)} → ${prettyDate(to)}`}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setAnchor(addDays(monthEnd(anchor), 1))}
          className="rounded-control border border-border px-2 py-1 text-2xs hover:border-brand"
        >
          ›
        </button>
      </div>

      {/* Two months side by side on anything wider than a phone, so a
          range spanning a month boundary is one glance, not two. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[anchor, addDays(monthEnd(anchor), 1)].map((m) => (
          <Month
            key={m}
            monthIso={m}
            selStart={selStart}
            selEnd={selEnd}
            min={minIso}
            max={max}
            onHover={setHover}
            onClick={click}
          />
        ))}
      </div>
    </div>
  );
}

function Month({
  monthIso,
  selStart,
  selEnd,
  min,
  max,
  onHover,
  onClick,
}: {
  monthIso: string;
  selStart: string;
  selEnd: string;
  min?: string;
  max: string;
  onHover: (iso: string | null) => void;
  onClick: (iso: string) => void;
}) {
  const first = monthStart(monthIso);
  const last = monthEnd(monthIso);
  const [y, mo] = first.split("-").map(Number);
  const label = new Date(Date.UTC(y ?? 2000, (mo ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const lead = new Date(`${first}T12:00:00Z`).getUTCDay();
  const days: Array<string | null> = Array(lead).fill(null);
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);

  return (
    <div>
      <p className="mb-1 text-center text-2xs font-medium">{label}</p>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="py-1 text-2xs text-text-subtle">
            {d}
          </span>
        ))}
        {days.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const disabled = d > max || (min !== undefined && d < min);
          const inRange = d >= selStart && d <= selEnd;
          const isEnd = d === selStart || d === selEnd;
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onMouseEnter={() => onHover(d)}
              onClick={() => onClick(d)}
              className={`tnum py-1.5 text-2xs transition-colors disabled:opacity-25 ${
                isEnd
                  ? "rounded-control bg-brand font-medium text-brand-fg"
                  : inRange
                    ? "bg-brand/10"
                    : "rounded-control hover:bg-surface-sunken"
              }`}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
