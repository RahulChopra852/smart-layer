import { useState } from 'react';
import CroFunnel from './CroFunnel';
import PagePerformance from './PagePerformance';
import RcaNotes from './RcaNotes';

function CroSyncBar({ onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSync() {
    setSyncing(true); setResult(null);
    try {
      const res = await fetch('/api/sync/cro_web', { method: 'POST' });
      const d1 = await res.json();
      await fetch('/api/sync/cro_app', { method: 'POST' });
      setResult({ ok: true, msg: `Synced ${d1.rowsAdded ?? 0} web rows` });
      onSynced?.();
    } catch (err) { setResult({ ok: false, msg: err.message }); }
    finally { setSyncing(false); }
  }

  async function handleRebuild() {
    if (!confirm('This will clear all CRO data and re-sync from scratch. Continue?')) return;
    setRebuilding(true); setResult(null);
    try {
      await fetch('/api/sync/rebuild/cro_daily', { method: 'POST' });
      setResult({ ok: true, msg: 'Rebuilt CRO data from scratch' });
      onSynced?.();
    } catch (err) { setResult({ ok: false, msg: err.message }); }
    finally { setRebuilding(false); }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={handleSync} disabled={syncing || rebuilding}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
        {syncing ? 'Syncing...' : 'Sync CRO'}
      </button>
      <button onClick={handleRebuild} disabled={syncing || rebuilding}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-bg border border-border text-text-secondary hover:border-accent/50 disabled:opacity-50 transition-colors">
        {rebuilding ? 'Rebuilding...' : 'Rebuild'}
      </button>
      {result && <span className={`text-xs ${result.ok ? 'text-positive' : 'text-negative'}`}>{result.msg}</span>}
    </div>
  );
}

export default function CroDashboard({ start, end }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">CRO Dashboard</h2>
        <CroSyncBar onSynced={() => setRefreshKey(k => k + 1)} />
      </div>
      <CroFunnel start={start} end={end} key={`funnel-${refreshKey}`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" key={`pages-${refreshKey}`}>
        <PagePerformance start={start} end={end} mode="top" />
        <PagePerformance start={start} end={end} mode="worst" />
      </div>
      <RcaNotes start={start} end={end} key={`rca-${refreshKey}`} />
    </div>
  );
}
