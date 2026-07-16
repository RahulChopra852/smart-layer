import { useApi } from '../hooks/useApi';

const fmt = (v) => v == null ? '—' : v.toLocaleString();
const fmtCur = (v) => v == null ? '—' : `₹${Math.round(v).toLocaleString()}`;
const fmtCurShort = (v) => {
  if (v == null) return '—';
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString()}`;
};

// % change (not absolute delta) to match the at-a-glance Shopify-style cards this was modeled
// on — "today" is a live/partial day, so a raw count delta is less meaningful than the trend.
function pctDelta(curr, prev) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}
function fmtPctDelta(v) {
  if (v == null) return null;
  const s = Math.abs(v).toFixed(1).replace(/\.0$/, '');
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${s}%`;
}

function timeAgo(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Small inline trend line, same idea as Shopify's own metric cards — rises/falls with the raw
// trailing values, colored by whether the period-over-period change is up or down.
function MiniSparkline({ points, positive }) {
  if (!points || points.filter(p => p != null).length < 2) return null;
  const w = 56, h = 22, pad = 2;
  const vals = points.map(p => p ?? 0);
  const max = Math.max(...vals), min = Math.min(...vals);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (vals.length - 1);
  const path = vals
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(pad + i * stepX).toFixed(1)} ${(h - pad - ((v - min) / range) * (h - pad * 2)).toFixed(1)}`)
    .join(' ');
  const color = positive == null ? '#94A3B8' : positive ? '#10B981' : '#EF4444';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetricCard({ label, value, delta, trend }) {
  const positive = delta == null ? null : delta > 0;
  const deltaColor = positive == null ? 'text-text-muted' : positive ? 'text-positive' : 'text-negative';
  return (
    <div className="flex-1 min-w-[140px] flex flex-col items-center text-center gap-1.5 px-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="flex items-center gap-3">
        <div className="text-xl font-bold text-text-primary">{value}</div>
        <MiniSparkline points={trend} positive={positive} />
        {delta != null && <span className={`text-xs font-medium ${deltaColor}`}>{fmtPctDelta(delta)}</span>}
      </div>
    </div>
  );
}

export default function CommerceSnapshot() {
  const { data, loading, error } = useApi('/api/analytics/commerce-snapshot');

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-center py-8 text-xs text-text-muted gap-2">
        <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />
        Loading commerce snapshot...
      </div>
    );
  }
  if (error) return <div className="bg-card border border-border rounded-lg p-4"><p className="text-xs text-negative">{error}</p></div>;
  if (!data) return null;

  const { sessions, orders, atc, revenue, croSyncedAt } = data;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Commerce Snapshot</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Sessions/ATC/Orders compared to yesterday · Revenue: Shopify, synced every 2h
          </p>
        </div>
      </div>

      <div className="flex items-stretch divide-x divide-border/50 border border-border/50 rounded-md bg-bg">
        <MetricCard
          label="Sessions"
          value={fmt(sessions.today.value)}
          delta={pctDelta(sessions.today.value, sessions.yesterday.value)}
          trend={sessions.trend}
        />
        <MetricCard
          label="ATC"
          value={fmt(atc.today.value)}
          delta={pctDelta(atc.today.value, orders.yesterday.atc)}
          trend={atc.trend}
        />
        <MetricCard
          label="Orders"
          value={fmt(orders.today.total)}
          delta={pctDelta(orders.today.total, orders.yesterday.total)}
          trend={orders.trend}
        />
        <MetricCard
          label="Revenue"
          value={fmtCurShort(revenue.yesterday.revenue)}
          delta={pctDelta(revenue.yesterday.revenue, revenue.dayBefore.revenue)}
          trend={revenue.trend}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted flex-wrap gap-1">
        <span>
          Orders {orders.today.date}: Web {fmt(orders.today.web)} · App {fmt(orders.today.app)}
          {' · '}Revenue as of {revenue.yesterday.date} ({fmtCur(revenue.yesterday.revenue)}, {fmt(revenue.yesterday.units)} units) — showing yesterday's complete total; today's is still partial
        </span>
        <span className="flex items-center gap-3">
          {croSyncedAt && <span>CRO synced {timeAgo(croSyncedAt)}</span>}
          {revenue.lastSyncedAt && <span>Shopify revenue synced {timeAgo(revenue.lastSyncedAt)}</span>}
        </span>
      </div>
    </div>
  );
}
