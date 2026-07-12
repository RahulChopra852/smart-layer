import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import SectionNav from './SectionNav';

const GOKWIK_SECTIONS = [
  { id: 'gokwik-header', label: 'Overview' },
  { id: 'gokwik-products', label: 'Products Sold' },
  { id: 'gokwik-utm', label: 'UTM Attribution' },
  { id: 'gokwik-landing-pages', label: 'Landing Pages' },
  { id: 'gokwik-daily-table', label: 'Daily Breakdown' },
  { id: 'gokwik-loyalty', label: 'Loyalty Points DoD' },
];

const pf = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const fmt = (v) => v == null ? '—' : v.toLocaleString();

function StatCard({ label, value, sub, color = 'text-text-primary' }) {
  return (
    <div className="bg-bg rounded-md p-3 border border-border/50">
      <div className="text-[10px] text-text-muted uppercase">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function BarChart({ data, maxVal }) {
  if (!data.length) return <div className="text-xs text-text-muted">No data</div>;
  const max = maxVal || data[0]?.[1] || 1;
  return (
    <div className="flex flex-col gap-1.5">
      {data.map(([name, count]) => (
        <div key={name} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-text-primary truncate" title={name}>{name}</div>
            <div className="h-1.5 bg-border/50 rounded-full mt-0.5 overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(count / max) * 100}%` }} />
            </div>
          </div>
          <span className="text-xs font-medium text-text-secondary shrink-0">{count}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Sub-section: Daily Breakdown Table ── */
function DailyTable({ daily }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-base font-semibold text-text-primary mb-3">Daily Breakdown</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-[2] bg-card">
            <tr className="border-b border-border">
              {['Date', 'Orders', 'Prepaid', 'COD', 'RTO Score', 'Top Coupon', 'Top Source', 'New/Ret'].map(h => (
                <th key={h} className={`text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3 ${h === 'Date' ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {daily.map((row, i) => {
              const total = pf(row.total_orders) || 0;
              const prev = daily[i + 1];
              const prevTotal = prev ? (pf(prev.total_orders) || 0) : null;
              const delta = prevTotal != null && prevTotal > 0 ? (((total - prevTotal) / prevTotal) * 100).toFixed(1) : null;
              const highRto = pf(row.high_rto_pct) || 0;
              return (
                <tr key={row.date} className="border-b border-border/50 hover:bg-bg transition-colors">
                  <td className="py-2.5 px-3 text-sm font-medium text-text-primary">{row.date}</td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-primary font-semibold">
                    {fmt(total)}
                    {delta != null && (
                      <span className={`ml-1.5 text-[10px] font-medium ${parseFloat(delta) >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {parseFloat(delta) >= 0 ? '+' : ''}{delta}%
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-secondary">{fmt(pf(row.prepaid_orders))}</td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-secondary">{fmt(pf(row.cod_orders))}</td>
                  <td className="py-2.5 px-3 text-sm text-right">
                    <span className={highRto > 20 ? 'text-negative' : highRto > 10 ? 'text-warning' : 'text-positive'}>{row.avg_rto_score || '—'}</span>
                    <span className="text-[10px] text-text-muted ml-1">({highRto}% high)</span>
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-secondary">{row.top_coupon || '—'}</td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-secondary">{row.top_utm_source || '—'}</td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-secondary">{fmt(pf(row.new_customers))}/{fmt(pf(row.returning_customers))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Sub-section: Top Products ── */
function ProductsSection({ selectedDate }) {
  const { data, loading } = useApi('/api/analytics/gokwik-products');
  const products = data?.products || [];
  const [expanded, setExpanded] = useState(null);

  const filtered = useMemo(() => {
    if (!selectedDate) return products;
    return products.filter(p => p.date === selectedDate);
  }, [products, selectedDate]);

  const top25 = filtered.slice(0, 25);
  const maxCount = top25[0] ? (parseInt(top25[0].order_count) || 1) : 1;

  if (loading) return null;
  if (!top25.length) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary">Top Products Sold</h2>
        <span className="text-[10px] text-text-muted">{selectedDate || 'All dates'} · {filtered.length} products</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-[11px] font-medium text-text-muted uppercase py-2 px-2 w-6">#</th>
              <th className="text-left text-[11px] font-medium text-text-muted uppercase py-2 px-3">Product</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">Orders</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">Qty</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">Revenue</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">Prepaid</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">COD</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">RTO</th>
              <th className="text-left text-[11px] font-medium text-text-muted uppercase py-2 px-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {top25.map((p, i) => {
              const count = parseInt(p.order_count) || 0;
              const qty = parseInt(p.quantity) || count;
              const revenue = pf(p.revenue) || 0;
              const avgRto = pf(p.avg_rto_score) || 0;
              const highRto = pf(p.high_rto_pct) || 0;
              const isExpanded = expanded === i;
              return (
                <tr key={p.product_name + p.date + i}
                  className={`border-b border-border/50 hover:bg-bg transition-colors cursor-pointer ${isExpanded ? 'bg-bg' : ''}`}
                  onClick={() => setExpanded(isExpanded ? null : i)}>
                  <td className="py-2.5 px-2 text-xs text-text-muted">{i + 1}</td>
                  <td className="py-2.5 px-3 max-w-[260px]">
                    <div className="text-sm text-text-primary truncate font-medium" title={p.product_name}>{p.product_name}</div>
                    {isExpanded && (
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                        {p.top_coupon && (
                          <span className="bg-accent/10 text-accent px-1.5 py-0.5 rounded">Coupon: {p.top_coupon}</span>
                        )}
                        {p.top_utm_source && (
                          <span className="bg-positive/10 text-positive px-1.5 py-0.5 rounded">UTM: {p.top_utm_source}</span>
                        )}
                        {(pf(p.avg_discount) || 0) > 0 && (
                          <span className="bg-warning/10 text-warning px-1.5 py-0.5 rounded">Avg Disc: ₹{p.avg_discount}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right font-semibold text-text-primary">{count}</td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-secondary">{qty}</td>
                  <td className="py-2.5 px-3 text-sm text-right text-text-primary font-medium">
                    {revenue > 0 ? `₹${revenue.toLocaleString()}` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-right text-positive">{p.payment_prepaid || 0}</td>
                  <td className="py-2.5 px-3 text-sm text-right text-warning">{p.payment_cod || 0}</td>
                  <td className="py-2.5 px-3 text-sm text-right">
                    <span className={avgRto >= 50 ? 'text-negative' : avgRto >= 30 ? 'text-warning' : 'text-positive'}>
                      {avgRto > 0 ? avgRto : '—'}
                    </span>
                    {highRto > 0 && <span className="text-[10px] text-text-muted ml-0.5">({highRto}%h)</span>}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="h-1.5 bg-border/50 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Sub-section: UTM Attribution ── */
function UtmSection({ selectedDate }) {
  const { data, loading } = useApi('/api/analytics/gokwik-utm');
  const utmRows = data?.utm || [];

  const breakdown = useMemo(() => {
    const rows = selectedDate ? utmRows.filter(r => r.date === selectedDate) : utmRows;
    const sources = {}, mediums = {}, campaigns = {};
    rows.forEach(r => {
      const count = parseInt(r.order_count) || 0;
      const src = r.utm_source || '(none)';
      const med = r.utm_medium || '(none)';
      const camp = r.utm_campaign || '(none)';
      if (src !== '(none)') sources[src] = (sources[src] || 0) + count;
      if (med !== '(none)') mediums[med] = (mediums[med] || 0) + count;
      if (camp !== '(none)') campaigns[camp] = (campaigns[camp] || 0) + count;
    });
    return {
      sources: Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 10),
      mediums: Object.entries(mediums).sort((a, b) => b[1] - a[1]).slice(0, 10),
      campaigns: Object.entries(campaigns).sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [utmRows, selectedDate]);

  if (loading || (!breakdown.sources.length && !breakdown.mediums.length)) return null;

  const globalMax = Math.max(
    breakdown.sources[0]?.[1] || 0,
    breakdown.mediums[0]?.[1] || 0,
    breakdown.campaigns[0]?.[1] || 0,
    1
  );

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary">UTM Attribution</h2>
        <span className="text-[10px] text-text-muted">{selectedDate || 'All dates'}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <div className="text-xs text-text-muted uppercase mb-2 font-medium">Sources</div>
          <BarChart data={breakdown.sources} maxVal={globalMax} />
        </div>
        <div>
          <div className="text-xs text-text-muted uppercase mb-2 font-medium">Mediums</div>
          <BarChart data={breakdown.mediums} maxVal={globalMax} />
        </div>
        <div>
          <div className="text-xs text-text-muted uppercase mb-2 font-medium">Campaigns</div>
          <BarChart data={breakdown.campaigns} maxVal={globalMax} />
        </div>
      </div>
    </div>
  );
}

/* ── Sub-section: Landing Pages ── */
function LandingPagesSection({ selectedDate }) {
  const { data, loading } = useApi('/api/analytics/gokwik-landing-pages');
  const pages = data?.pages || [];

  const filtered = useMemo(() => {
    const rows = selectedDate ? pages.filter(r => r.date === selectedDate) : pages;
    const aggregated = {};
    rows.forEach(r => {
      const page = r.landing_page;
      if (!page) return;
      if (!aggregated[page]) aggregated[page] = { count: 0, source: '' };
      aggregated[page].count += parseInt(r.order_count) || 0;
      if (!aggregated[page].source && r.top_utm_source) aggregated[page].source = r.top_utm_source;
    });
    return Object.entries(aggregated)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15);
  }, [pages, selectedDate]);

  if (loading || !filtered.length) return null;

  const maxCount = filtered[0]?.[1].count || 1;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary">Top Landing Pages</h2>
        <span className="text-[10px] text-text-muted">{selectedDate || 'All dates'}</span>
      </div>
      <div className="flex flex-col gap-2">
        {filtered.map(([page, v]) => {
          const short = page.replace(/^https?:\/\/[^/]+/, '').slice(0, 60) || '/';
          return (
            <div key={page} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-primary truncate" title={page}>{short}</span>
                  {v.source && <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded shrink-0">{v.source}</span>}
                </div>
                <div className="h-1.5 bg-border/50 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-positive rounded-full" style={{ width: `${(v.count / maxCount) * 100}%` }} />
                </div>
              </div>
              <span className="text-sm font-semibold text-text-primary shrink-0">{v.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Line chart used by Loyalty Points DoD ── */
function LineChart({ data, valueFmt = (v) => `₹${v.toLocaleString()}` }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  if (!data.length) return null;

  const w = 600, h = 260, padX = 44, padY = 20;
  const innerW = w - padX * 2, innerH = h - padY * 2;
  const values = data.map(d => d.value).filter(v => v > 0);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  // Log scale, not linear — this series jumps ~6-8x partway through (₹22-38k early on,
  // ₹180k+ later). A linear axis has to fit both on the same pixel range, which flattens the
  // early week's real ~65% swings into a barely-visible sliver near the bottom. Log space
  // shows proportional change instead of absolute change, so both halves read clearly.
  const logMin = Math.log(rawMin || 1);
  const logMax = Math.log(rawMax || 1);
  const logRange = (logMax - logMin) || 1;
  const pad = logRange * 0.03;
  const max = logMax + pad;
  const min = logMin - pad;
  const range = (max - min) || 1;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    ...d,
    x: padX + i * stepX,
    y: padY + (1 - (Math.log(d.value || 1) - min) / range) * innerH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padY + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`;

  // Cap the number of x-axis date labels so they don't overlap on longer ranges.
  const maxTicks = 6;
  const tickStep = Math.max(1, Math.ceil((data.length - 1) / (maxTicks - 1)));
  const tickIndices = [];
  for (let i = 0; i < data.length; i += tickStep) tickIndices.push(i);
  if (tickIndices[tickIndices.length - 1] !== data.length - 1) tickIndices.push(data.length - 1);

  return (
    <div className="mb-2">
      <div className="relative text-accent">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-56">
          {[0, 0.5, 1].map(frac => {
            const y = padY + frac * innerH;
            const val = Math.exp(max - frac * range);
            return (
              <g key={frac}>
                <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="currentColor" className="text-border" strokeWidth="1" strokeDasharray="3,3" />
                <text x={padX - 6} y={y + 3} textAnchor="end" className="fill-current text-text-muted" fontSize="9">{valueFmt(Math.round(val))}</text>
              </g>
            );
          })}
          <path d={areaPath} fill="currentColor" opacity="0.08" stroke="none" />
          <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={hoverIdx === i ? 4.5 : 2.5} fill="currentColor"
              stroke="white" strokeWidth={hoverIdx === i ? 1.5 : 0}
              onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer transition-all" />
          ))}
        </svg>
        {hoverIdx != null && (
          <div className="absolute bg-gray-900 text-white text-[10px] px-2 py-1 rounded pointer-events-none z-10 whitespace-nowrap"
            style={{ left: `${(points[hoverIdx].x / w) * 100}%`, top: `${(points[hoverIdx].y / h) * 100}%`, transform: 'translate(-50%, -140%)' }}>
            {points[hoverIdx].date}: {valueFmt(points[hoverIdx].value)}
          </div>
        )}
      </div>
      <div className="relative h-4 mt-1">
        {tickIndices.map(i => (
          <span key={i} className="absolute text-[9px] text-text-muted -translate-x-1/2"
            style={{ left: `${(points[i].x / w) * 100}%` }}>
            {points[i].date.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Sub-section: Loyalty Points DoD ── */
function LoyaltyTrend({ daily }) {
  if (!daily.length) return null;
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  let cumulative = 0;
  const hasLoyalty = sorted.some(r => (pf(r.loyalty_points_redeemed) || 0) > 0);
  if (!hasLoyalty) return null;

  const chartData = sorted.map(row => ({ date: row.date, value: pf(row.loyalty_points_redeemed) || 0 }));

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-base font-semibold text-text-primary mb-3">Loyalty Points Redeemed (DoD)</h2>
      <LineChart data={chartData} />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-[11px] font-medium text-text-muted uppercase py-2 px-3">Date</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">Day Total</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">Cumulative</th>
              <th className="text-right text-[11px] font-medium text-text-muted uppercase py-2 px-3">Total Discount</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const dayLoyalty = pf(row.loyalty_points_redeemed) || 0;
              cumulative += dayLoyalty;
              return (
                <tr key={row.date} className="border-b border-border/50 hover:bg-bg transition-colors">
                  <td className="py-2 px-3 text-sm text-text-primary">{row.date}</td>
                  <td className="py-2 px-3 text-sm text-right text-accent font-medium">{dayLoyalty > 0 ? `₹${dayLoyalty.toLocaleString()}` : '—'}</td>
                  <td className="py-2 px-3 text-sm text-right text-text-primary font-semibold">₹{cumulative.toLocaleString()}</td>
                  <td className="py-2 px-3 text-sm text-right text-text-secondary">₹{(pf(row.total_discount) || 0).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main Tab ── */
export default function GokwikTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useApi(`/api/analytics/gokwik-daily?_k=${refreshKey}`);
  const daily = data?.daily || [];

  const dates = daily.map(r => r.date);
  const [selectedDate, setSelectedDate] = useState(null);

  const totals = useMemo(() => {
    let orders = 0, prepaid = 0, cod = 0, newC = 0, retC = 0;
    daily.forEach(r => {
      orders += pf(r.total_orders) || 0;
      prepaid += pf(r.prepaid_orders) || 0;
      cod += pf(r.cod_orders) || 0;
      newC += pf(r.new_customers) || 0;
      retC += pf(r.returning_customers) || 0;
    });
    return { orders, prepaid, cod, newC, retC, days: daily.length };
  }, [daily]);

  return (
    <div className="flex flex-col gap-4">
      <SectionNav sections={GOKWIK_SECTIONS} />
      {/* Header + stats */}
      <div className="bg-card border border-border rounded-lg p-4" id="gokwik-header">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">GoKwik Orders</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {daily.length ? `${daily.length} days · ${daily[daily.length - 1]?.date} to ${daily[0]?.date}` : 'No data synced yet — set up the Apps Script'}
            </p>
          </div>
          <button onClick={() => setRefreshKey(k => k + 1)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 transition-opacity">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
            <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading...
          </div>
        ) : error ? (
          <p className="text-xs text-negative text-center py-8">{error}</p>
        ) : daily.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-text-muted mb-1">No GoKwik data yet</p>
            <p className="text-xs text-text-muted">Deploy the Apps Script to start syncing order reports</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
              <StatCard label="Total Orders" value={fmt(totals.orders)} sub={`${totals.days} days`} color="text-accent" />
              <StatCard label="Prepaid" value={fmt(totals.prepaid)}
                sub={totals.orders ? `${((totals.prepaid / totals.orders) * 100).toFixed(0)}%` : ''} color="text-positive" />
              <StatCard label="COD" value={fmt(totals.cod)}
                sub={totals.orders ? `${((totals.cod / totals.orders) * 100).toFixed(0)}%` : ''} color="text-warning" />
              <StatCard label="New Customers" value={fmt(totals.newC)} color="text-text-primary" />
              <StatCard label="Returning" value={fmt(totals.retC)} color="text-text-primary" />
            </div>

            {/* Date filter chips */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button onClick={() => setSelectedDate(null)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                  !selectedDate ? 'bg-accent text-white' : 'bg-bg text-text-muted hover:text-text-secondary border border-border'
                }`}>All</button>
              {dates.slice(0, 10).map(d => (
                <button key={d} onClick={() => setSelectedDate(d)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
                    selectedDate === d ? 'bg-accent text-white' : 'bg-bg text-text-muted hover:text-text-secondary border border-border'
                  }`}>{d.slice(5)}</button>
              ))}
            </div>

            {daily[0] && (
              <div className="bg-bg rounded-md p-3 border border-border/50">
                <div className="text-[10px] text-text-muted uppercase mb-1">Latest: {daily[0].date}</div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-text-muted">Orders:</span> <span className="font-medium">{daily[0].total_orders}</span></div>
                  <div><span className="text-text-muted">Top Coupon:</span> <span className="font-medium">{daily[0].top_coupon || '—'}</span> ({daily[0].coupon_usage_count || 0}x)</div>
                  <div><span className="text-text-muted">Top Source:</span> <span className="font-medium">{daily[0].top_utm_source || '—'}</span></div>
                  <div><span className="text-text-muted">Store:</span> <span className="font-medium">{daily[0].top_store_source || '—'}</span></div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Products sold */}
      {daily.length > 0 && <div id="gokwik-products"><ProductsSection selectedDate={selectedDate} /></div>}

      {/* UTM Attribution */}
      {daily.length > 0 && <div id="gokwik-utm"><UtmSection selectedDate={selectedDate} /></div>}

      {/* Landing Pages */}
      {daily.length > 0 && <div id="gokwik-landing-pages"><LandingPagesSection selectedDate={selectedDate} /></div>}

      {/* Daily table */}
      {daily.length > 0 && <div id="gokwik-daily-table"><DailyTable daily={daily} /></div>}

      {/* Loyalty Points DoD */}
      <div id="gokwik-loyalty"><LoyaltyTrend daily={daily} /></div>
    </div>
  );
}
