import { useState } from 'react';
import { usePolling } from '../hooks/useApi';

function formatTimeAgo(date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function SyncStatus({ onSyncComplete }) {
  const { data, refetch } = usePolling('/api/sync/status', 60000);
  const [syncing, setSyncing] = useState(false);

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

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <div className={`w-1.5 h-1.5 rounded-full ${syncing ? 'bg-warning animate-pulse' : 'bg-positive'}`} />
        {timeAgo ? `Synced ${timeAgo}` : 'Not synced'}
      </div>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {syncing ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  );
}
