import { useState } from 'react';
import { useApi } from '../hooks/useApi';

function Delta({ value, suffix = '' }) {
  if (value == null || isNaN(value)) return <span className="text-[11px] text-text-muted">—</span>;
  const pos = value > 0;
  const neg = value < 0;
  return (
    <span className={`text-[11px] font-medium ${pos ? 'text-positive' : neg ? 'text-negative' : 'text-text-muted'}`}>
      {pos ? '+' : ''}{typeof value === 'number' && suffix === '%' ? value.toFixed(0) : value}{suffix}
    </span>
  );
}

function LowStockCard() {
  const { data, loading, error } = useApi('/api/analytics/low-stock');
  const alerts = data?.alerts || [];
  const [open, setOpen] = useState(false);

  const oosCount = alerts.filter(a => a.qty === 0).length;
  const criticalCount = alerts.filter(a => a.qty > 0 && a.qty < 20).length;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => !loading && setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <span className="text-text-muted text-sm">{open ? '▼' : '▶'}</span>
          <div>
            <h2 className="text-base font-semibold text-text-primary">OOS Alerts</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {loading ? 'Loading...' : alerts.length === 0 ? 'All key products well-stocked' : `${oosCount} OOS · ${criticalCount} critical · ${alerts.length} total low stock`}
            </p>
          </div>
        </div>
        {alerts.length > 0 && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${oosCount > 0 ? 'bg-negative/15 text-negative' : 'bg-warning/15 text-warning'}`}>
            {alerts.length} low stock
          </span>
        )}
      </div>

      {loading && open ? (
        <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2 mt-4">
          <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading inventory...
        </div>
      ) : error && open ? (
        <p className="text-xs text-negative text-center py-8 mt-4">{error}</p>
      ) : open && alerts.length === 0 ? (
        <p className="text-xs text-positive text-center py-8 mt-4">All key products are well-stocked</p>
      ) : open && (
        <div className="overflow-x-auto mt-4">
          <table className="w-full">
            <thead className="sticky top-0 z-[2] bg-card">
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Product</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Variant</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">SKU</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Qty</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-bg transition-colors">
                  <td className="py-2.5 px-3 text-xs text-text-primary max-w-[240px] truncate" title={a.product_title}>
                    {a.product_title}
                  </td>
                  <td className="py-2.5 px-3 text-xs text-text-secondary">{a.variant_title}</td>
                  <td className="py-2.5 px-3 text-xs text-text-muted font-mono">{a.sku}</td>
                  <td className={`py-2.5 px-3 text-xs text-right font-semibold ${a.qty === 0 ? 'text-negative' : a.qty < 20 ? 'text-warning' : 'text-text-primary'}`}>
                    {a.qty}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      a.qty === 0 ? 'bg-negative/15 text-negative' : a.qty < 20 ? 'bg-warning/15 text-warning' : 'bg-accent/15 text-accent'
                    }`}>
                      {a.qty === 0 ? 'OOS' : a.qty < 20 ? 'Critical' : 'Low'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ProductsTab({ start, end }) {
  const [selectedDate, setSelectedDate] = useState(end);
  const { data, loading, error } = useApi(`/api/analytics/products?date=${selectedDate}`);
  const products = data?.products || [];
  const dates = data?.dates || {};
  const availableDates = data?.availableDates || [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const actualDate = dates.today || selectedDate;
  const isToday = actualDate === todayStr;
  const mismatch = actualDate !== selectedDate;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-text-primary">Products Insights</h2>
              {actualDate && (
                <span className="relative flex h-2.5 w-2.5" title={isToday ? 'Live — today' : `Viewing ${actualDate}`}>
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isToday ? 'bg-positive' : 'bg-accent'}`} />
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isToday ? 'bg-positive' : 'bg-accent'}`} />
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              {dates.today && <>Showing {dates.today}</>}
              {dates.yesterday && <> vs {dates.yesterday} (DoD)</>}
              {dates.weekAgo && <> vs {dates.weekAgo} (WoW)</>}
            </p>
            {mismatch && !loading && (
              <p className="text-[11px] text-warning mt-1">No data for {selectedDate} — showing nearest: {actualDate}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent"
            />
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
              {products.length} products
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-xs text-text-muted gap-2">
            <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />
            Loading products...
          </div>
        ) : error ? (
          <p className="text-xs text-negative text-center py-12">{error}</p>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-text-muted mb-2">No product data for {selectedDate}</p>
            <p className="text-xs text-text-muted">
              {availableDates.length > 0
                ? `Data available from ${availableDates[0]} to ${availableDates[availableDates.length - 1]}`
                : 'Sync Shopify orders first — click "Sync Now" in the header.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-[2] bg-card">
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3 w-8">#</th>
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Product</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">
                    {isToday ? 'Today' : selectedDate}
                  </th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Prev Day</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">DoD</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">DoD %</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Week Ago</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">WoW</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">WoW %</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.product_id} className="border-b border-border/50 hover:bg-bg transition-colors">
                    <td className="py-3 px-3 text-xs text-text-muted">{i + 1}</td>
                    <td className="py-3 px-3 text-sm text-text-primary max-w-[280px] truncate" title={p.product_title}>
                      {p.product_title}
                    </td>
                    <td className="py-3 px-3 text-sm text-right font-semibold text-text-primary">{p.units_sold}</td>
                    <td className="py-3 px-3 text-sm text-right text-text-secondary">{p.yesterday_units ?? '—'}</td>
                    <td className="py-3 px-3 text-right"><Delta value={p.units_dod} /></td>
                    <td className="py-3 px-3 text-right"><Delta value={p.units_dod_pct} suffix="%" /></td>
                    <td className="py-3 px-3 text-sm text-right text-text-secondary">{p.week_ago_units ?? '—'}</td>
                    <td className="py-3 px-3 text-right"><Delta value={p.units_wow} /></td>
                    <td className="py-3 px-3 text-right"><Delta value={p.units_wow_pct} suffix="%" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <LowStockCard />
    </div>
  );
}
