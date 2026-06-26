import { useState } from 'react';
import { useApi } from '../hooks/useApi';

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
function dateKeyToISO(k) { return `${k.slice(0,4)}-${k.slice(4,6)}-${k.slice(6)}`; }
function isoToDateKey(iso) { return iso.replace(/-/g, ''); }

function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function aggregateDays(byDate, startIso, endIso) {
  const startKey = isoToDateKey(startIso);
  const endKey = isoToDateKey(endIso);
  const result = { activeUsers: 0, newUsers: 0, sessions: 0, android: { users: 0, newUsers: 0 }, ios: { users: 0, newUsers: 0 }, days: 0 };
  for (const [k, d] of Object.entries(byDate)) {
    if (k >= startKey && k <= endKey) {
      result.activeUsers += d.activeUsers;
      result.newUsers += d.newUsers;
      result.sessions += d.sessions;
      result.android.users += d.android.users || 0;
      result.android.newUsers += d.android.newUsers || 0;
      result.ios.users += d.ios.users || 0;
      result.ios.newUsers += d.ios.newUsers || 0;
      result.days++;
    }
  }
  return result;
}

function InstallsTracker({ byDate, dates }) {
  const latestKey = dates[dates.length - 1].date;
  const earliestKey = dates[0].date;
  const [selectedDate, setSelectedDate] = useState(dateKeyToISO(latestKey));

  const selKey = isoToDateKey(selectedDate);
  const prevKey = isoToDateKey(shiftDate(selectedDate, -1));
  const sel = byDate[selKey] || null;
  const prev = byDate[prevKey] || null;

  const rows = [
    { label: 'Active Users', curr: sel?.activeUsers, prev: prev?.activeUsers },
    { label: 'Downloads (Installs)', curr: sel?.newUsers, prev: prev?.newUsers },
    { label: 'Sessions', curr: sel?.sessions, prev: prev?.sessions },
    { label: 'Android Downloads', curr: sel?.android?.newUsers, prev: prev?.android?.newUsers },
    { label: 'iOS Downloads', curr: sel?.ios?.newUsers, prev: prev?.ios?.newUsers },
  ];

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary">Installs Tracker</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Date:</span>
          <input type="date" value={selectedDate}
            min={dateKeyToISO(earliestKey)} max={dateKeyToISO(latestKey)}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent" />
        </div>
      </div>
      {!sel ? (
        <p className="text-xs text-warning">No data for {selectedDate}</p>
      ) : (
        <table className="w-full">
          <thead className="sticky top-0 z-[2] bg-card">
            <tr className="border-b border-border">
              <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Metric</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">{selectedDate}</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">{prev ? shiftDate(selectedDate, -1) : 'No data'}</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-border/50 hover:bg-bg">
                <td className="py-2.5 px-3 text-xs font-medium text-text-primary">{r.label}</td>
                <td className="py-2.5 px-3 text-xs text-right font-semibold text-text-primary">{fmt(r.curr)}</td>
                <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(r.prev)}</td>
                <td className="py-2.5 px-3 text-xs text-right">
                  {r.curr != null && r.prev != null && r.prev > 0 ? <Delta curr={r.curr} prev={r.prev} /> : <span className="text-text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FourWeekComparison({ byDate, latestIso }) {
  const weeks = [];
  for (let i = 0; i < 4; i++) {
    const end = shiftDate(latestIso, -i * 7);
    const start = shiftDate(end, -6);
    weeks.push({ label: `Week ${i + 1}`, start, end, data: aggregateDays(byDate, start, end) });
  }

  const metrics = [
    { label: 'Active Users', key: 'activeUsers' },
    { label: 'Downloads', key: 'newUsers' },
    { label: 'Sessions', key: 'sessions' },
    { label: 'Android DL', key: 'androidDL' },
    { label: 'iOS DL', key: 'iosDL' },
  ];

  function getVal(w, key) {
    if (key === 'androidDL') return w.data.android.newUsers;
    if (key === 'iosDL') return w.data.ios.newUsers;
    return w.data[key];
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-base font-semibold text-text-primary mb-3">Weekly Comparison</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-[2] bg-card">
            <tr className="border-b border-border">
              <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Metric</th>
              {weeks.map(w => (
                <th key={w.label} className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">
                  <div>{w.label}</div>
                  <div className="text-[9px] font-normal normal-case tracking-normal">{w.start} → {w.end}</div>
                  <div className="text-[9px] font-normal normal-case tracking-normal text-text-muted">({w.data.days}d)</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.key} className="border-b border-border/50 hover:bg-bg">
                <td className="py-2.5 px-3 text-xs font-medium text-text-primary">{m.label}</td>
                {weeks.map((w, i) => {
                  const val = getVal(w, m.key);
                  const prevWeek = weeks[i + 1];
                  const prevVal = prevWeek ? getVal(prevWeek, m.key) : null;
                  return (
                    <td key={w.label} className="py-2.5 px-3 text-xs text-right">
                      <span className={i === 0 ? 'font-semibold text-text-primary' : 'text-text-secondary'}>{fmt(val)}</span>
                      {prevVal != null && prevVal > 0 && (
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

function PeriodTotals({ dates }) {
  const earliest = dateKeyToISO(dates[0].date);
  const latest = dateKeyToISO(dates[dates.length - 1].date);
  const [ptStart, setPtStart] = useState(earliest);
  const [ptEnd, setPtEnd] = useState(latest);

  const filtered = dates.filter(d => {
    const iso = dateKeyToISO(d.date);
    return iso >= ptStart && iso <= ptEnd;
  });

  const totals = filtered.reduce((t, d) => {
    t.users += d.activeUsers; t.newUsers += d.newUsers; t.sessions += d.sessions;
    t.android += d.android.newUsers || 0; t.ios += d.ios.newUsers || 0;
    return t;
  }, { users: 0, newUsers: 0, sessions: 0, android: 0, ios: 0 });

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-text-primary">Period Totals</h2>
        <div className="flex items-center gap-2">
          <input type="date" value={ptStart} min={earliest} max={ptEnd}
            onChange={e => setPtStart(e.target.value)}
            className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent" />
          <span className="text-xs text-text-muted">to</span>
          <input type="date" value={ptEnd} min={ptStart} max={latest}
            onChange={e => setPtEnd(e.target.value)}
            className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent" />
          <span className="text-[10px] text-text-muted">({filtered.length} days)</span>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Total Active Users" value={fmt(totals.users)} />
        <KpiCard label="Total Installs" value={fmt(totals.newUsers)} sub={`${filtered.length} days`} />
        <KpiCard label="Total Sessions" value={fmt(totals.sessions)} />
        <KpiCard label="Android Installs" value={fmt(totals.android)} sub={`${totals.newUsers > 0 ? (totals.android / totals.newUsers * 100).toFixed(0) : 0}%`} />
        <KpiCard label="iOS Installs" value={fmt(totals.ios)} sub={`${totals.newUsers > 0 ? (totals.ios / totals.newUsers * 100).toFixed(0) : 0}%`} />
      </div>
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
  const latest = dates[dates.length - 1];
  const prev = dates.length > 1 ? dates[dates.length - 2] : null;
  const latestIso = latest ? dateKeyToISO(latest.date) : end;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">GA App</h2>
        <GaSyncBar onSynced={() => setRefreshKey(k => k + 1)} />
      </div>

      {/* KPIs - Latest Day */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Latest Day Overview</h2>
            <p className="text-xs text-text-muted mt-0.5">Date: {latest?.date ? fmtDateKey(latest.date) : '—'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="Active Users" value={fmt(latest?.activeUsers)} prev={prev?.activeUsers} />
          <KpiCard label="Downloads" value={fmt(latest?.newUsers)} prev={prev?.newUsers} />
          <KpiCard label="Sessions" value={fmt(latest?.sessions)} prev={prev?.sessions} />
          <KpiCard label="Android Downloads" value={fmt(latest?.android?.newUsers)} prev={prev?.android?.newUsers} />
          <KpiCard label="iOS Downloads" value={fmt(latest?.ios?.newUsers)} prev={prev?.ios?.newUsers} />
        </div>
      </div>

      {/* Installs Tracker with date picker */}
      {dates.length > 0 && <InstallsTracker byDate={byDate} dates={dates} />}

      {/* 4-Week Comparison */}
      <FourWeekComparison byDate={byDate} latestIso={latestIso} />

      {/* Period Totals */}
      {dates.length > 0 && <PeriodTotals dates={dates} />}

      {/* Daily Breakdown */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-base font-semibold text-text-primary mb-3">Daily Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-[2] bg-card">
              <tr className="border-b border-border">
                {['Date', 'Active Users', 'Downloads', 'Sessions', 'Engaged', 'Screen Views', 'Android Users', 'Android DL', 'iOS Users', 'iOS DL'].map(h => (
                  <th key={h} className={`text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3 ${h === 'Date' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.slice().reverse().map((d, i) => {
                const prevDay = dates.slice().reverse()[i + 1];
                return (
                  <tr key={d.date} className="border-b border-border/50 hover:bg-bg transition-colors">
                    <td className="py-2.5 px-3 text-xs text-text-primary">{fmtDateKey(d.date)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.activeUsers)} {prevDay && <Delta curr={d.activeUsers} prev={prevDay.activeUsers} />}</td>
                    <td className="py-2.5 px-3 text-xs text-right font-medium text-text-primary">{fmt(d.newUsers)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.sessions)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.engagedSessions)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.screenPageViews)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.android?.users)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-positive">{fmt(d.android?.newUsers)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.ios?.users)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-accent">{fmt(d.ios?.newUsers)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Events + Top Screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
