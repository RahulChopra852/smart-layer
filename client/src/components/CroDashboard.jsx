import { useState } from 'react';
import CroFunnel from './CroFunnel';
import PagePerformance from './PagePerformance';
import DayTrend from './DayTrend';
import RcaSnapshot, { useRcaProblems } from './RcaSnapshot';
import CommerceSnapshot from './CommerceSnapshot';
import MainMovers from './MainMovers';
import { useApi } from '../hooks/useApi';

function fmt(n) { return n != null ? n.toLocaleString() : '—'; }
function pct(n) { if (n == null || isNaN(n)) return '—'; return `${n.toFixed(1)}%`; }

function DateSyncRow({ date, onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSync() {
    setSyncing(true); setResult(null);
    try {
      const res = await fetch('/api/sync/cro-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: [date], channels: ['web', 'app'] })
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setResult('ok');
      onSynced?.();
    } catch { setResult('err'); }
    finally { setSyncing(false); }
  }

  return (
    <button onClick={handleSync} disabled={syncing} title={`Re-sync ${date}`}
      className={`ml-1 inline-flex items-center justify-center w-4 h-4 rounded text-[8px] transition-all ${
        result === 'ok' ? 'text-positive' : result === 'err' ? 'text-negative' : 'text-text-muted hover:text-accent'
      } disabled:opacity-50`}>
      {syncing ? <span className="w-2.5 h-2.5 border border-border border-t-accent rounded-full animate-spin" /> : result === 'ok' ? '✓' : '↻'}
    </button>
  );
}

function FunnelDateSync({ onSynced }) {
  const [open, setOpen] = useState(false);
  const [syncDate, setSyncDate] = useState(new Date().toISOString().slice(0, 10));
  const [channels, setChannels] = useState({ web: true, app: true });
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSync() {
    const chans = [];
    if (channels.web) chans.push('web');
    if (channels.app) chans.push('app');
    if (!chans.length) return;
    setSyncing(true); setResult(null);
    try {
      const res = await fetch('/api/sync/cro-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: [syncDate], channels: chans })
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      const summary = d.results.map(r => `${r.channel}: ${r.status}`).join(', ');
      setResult({ ok: true, msg: summary });
      onSynced?.();
    } catch (err) { setResult({ ok: false, msg: err.message }); }
    finally { setSyncing(false); }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setOpen(o => !o)}
        className={`px-2 py-1 text-[10px] font-medium rounded border transition-colors ${open ? 'bg-accent/10 border-accent text-accent' : 'bg-bg border-border text-text-muted hover:border-accent/50'}`}>
        Sync Date
      </button>
      {open && (
        <div className="flex items-center gap-1.5 bg-bg border border-border rounded px-2 py-1">
          <input type="date" value={syncDate} onChange={e => setSyncDate(e.target.value)}
            className="bg-card border border-border text-text-primary text-[10px] px-1.5 py-0.5 rounded focus:outline-none focus:border-accent" />
          <label className="flex items-center gap-0.5 text-[10px] text-text-secondary cursor-pointer">
            <input type="checkbox" checked={channels.web} onChange={e => setChannels(c => ({ ...c, web: e.target.checked }))} /> Web
          </label>
          <label className="flex items-center gap-0.5 text-[10px] text-text-secondary cursor-pointer">
            <input type="checkbox" checked={channels.app} onChange={e => setChannels(c => ({ ...c, app: e.target.checked }))} /> App
          </label>
          <button onClick={handleSync} disabled={syncing}
            className="px-2 py-0.5 text-[10px] font-medium rounded bg-accent text-white hover:opacity-90 disabled:opacity-50">
            {syncing ? '...' : 'Go'}
          </button>
          {result && <span className={`text-[10px] ${result.ok ? 'text-positive' : 'text-negative'}`}>{result.msg}</span>}
        </div>
      )}
    </div>
  );
}

function WeeklyFunnel({ start, end, onSynced }) {
  const { data, loading, error, refetch } = useApi(`/api/analytics/cro-funnel-deltas?start=${start}&end=${end}`);

  function handleSynced() {
    refetch?.();
    onSynced?.();
  }

  if (loading) return <div className="bg-card border border-border rounded-lg p-4"><div className="flex items-center justify-center py-8 text-xs text-text-muted gap-2"><div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />Loading funnel...</div></div>;
  if (error || !data) return null;

  const channels = [
    { key: 'web', label: 'Web', rows: data.web || [] },
    { key: 'app', label: 'App', rows: data.app || [] },
  ];

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">7-Day Funnel Trend</h2>
          <p className="text-xs text-text-muted mt-0.5">Daily Sessions → ATC → CI → RPP → Orders</p>
        </div>
        <div className="flex items-center gap-3">
          <FunnelDateSync onSynced={handleSynced} />
          <span className="text-[10px] text-text-muted">{start} to {end}</span>
        </div>
      </div>

      {channels.map(ch => {
        const rows = ch.rows.filter(r => (r.sessions > 0) || (r.ic > 0) || (r.rpp > 0) || (r.orders > 0));
        if (rows.length === 0) return null;

        const totals = rows.reduce((t, r) => {
          t.sessions += r.sessions || 0;
          t.atc += r.atc || 0;
          t.ic += r.ic || 0;
          t.rpp += r.rpp || 0;
          t.orders += r.orders || 0;
          return t;
        }, { sessions: 0, atc: 0, ic: 0, rpp: 0, orders: 0 });

        const steps = [
          { label: 'Sessions', key: 'sessions' },
          { label: 'ATC', key: 'atc' },
          { label: 'CI', key: 'ic' },
          { label: 'RPP', key: 'rpp' },
          { label: 'Orders', key: 'orders' },
        ];

        return (
          <div key={ch.key} className="mb-4 last:mb-0">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-text-primary">{ch.label}</h3>
              <div className="flex-1 h-px bg-border/50" />
              {/* Period totals as pills */}
              <div className="flex gap-1.5">
                {steps.map(s => (
                  <span key={s.key} className="text-[10px] text-text-muted bg-bg px-2 py-0.5 rounded-full border border-border/50">
                    {s.label}: <span className="font-semibold text-text-primary">{fmt(totals[s.key])}</span>
                    {s.key !== 'sessions' && totals.sessions > 0 && (
                      <span className="text-accent ml-0.5">({(totals[s.key] / totals.sessions * 100).toFixed(1)}%)</span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-[2] bg-card">
                  <tr className="border-b border-border">
                    <th className="text-left text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">Date</th>
                    {steps.map(s => (
                      <th key={s.key} className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">{s.label}</th>
                    ))}
                    <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">ATC%</th>
                    <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">CI%</th>
                    <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">RPP%</th>
                    <th className="text-right text-[10px] font-medium text-text-muted uppercase tracking-wider py-2 px-2 bg-card">CVR%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const prev = i > 0 ? rows[i - 1] : null;
                    const atcPct = r.atc_pct;
                    const icPct = r.ic_pct;
                    const rppPct = r.rpp_pct;
                    const cvrPct = r.cvr_pct;
                    return (
                      <tr key={r.date} className="border-b border-border/30 hover:bg-bg transition-colors">
                        <td className="py-2 px-2 text-xs font-medium text-text-primary whitespace-nowrap">{r.date}<DateSyncRow date={r.date} onSynced={handleSynced} /></td>
                        <td className="py-2 px-2 text-xs text-right text-text-secondary">{fmt(r.sessions)}</td>
                        <td className="py-2 px-2 text-xs text-right text-text-secondary">{fmt(r.atc)}</td>
                        <td className="py-2 px-2 text-xs text-right text-text-secondary">{fmt(r.ic)}</td>
                        <td className="py-2 px-2 text-xs text-right text-text-secondary">{fmt(r.rpp)}</td>
                        <td className="py-2 px-2 text-xs text-right font-medium text-text-primary">{fmt(r.orders)}</td>
                        <td className={`py-2 px-2 text-xs text-right font-medium ${prev && atcPct != null && prev.atc_pct != null ? (atcPct > prev.atc_pct ? 'text-positive' : atcPct < prev.atc_pct ? 'text-negative' : 'text-text-secondary') : 'text-text-secondary'}`}>{pct(atcPct)}</td>
                        <td className={`py-2 px-2 text-xs text-right font-medium ${prev && icPct != null && prev.ic_pct != null ? (icPct > prev.ic_pct ? 'text-positive' : icPct < prev.ic_pct ? 'text-negative' : 'text-text-secondary') : 'text-text-secondary'}`}>{pct(icPct)}</td>
                        <td className={`py-2 px-2 text-xs text-right font-medium ${prev && rppPct != null && prev.rpp_pct != null ? (rppPct > prev.rpp_pct ? 'text-positive' : rppPct < prev.rpp_pct ? 'text-negative' : 'text-text-secondary') : 'text-text-secondary'}`}>{pct(rppPct)}</td>
                        <td className={`py-2 px-2 text-xs text-right font-semibold ${prev && cvrPct != null && prev.cvr_pct != null ? (cvrPct > prev.cvr_pct ? 'text-positive' : cvrPct < prev.cvr_pct ? 'text-negative' : 'text-text-secondary') : 'text-text-secondary'}`}>{pct(cvrPct)}</td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr className="bg-bg/50 border-t border-border font-semibold">
                    <td className="py-2 px-2 text-xs text-text-primary">Total</td>
                    {steps.map(s => (
                      <td key={s.key} className="py-2 px-2 text-xs text-right text-text-primary">{fmt(totals[s.key])}</td>
                    ))}
                    <td className="py-2 px-2 text-xs text-right text-accent">{totals.sessions > 0 ? pct(totals.atc / totals.sessions * 100) : '—'}</td>
                    <td className="py-2 px-2 text-xs text-right text-accent">{totals.sessions > 0 ? pct(totals.ic / totals.sessions * 100) : '—'}</td>
                    <td className="py-2 px-2 text-xs text-right text-accent">{totals.sessions > 0 ? pct(totals.rpp / totals.sessions * 100) : '—'}</td>
                    <td className="py-2 px-2 text-xs text-right text-accent font-bold">{totals.sessions > 0 ? pct(totals.orders / totals.sessions * 100) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CroSyncBar({ onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [result, setResult] = useState(null);
  const [showDateSync, setShowDateSync] = useState(false);
  const [syncDate, setSyncDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncChannels, setSyncChannels] = useState({ web: true, app: true });
  const [dateSyncing, setDateSyncing] = useState(false);

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

  async function handleDateSync() {
    const channels = [];
    if (syncChannels.web) channels.push('web');
    if (syncChannels.app) channels.push('app');
    if (!channels.length) return;
    setDateSyncing(true); setResult(null);
    try {
      const res = await fetch('/api/sync/cro-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: [syncDate], channels })
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      const summary = d.results.map(r => `${r.channel}: ${r.status}`).join(', ');
      setResult({ ok: true, msg: `${syncDate} — ${summary}` });
      onSynced?.();
    } catch (err) { setResult({ ok: false, msg: err.message }); }
    finally { setDateSyncing(false); }
  }

  const busy = syncing || rebuilding || dateSyncing;

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={handleSync} disabled={busy}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
          {syncing ? 'Syncing...' : 'Sync CRO'}
        </button>
        <button onClick={() => setShowDateSync(s => !s)} disabled={busy}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${showDateSync ? 'bg-accent/10 border-accent text-accent' : 'bg-bg border-border text-text-secondary hover:border-accent/50'} disabled:opacity-50`}>
          Sync Date
        </button>
        <button onClick={handleRebuild} disabled={busy}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-bg border border-border text-text-secondary hover:border-accent/50 disabled:opacity-50 transition-colors">
          {rebuilding ? 'Rebuilding...' : 'Rebuild'}
        </button>
        {result && <span className={`text-xs ${result.ok ? 'text-positive' : 'text-negative'}`}>{result.msg}</span>}
      </div>
      {showDateSync && (
        <div className="flex items-center gap-2 bg-bg border border-border rounded-md px-3 py-2">
          <input type="date" value={syncDate} onChange={e => setSyncDate(e.target.value)}
            className="bg-card border border-border text-text-primary text-xs px-2 py-1 rounded focus:outline-none focus:border-accent" />
          <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={syncChannels.web} onChange={e => setSyncChannels(c => ({ ...c, web: e.target.checked }))} className="rounded" />
            Web
          </label>
          <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" checked={syncChannels.app} onChange={e => setSyncChannels(c => ({ ...c, app: e.target.checked }))} className="rounded" />
            App
          </label>
          <button onClick={handleDateSync} disabled={busy}
            className="px-2.5 py-1 text-xs font-medium rounded bg-accent text-white hover:opacity-90 disabled:opacity-50">
            {dateSyncing ? 'Syncing...' : 'Go'}
          </button>
        </div>
      )}
    </div>
  );
}

function HealthLed() {
  const problems = useRcaProblems();
  const count = problems.length;
  const isGreen = count === 0;

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center">
        <div className={`w-3 h-3 rounded-full ${isGreen ? 'bg-positive' : 'bg-negative'}`}>
          <div className={`absolute inset-0 w-3 h-3 rounded-full ${isGreen ? 'bg-positive' : 'bg-negative'} animate-ping opacity-75`} />
        </div>
      </div>
      {count > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {problems.map(p => (
            <span key={p} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-negative/15 text-negative whitespace-nowrap">{p}</span>
          ))}
        </div>
      )}
      {isGreen && <span className="text-[10px] text-positive font-medium">All clear</span>}
    </div>
  );
}

export default function CroDashboard({ start, end }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-text-primary">CRO Dashboard</h2>
          <HealthLed />
        </div>
        <CroSyncBar onSynced={() => setRefreshKey(k => k + 1)} />
      </div>
      <CommerceSnapshot key={`commerce-${refreshKey}`} />
      <RcaSnapshot key={`rca-${refreshKey}`} />
      <DayTrend key={`daytrend-${refreshKey}`} />
      <CroFunnel start={start} end={end} key={`funnel-${refreshKey}`} />
      <WeeklyFunnel start={start} end={end} key={`weekly-${refreshKey}`} onSynced={() => setRefreshKey(k => k + 1)} />
      <MainMovers end={end} key={`movers-${refreshKey}`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" key={`pages-${refreshKey}`}>
        <PagePerformance start={start} end={end} mode="top" />
        <PagePerformance start={start} end={end} mode="worst" />
      </div>
    </div>
  );
}
