import { useState, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import SectionNav from './SectionNav';

const VWO_SECTIONS = [
  { id: 'vwo-overview', label: 'Overview' },
  { id: 'vwo-running', label: 'Currently Running' },
  { id: 'vwo-all-campaigns', label: 'All Campaigns' },
];

function SyncButton({ onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSync() {
    setSyncing(true); setResult(null);
    try {
      const res = await fetch('/api/analytics/vwo-sync', { method: 'POST' });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setResult({ ok: true, msg: `${d.count} tests · ${d.running} running` });
      onSynced?.();
    } catch (err) { setResult({ ok: false, msg: err.message }); }
    finally { setSyncing(false); }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={handleSync} disabled={syncing}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-positive/90 text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
        {syncing ? 'Syncing...' : 'Sync VWO'}
      </button>
      {result && <span className={`text-[10px] ${result.ok ? 'text-positive' : 'text-negative'}`}>{result.msg}</span>}
    </div>
  );
}

const pf = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
      status === 'RUNNING' ? 'bg-positive/10 text-positive' : 'bg-border text-text-muted'
    }`}>
      {status}
    </span>
  );
}

function ResultBadge({ improvement, confidence }) {
  if (improvement == null) return <span className="text-text-muted">—</span>;
  const pos = improvement > 0;
  const color = pos ? 'text-positive' : 'text-negative';
  return (
    <div className="text-right">
      <div className={`text-sm font-semibold ${color}`}>
        {pos ? '+' : ''}{improvement.toFixed(1)}%
      </div>
      <div className="text-[10px] text-text-muted">{confidence.toFixed(0)}% conf.</div>
    </div>
  );
}

function CampaignCard({ campaign: c }) {
  const imp = pf(c.improvement);
  const conf = pf(c.confidence);
  const pos = imp > 0;
  return (
    <div className="bg-bg rounded-md p-4 border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">{c.name}</h3>
            <StatusBadge status={c.status} />
          </div>
          <p className="text-[11px] text-text-muted mt-0.5">Goal: {c.goal} · Started {c.started}</p>
        </div>
        <ResultBadge improvement={imp} confidence={conf} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-md p-3 border border-border/50">
          <div className="text-[10px] text-text-muted uppercase mb-1">Control</div>
          <div className="text-lg font-bold text-text-primary">
            {c.type === 'revenue' ? `₹${pf(c.control_rpv)?.toFixed(2) || '—'}/visitor` : `${pf(c.control_rate)?.toFixed(2) || '—'}%`}
          </div>
          <div className="text-xs text-text-muted mt-1">
            {pf(c.control_conv)?.toLocaleString() || 0} / {pf(c.control_visitors)?.toLocaleString() || 0} visitors
          </div>
        </div>
        <div className={`bg-card rounded-md p-3 border ${pos ? 'border-positive/30' : 'border-negative/30'}`}>
          <div className="text-[10px] text-text-muted uppercase mb-1">Variation</div>
          <div className={`text-lg font-bold ${pos ? 'text-positive' : 'text-negative'}`}>
            {c.type === 'revenue' ? `₹${pf(c.var_rpv)?.toFixed(2) || '—'}/visitor` : `${pf(c.var_rate)?.toFixed(2) || '—'}%`}
          </div>
          <div className="text-xs text-text-muted mt-1">
            {pf(c.var_conv)?.toLocaleString() || 0} / {pf(c.var_visitors)?.toLocaleString() || 0} visitors
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VwoTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useApi(`/api/analytics/vwo-campaigns?_k=${refreshKey}`);
  const campaigns = (data?.campaigns || []).map(c => ({
    ...c,
    improvement: pf(c.improvement),
    confidence: pf(c.confidence),
    visitors: pf(c.visitors) || 0,
  }));

  const running = campaigns.filter(c => c.status === 'RUNNING');
  const paused = campaigns.filter(c => c.status === 'PAUSED');
  const winners = campaigns.filter(c => c.improvement > 0 && c.confidence >= 70);
  const losers = campaigns.filter(c => c.improvement < 0 && c.confidence >= 70);

  const lastSync = campaigns[0]?.synced_at;

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return (
    <div className="flex flex-col gap-4">
      <SectionNav sections={VWO_SECTIONS} />
      <div className="bg-card border border-border rounded-lg p-4" id="vwo-overview">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">VWO AB Tests</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {lastSync ? `Last synced: ${lastSync.slice(0, 16).replace('T', ' ')}` : 'Not synced yet — ask Claude to sync VWO'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SyncButton onSynced={handleRefresh} />
            <button onClick={handleRefresh}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 transition-opacity">
              Refresh
            </button>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
              {campaigns.length} tests
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2">
            <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading...
          </div>
        ) : error ? (
          <p className="text-xs text-negative text-center py-8">{error}</p>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-text-muted mb-1">No VWO data yet</p>
            <p className="text-xs text-text-muted">Ask Claude: "sync VWO data"</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="bg-bg rounded-md p-3 border border-border/50 text-center">
                <div className="text-[10px] text-text-muted uppercase">Running</div>
                <div className="text-xl font-bold text-positive">{running.length}</div>
              </div>
              <div className="bg-bg rounded-md p-3 border border-border/50 text-center">
                <div className="text-[10px] text-text-muted uppercase">Paused</div>
                <div className="text-xl font-bold text-text-primary">{paused.length}</div>
              </div>
              <div className="bg-bg rounded-md p-3 border border-border/50 text-center">
                <div className="text-[10px] text-text-muted uppercase">Positive Lift</div>
                <div className="text-xl font-bold text-positive">{winners.length}</div>
              </div>
              <div className="bg-bg rounded-md p-3 border border-border/50 text-center">
                <div className="text-[10px] text-text-muted uppercase">Negative</div>
                <div className="text-xl font-bold text-negative">{losers.length}</div>
              </div>
            </div>
            <div className="text-xs text-text-muted">
              Total visitors: {campaigns.reduce((s, c) => s + c.visitors, 0).toLocaleString()}
            </div>
          </>
        )}
      </div>

      {running.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4" id="vwo-running">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">Currently Running</h2>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-positive/15 text-positive">{running.length} live</span>
          </div>
          <div className="flex flex-col gap-3">
            {running.map(c => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4" id="vwo-all-campaigns">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">All Campaigns</h2>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">{campaigns.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-[2] bg-card">
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Campaign</th>
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Status</th>
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Started</th>
                  <th className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Goal</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Visitors</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Control</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Variation</th>
                  <th className="text-right text-[11px] font-medium text-text-muted uppercase tracking-wider py-2 px-3">Lift</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-bg transition-colors">
                    <td className="py-3 px-3 text-sm font-medium text-text-primary max-w-[200px] truncate">{c.name}</td>
                    <td className="py-3 px-3"><StatusBadge status={c.status} /></td>
                    <td className="py-3 px-3 text-xs text-text-muted">{c.started}</td>
                    <td className="py-3 px-3 text-xs text-text-secondary max-w-[160px] truncate">{c.goal}</td>
                    <td className="py-3 px-3 text-sm text-right text-text-secondary">{c.visitors.toLocaleString()}</td>
                    <td className="py-3 px-3 text-sm text-right text-text-secondary">
                      {c.type === 'revenue' ? `₹${pf(c.control_rpv)?.toFixed(0) || '—'}/v` : `${pf(c.control_rate) || '—'}%`}
                    </td>
                    <td className="py-3 px-3 text-sm text-right text-text-secondary">
                      {c.type === 'revenue' ? `₹${pf(c.var_rpv)?.toFixed(0) || '—'}/v` : `${pf(c.var_rate) || '—'}%`}
                    </td>
                    <td className="py-3 px-3"><ResultBadge improvement={c.improvement} confidence={c.confidence} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
