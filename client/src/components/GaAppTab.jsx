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

function shiftDateKey(key, days) {
  const d = new Date(`${fmtDateKey(key)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

const METRICS = [
  { label: 'Total Installs', key: 'newUsers', get: d => d?.newUsers },
  { label: 'Android', key: 'android', get: d => d?.android?.newUsers },
  { label: 'iOS', key: 'ios', get: d => d?.ios?.newUsers },
];

function CompareTable({ title, selected, compare, label1, label2 }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-3">{title}</h3>
      <table className="w-full">
        <thead className="sticky top-0 z-[2] bg-card">
          <tr className="border-b border-border">
            <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Metric</th>
            <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">{label1}</th>
            <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">{label2}</th>
            <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Change</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map(row => {
            const curr = row.get(selected);
            const prev = row.get(compare);
            return (
              <tr key={row.key} className="border-b border-border/50 hover:bg-bg">
                <td className="py-2.5 px-3 text-xs font-medium text-text-primary">{row.label}</td>
                <td className="py-2.5 px-3 text-xs text-right font-semibold text-text-primary">{fmt(curr)}</td>
                <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(prev)}</td>
                <td className="py-2.5 px-3 text-xs text-right">
                  {curr != null && prev != null && prev > 0
                    ? <Delta curr={curr} prev={prev} />
                    : <span className="text-text-muted">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InstallsCard({ dates, byDate }) {
  const latestKey = dates[dates.length - 1].date;
  const earliestKey = dates[0].date;
  const [selectedDate, setSelectedDate] = useState(dateKeyToISO(latestKey));

  const selKey = isoToDateKey(selectedDate);
  const selected = byDate[selKey] || null;
  const dodKey = shiftDateKey(selKey, -1);
  const wowKey = shiftDateKey(selKey, -7);
  const dodEntry = byDate[dodKey] || null;
  const wowEntry = byDate[wowKey] || null;

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">App Installs</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Date:</span>
            <input
              type="date"
              value={selectedDate}
              min={dateKeyToISO(earliestKey)}
              max={dateKeyToISO(latestKey)}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent"
            />
          </div>
        </div>
        {!selected && <p className="text-xs text-warning mt-2">No data for {selectedDate}</p>}
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CompareTable
            title="Day over Day"
            selected={selected}
            compare={dodEntry}
            label1={fmtDateKey(selKey)}
            label2={dodEntry ? fmtDateKey(dodKey) : 'No data'}
          />
          <CompareTable
            title="Week over Week"
            selected={selected}
            compare={wowEntry}
            label1={fmtDateKey(selKey)}
            label2={wowEntry ? fmtDateKey(wowKey) : 'No data'}
          />
        </div>
      )}
    </div>
  );
}

export default function GaAppTab({ start, end }) {
  const { data, loading, error } = useApi(`/api/analytics/ga-app?start=${start}&end=${end}`);

  if (loading) return <div className="flex items-center justify-center py-16 text-xs text-text-muted gap-2"><div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading GA App data...</div>;
  if (error) return <div className="bg-card border border-border rounded-lg p-4"><p className="text-xs text-negative">{error}</p></div>;
  if (!data) return null;

  const { daily, topEvents, topScreens } = data;

  // Aggregate by date
  const byDate = {};
  for (const r of daily) {
    if (!byDate[r.date]) byDate[r.date] = { date: r.date, activeUsers: 0, newUsers: 0, sessions: 0, engagedSessions: 0, screenPageViews: 0, android: {}, ios: {} };
    const d = byDate[r.date];
    d.activeUsers += r.activeUsers;
    d.newUsers += r.newUsers;
    d.sessions += r.sessions;
    d.engagedSessions += r.engagedSessions;
    d.screenPageViews += r.screenPageViews;
    const plat = r.platform === 'iOS' ? 'ios' : 'android';
    d[plat] = { users: r.activeUsers, newUsers: r.newUsers, sessions: r.sessions };
  }
  const dates = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  const latest = dates[dates.length - 1];
  const prev = dates.length > 1 ? dates[dates.length - 2] : null;

  // Totals for period
  const totals = dates.reduce((t, d) => {
    t.users += d.activeUsers; t.newUsers += d.newUsers; t.sessions += d.sessions;
    t.android += d.android.newUsers || 0; t.ios += d.ios.newUsers || 0;
    return t;
  }, { users: 0, newUsers: 0, sessions: 0, android: 0, ios: 0 });

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs - Latest Day */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">GA App Overview</h2>
            <p className="text-xs text-text-muted mt-0.5">Latest: {latest?.date ? `${latest.date.slice(0,4)}-${latest.date.slice(4,6)}-${latest.date.slice(6)}` : '—'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="Active Users" value={fmt(latest?.activeUsers)} prev={prev?.activeUsers} />
          <KpiCard label="New Users (Installs)" value={fmt(latest?.newUsers)} prev={prev?.newUsers} />
          <KpiCard label="Sessions" value={fmt(latest?.sessions)} prev={prev?.sessions} />
          <KpiCard label="Android Installs" value={fmt(latest?.android.newUsers)} prev={prev?.android.newUsers} />
          <KpiCard label="iOS Installs" value={fmt(latest?.ios.newUsers)} prev={prev?.ios.newUsers} />
        </div>
      </div>

      {/* App Installs — DoD & WoW with date picker */}
      {dates.length > 0 && <InstallsCard dates={dates} byDate={byDate} />}

      {/* Period Totals */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-base font-semibold text-text-primary mb-3">Period Totals</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="Total Active Users" value={fmt(totals.users)} />
          <KpiCard label="Total Installs" value={fmt(totals.newUsers)} sub={`${dates.length} days`} />
          <KpiCard label="Total Sessions" value={fmt(totals.sessions)} />
          <KpiCard label="Android Installs" value={fmt(totals.android)} sub={`${totals.newUsers > 0 ? (totals.android / totals.newUsers * 100).toFixed(0) : 0}%`} />
          <KpiCard label="iOS Installs" value={fmt(totals.ios)} sub={`${totals.newUsers > 0 ? (totals.ios / totals.newUsers * 100).toFixed(0) : 0}%`} />
        </div>
      </div>

      {/* Daily Breakdown */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-base font-semibold text-text-primary mb-3">Daily Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-[2] bg-card">
              <tr className="border-b border-border">
                {['Date', 'Active Users', 'New Users', 'Sessions', 'Engaged', 'Screen Views', 'Android Users', 'Android New', 'iOS Users', 'iOS New'].map(h => (
                  <th key={h} className={`text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3 ${h === 'Date' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.slice().reverse().map((d, i) => {
                const prevDay = dates.slice().reverse()[i + 1];
                return (
                  <tr key={d.date} className="border-b border-border/50 hover:bg-bg transition-colors">
                    <td className="py-2.5 px-3 text-xs text-text-primary">{d.date.slice(0,4)}-{d.date.slice(4,6)}-{d.date.slice(6)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.activeUsers)} {prevDay && <Delta curr={d.activeUsers} prev={prevDay.activeUsers} />}</td>
                    <td className="py-2.5 px-3 text-xs text-right font-medium text-text-primary">{fmt(d.newUsers)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.sessions)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.engagedSessions)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.screenPageViews)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.android.users)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-positive">{fmt(d.android.newUsers)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.ios.users)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-accent">{fmt(d.ios.newUsers)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Events + Top Screens side by side */}
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
