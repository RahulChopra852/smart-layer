import { useState, useMemo, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import SectionNav from './SectionNav';

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

function formatTimeAgo(date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Shows when the shopify_orders sync (the source behind Products Insights) last actually ran —
// distinct from the header's global SyncStatus, which mixes in cro_web/webvitals/etc. and can
// read "just now" even when product data itself is a day stale.
function LastProductSync() {
  const { data } = useApi('/api/sync/status');
  const lastSyncedAt = data?.sources?.shopify_orders?.last_synced_at;
  if (!lastSyncedAt) return null;
  return (
    <span className="text-[11px] text-text-muted">Product data last synced {formatTimeAgo(new Date(lastSyncedAt))}</span>
  );
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
            <div className="mt-1"><LastProductSync /></div>
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
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">SKU</th>
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
                    <td className="py-3 px-3 text-xs text-text-muted font-mono">{p.sku || '—'}</td>
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
                    <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">SKU</th>
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
                        <td className="py-2.5 px-3 text-xs text-text-muted font-mono">{r.sku || '—'}</td>
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

// Full OOS history — every cycle ever logged, open or closed. A product that has gone OOS and
// come back multiple times shows up as one row per cycle (that's how oos_log is already
// written; this just doesn't filter down to currently-open cycles the way OosSessionsCard does).
function OosHistoryCard() {
  const { data, loading, error } = useApi('/api/analytics/oos-history');
  const history = useMemo(() => data?.history || [], [data]);
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [onDate, setOnDate] = useState('');

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return history.filter(r => {
      if (kw && !(r.product_title || '').toLowerCase().includes(kw) && !(r.sku || '').toLowerCase().includes(kw)) return false;
      // "What was OOS on this date" — the cycle's window [oos_since, restocked_at || today] must contain the picked date.
      if (onDate && !(r.oos_since <= onDate && (r.restocked_at == null || onDate < r.restocked_at))) return false;
      return true;
    });
  }, [history, keyword, onDate]);

  const totalLost = filtered.reduce((s, r) => s + (r.sessions_lost || 0), 0);
  const subtitle = loading ? 'Loading...'
    : `${history.length} OOS cycle${history.length === 1 ? '' : 's'} logged`;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => !loading && setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <span className="text-text-muted text-xs w-3">{open ? '▼' : '▶'}</span>
          <div>
            <h2 className="text-base font-semibold text-text-primary">OOS History</h2>
            <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
          </div>
        </div>
      </div>

      {open && (
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
              <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading history...
            </div>
          ) : error ? (
            <p className="text-xs text-negative text-center py-8">{error}</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-8">No OOS cycles logged yet</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Search product name or SKU..."
                  className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded-md border border-border bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-text-secondary whitespace-nowrap">What was OOS on:</label>
                  <input
                    type="date"
                    value={onDate}
                    onChange={(e) => setOnDate(e.target.value)}
                    className="bg-bg border border-border text-text-primary text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:border-accent"
                  />
                  {onDate && (
                    <button onClick={() => setOnDate('')} className="text-[11px] text-accent hover:underline">clear</button>
                  )}
                </div>
              </div>

              {filtered.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-8">No OOS cycles match this filter</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-[2] bg-card">
                      <tr className="border-b border-border">
                        <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Date</th>
                        <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Product</th>
                        <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">SKU</th>
                        <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">OOS Days</th>
                        <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Sessions Lost</th>
                        <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Back In Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-bg transition-colors">
                          <td className="py-2.5 px-3 text-xs text-text-secondary whitespace-nowrap">{r.oos_since}</td>
                          <td className="py-2.5 px-3 text-xs text-text-primary max-w-[220px] truncate" title={r.product_title}>{r.product_title}</td>
                          <td className="py-2.5 px-3 text-xs text-text-muted font-mono">{r.sku || '—'}</td>
                          <td className="py-2.5 px-3 text-xs text-right font-semibold text-text-primary">{r.oos_days}d</td>
                          <td className="py-2.5 px-3 text-xs text-right font-semibold text-negative">{(r.sessions_lost || 0).toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                            {r.restocked_at
                              ? <span className="text-positive">{r.restocked_at}</span>
                              : <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-negative/15 text-negative">Still OOS</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-bg/50">
                        <td colSpan={4} className="py-2 px-3 text-xs font-semibold text-text-primary">Total ({filtered.length} cycles)</td>
                        <td className="py-2 px-3 text-xs text-right font-bold text-negative">{totalLost.toLocaleString()}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Plain-SVG line chart (linear scale — units-sold counts don't span the multiple orders of
// magnitude that would need GokwikTab's log-scale LineChart) for the Focus Product trend.
function UnitsTrendChart({ data }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);
  if (!data.length) return null;

  const w = 640, h = 280, padX = 56, padY = 20;
  const innerW = w - padX * 2, innerH = h - padY * 2;
  // Scale tops out at the actual highest value in view (not rounded to a coarse 1/2/5×10ⁿ
  // step) — rounding overshoots badly on smaller ranges, e.g. a max of 250 jumping to 500.
  const max = Math.max(...data.map(d => d.value), 1);
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    ...d,
    x: padX + i * stepX,
    y: padY + (1 - d.value / max) * innerH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padY + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`;

  const maxTicks = 6;
  const tickStep = Math.max(1, Math.ceil((data.length - 1) / (maxTicks - 1)));
  const tickIndices = [];
  for (let i = 0; i < data.length; i += tickStep) tickIndices.push(i);
  if (tickIndices[tickIndices.length - 1] !== data.length - 1) tickIndices.push(data.length - 1);

  const gridFracs = [0, 0.25, 0.5, 0.75, 1];

  // A circle per data point looks fine for a handful of days but becomes a solid overlapping
  // blob once the range spans months of daily data (which it always does here, since Focus
  // Product has no date filter) — so hover is driven by mouse position against the nearest
  // point instead of one hit-target per point, and only that single point ever renders a dot.
  function handleMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const svgX = fracX * w;
    let nearest = 0, bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].x - svgX);
      if (dist < bestDist) { bestDist = dist; nearest = i; }
    }
    setHoverIdx(nearest);
  }

  const hp = hoverIdx != null ? points[hoverIdx] : null;

  return (
    <div className="mb-2">
      <div className="relative text-accent">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="w-full h-64"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {gridFracs.map(frac => {
            const y = padY + frac * innerH;
            const val = max - frac * max;
            return (
              <g key={frac}>
                <line x1={padX} y1={y} x2={w - padX} y2={y} stroke="currentColor" className="text-border" strokeWidth="1" strokeDasharray="3,3" />
                <text x={padX - 8} y={y + 4} textAnchor="end" className="fill-current text-text-secondary font-medium" fontSize="11">{Math.round(val).toLocaleString()}</text>
              </g>
            );
          })}
          <path d={areaPath} fill="currentColor" opacity="0.1" stroke="none" />
          <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" />
          {hp && (
            <>
              <line x1={hp.x} y1={padY} x2={hp.x} y2={padY + innerH} stroke="currentColor" className="text-border" strokeWidth="1" />
              <circle cx={hp.x} cy={hp.y} r={4.5} fill="currentColor" stroke="white" strokeWidth={1.5} />
            </>
          )}
        </svg>
        {hp && (
          <div className="absolute bg-gray-900 text-white text-[11px] font-medium px-2.5 py-1.5 rounded pointer-events-none z-10 whitespace-nowrap"
            style={{ left: `${(hp.x / w) * 100}%`, top: `${(hp.y / h) * 100}%`, transform: 'translate(-50%, -140%)' }}>
            {hp.date}: {hp.value.toLocaleString()} units
          </div>
        )}
      </div>
      <div className="relative h-4 mt-1">
        {tickIndices.map(i => (
          <span key={i} className="absolute text-[10px] text-text-muted -translate-x-1/2"
            style={{ left: `${(points[i].x / w) * 100}%` }}>
            {points[i].date.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}

// Keyword search (product name or SKU) across the full shopify_products history — aggregates
// matching products' units_sold into one daily trend line, same "type a keyword, see the
// rollup" pattern as the Meta tab's Focus Products card.
function FocusProductCard() {
  const { data, loading } = useApi('/api/analytics/products-raw');
  const [keyword, setKeyword] = useState('');

  const { series, matchedProducts } = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return { series: [], matchedProducts: [] };
    const rows = data?.rows || [];
    const matches = rows.filter(r => (r.product_title || '').toLowerCase().includes(kw) || (r.sku || '').toLowerCase().includes(kw));

    const byDate = new Map();
    const byProduct = new Map();
    for (const r of matches) {
      const units = parseInt(r.units_sold, 10) || 0;
      byDate.set(r.date, (byDate.get(r.date) || 0) + units);
      if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, { product_id: r.product_id, product_title: r.product_title, sku: r.sku || '', totalUnits: 0 });
      byProduct.get(r.product_id).totalUnits += units;
    }

    const series = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
    const matchedProducts = [...byProduct.values()].sort((a, b) => b.totalUnits - a.totalUnits);
    return { series, matchedProducts };
  }, [data, keyword]);

  const totalUnits = matchedProducts.reduce((s, p) => s + p.totalUnits, 0);
  const kwTrimmed = keyword.trim();

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-text-primary">🎯 Focus Product</h2>
        <p className="text-xs text-text-muted mt-0.5">Search a product name or SKU to see its daily units-sold trend</p>
      </div>

      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="e.g. plant protein, whey, 90200182..."
        className="w-full mb-4 px-3 py-2 text-sm rounded-md border border-border bg-bg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
      />

      {loading ? (
        <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
          <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading...
        </div>
      ) : !kwTrimmed ? (
        <p className="text-xs text-text-muted py-6 text-center">Type a product name or SKU above to see its sales trend.</p>
      ) : matchedProducts.length === 0 ? (
        <p className="text-xs text-text-muted py-6 text-center">No products match "{kwTrimmed}".</p>
      ) : (
        <>
          <p className="text-xs text-text-secondary mb-3">
            <span className="font-semibold text-text-primary">{matchedProducts.length}</span> matching product{matchedProducts.length === 1 ? '' : 's'}
            {' · '}<span className="font-semibold text-text-primary">{totalUnits.toLocaleString()}</span> units sold total
          </p>
          <UnitsTrendChart data={series} />
          <div className="overflow-x-auto mt-3">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Product</th>
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">SKU</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Units Sold</th>
                </tr>
              </thead>
              <tbody>
                {matchedProducts.map(p => (
                  <tr key={p.product_id} className="border-b border-border/50 hover:bg-bg transition-colors">
                    <td className="py-2 px-3 text-xs text-text-primary max-w-[280px] truncate" title={p.product_title}>{p.product_title}</td>
                    <td className="py-2 px-3 text-xs text-text-muted font-mono">{p.sku || '—'}</td>
                    <td className="py-2 px-3 text-xs text-right font-semibold text-text-primary">{p.totalUnits.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Notification card — products at risk of going OOS soon (total_inventory under the watch
// threshold), flagged with a day-level session-spike indicator (today's/latest-day sessions vs
// that product's own trailing 7-day baseline) as a proxy for "something is driving unusual
// traffic here" — see getLowStockTrafficWatch's comment for why this is day-granularity, not
// literal ads detection (no hourly session data exists in this system).
function LowStockWatchCard() {
  const { data, loading, error } = useApi('/api/analytics/low-stock-watch');
  const watchlist = data?.watchlist || [];

  const subtitle = loading ? 'Loading...'
    : watchlist.length === 0 ? 'No products under the watch threshold'
    : `${watchlist.length} product${watchlist.length === 1 ? '' : 's'} under 50 units`;

  return (
    <AccordionCard
      title="⚠️ Low Stock Watch"
      subtitle={subtitle}
      badge={watchlist.length > 0 ? watchlist.length : null}
      badgeColor="warning"
      loading={loading}
    >
      {error ? (
        <p className="text-xs text-negative text-center py-8">{error}</p>
      ) : watchlist.length === 0 ? (
        <p className="text-xs text-positive text-center py-8">Nothing under the 50-unit watch threshold</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-[2] bg-card">
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Product</th>
                <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">SKU</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Qty</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">OOS Variants</th>
                <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Sessions (last 7d)</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map((w, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-bg transition-colors">
                  <td className="py-2.5 px-3 text-xs text-text-primary max-w-[240px] truncate" title={w.product_title}>{w.product_title}</td>
                  <td className="py-2.5 px-3 text-xs text-text-muted font-mono">{w.sku || '—'}</td>
                  <td className={`py-2.5 px-3 text-xs text-right font-semibold ${w.total_inventory === 0 ? 'text-negative' : 'text-warning'}`}>{w.total_inventory}</td>
                  <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{w.oos_variant_count}/{w.total_variant_count}</td>
                  <td className="py-2.5 px-3 text-xs text-right text-text-secondary">{w.sessions_last_7d.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AccordionCard>
  );
}

const SECTIONS = [
  { id: 'products-low-stock-watch', label: 'Low Stock Watch' },
  { id: 'products-insights', label: 'Products Insights' },
  { id: 'products-focus-product', label: 'Focus Product' },
  { id: 'products-low-stock', label: 'Low Stock' },
  { id: 'products-oos-sessions', label: 'Sessions Lost While OOS' },
  { id: 'products-oos-history', label: 'OOS History' },
];

export default function ProductsTab({ start, end }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionNav sections={SECTIONS} />
      <div id="products-low-stock-watch"><LowStockWatchCard /></div>
      <div id="products-insights"><ProductsInsightsCard start={start} end={end} /></div>
      <div id="products-focus-product"><FocusProductCard /></div>
      <div id="products-low-stock"><LowStockCard /></div>
      <div id="products-oos-sessions"><OosSessionsCard /></div>
      <div id="products-oos-history"><OosHistoryCard /></div>
    </div>
  );
}
