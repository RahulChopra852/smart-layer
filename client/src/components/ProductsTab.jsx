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

function daysAgo(dateStr) {
  if (!dateStr) return null;
  const d1 = new Date(dateStr + 'T00:00:00Z');
  const d2 = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  return Math.round((d2 - d1) / 86400000);
}

function AccordionCard({ title, subtitle, badge, badgeColor = 'accent', defaultOpen = false, loading, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => !loading && setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <span className="text-text-muted text-xs w-3">{open ? '▼' : '▶'}</span>
          <div>
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {badge != null && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full bg-${badgeColor}/15 text-${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
      {open && (
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
              <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading...
            </div>
          ) : children}
        </div>
      )}
    </div>
  );
}

function ProductsInsightsCard({ start, end }) {
  const [open, setOpen] = useState(true);
  const [selectedDate, setSelectedDate] = useState(end);
  const { data, loading, error } = useApi(`/api/analytics/products?date=${selectedDate}`);
  const products = data?.products || [];
  const dates = data?.dates || {};
  const availableDates = data?.availableDates || [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const actualDate = dates.today || selectedDate;
  const isToday = actualDate === todayStr;
  const mismatch = actualDate !== selectedDate;

  const subtitle = loading ? 'Loading...'
    : [dates.today, dates.yesterday && `vs ${dates.yesterday} (DoD)`, dates.weekAgo && `vs ${dates.weekAgo} (WoW)`].filter(Boolean).join(' ');

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
          <span className="text-text-muted text-xs w-3">{open ? '▼' : '▶'}</span>
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
            <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
            {mismatch && !loading && (
              <p className="text-[11px] text-warning mt-1">No data for {selectedDate} — showing nearest: {actualDate}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            max={todayStr}
            onChange={e => { e.stopPropagation(); setSelectedDate(e.target.value); }}
            onClick={e => e.stopPropagation()}
            className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent"
          />
          {!loading && products.length > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
              {products.length} products
            </span>
          )}
        </div>
      </div>

      {open && <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-xs text-text-muted gap-2">
            <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading products...
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
      </div>}
    </div>
  );
}

function LowStockCard() {
  const { data, loading, error } = useApi('/api/analytics/low-stock');
  const alerts = data?.alerts || [];
  const [open, setOpen] = useState(false);

  const oosCount = alerts.filter(a => a.qty === 0 && a.inventory_policy !== 'CONTINUE').length;
  const criticalCount = alerts.filter(a => a.qty > 0 && a.qty < 20).length;

  const subtitle = loading ? 'Loading...'
    : alerts.length === 0 ? 'All key products well-stocked'
    : `${oosCount} OOS · ${criticalCount} critical · ${alerts.length} total low stock`;

  const badgeColor = oosCount > 0 ? 'negative' : 'warning';

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => !loading && setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <span className="text-text-muted text-xs w-3">{open ? '▼' : '▶'}</span>
          <div>
            <h2 className="text-base font-semibold text-text-primary">OOS Alerts</h2>
            <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
          </div>
        </div>
        {alerts.length > 0 && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full bg-${badgeColor}/15 text-${badgeColor}`}>
            {alerts.length} low stock
          </span>
        )}
      </div>

      {open && (
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
              <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading inventory...
            </div>
          ) : error ? (
            <p className="text-xs text-negative text-center py-8">{error}</p>
          ) : alerts.length === 0 ? (
            <p className="text-xs text-positive text-center py-8">All key products are well-stocked</p>
          ) : (
            <div className="overflow-x-auto">
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
                      <td className={`py-2.5 px-3 text-xs text-right font-semibold ${a.qty === 0 && a.inventory_policy !== 'CONTINUE' ? 'text-negative' : a.qty < 20 ? 'text-warning' : 'text-text-primary'}`}>
                        {a.qty}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          a.qty === 0 && a.inventory_policy !== 'CONTINUE' ? 'bg-negative/15 text-negative' : a.qty < 20 ? 'bg-warning/15 text-warning' : 'bg-accent/15 text-accent'
                        }`}>
                          {a.qty === 0 && a.inventory_policy !== 'CONTINUE' ? 'OOS' : a.qty < 20 ? 'Critical' : 'Low'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OosSessionsCard() {
  const { data, loading, error } = useApi('/api/analytics/oos-sessions');
  const rows = data?.oosWithSessions || [];
  const [open, setOpen] = useState(false);

  const totalLost = rows.reduce((s, r) => s + (r.sessions_during_oos || 0), 0);
  const subtitle = loading ? 'Loading...'
    : rows.length === 0 ? 'No OOS products detected'
    : `${rows.length} products · ${totalLost.toLocaleString()} sessions lost`;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => !loading && setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <span className="text-text-muted text-xs w-3">{open ? '▼' : '▶'}</span>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Sessions Lost While OOS</h2>
            <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
          </div>
        </div>
        {totalLost > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-negative/15 text-negative">
            {totalLost.toLocaleString()} sessions
          </span>
        )}
      </div>

      {open && (
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
              <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading session impact...
            </div>
          ) : error ? (
            <p className="text-xs text-negative text-center py-8">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-8">No OOS products detected</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-[2] bg-card">
                  <tr className="border-b border-border">
                    <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Product</th>
                    <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">URL</th>
                    <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">OOS Since</th>
                    <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Days OOS</th>
                    <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">OOS Variants</th>
                    <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Sessions Lost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const days = daysAgo(r.oos_since);
                    const isFullyOos = r.total_inventory === 0;
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-bg transition-colors">
                        <td className="py-2.5 px-3 text-xs text-text-primary max-w-[200px] truncate" title={r.product_title}>
                          {r.product_title}
                        </td>
                        <td className="py-2.5 px-3 text-xs">
                          {r.landing_page ? (
                            <a
                              href={`https://www.guardian.in${r.landing_page}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:underline font-mono text-[10px]"
                              title={r.landing_page}
                            >
                              {r.handle}↗
                            </a>
                          ) : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-text-secondary whitespace-nowrap">{r.oos_since}</td>
                        <td className="py-2.5 px-3 text-xs text-right">
                          {days != null && (
                            <span className={`font-semibold ${days >= 7 ? 'text-negative' : days >= 3 ? 'text-warning' : 'text-text-secondary'}`}>
                              {days}d
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-right">
                          <span className={`font-medium ${isFullyOos ? 'text-negative' : 'text-warning'}`}>
                            {r.oos_variant_count}/{r.total_variant_count}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-xs text-right font-semibold text-negative">
                          {(r.sessions_during_oos || 0).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-bg/50">
                    <td colSpan={5} className="py-2 px-3 text-xs font-semibold text-text-primary">Total</td>
                    <td className="py-2 px-3 text-xs text-right font-bold text-negative">{totalLost.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductsTab({ start, end }) {
  return (
    <div className="flex flex-col gap-4">
      <ProductsInsightsCard start={start} end={end} />
      <LowStockCard />
      <OosSessionsCard />
    </div>
  );
}
