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

export default function ProductsTab() {
  const { data, loading, error } = useApi('/api/analytics/products');
  const products = data?.products || [];
  const dates = data?.dates || {};

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Products Insights</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Top products by units sold
              {dates.today && <> — {dates.today}</>}
              {dates.yesterday && <> vs {dates.yesterday} (DoD)</>}
              {dates.weekAgo && <> vs {dates.weekAgo} (WoW)</>}
            </p>
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
            {products.length} products
          </span>
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
            <p className="text-sm text-text-muted mb-2">No product data yet</p>
            <p className="text-xs text-text-muted">Sync Shopify orders first — click "Sync Now" in the header. The first sync may take a few minutes as it fetches order history.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3 w-8">#</th>
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Product</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Today</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Yesterday</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">DoD</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">DoD %</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Last Week</th>
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
