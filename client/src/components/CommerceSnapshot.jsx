import { useApi } from '../hooks/useApi';

const fmt = (v) => v == null ? '—' : v.toLocaleString();
const fmtCur = (v) => v == null ? '—' : `₹${Math.round(v).toLocaleString()}`;

function Delta({ value }) {
  if (value == null || value === 0) return null;
  const positive = value > 0;
  return (
    <span className={`text-[11px] font-medium ml-1.5 ${positive ? 'text-positive' : 'text-negative'}`}>
      {positive ? '+' : ''}{fmt(value)}
    </span>
  );
}

function timeAgo(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
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

  const { orders, atc, cvr, revenue, croSyncedAt } = data;
  const fmtPct = (v) => v == null ? '—' : `${v.toFixed(2)}%`;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Commerce Snapshot</h2>
          <p className="text-xs text-text-muted mt-0.5">Orders/ATC/CVR%: live from CRO sheet (every 2 min) · Revenue/Units: Shopify, once nightly at 12:15am</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-bg rounded-md p-3 border border-border/50">
          <div className="text-[10px] text-text-muted uppercase">Orders Today (live) — {orders.today.date}</div>
          <div className="text-xl font-bold text-accent">{fmt(orders.today.total)}<Delta value={orders.dodDelta} /></div>
          <div className="text-[10px] text-text-muted mt-0.5">Web {fmt(orders.today.web)} · App {fmt(orders.today.app)}</div>
        </div>
        <div className="bg-bg rounded-md p-3 border border-border/50">
          <div className="text-[10px] text-text-muted uppercase">ATC Today (live) — {atc.today.date}</div>
          <div className="text-xl font-bold text-accent">{fmt(atc.today.value)}<Delta value={atc.dodDelta} /></div>
          <div className="text-[10px] text-text-muted mt-0.5">7d: {fmt(atc.last7.value)} · Prior 7d: {fmt(atc.prior7.value)}</div>
        </div>
        <div className="bg-bg rounded-md p-3 border border-border/50">
          <div className="text-[10px] text-text-muted uppercase">CVR% Today (live) — {cvr.today.date}</div>
          <div className="text-xl font-bold text-accent">{fmtPct(cvr.today.value)}<Delta value={cvr.dodDelta} /></div>
          <div className="text-[10px] text-text-muted mt-0.5">Yesterday ({cvr.yesterday.date}): {fmtPct(cvr.yesterday.value)}</div>
        </div>
        <div className="bg-bg rounded-md p-3 border border-border/50">
          <div className="text-[10px] text-text-muted uppercase">Orders: 7d vs Prior 7d</div>
          <div className="text-xl font-bold text-text-primary">{fmt(orders.last7.total)}<Delta value={orders.wowDelta} /></div>
          <div className="text-[10px] text-text-muted mt-0.5">Prior: {fmt(orders.prior7.total)}</div>
        </div>
        <div className="bg-bg rounded-md p-3 border border-border/50">
          <div className="text-[10px] text-text-muted uppercase">Units — Yesterday ({revenue.yesterday.date})</div>
          <div className="text-xl font-bold text-text-primary">{fmt(revenue.yesterday.units)}<Delta value={revenue.dodUnitsDelta} /></div>
          <div className="text-[10px] text-text-muted mt-0.5">Day before ({revenue.dayBefore.date}): {fmt(revenue.dayBefore.units)}</div>
        </div>
        <div className="bg-bg rounded-md p-3 border border-border/50">
          <div className="text-[10px] text-text-muted uppercase">Revenue — Yesterday ({revenue.yesterday.date})</div>
          <div className="text-xl font-bold text-positive">{fmtCur(revenue.yesterday.revenue)}<Delta value={revenue.dodRevenueDelta} /></div>
          <div className="text-[10px] text-text-muted mt-0.5">Day before ({revenue.dayBefore.date}): {fmtCur(revenue.dayBefore.revenue)}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-text-muted flex-wrap gap-1">
        <span>
          Revenue 7d ({revenue.last7Range.start} to {revenue.last7Range.end}): ₹{Math.round(revenue.last7.revenue).toLocaleString()} vs prior (
          {revenue.prior7Range.start} to {revenue.prior7Range.end}): ₹{Math.round(revenue.prior7.revenue).toLocaleString()} <Delta value={Math.round(revenue.wowRevenueDelta)} />
        </span>
        <span className="flex items-center gap-3">
          {croSyncedAt && <span>CRO synced {timeAgo(croSyncedAt)}</span>}
          {revenue.lastSyncedAt && <span>Shopify revenue synced {timeAgo(revenue.lastSyncedAt)}</span>}
        </span>
      </div>
    </div>
  );
}
