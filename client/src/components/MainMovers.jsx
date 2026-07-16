import { useState } from 'react';
import { useApi } from '../hooks/useApi';

const fmt = (v) => v == null ? '—' : Math.round(v).toLocaleString();
const inr = (v) => v == null ? '—' : `₹${Math.round(v).toLocaleString()}`;

// ATC/IC/RPP/Orders/CVR% moved to Commerce Snapshot — those are account-wide, not per landing
// page, so they don't fit this card's page-mover focus. Sessions/Revenue/Units Sold remain.
const METRIC_LABELS = {
  sessions: 'Sessions',
  revenue: 'Revenue',
  units_sold: 'Units Sold',
};

const WINDOWS = [
  { key: 7, label: '7 Days' },
  { key: 15, label: '15 Days' },
  { key: 30, label: '30 Days' },
];

function MetricCard({ m }) {
  const isCurrency = m.metric === 'revenue';
  const fmtVal = (v) => v == null ? '—' : isCurrency ? inr(v) : fmt(v);
  const up = m.change != null && m.change > 0;
  const down = m.change != null && m.change < 0;
  return (
    <div className="bg-bg rounded-md p-3 border border-border/50">
      <div className="text-xs font-semibold text-text-secondary mb-1">{METRIC_LABELS[m.metric] || m.metric}</div>
      <div className="text-lg font-bold text-text-primary">{fmtVal(m.curr)}</div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-text-muted">prev: {fmtVal(m.prior)}</span>
        {m.change != null && (
          <span className={`text-[11px] font-semibold ${up ? 'text-positive' : down ? 'text-negative' : 'text-text-muted'}`}>
            {up ? '+' : ''}{m.change.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function MoverRow({ p }) {
  const up = p.change > 0;
  return (
    <div className={`flex items-center justify-between p-2 rounded-md border ${up ? 'border-positive/30 bg-positive/5' : 'border-negative/30 bg-negative/5'}`}>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-text-primary truncate" title={p.landing_page}>{p.landing_page}</div>
        <div className="text-[10px] text-text-muted">{fmt(p.priorSessions)} → {fmt(p.currSessions)} sessions</div>
      </div>
      <span className={`text-xs font-semibold ml-2 whitespace-nowrap ${up ? 'text-positive' : 'text-negative'}`}>
        {up ? '+' : ''}{p.change.toFixed(1)}%
      </span>
    </div>
  );
}

export default function MainMovers({ end }) {
  const [windowDays, setWindowDays] = useState(7);
  const anchor = end || new Date().toISOString().slice(0, 10);
  const { data, loading, error } = useApi(`/api/analytics/main-movers?window=${windowDays}&end=${anchor}`);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Main Movers</h2>
          {data && (
            <p className="text-xs text-text-muted mt-0.5">
              {data.currRange.start} to {data.currRange.end} vs {data.priorRange.start} to {data.priorRange.end}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 bg-bg rounded-lg p-1">
          {WINDOWS.map(w => (
            <button key={w.key} onClick={() => setWindowDays(w.key)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${windowDays === w.key ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2"><div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading movers...</div>}
      {error && <p className="text-xs text-negative">{error}</p>}

      {data && (
        <>
          <h3 className="text-xs font-semibold text-text-primary mb-2">Sessions &amp; Sales — current vs prior period</h3>
          {data.salesRange.end !== data.currRange.end && (
            <p className="text-[11px] text-text-muted mb-2">
              Revenue/Units Sold reflect {data.salesRange.start} to {data.salesRange.end} — Shopify's 2-hourly sync hasn't posted {data.currRange.end} yet.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {data.metrics.map(m => <MetricCard key={m.metric} m={m} />)}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-text-primary mb-2">Top Gainers (landing pages)</h3>
              {data.gainers.length === 0 ? (
                <p className="text-xs text-text-muted py-4 text-center bg-bg rounded-md border border-border/50">
                  No pages with 20+ sessions in both windows{data.pageDataFrom ? ` — page-level data only goes back to ${data.pageDataFrom}` : ''}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {data.gainers.map(p => <MoverRow key={p.landing_page} p={p} />)}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-text-primary mb-2">Top Decliners (landing pages)</h3>
              {data.decliners.length === 0 ? (
                <p className="text-xs text-text-muted py-4 text-center bg-bg rounded-md border border-border/50">
                  No pages with 20+ sessions in both windows{data.pageDataFrom ? ` — page-level data only goes back to ${data.pageDataFrom}` : ''}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {data.decliners.map(p => <MoverRow key={p.landing_page} p={p} />)}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
