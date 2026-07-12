import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import SectionNav from './SectionNav';

const GA_APP_SECTIONS = [
  { id: 'ga-app-overview', label: 'Current Month Overview' },
  { id: 'ga-app-product-pages', label: 'Product Pages' },
  { id: 'ga-app-installs', label: 'Installs Tracker' },
  { id: 'ga-app-monthly-comparison', label: 'Monthly Comparison' },
  { id: 'ga-app-period-totals', label: 'Period Totals' },
  { id: 'ga-app-monthly-breakdown', label: 'Monthly Breakdown' },
  { id: 'ga-app-top-events-screens', label: 'Top Events / Screens' },
];

function fmt(n) { return n != null ? n.toLocaleString() : '—'; }
function fmtDur(s) { if (s == null) return '—'; const m = Math.floor(s / 60); return `${m}m ${Math.round(s % 60)}s`; }

function Delta({ curr, prev }) {
  if (curr == null || prev == null || prev === 0) return null;
  const d = ((curr - prev) / prev * 100);
  return <span className={`text-[11px] font-medium ${d > 0 ? 'text-positive' : d < 0 ? 'text-negative' : 'text-text-muted'}`}>{d > 0 ? '+' : ''}{d.toFixed(1)}%</span>;
}

function KpiCard({ label, value, prev, sub }) {
  return (
    <div className="bg-bg rounded-md p-3 border border-border/50">
      <div className="text-[10px] text-text-muted uppercase mb-0.5">{label}</div>
      <div className="text-lg font-bold text-text-primary">{value}</div>
      <div className="flex items-center justify-between mt-1">
        {sub && <span className="text-[10px] text-text-muted">{sub}</span>}
        {prev != null && <Delta curr={parseFloat(String(value).replace(/,/g, ''))} prev={prev} />}
      </div>
    </div>
  );
}

function fmtDateKey(k) { return `${k.slice(0,4)}-${k.slice(4,6)}-${k.slice(6)}`; }

// Month-key helpers — GA dates come through as YYYYMMDD, month key is the first 6 digits (YYYYMM).
function dateKeyToMonthKey(k) { return k.slice(0, 6); }
function monthKeyToLabel(ym) {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(4, 6), 10) - 1;
  return new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function monthKeyToInputValue(ym) { return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`; }
function inputValueToMonthKey(v) { return v.replace('-', ''); }
function shiftMonthKey(ym, delta) {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(4, 6), 10) - 1;
  const d = new Date(Date.UTC(y, m + delta, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function daysInMonth(ym) {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(4, 6), 10);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
// A month only compares fairly against another full month once its calendar boundary has passed —
// checking "every single day present" is too strict, since GA data has a normal 1-2 day processing
// lag that would otherwise permanently flag an actually-finished month as partial. Comparing a
// 5-day-old current month against a full prior month is the case we actually need to avoid.
function isCompleteMonth(ym) {
  return !!ym && ym < currentMonthKey();
}

// Rolls up the already-merged per-day rows into per-month totals. Note: "Active Users" here is a
// SUM of each day's active users, not a deduplicated monthly-active count — GA doesn't give us
// distinct-user counts over an arbitrary range from daily rows, so this overcounts repeat users.
// "Downloads" (newUsers) is safe to sum since GA only counts a user as new once, on their first day.
function aggregateByMonth(dates) {
  const byMonth = {};
  for (const d of dates) {
    const ym = dateKeyToMonthKey(d.date);
    if (!byMonth[ym]) {
      byMonth[ym] = { month: ym, activeUsers: 0, newUsers: 0, sessions: 0, engagedSessions: 0, screenPageViews: 0, android: { users: 0, newUsers: 0 }, ios: { users: 0, newUsers: 0 }, days: 0 };
    }
    const m = byMonth[ym];
    m.activeUsers += d.activeUsers;
    m.newUsers += d.newUsers;
    m.sessions += d.sessions;
    m.engagedSessions += d.engagedSessions || 0;
    m.screenPageViews += d.screenPageViews || 0;
    m.android.users += d.android?.users || 0;
    m.android.newUsers += d.android?.newUsers || 0;
    m.ios.users += d.ios?.users || 0;
    m.ios.newUsers += d.ios?.newUsers || 0;
    m.days++;
  }
  return byMonth;
}

function InstallsTracker({ byMonth, months }) {
  const latestKey = months[months.length - 1];
  const earliestKey = months[0];
  const [selectedMonth, setSelectedMonth] = useState(latestKey);

  // Selected month + its 2 preceding months — a rolling quarter window, movable via the picker.
  const windowMonths = [selectedMonth, shiftMonthKey(selectedMonth, -1), shiftMonthKey(selectedMonth, -2)];
  const selData = byMonth[selectedMonth] || null;
  const selComplete = isCompleteMonth(selectedMonth);

  const rows = [
    { label: 'Active Users (sum of daily)', key: 'activeUsers' },
    { label: 'Downloads (Installs)', key: 'newUsers' },
    { label: 'Sessions', key: 'sessions' },
    { label: 'Android Downloads', key: 'androidDL' },
    { label: 'iOS Downloads', key: 'iosDL' },
  ];

  function getVal(ym, key) {
    const m = byMonth[ym];
    if (!m) return null;
    if (key === 'androidDL') return m.android.newUsers;
    if (key === 'iosDL') return m.ios.newUsers;
    return m[key];
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary">Installs Tracker</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Month:</span>
          <input type="month" value={monthKeyToInputValue(selectedMonth)}
            min={monthKeyToInputValue(earliestKey)} max={monthKeyToInputValue(latestKey)}
            onChange={e => setSelectedMonth(inputValueToMonthKey(e.target.value))}
            className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent" />
        </div>
      </div>
      {!selData ? (
        <p className="text-xs text-warning">No data for {monthKeyToLabel(selectedMonth)}</p>
      ) : (
        <>
        {!selComplete && (
          <p className="text-[11px] text-warning mb-2">
            {monthKeyToLabel(selectedMonth)} is still in progress ({selData.days} of {daysInMonth(selectedMonth)} days synced) —
            change vs. the prior month isn't a fair comparison, so it's hidden below.
          </p>
        )}
        <table className="w-full">
          <thead className="sticky top-0 z-[2] bg-card">
            <tr className="border-b border-border">
              <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Metric</th>
              {windowMonths.map(ym => (
                <th key={ym} className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">
                  {monthKeyToLabel(ym)}{!byMonth[ym] && <span className="block text-[9px] normal-case text-text-muted">(no data)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-border/50 hover:bg-bg">
                <td className="py-2.5 px-3 text-xs font-medium text-text-primary">{r.label}</td>
                {windowMonths.map((ym, i) => {
                  const val = getVal(ym, r.key);
                  const nextYm = windowMonths[i + 1];
                  const prevVal = nextYm ? getVal(nextYm, r.key) : null;
                  const thisComplete = isCompleteMonth(ym);
                  return (
                    <td key={ym} className="py-2.5 px-3 text-xs text-right">
                      <span className={i === 0 ? 'font-semibold text-text-primary' : 'text-text-secondary'}>{fmt(val)}</span>
                      {thisComplete && prevVal != null && prevVal > 0 && (
                        <span className="ml-1.5"><Delta curr={val} prev={prevVal} /></span>
                      )}
                      {!thisComplete && val != null && <span className="ml-1.5 text-text-muted italic text-[10px]">partial</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </div>
  );
}

function MonthlyComparison({ byMonth, months }) {
  const recentMonths = months.slice(-3).reverse();

  const metrics = [
    { label: 'Active Users', key: 'activeUsers' },
    { label: 'Downloads', key: 'newUsers' },
    { label: 'Sessions', key: 'sessions' },
    { label: 'Android DL', key: 'androidDL' },
    { label: 'iOS DL', key: 'iosDL' },
  ];

  function getVal(ym, key) {
    const m = byMonth[ym];
    if (!m) return null;
    if (key === 'androidDL') return m.android.newUsers;
    if (key === 'iosDL') return m.ios.newUsers;
    return m[key];
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-base font-semibold text-text-primary mb-3">Monthly Comparison</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-[2] bg-card">
            <tr className="border-b border-border">
              <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Metric</th>
              {recentMonths.map(ym => {
                const complete = isCompleteMonth(ym, byMonth[ym]);
                return (
                  <th key={ym} className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">
                    <div>{monthKeyToLabel(ym)}</div>
                    <div className={`text-[9px] font-normal normal-case tracking-normal ${complete ? 'text-text-muted' : 'text-warning'}`}>
                      {complete ? `(${byMonth[ym]?.days || 0}d)` : `(${byMonth[ym]?.days || 0}d, in progress)`}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.key} className="border-b border-border/50 hover:bg-bg">
                <td className="py-2.5 px-3 text-xs font-medium text-text-primary">{m.label}</td>
                {recentMonths.map((ym, i) => {
                  const val = getVal(ym, m.key);
                  const prevMonth = recentMonths[i + 1];
                  const prevVal = prevMonth ? getVal(prevMonth, m.key) : null;
                  const complete = isCompleteMonth(ym, byMonth[ym]);
                  return (
                    <td key={ym} className="py-2.5 px-3 text-xs text-right">
                      <span className={i === 0 ? 'font-semibold text-text-primary' : 'text-text-secondary'}>{fmt(val)}</span>
                      {complete && prevVal != null && prevVal > 0 && (
                        <span className="ml-1.5"><Delta curr={val} prev={prevVal} /></span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PeriodTotals({ months, byMonth }) {
  const earliest = months[0];
  const latest = months[months.length - 1];
  const [ptStart, setPtStart] = useState(earliest);
  const [ptEnd, setPtEnd] = useState(latest);

  const filtered = months.filter(ym => ym >= ptStart && ym <= ptEnd);

  const totals = filtered.reduce((t, ym) => {
    const m = byMonth[ym];
    t.users += m.activeUsers; t.newUsers += m.newUsers; t.sessions += m.sessions;
    t.android += m.android.newUsers || 0; t.ios += m.ios.newUsers || 0;
    return t;
  }, { users: 0, newUsers: 0, sessions: 0, android: 0, ios: 0 });

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-text-primary">Period Totals</h2>
        <div className="flex items-center gap-2">
          <input type="month" value={monthKeyToInputValue(ptStart)} min={monthKeyToInputValue(earliest)} max={monthKeyToInputValue(ptEnd)}
            onChange={e => setPtStart(inputValueToMonthKey(e.target.value))}
            className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent" />
          <span className="text-xs text-text-muted">to</span>
          <input type="month" value={monthKeyToInputValue(ptEnd)} min={monthKeyToInputValue(ptStart)} max={monthKeyToInputValue(latest)}
            onChange={e => setPtEnd(inputValueToMonthKey(e.target.value))}
            className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent" />
          <span className="text-[10px] text-text-muted">({filtered.length} months)</span>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Total Active Users" value={fmt(totals.users)} />
        <KpiCard label="Total Installs" value={fmt(totals.newUsers)} sub={`${filtered.length} months`} />
        <KpiCard label="Total Sessions" value={fmt(totals.sessions)} />
        <KpiCard label="Android Installs" value={fmt(totals.android)} sub={`${totals.newUsers > 0 ? (totals.android / totals.newUsers * 100).toFixed(0) : 0}%`} />
        <KpiCard label="iOS Installs" value={fmt(totals.ios)} sub={`${totals.newUsers > 0 ? (totals.ios / totals.newUsers * 100).toFixed(0) : 0}%`} />
      </div>
    </div>
  );
}

function ProductPagesCard({ start, end }) {
  const [rangeStart, setRangeStart] = useState(start);
  const [rangeEnd, setRangeEnd] = useState(end);
  const { data, loading, error } = useApi(`/api/analytics/ga-app-products?start=${rangeStart}&end=${rangeEnd}`);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-text-primary">Product Pages</h2>
        <div className="flex items-center gap-2">
          <input type="date" value={rangeStart} max={rangeEnd}
            onChange={e => setRangeStart(e.target.value)}
            className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent" />
          <span className="text-xs text-text-muted">to</span>
          <input type="date" value={rangeEnd} min={rangeStart}
            onChange={e => setRangeEnd(e.target.value)}
            className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent" />
        </div>
      </div>

      {loading && <div className="text-xs text-text-muted py-4 text-center">Loading...</div>}
      {error && <p className="text-xs text-negative">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <KpiCard label="Page Views" value={fmt(data.screenPageViews)} />
            <KpiCard label="Sessions" value={fmt(data.sessions)} />
            <KpiCard label="Checkout Initiated (from Cart)" value={fmt(data.checkoutInitiated)} />
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-[2] bg-card">
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Product</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Sessions</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Add to Cart</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">ATC Rate</th>
                </tr>
              </thead>
              <tbody>
                {(data.products || []).map((p, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-bg">
                    <td className="py-2 px-3 text-xs text-text-secondary max-w-[280px] truncate" title={p.itemName}>{p.itemName}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-primary font-medium">{fmt(p.sessions)}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-secondary">{fmt(p.itemsAddedToCart)}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-muted">{p.sessions > 0 ? `${(p.itemsAddedToCart / p.sessions * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function GaSyncBar({ onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSync() {
    setSyncing(true); setResult(null);
    try {
      const res = await fetch('/api/sync/ga_app', { method: 'POST' });
      const d = await res.json();
      setResult({ ok: true, msg: `Synced ${d.result?.rowsAdded ?? 0} rows` });
      onSynced?.();
    } catch (err) { setResult({ ok: false, msg: err.message }); }
    finally { setSyncing(false); }
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={handleSync} disabled={syncing}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
        {syncing ? 'Syncing...' : 'Sync GA Data'}
      </button>
      {result && <span className={`text-xs ${result.ok ? 'text-positive' : 'text-negative'}`}>{result.msg}</span>}
    </div>
  );
}

export default function GaAppTab({ start, end }) {
  const { data, loading, error } = useApi(`/api/analytics/ga-app?start=${start}&end=${end}`);
  const { data: stored } = useApi('/api/analytics/ga-app-stored');
  const [refreshKey, setRefreshKey] = useState(0);

  if (loading) return <div className="flex items-center justify-center py-16 text-xs text-text-muted gap-2"><div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading GA App data...</div>;
  if (error) return <div className="bg-card border border-border rounded-lg p-4"><p className="text-xs text-negative">{error}</p></div>;
  if (!data) return null;

  const { daily, topEvents, topScreens } = data;

  const byDate = {};
  function addRow(r) {
    if (!byDate[r.date]) byDate[r.date] = { date: r.date, activeUsers: 0, newUsers: 0, sessions: 0, engagedSessions: 0, screenPageViews: 0, android: { users: 0, newUsers: 0, sessions: 0 }, ios: { users: 0, newUsers: 0, sessions: 0 } };
    const d = byDate[r.date];
    d.activeUsers += r.activeUsers;
    d.newUsers += r.newUsers;
    d.sessions += r.sessions;
    d.engagedSessions += (r.engagedSessions || 0);
    d.screenPageViews += (r.screenPageViews || 0);
    const plat = r.platform === 'iOS' ? 'ios' : 'android';
    d[plat] = { users: (d[plat].users || 0) + r.activeUsers, newUsers: (d[plat].newUsers || 0) + r.newUsers, sessions: (d[plat].sessions || 0) + r.sessions };
  }

  if (stored?.daily) {
    for (const r of stored.daily) addRow(r);
  }
  const liveByDate = {};
  for (const r of daily) {
    if (!liveByDate[r.date]) liveByDate[r.date] = true;
  }
  for (const k of Object.keys(liveByDate)) delete byDate[k];
  for (const r of daily) addRow(r);

  const dates = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = aggregateByMonth(dates);
  const months = Object.keys(byMonth).sort();
  const latestMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;
  const currMonthData = latestMonth ? byMonth[latestMonth] : null;
  const prevMonthData = prevMonth ? byMonth[prevMonth] : null;
  const currMonthComplete = isCompleteMonth(latestMonth, currMonthData);

  return (
    <div className="flex flex-col gap-4">
      <SectionNav sections={GA_APP_SECTIONS} />
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">GA App</h2>
        <GaSyncBar onSynced={() => setRefreshKey(k => k + 1)} />
      </div>

      {/* KPIs - Current Month */}
      <div className="bg-card border border-border rounded-lg p-4" id="ga-app-overview">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Current Month Overview</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Month: {latestMonth ? monthKeyToLabel(latestMonth) : '—'}
              {!currMonthComplete && currMonthData && (
                <span className="ml-2 text-warning">
                  ({currMonthData.days}/{daysInMonth(latestMonth)} days so far — vs. prior month hidden until complete)
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="Active Users" value={fmt(currMonthData?.activeUsers)} prev={currMonthComplete ? prevMonthData?.activeUsers : null} />
          <KpiCard label="Downloads" value={fmt(currMonthData?.newUsers)} prev={currMonthComplete ? prevMonthData?.newUsers : null} />
          <KpiCard label="Sessions" value={fmt(currMonthData?.sessions)} prev={currMonthComplete ? prevMonthData?.sessions : null} />
          <KpiCard label="Android Downloads" value={fmt(currMonthData?.android?.newUsers)} prev={currMonthComplete ? prevMonthData?.android?.newUsers : null} />
          <KpiCard label="iOS Downloads" value={fmt(currMonthData?.ios?.newUsers)} prev={currMonthComplete ? prevMonthData?.ios?.newUsers : null} />
        </div>
      </div>

      {/* Product Pages — sessions/ATC per product, own date range */}
      <div id="ga-app-product-pages"><ProductPagesCard start={start} end={end} /></div>

      {/* Installs Tracker with month picker */}
      {months.length > 0 && <div id="ga-app-installs"><InstallsTracker byMonth={byMonth} months={months} /></div>}

      {/* Monthly Comparison */}
      {months.length > 0 && <div id="ga-app-monthly-comparison"><MonthlyComparison byMonth={byMonth} months={months} /></div>}

      {/* Period Totals */}
      {months.length > 0 && <div id="ga-app-period-totals"><PeriodTotals months={months} byMonth={byMonth} /></div>}

      {/* Monthly Breakdown */}
      <div className="bg-card border border-border rounded-lg p-4" id="ga-app-monthly-breakdown">
        <h2 className="text-base font-semibold text-text-primary mb-3">Monthly Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-[2] bg-card">
              <tr className="border-b border-border">
                {['Month', 'Active Users', 'Downloads', 'Sessions', 'Engaged', 'Screen Views', 'Android Users', 'Android DL', 'iOS Users', 'iOS DL'].map(h => (
                  <th key={h} className={`text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3 ${h === 'Month' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.slice(-3).reverse().map((ym, i, reversedMonths) => {
                const m = byMonth[ym];
                const prevYm = reversedMonths[i + 1];
                const prevMo = prevYm ? byMonth[prevYm] : null;
                const complete = isCompleteMonth(ym, m);
                return (
                  <tr key={ym} className="border-b border-border/50 hover:bg-bg transition-colors">
                    <td className="py-2.5 px-3 text-xs text-text-primary">
                      {monthKeyToLabel(ym)}{!complete && <span className="ml-1 text-[10px] text-warning">(partial, {m.days}d)</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(m.activeUsers)} {complete && prevMo && <Delta curr={m.activeUsers} prev={prevMo.activeUsers} />}</td>
                    <td className="py-2.5 px-3 text-xs text-right font-medium text-text-primary">{fmt(m.newUsers)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(m.sessions)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(m.engagedSessions)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(m.screenPageViews)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(m.android?.users)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-positive">{fmt(m.android?.newUsers)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(m.ios?.users)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-accent">{fmt(m.ios?.newUsers)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Events + Top Screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" id="ga-app-top-events-screens">
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-base font-semibold text-text-primary mb-3">Top Events</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-[2] bg-card">
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Event</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Count</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Users</th>
                </tr>
              </thead>
              <tbody>
                {topEvents.map((e, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-bg">
                    <td className="py-2 px-3 text-xs text-text-secondary">{e.eventName}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-primary font-medium">{fmt(e.eventCount)}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-secondary">{fmt(e.totalUsers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-base font-semibold text-text-primary mb-3">Top Screens</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-[2] bg-card">
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Screen</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Views</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Users</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {topScreens.map((s, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-bg">
                    <td className="py-2 px-3 text-xs text-text-secondary max-w-[200px] truncate" title={s.unifiedScreenName}>{s.unifiedScreenName}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-primary font-medium">{fmt(s.screenPageViews)}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-secondary">{fmt(s.activeUsers)}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-secondary">{fmtDur(s.averageSessionDuration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
