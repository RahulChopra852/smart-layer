import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { supabase } from '../lib/supabaseClient';
import { useWorkspace } from '../lib/workspace';

const STATUS_COLOR = { active: 'text-positive', error: 'text-negative', revoked: 'text-text-muted' };

const TOKEN_PLACEHOLDERS = {
  shopify: 'sdbc_live_... (from the Smart Layer Shopify app)',
  vwo: 'VWO API token',
  psi: 'PageSpeed Insights API key',
  metabase: 'Metabase API key',
};

// Workspace-level connection management. Every source is connected the same way: paste an
// API key/token here, no OAuth flow, no install webhook. For Shopify specifically that key is
// the fixed proxy key the connector app issues after a merchant installs it — Smart Layer never
// sees a raw Shopify token, every query goes through the connector's own GraphQL proxy with this
// key as the Bearer token (see server/connectors/shopify.js).
export default function ConnectionsHub({ onCreated }) {
  const workspace = useWorkspace();
  const { data, loading, refetch } = useApi('/api/connections');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: 'shopify', label: '', token: '' });
  const [error, setError] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const secretKey = form.type === 'shopify' ? 'proxy_key' : 'api_token';
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, 'x-workspace-id': workspace.id },
        body: JSON.stringify({ type: form.type, label: form.label, secret: { [secretKey]: form.token } }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setForm({ type: 'shopify', label: '', token: '' });
      refetch();
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {loading ? (
        <p className="text-xs text-text-muted">Loading connections...</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {(data?.connections || []).map(c => (
            <li key={c.id} className="flex items-center justify-between bg-bg border border-border rounded-md px-3 py-2 text-xs">
              <span className="text-text-primary font-medium">{c.label || c.type}</span>
              <span className="text-text-muted">{c.type}</span>
              <span className={STATUS_COLOR[c.status] || 'text-text-muted'}>{c.status}</span>
            </li>
          ))}
          {(data?.connections || []).length === 0 && <p className="text-xs text-text-muted">No connections yet.</p>}
        </ul>
      )}

      <form onSubmit={handleCreate} className="flex flex-col gap-2 bg-card border border-border rounded-md p-3">
        <div className="flex items-center gap-2">
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            className="text-xs bg-bg border border-border rounded px-2 py-1">
            <option value="shopify">Shopify</option>
            <option value="vwo">VWO</option>
            <option value="psi">PageSpeed Insights</option>
            <option value="metabase">Metabase</option>
          </select>
          <input placeholder="Label" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            className="flex-1 text-xs bg-bg border border-border rounded px-2 py-1" />
        </div>
        <input placeholder={TOKEN_PLACEHOLDERS[form.type]} value={form.token}
          onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
          className="text-xs bg-bg border border-border rounded px-2 py-1" type="password" />
        {error && <p className="text-xs text-negative">{error}</p>}
        <button type="submit" disabled={creating}
          className="self-start px-2.5 py-1 text-[11px] font-medium rounded bg-accent text-white hover:opacity-90 disabled:opacity-50">
          {creating ? 'Creating...' : 'Add connection'}
        </button>
      </form>
    </div>
  );
}
