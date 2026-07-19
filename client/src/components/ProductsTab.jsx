import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import DateRangePicker from './DateRangePicker';
import SetupForm from '../setup/SetupForm';

function fmt(n) { return n != null ? Math.round(n).toLocaleString('en-IN') : '—'; }
function inr(n) { return n != null ? `₹${Math.round(n).toLocaleString('en-IN')}` : '—'; }

function CommerceSnapshot({ start, end }) {
  const { data, loading, error } = useApi(`/api/data/products/snapshot?start=${start}&end=${end}`);
  if (loading) return <div className="bg-card border border-border rounded-lg p-4"><p className="text-xs text-text-muted">Loading live Shopify data...</p></div>;
  if (error) return <div className="bg-card border border-border rounded-lg p-4"><p className="text-xs text-negative">{error}</p></div>;

  const totals = (data?.daily || []).reduce((t, d) => ({
    orders: t.orders + d.order_count, units: t.units + d.units_sold, revenue: t.revenue + d.revenue,
  }), { orders: 0, units: 0, revenue: 0 });

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-base font-semibold text-text-primary mb-3">Commerce Snapshot</h2>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-bg rounded-md p-3 border border-border/50 text-center">
          <div className="text-[10px] text-text-muted uppercase">Orders</div>
          <div className="text-lg font-bold text-text-primary">{fmt(totals.orders)}</div>
        </div>
        <div className="bg-bg rounded-md p-3 border border-border/50 text-center">
          <div className="text-[10px] text-text-muted uppercase">Units Sold</div>
          <div className="text-lg font-bold text-text-primary">{fmt(totals.units)}</div>
        </div>
        <div className="bg-bg rounded-md p-3 border border-border/50 text-center">
          <div className="text-[10px] text-text-muted uppercase">Revenue</div>
          <div className="text-lg font-bold text-positive">{inr(totals.revenue)}</div>
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-[11px] font-medium text-text-muted uppercase py-1.5">Date</th>
            <th className="text-right text-[11px] font-medium text-text-muted uppercase py-1.5">Orders</th>
            <th className="text-right text-[11px] font-medium text-text-muted uppercase py-1.5">Units</th>
            <th className="text-right text-[11px] font-medium text-text-muted uppercase py-1.5">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {(data?.daily || []).sort((a, b) => a.date.localeCompare(b.date)).map(d => (
            <tr key={d.date} className="border-b border-border/30">
              <td className="py-1.5 text-xs text-text-secondary">{d.date}</td>
              <td className="py-1.5 text-xs text-right text-text-secondary">{fmt(d.order_count)}</td>
              <td className="py-1.5 text-xs text-right text-text-secondary">{fmt(d.units_sold)}</td>
              <td className="py-1.5 text-xs text-right font-medium text-text-primary">{inr(d.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CatalogState() {
  const { data, loading, error } = useApi('/api/data/products/catalog');
  if (loading) return <div className="bg-card border border-border rounded-lg p-4"><p className="text-xs text-text-muted">Loading live catalog...</p></div>;
  if (error) return <div className="bg-card border border-border rounded-lg p-4"><p className="text-xs text-negative">{error}</p></div>;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-text-primary">Out of Stock / Low Stock</h2>
        <span className="text-[10px] text-text-muted">live Shopify inventory snapshot — no persisted history, see docs</span>
      </div>

      {data?.oos?.length > 0 ? (
        <ul className="flex flex-col gap-1 mb-3">
          {data.oos.map(p => (
            <li key={p.product_id} className="flex items-center justify-between text-xs bg-negative/5 border border-negative/20 rounded px-2 py-1.5">
              <span className="text-text-primary">{p.product_title}</span>
              <span className="text-negative font-medium">OOS</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-positive mb-3">No products currently out of stock.</p>
      )}

      {data?.lowStock?.length > 0 && (
        <ul className="flex flex-col gap-1">
          {data.lowStock.map(p => (
            <li key={p.product_id} className="flex items-center justify-between text-xs bg-warning/5 border border-warning/20 rounded px-2 py-1.5">
              <span className="text-text-primary">{p.product_title}</span>
              <span className="text-warning font-medium">{p.qty} left</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ProductsTab({ start, end, report, onLive }) {
  const [range, setRange] = useState({ start, end });

  // 'validated' means the probe confirmed required fields are present but no real query has
  // succeeded yet — render the dashboard anyway; the first live fetch promotes it to 'live'
  // server-side (see server/routes/data.js markOutcome). Anything else (draft/error) needs setup.
  if (!report || !['live', 'validated'].includes(report.status)) {
    return <SetupForm report={report} onLive={onLive} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Products</h1>
        <DateRangePicker start={range.start} end={range.end} onChange={({ start: s, end: e }) => setRange({ start: s, end: e })} />
      </div>
      <CommerceSnapshot start={range.start} end={range.end} />
      <CatalogState />
    </div>
  );
}
