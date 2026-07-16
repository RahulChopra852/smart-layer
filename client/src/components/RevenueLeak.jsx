import { useState } from 'react';
import { useApi } from '../hooks/useApi';

const fmt = (n) => n == null ? '—' : n.toLocaleString();
const fmtCur = (n) => n == null ? '—' : `₹${Math.round(n).toLocaleString()}`;
const fmtPct = (n) => n == null || isNaN(n) ? '—' : `${n.toFixed(1)}%`;

function UploadButton({ label, endpoint, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(endpoint, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult({ ok: true, msg: `${data.rowCount} rows uploaded` });
      onUploaded?.();
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <label className={`px-2 py-0.5 text-[10px] font-medium rounded cursor-pointer transition-opacity whitespace-nowrap ${uploading ? 'bg-border text-text-muted' : 'bg-accent/10 text-accent hover:bg-accent/20'}`}>
        {uploading ? 'Uploading…' : label}
        <input type="file" accept=".csv" onChange={handleUpload} disabled={uploading} className="hidden" />
      </label>
      {result && <span className={`text-[9px] ${result.ok ? 'text-positive' : 'text-negative'}`}>{result.msg}</span>}
    </div>
  );
}

function LeakCard({ title, value, sub, action }) {
  return (
    <div className="bg-bg rounded-md p-3 border border-border/50 flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] text-text-muted uppercase leading-tight">{title}</div>
        {action}
      </div>
      <div className="text-xl font-bold text-negative">{value}</div>
      {sub && <div className="text-[10px] text-text-muted">{sub}</div>}
    </div>
  );
}

export default function RevenueLeak() {
  const { data, loading, error, refetch } = useApi('/api/analytics/revenue-leak');

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-center py-8 text-xs text-text-muted gap-2">
        <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />
        Loading revenue leak...
      </div>
    );
  }
  if (error) return <div className="bg-card border border-border rounded-lg p-4"><p className="text-xs text-negative">{error}</p></div>;
  if (!data) return null;

  const { oosSessions, ciToPurchase, discountFailures, abandonedCarts } = data;
  const ci = ciToPurchase.yesterday || ciToPurchase.today;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Revenue Leak</h2>
          <p className="text-xs text-text-muted mt-0.5">Where demand and conversion are being lost right now</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <LeakCard
          title="Sessions on OOS Products"
          value={fmt(oosSessions.total)}
          sub={oosSessions.topProducts[0] ? `Top: ${oosSessions.topProducts[0].product_title}` : 'No products currently OOS'}
        />
        <LeakCard
          title={`Checkout → Purchase Drop${ci ? ` (${ci.date})` : ''}`}
          value={fmt(ci?.dropped)}
          sub={ci ? `${fmtPct(ci.dropPct)} of ${fmt(ci.ic)} checkouts initiated` : 'No data yet'}
        />
        <LeakCard
          title="Discounts Failed"
          value={fmt(discountFailures.totalFailedAttempts)}
          sub={discountFailures.date ? `${fmt(discountFailures.totalUniqueUsers)} users affected · ${discountFailures.date}` : 'No CSV uploaded yet'}
          action={<UploadButton label="Upload CSV" endpoint="/api/analytics/revenue-leak/discount-failures" onUploaded={refetch} />}
        />
        <LeakCard
          title="Abandoned Carts"
          value={fmt(abandonedCarts.count)}
          sub={abandonedCarts.date ? `${fmtCur(abandonedCarts.value)} value · ${abandonedCarts.date}` : 'No CSV uploaded yet (auto-import script pending)'}
          action={<UploadButton label="Upload CSV" endpoint="/api/analytics/revenue-leak/abandoned-carts" onUploaded={refetch} />}
        />
      </div>

      {(discountFailures.topReasons.length > 0 || abandonedCarts.topDropStages.length > 0) && (
        <div className="mt-3 flex flex-col gap-1 text-[10px] text-text-muted">
          {discountFailures.topReasons.length > 0 && (
            <span>Top failure reasons: {discountFailures.topReasons.map(r => `${r.reason} (${r.count})`).join(' · ')}</span>
          )}
          {abandonedCarts.topDropStages.length > 0 && (
            <span>Cart drop stages: {abandonedCarts.topDropStages.map(s => `${s.stage} (${s.count})`).join(' · ')}</span>
          )}
        </div>
      )}
    </div>
  );
}
