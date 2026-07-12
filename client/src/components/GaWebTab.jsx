import { useApi } from '../hooks/useApi';
import SectionNav from './SectionNav';

const GA_WEB_SECTIONS = [
  { id: 'ga-web-overview', label: 'Overview' },
  { id: 'ga-web-period-totals', label: 'Period Totals' },
  { id: 'ga-web-daily-breakdown', label: 'Daily Breakdown' },
  { id: 'ga-web-channels-sources', label: 'Channels / Sources' },
  { id: 'ga-web-top-pages', label: 'Top Pages' },
];

function fmt(n) { return n != null ? n.toLocaleString() : '—'; }
function pctD(n) { return n != null ? `${(n * 100).toFixed(1)}%` : '—'; }
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
        {prev != null && <Delta curr={parseFloat(String(value).replace(/[,%]/g, ''))} prev={prev} />}
      </div>
    </div>
  );
}

export default function GaWebTab({ start, end }) {
  const { data, loading, error } = useApi(`/api/analytics/ga-web?start=${start}&end=${end}`);

  if (loading) return <div className="flex items-center justify-center py-16 text-xs text-text-muted gap-2"><div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading GA Web data...</div>;
  if (error) return <div className="bg-card border border-border rounded-lg p-4"><p className="text-xs text-negative">{error}</p></div>;
  if (!data) return null;

  const { daily, topSources, topPages, topChannels } = data;
  const latest = daily[daily.length - 1];
  const prev = daily.length > 1 ? daily[daily.length - 2] : null;

  const totals = daily.reduce((t, d) => {
    t.users += d.activeUsers; t.newUsers += d.newUsers; t.sessions += d.sessions;
    t.conversions += d.conversions; t.pageViews += d.screenPageViews;
    return t;
  }, { users: 0, newUsers: 0, sessions: 0, conversions: 0, pageViews: 0 });

  return (
    <div className="flex flex-col gap-4">
      <SectionNav sections={GA_WEB_SECTIONS} />
      {/* KPIs */}
      <div className="bg-card border border-border rounded-lg p-4" id="ga-web-overview">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">GA Web Overview</h2>
            <p className="text-xs text-text-muted mt-0.5">Latest: {latest?.date ? `${latest.date.slice(0,4)}-${latest.date.slice(4,6)}-${latest.date.slice(6)}` : '—'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <KpiCard label="Active Users" value={fmt(latest?.activeUsers)} prev={prev?.activeUsers} />
          <KpiCard label="New Users" value={fmt(latest?.newUsers)} prev={prev?.newUsers} />
          <KpiCard label="Sessions" value={fmt(latest?.sessions)} prev={prev?.sessions} />
          <KpiCard label="Bounce Rate" value={pctD(latest?.bounceRate)} />
          <KpiCard label="Avg Duration" value={fmtDur(latest?.averageSessionDuration)} />
          <KpiCard label="Purchases" value={fmt(latest?.conversions)} prev={prev?.conversions} />
        </div>
      </div>

      {/* Period Totals */}
      <div className="bg-card border border-border rounded-lg p-4" id="ga-web-period-totals">
        <h2 className="text-base font-semibold text-text-primary mb-3">Period Totals ({daily.length} days)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="Total Users" value={fmt(totals.users)} />
          <KpiCard label="New Users" value={fmt(totals.newUsers)} />
          <KpiCard label="Sessions" value={fmt(totals.sessions)} />
          <KpiCard label="Page Views" value={fmt(totals.pageViews)} />
          <KpiCard label="Purchases" value={fmt(totals.conversions)} />
        </div>
      </div>

      {/* Daily Breakdown */}
      <div className="bg-card border border-border rounded-lg p-4" id="ga-web-daily-breakdown">
        <h2 className="text-base font-semibold text-text-primary mb-3">Daily Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-[2] bg-card">
              <tr className="border-b border-border">
                {['Date', 'Active Users', 'New Users', 'Sessions', 'Engaged', 'Bounce Rate', 'Avg Duration', 'Page Views', 'Purchases'].map(h => (
                  <th key={h} className={`text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3 ${h === 'Date' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.slice().reverse().map((d, i) => {
                const p = daily.slice().reverse()[i + 1];
                return (
                  <tr key={d.date} className="border-b border-border/50 hover:bg-bg transition-colors">
                    <td className="py-2.5 px-3 text-xs text-text-primary">{d.date.slice(0,4)}-{d.date.slice(4,6)}-{d.date.slice(6)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.activeUsers)} {p && <Delta curr={d.activeUsers} prev={p.activeUsers} />}</td>
                    <td className="py-2.5 px-3 text-xs text-right font-medium text-text-primary">{fmt(d.newUsers)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.sessions)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.engagedSessions)}</td>
                    <td className={`py-2.5 px-3 text-xs text-right ${d.bounceRate > 0.5 ? 'text-negative' : 'text-text-secondary'}`}>{pctD(d.bounceRate)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmtDur(d.averageSessionDuration)}</td>
                    <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{fmt(d.screenPageViews)}</td>
                    <td className="py-2.5 px-3 text-xs text-right font-medium text-accent">{fmt(d.conversions)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Channels + Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" id="ga-web-channels-sources">
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-base font-semibold text-text-primary mb-3">Traffic Channels</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-[2] bg-card">
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Channel</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Sessions</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Users</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">New Users</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Purchases</th>
                </tr>
              </thead>
              <tbody>
                {topChannels.map((c, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-bg">
                    <td className="py-2 px-3 text-xs text-text-primary font-medium">{c.sessionDefaultChannelGroup}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-secondary">{fmt(c.sessions)}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-secondary">{fmt(c.activeUsers)}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-secondary">{fmt(c.newUsers)}</td>
                    <td className="py-2 px-3 text-xs text-right font-medium text-accent">{fmt(c.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-base font-semibold text-text-primary mb-3">Top Sources</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-[2] bg-card">
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Source</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Sessions</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Users</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Purchases</th>
                </tr>
              </thead>
              <tbody>
                {topSources.map((s, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-bg">
                    <td className="py-2 px-3 text-xs text-text-secondary">{s.sessionSource || '(direct)'}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-secondary">{fmt(s.sessions)}</td>
                    <td className="py-2 px-3 text-xs text-right text-text-secondary">{fmt(s.activeUsers)}</td>
                    <td className="py-2 px-3 text-xs text-right font-medium text-accent">{fmt(s.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Top Pages */}
      <div className="bg-card border border-border rounded-lg p-4" id="ga-web-top-pages">
        <h2 className="text-base font-semibold text-text-primary mb-3">Top Pages</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-[2] bg-card">
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Page</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Views</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Users</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Avg Duration</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Bounce Rate</th>
              </tr>
            </thead>
            <tbody>
              {topPages.map((p, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-bg">
                  <td className="py-2 px-3 text-xs text-text-secondary max-w-[300px] truncate" title={p.pagePath}>{p.pagePath}</td>
                  <td className="py-2 px-3 text-xs text-right font-medium text-text-primary">{fmt(p.screenPageViews)}</td>
                  <td className="py-2 px-3 text-xs text-right text-text-secondary">{fmt(p.activeUsers)}</td>
                  <td className="py-2 px-3 text-xs text-right text-text-secondary">{fmtDur(p.averageSessionDuration)}</td>
                  <td className={`py-2 px-3 text-xs text-right ${p.bounceRate > 0.5 ? 'text-negative' : 'text-text-secondary'}`}>{pctD(p.bounceRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
