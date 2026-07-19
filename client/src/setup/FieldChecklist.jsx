import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Calls POST /api/reports/:id/probe and renders a live ✓/✗ per required field — this is the
// "shows which fields are needed in the report" requirement from the product brief.
export default function FieldChecklist({ reportId, workspaceId, onValidated }) {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  async function runProbe() {
    setRunning(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/reports/${reportId}/probe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'x-workspace-id': workspaceId },
      });
      const body = await res.json();
      setResult(body);
      if (body.ok) onValidated?.();
    } catch (err) {
      setResult({ ok: false, error: err.message });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-bg border border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-secondary">Field checklist</span>
        <button onClick={runProbe} disabled={running}
          className="px-2.5 py-1 text-[11px] font-medium rounded bg-accent text-white hover:opacity-90 disabled:opacity-50">
          {running ? 'Checking...' : 'Check now'}
        </button>
      </div>

      {result?.error && <p className="text-xs text-negative">{result.error}</p>}

      {result?.fields && (
        <ul className="flex flex-col gap-1">
          {result.fields.map(f => (
            <li key={f.name} className="flex items-center gap-2 text-xs">
              <span className={f.present ? 'text-positive' : 'text-negative'}>{f.present ? '✓' : '✗'}</span>
              <span className="text-text-primary">{f.name}</span>
              {f.error && <span className="text-text-muted">— {f.error}</span>}
            </li>
          ))}
        </ul>
      )}

      {result?.ok && <p className="text-xs text-positive mt-2">All required fields present — report is live.</p>}
    </div>
  );
}
