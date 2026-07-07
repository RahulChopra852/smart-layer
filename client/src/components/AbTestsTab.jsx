import { useState } from 'react';
import { useApi } from '../hooks/useApi';

const CATEGORIES = [
  { metric: 'ATC', area: 'Product Page' },
  { metric: 'IC', area: 'Cart Page' },
  { metric: 'RPP', area: 'Checkout Flow' },
  { metric: 'CVR', area: 'Sitewide' },
];

const METRIC_LABELS = { ATC: 'ATC Optimization', IC: 'IC (Initiate Checkout) Optimization', RPP: 'RPP (Reached Payment) Optimization', CVR: 'CVR (Overall) Optimization' };

const STATUS_OPTIONS = [
  { value: '', label: 'Set status' },
  { value: 'picked_up', label: 'Picked Up' },
  { value: 'already_exists', label: 'Already Exists' },
  { value: 'ab_completed', label: 'AB Completed' },
];

const STATUS_COLORS = {
  picked_up: 'text-accent',
  already_exists: 'text-text-muted',
  ab_completed: 'text-positive',
};

// Once a test is triaged into one of these statuses, it moves out of its metric category card
// and into its own dedicated card below, grouped by status instead — so "picked up" / "already
// exists" / "AB completed" tests from every metric live together for easy cross-referencing
// against VWO later.
const STATUS_CARDS = [
  { key: 'picked_up', title: 'Picked Up' },
  { key: 'already_exists', title: 'Already Exists' },
  { key: 'ab_completed', title: 'AB Completed' },
];

function PriorityBadge({ level }) {
  const colors = { High: 'bg-negative/10 text-negative', Medium: 'bg-warning/10 text-warning', Low: 'bg-positive/10 text-positive' };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors[level] || ''}`}>{level || '—'}</span>;
}

function StatusSelect({ test, onChange }) {
  const [saving, setSaving] = useState(false);
  async function handleChange(e) {
    const value = e.target.value || null;
    setSaving(true);
    try {
      const res = await fetch(`/api/analytics/ab-tests/${test.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update status');
      onChange(test.id, value);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <select
      value={test.status || ''}
      onChange={handleChange}
      disabled={saving}
      className={`text-[11px] font-medium bg-bg border border-border rounded-md px-1.5 py-1 focus:outline-none focus:border-accent disabled:opacity-50 ${STATUS_COLORS[test.status] || 'text-text-secondary'}`}
    >
      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function GenerateButton({ metric, area, onGenerated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleClick() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/analytics/ab-tests/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric, area }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Generation failed');
      onGenerated(d.test);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={busy}
        className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-accent/90 text-white hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
      >
        {busy ? 'Analyzing live page…' : 'Generate new'}
      </button>
      {error && <span className="text-[10px] text-negative max-w-[220px] truncate" title={error}>{error}</span>}
    </div>
  );
}

function Chevron({ open }) {
  return (
    <svg className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function TestCard({ test, onStatusChange, showMetricTag = false }) {
  const pending = test.source === 'requested';
  return (
    <div className={`bg-bg rounded-md p-3 border ${pending ? 'border-dashed border-warning/50' : 'border-border/50'}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {showMetricTag && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent">{test.metric}</span>
          )}
          <h3 className="text-sm font-medium text-text-primary">{test.name}</h3>
          {pending && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning/15 text-warning">Pending analysis</span>}
        </div>
        {!pending && (
          <div className="flex items-center gap-2 shrink-0">
            <PriorityBadge level={test.impact} />
            <StatusSelect test={test} onChange={onStatusChange} />
          </div>
        )}
      </div>
      <p className={`text-xs leading-relaxed ${pending ? 'text-text-muted italic' : 'text-text-secondary'}`}>{test.hypothesis}</p>
      {test.page_url && (
        <a href={test.page_url} target="_blank" rel="noreferrer" className="text-[10px] text-accent hover:underline mt-1 inline-block truncate max-w-full">
          {test.page_url}
        </a>
      )}
    </div>
  );
}

function CollapsibleCard({ title, subtitle, badge, headerExtra, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 min-w-0 text-left flex-1">
          <Chevron open={open} />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {headerExtra}
          {badge}
        </div>
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function AbTestsTab({ start, end }) {
  const { data: funnelData } = useApi(`/api/analytics/cro-funnel-deltas?start=${start}&end=${end}`);
  const { data: testsData, loading, error, refetch } = useApi('/api/analytics/ab-tests');
  const [localTests, setLocalTests] = useState(null);

  const tests = localTests || testsData?.tests || [];

  function handleGenerated(newTest) {
    setLocalTests([newTest, ...tests]);
  }
  function handleStatusChange(id, status) {
    setLocalTests(tests.map(t => t.id === id ? { ...t, status } : t));
  }

  const webLatest = funnelData?.web?.[funnelData.web.length - 1];
  const context = webLatest ? {
    atc_pct: webLatest.atc_pct,
    ic_pct: webLatest.ic_pct,
    rpp_pct: webLatest.rpp_pct,
    cvr_pct: webLatest.cvr_pct,
  } : null;

  return (
    <div className="flex flex-col gap-4">
      {context && (
        <CollapsibleCard title="Current Funnel State" subtitle="Tests are prioritized based on the biggest conversion drop-offs in your funnel">
          <div className="flex gap-4">
            {[
              { label: 'ATC %', val: context.atc_pct },
              { label: 'IC %', val: context.ic_pct },
              { label: 'RPP %', val: context.rpp_pct },
              { label: 'CVR %', val: context.cvr_pct },
            ].map(m => (
              <div key={m.label} className="flex-1 bg-bg rounded-md p-3 border border-border/50 text-center">
                <div className="text-[10px] text-text-muted uppercase">{m.label}</div>
                <div className="text-lg font-bold text-text-primary">{m.val != null ? `${m.val.toFixed(1)}%` : '—'}</div>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {error && <div className="bg-card border border-border rounded-lg p-4"><p className="text-xs text-negative">{error}</p></div>}

      {CATEGORIES.map(({ metric, area }) => {
        const categoryTests = tests.filter(t => t.metric === metric && !t.status);
        return (
          <CollapsibleCard
            key={metric}
            title={METRIC_LABELS[metric]}
            subtitle={`Target area: ${area}`}
            headerExtra={<GenerateButton metric={metric} area={area} onGenerated={handleGenerated} />}
            badge={
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                {categoryTests.length} tests
              </span>
            }
          >
            {loading && !localTests ? (
              <div className="flex items-center justify-center py-6 text-xs text-text-muted gap-2">
                <div className="w-3.5 h-3.5 border-2 border-border border-t-accent rounded-full animate-spin" />
                Loading...
              </div>
            ) : categoryTests.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-6">No untriaged tests — click "Generate new" to create one from live page analysis.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {categoryTests.map((test) => (
                  <TestCard key={test.id} test={test} onStatusChange={handleStatusChange} />
                ))}
              </div>
            )}
          </CollapsibleCard>
        );
      })}

      {STATUS_CARDS.map(({ key, title }) => {
        const statusTests = tests.filter(t => t.status === key);
        return (
          <CollapsibleCard
            key={key}
            title={title}
            subtitle="Tests moved here after triage, from every metric category"
            defaultOpen={statusTests.length > 0}
            badge={
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                {statusTests.length} tests
              </span>
            }
          >
            {statusTests.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-6">No tests marked "{title}" yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {statusTests.map((test) => (
                  <TestCard key={test.id} test={test} onStatusChange={handleStatusChange} showMetricTag />
                ))}
              </div>
            )}
          </CollapsibleCard>
        );
      })}
    </div>
  );
}
