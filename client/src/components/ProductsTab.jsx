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

export default function ProductsTab({ start, end }) {
  const [selectedDate, setSelectedDate] = useState(end);
  const { data, loading, error } = useApi(`/api/analytics/products?date=${selectedDate}`);
  const products = data?.products || [];
  const dates = data?.dates || {};
  const availableDates = data?.availableDates || [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday = selectedDate === todayStr;
  const hasData = availableDates.includes(selectedDate);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-text-primary">Products Insights</h2>
              {hasData && (
                <span className="relative flex h-2.5 w-2.5" title={isToday ? 'Live — today' : `Viewing ${selectedDate}`}>
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
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
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
              <thead>
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
    </div>
  );
}
