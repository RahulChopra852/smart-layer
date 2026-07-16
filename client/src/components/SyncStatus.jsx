import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/useApi';
import { TABS } from '../tabs';

function formatTimeAgo(date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// The backend cron (services/scheduler.js) runs the full sync on the clock, at every even hour
// (0 */2 * * *) — not "2 hours after whenever the last sync happened". So the next run time is
// fully deterministic from the current clock, independent of any server data.
function nextEvenHourBoundary(now) {
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setMinutes(0);
  while (d.getHours() % 2 !== 0 || d.getTime() <= now) d.setHours(d.getHours() + 1);
  return d;
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

// Renders one tab's row in the breakdown panel — a few tabs don't fit the "synced at X" model
// (live API reads, or internally-generated data), so those get a distinct label instead of a
// misleading timestamp.
function TabSyncRow({ label, info }) {
  if (!info) return null;
  if (info.live) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="flex items-center gap-1.5 text-text-muted"><span className="w-1.5 h-1.5 rounded-full bg-accent" />Live</span>
      </div>
    );
  }
  if (info.internal) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-muted">Internal</span>
      </div>
    );
  }
  const synced = info.last_synced_at ? new Date(info.last_synced_at) : null;
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-xs">
      <span className="text-text-secondary">{label}</span>
      <span className="flex items-center gap-1.5 text-text-muted">
        <span className={`w-1.5 h-1.5 rounded-full ${synced ? 'bg-positive' : 'bg-negative'}`} />
        {synced ? formatTimeAgo(synced) : 'Never synced'}
      </span>
    </div>
  );
}

export default function SyncStatus({ onSyncComplete }) {
  const { data, refetch } = usePolling('/api/sync/status', 60000);
  const [syncing, setSyncing] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch('/api/sync/all', { method: 'POST' });
      await refetch();
      onSyncComplete?.();
    } finally {
      setSyncing(false);
    }
  }

  const lastSync = data?.sources
    ? Object.values(data.sources).reduce((latest, s) => {
        if (s.last_synced_at && (!latest || s.last_synced_at > latest)) return s.last_synced_at;
        return latest;
      }, null)
    : null;

  const timeAgo = lastSync ? formatTimeAgo(new Date(lastSync)) : null;
  const countdown = formatCountdown(nextEvenHourBoundary(now).getTime() - now);

  return (
    <div className="relative flex items-center gap-3">
      <span className="text-xs text-text-muted" title="Auto-sync runs every 2 hours, on the clock (server: services/scheduler.js)">
        Next auto-sync in {countdown}
      </span>
      <button
        onClick={() => setShowBreakdown(o => !o)}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
        title="Show sync status per tab"
      >
        <div className={`w-1.5 h-1.5 rounded-full ${syncing ? 'bg-warning animate-pulse' : 'bg-positive'}`} />
        {timeAgo ? `Synced ${timeAgo}` : 'Not synced'}
        <span className="text-[9px]">{showBreakdown ? '▲' : '▼'}</span>
      </button>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {syncing ? 'Syncing...' : 'Sync Now'}
      </button>

      {showBreakdown && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowBreakdown(false)} />
          <div className="absolute top-full right-0 mt-2 z-40 w-64 bg-card border border-border rounded-lg shadow-xl py-1.5 max-h-[70vh] overflow-y-auto">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted border-b border-border mb-1">Sync status by tab</div>
            {TABS.map(t => <TabSyncRow key={t.id} label={t.label} info={data?.tabs?.[t.id]} />)}
          </div>
        </>
      )}
    </div>
  );
}
