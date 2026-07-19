import { useState, useRef, useEffect } from 'react';

function toIso(d) { return d.toISOString().slice(0, 10); }
function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function addDays(iso, n) { const d = parseIso(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); }
function startOfMonth(iso) { const d = parseIso(iso); return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))); }
function endOfMonth(iso) { const d = parseIso(iso); return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); }
function addMonths(iso, n) { const d = parseIso(iso); return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))); }
function todayIso() { return toIso(new Date()); }
function formatShort(iso) { return parseIso(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
function formatWithYear(iso) { return parseIso(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }

const PRESETS = [
  { label: 'Today', range: () => { const t = todayIso(); return { start: t, end: t }; } },
  { label: 'Yesterday', range: () => { const y = addDays(todayIso(), -1); return { start: y, end: y }; } },
  { label: 'Last 7 days', range: () => ({ start: addDays(todayIso(), -6), end: todayIso() }) },
  { label: 'Last 14 days', range: () => ({ start: addDays(todayIso(), -13), end: todayIso() }) },
  { label: 'Last 30 days', range: () => ({ start: addDays(todayIso(), -29), end: todayIso() }) },
  { label: 'This month', range: () => ({ start: startOfMonth(todayIso()), end: todayIso() }) },
  { label: 'Last month', range: () => { const lm = addMonths(startOfMonth(todayIso()), -1); return { start: lm, end: endOfMonth(lm) }; } },
];

// The trigger button shows a preset's name instead of raw dates whenever the current range
// happens to match one exactly — matches Shopify's own picker, where "Last 7 days" stays legible
// instead of always collapsing to "Jul 13 – Jul 19".
function rangeLabel(start, end) {
  const matched = PRESETS.find(p => { const r = p.range(); return r.start === start && r.end === end; });
  if (matched) return matched.label;
  if (start === end) return formatWithYear(start);
  return `${formatShort(start)} – ${formatWithYear(end)}`;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function MonthGrid({ monthStartIso, draftStart, draftEnd, onPick, minIso, maxIso }) {
  const d = parseIso(monthStartIso);
  const year = d.getUTCFullYear(), month = d.getUTCMonth();
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(toIso(new Date(Date.UTC(year, month, day))));
  const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const today = todayIso();

  return (
    <div className="flex-1">
      <div className="text-center text-xs font-semibold text-text-primary mb-2">{monthLabel}</div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map(w => <div key={w} className="text-center text-[10px] text-text-muted">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`blank-${i}`} />;
          const disabled = (minIso && iso < minIso) || (maxIso && iso > maxIso);
          const inRange = draftStart && draftEnd && iso >= draftStart && iso <= draftEnd;
          const isEdge = iso === draftStart || iso === draftEnd;
          return (
            <button key={iso} type="button" disabled={disabled} onClick={() => onPick(iso)}
              className={`text-[11px] py-1.5 rounded-md transition-colors relative ${
                disabled ? 'text-text-muted/40 cursor-not-allowed'
                  : isEdge ? 'bg-accent text-white font-semibold'
                    : inRange ? 'bg-accent/15 text-text-primary'
                      : 'text-text-secondary hover:bg-bg'
              } ${iso === today && !isEdge ? 'ring-1 ring-inset ring-accent/40' : ''}`}>
              {parseInt(iso.slice(8, 10), 10)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Shopify-style date range picker: a trigger button that opens a popover with quick presets on
// the left and two side-by-side month calendars on the right for a custom range. Presets apply
// immediately; a custom calendar selection needs "Apply" since it takes two clicks (start, then
// end) to mean anything.
export default function DateRangePicker({ start, end, onChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [viewMonth, setViewMonth] = useState(startOfMonth(start));
  const rootRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  function openPanel() {
    setDraftStart(start);
    setDraftEnd(end);
    setPickingEnd(false);
    setViewMonth(startOfMonth(start));
    setOpen(true);
  }

  function pickPreset(preset) {
    const r = preset.range();
    onChange(r);
    setOpen(false);
  }

  // First click on a day starts a fresh single-day range; the second click extends it to an end
  // date (swapping if picked before the start) — the same two-click convention Shopify uses.
  function pickDay(iso) {
    if (!pickingEnd) {
      setDraftStart(iso);
      setDraftEnd(iso);
      setPickingEnd(true);
    } else {
      if (iso < draftStart) { setDraftStart(iso); setDraftEnd(draftStart); }
      else setDraftEnd(iso);
      setPickingEnd(false);
    }
  }

  function apply() {
    if (draftStart && draftEnd) onChange({ start: draftStart, end: draftEnd > draftStart ? draftEnd : draftStart });
    setOpen(false);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={`flex items-center gap-1.5 bg-bg border border-border text-text-primary rounded-md hover:border-accent/50 transition-colors whitespace-nowrap ${compact ? 'text-[11px] px-2 py-1' : 'text-xs px-2.5 py-1.5 gap-2'}`}
      >
        <svg className={`text-text-muted shrink-0 ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {rangeLabel(start, end)}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-card border border-border rounded-lg shadow-xl flex">
          <div className="flex flex-col gap-0.5 p-2 border-r border-border w-36 shrink-0">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => pickPreset(p)}
                className="text-left text-xs px-2.5 py-1.5 rounded-md text-text-secondary hover:bg-bg hover:text-text-primary transition-colors whitespace-nowrap">
                {p.label}
              </button>
            ))}
          </div>

          <div className="p-3 w-[440px]">
            <div className="flex items-center gap-2 mb-3">
              <input type="date" value={draftStart} onChange={e => { setDraftStart(e.target.value); setPickingEnd(true); }}
                className="flex-1 bg-bg border border-border text-text-primary text-xs px-2 py-1.5 rounded-md focus:outline-none focus:border-accent" />
              <span className="text-xs text-text-muted">to</span>
              <input type="date" value={draftEnd} onChange={e => { setDraftEnd(e.target.value); setPickingEnd(false); }}
                className="flex-1 bg-bg border border-border text-text-primary text-xs px-2 py-1.5 rounded-md focus:outline-none focus:border-accent" />
            </div>

            <div className="flex items-center justify-between mb-1">
              <button onClick={() => setViewMonth(m => addMonths(m, -1))} className="text-text-muted hover:text-text-primary p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={() => setViewMonth(m => addMonths(m, 1))} className="text-text-muted hover:text-text-primary p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <div className="flex gap-4">
              <MonthGrid monthStartIso={viewMonth} draftStart={draftStart} draftEnd={draftEnd} onPick={pickDay} />
              <MonthGrid monthStartIso={addMonths(viewMonth, 1)} draftStart={draftStart} draftEnd={draftEnd} onPick={pickDay} />
            </div>

            <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border">
              <button onClick={() => setOpen(false)} className="text-xs font-medium px-3 py-1.5 rounded-md text-text-secondary hover:bg-bg transition-colors">
                Cancel
              </button>
              <button onClick={apply} className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 transition-opacity">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SINGLE_PRESETS = [
  { label: 'Today', value: () => todayIso() },
  { label: 'Yesterday', value: () => addDays(todayIso(), -1) },
];

// Same Shopify-derived visual language as DateRangePicker (trigger button + popover + month
// grid) but for the handful of spots in the app that pick one date rather than a range — a sync
// trigger's target date, a single-day snapshot filter, etc. Clicking a day applies immediately;
// there's no second click or Apply step to wait on since a single date is unambiguous.
export function SingleDatePicker({ value, onChange, min, max, compact = false, clearable = false }) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(startOfMonth(value || todayIso()));
  const rootRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  function openPanel() {
    setViewMonth(startOfMonth(value || todayIso()));
    setOpen(true);
  }

  function pick(iso) {
    if ((min && iso < min) || (max && iso > max)) return;
    onChange(iso);
    setOpen(false);
  }

  const label = value ? formatWithYear(value) : 'Select date';
  const btnClasses = `flex items-center gap-1.5 bg-bg border border-border text-text-primary rounded-md hover:border-accent/50 transition-colors whitespace-nowrap ${compact ? 'text-[11px] px-2 py-1' : 'text-xs px-2.5 py-1.5'}`;

  return (
    <div className="relative inline-flex items-center gap-1.5" ref={rootRef}>
      <button type="button" onClick={() => (open ? setOpen(false) : openPanel())} className={btnClasses}>
        <svg className={`text-text-muted shrink-0 ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {label}
      </button>
      {clearable && value && (
        <button type="button" onClick={() => onChange('')} className="text-[11px] text-accent hover:underline">clear</button>
      )}

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-card border border-border rounded-lg shadow-xl flex">
          <div className="flex flex-col gap-0.5 p-2 border-r border-border w-24 shrink-0">
            {SINGLE_PRESETS.map(p => (
              <button key={p.label} type="button" onClick={() => pick(p.value())}
                className="text-left text-xs px-2 py-1.5 rounded-md text-text-secondary hover:bg-bg hover:text-text-primary transition-colors whitespace-nowrap">
                {p.label}
              </button>
            ))}
          </div>
          <div className="p-3 w-[220px]">
            <div className="flex items-center justify-between mb-1">
              <button type="button" onClick={() => setViewMonth(m => addMonths(m, -1))} className="text-text-muted hover:text-text-primary p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button type="button" onClick={() => setViewMonth(m => addMonths(m, 1))} className="text-text-muted hover:text-text-primary p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <MonthGrid monthStartIso={viewMonth} draftStart={value} draftEnd={value} onPick={pick} minIso={min} maxIso={max} />
          </div>
        </div>
      )}
    </div>
  );
}
