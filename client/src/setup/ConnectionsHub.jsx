import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { supabase } from '../lib/supabaseClient';
import { useWorkspace } from '../lib/workspace';

const STATUS_COLOR = { active: 'text-positive', error: 'text-negative', revoked: 'text-text-muted' };

// Workspace-level connection management. The normal Shopify path is the connector app's install
// hook (no form needed — see server/routes/hooks.js); this form covers the manual-token fallback
// and every other source type (vwo/psi/metabase), which have no equivalent install flow yet.
export default function ConnectionsHub({ onCreated }) {
  const workspace = useWorkspace();
  const { data, loading, refetch } = useApi('/api/connections');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: 'shopify', label: '', shopDomain: '', token: '' });
  const [error, setError] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body = form.type === 'shopify'
        ? { type: 'shopify', label: form.label || form.shopDomain, meta: { shop_domain: form.shopDomain, manual_token: true }, secret: { access_token: form.token } }
        : { type: form.type, label: form.label, secret: { api_token: form.token } };

      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, 'x-workspace-id': workspace.id },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setForm({ type: 'shopify', label: '', shopDomain: '', token: '' });
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
            <option value="shopify">Shopify (manual token)</option>
            <option value="vwo">VWO</option>
            <option value="psi">PageSpeed Insights</option>
            <option value="metabase">Metabase</option>
          </select>
          <input placeholder="Label" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            className="flex-1 text-xs bg-bg border border-border rounded px-2 py-1" />
        </div>
        {form.type === 'shopify' && (
          <input placeholder="shop-domain.myshopify.com" value={form.shopDomain}
            onChange={e => setForm(f => ({ ...f, shopDomain: e.target.value }))}
            className="text-xs bg-bg border border-border rounded px-2 py-1" />
        )}
        <input placeholder={form.type === 'shopify' ? 'Admin API access token' : 'API token / key'} value={form.token}
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
