import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { supabase } from '../lib/supabaseClient';
import { useWorkspace } from '../lib/workspace';
import ConnectionsHub from './ConnectionsHub';
import FieldChecklist from './FieldChecklist';

// Renders a report definition's setup form: source connection → field checklist → settings.
// Generated purely from the registry entry passed in as `report` (from GET /api/reports) — adding
// a new report to the registry gets this form for free.
export default function SetupForm({ report, onLive }) {
  const workspace = useWorkspace();
  const { data: connData, refetch: refetchConnections } = useApi('/api/connections');
  const [connectionId, setConnectionId] = useState(report.connectionId || '');
  const [settings, setSettings] = useState(() => {
    const initial = {};
    for (const s of report.settings || []) initial[s.key] = report.config?.settings?.[s.key] ?? s.default;
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const eligible = (connData?.connections || []).filter(c => report.sourceTypes.includes(c.type));

  async function saveConfig() {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/reports/${report.id}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, 'x-workspace-id': workspace.id },
        body: JSON.stringify({ connectionId: connectionId || null, config: { settings } }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">{report.title} — setup</h2>
        <p className="text-xs text-text-muted mt-0.5">Connect a source, validate required fields, then set thresholds.</p>
      </div>

      <div>
        <p className="text-xs font-medium text-text-secondary mb-1.5">1. Source</p>
        {eligible.length > 0 ? (
          <select value={connectionId} onChange={e => setConnectionId(e.target.value)}
            className="text-xs bg-bg border border-border rounded px-2 py-1.5 w-full mb-2">
            <option value="">Select a connection...</option>
            {eligible.map(c => <option key={c.id} value={c.id}>{c.label || c.type}</option>)}
          </select>
        ) : (
          <p className="text-xs text-text-muted mb-2">No {report.sourceTypes.join('/')} connection yet — add one below.</p>
        )}
        <ConnectionsHub onCreated={refetchConnections} />
      </div>

      <div>
        <p className="text-xs font-medium text-text-secondary mb-1.5">2. Required fields</p>
        {connectionId ? (
          <FieldChecklist reportId={report.id} workspaceId={workspace.id} onValidated={onLive} />
        ) : (
          <p className="text-xs text-text-muted">Pick a connection above, then save, to run the field check.</p>
        )}
      </div>

      {report.settings?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-secondary mb-1.5">3. Settings</p>
          <div className="flex flex-col gap-2">
            {report.settings.map(s => (
              <label key={s.key} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-text-secondary">{s.label}</span>
                {s.type === 'number' ? (
                  <input type="number" value={settings[s.key] ?? ''} onChange={e => setSettings(v => ({ ...v, [s.key]: Number(e.target.value) }))}
                    className="w-28 bg-bg border border-border rounded px-2 py-1" />
                ) : (
                  <span className="text-text-muted">(configured via alias list — coming soon)</span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      <button onClick={saveConfig} disabled={saving || !connectionId}
        className="self-start px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50">
        {saving ? 'Saving...' : 'Save configuration'}
      </button>
    </div>
  );
}
