import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import SectionNav from './SectionNav';

const CATEGORIES = [
  { metric: 'ATC', area: 'Product Page' },
  { metric: 'IC', area: 'Cart Page' },
  { metric: 'RPP', area: 'Checkout Flow' },
  { metric: 'CVR', area: 'Sitewide' },
];

const METRIC_LABELS = { ATC: 'ATC Optimization', IC: 'IC (Initiate Checkout) Optimization', RPP: 'RPP (Reached Payment) Optimization', CVR: 'CVR (Overall) Optimization' };

// This quarter's stated focus areas — static reference content, set by hand each quarter rather
// than derived from any table, so the AB test backlog below stays visibly anchored to a goal.
const QUARTER_FOCUS_AREAS = [
  'Trustification on the website',
  'SEO / AIO / AI bots visibility',
  "Optimising PDPs for increasing ATC",
  "Optimising PDPs for increasing CVR",
];

const ABTESTS_SECTIONS = [
  { id: 'abtests-quarter-plan', label: 'Quarter Plan' },
  ...CATEGORIES.map(c => ({ id: `abtests-${c.metric.toLowerCase()}`, label: METRIC_LABELS[c.metric] })),
];

// "Picked Up" isn't a manually-settable option here — creating a ticket sets it automatically
// (see StatusSelect's create-ticket branch), so it's excluded from this list but stays in
// STATUS_COLORS/STATUS_CARDS since tests can still carry and display that status.
const STATUS_OPTIONS = [
  { value: '', label: 'Set status' },
  { value: 'already_exists', label: 'Already Exists / Completed' },
];

// Not a real status — selecting this fires off a backlog ticket via the SDLC MCP instead of
// persisting a status change, so it's handled separately in StatusSelect's change handler and
// never gets written to ab_tests.status.
const CREATE_TICKET_VALUE = '__create_ticket__';

const STATUS_COLORS = {
  picked_up: 'text-accent',
  already_exists: 'text-text-muted',
};

// Once a test is triaged into one of these statuses, it moves out of its metric category card
// and into its own dedicated card below, grouped by status instead — so "picked up" / "already
// exists" tests from every metric live together for easy cross-referencing against VWO later.
const STATUS_CARDS = [
  { key: 'picked_up', title: 'Picked Up' },
  { key: 'already_exists', title: 'Already Exists / Completed' },
];

function PriorityBadge({ level }) {
  const colors = { High: 'bg-negative/10 text-negative', Medium: 'bg-warning/10 text-warning', Low: 'bg-positive/10 text-positive' };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors[level] || ''}`}>{level || '—'}</span>;
}

function StatusSelect({ test, onChange, onTicketCreated }) {
  const [saving, setSaving] = useState(false);

  async function handleChange(e) {
    const raw = e.target.value;

    if (raw === CREATE_TICKET_VALUE) {
      setSaving(true);
      try {
        const res = await fetch(`/api/analytics/ab-tests/${test.id}/create-ticket`, { method: 'POST' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Failed to create ticket');
        if (d.code) onTicketCreated(test.id, d.code);
        else alert('Ticket was created but no task code came back — check the SDLC backlog directly.');
      } catch (err) {
        alert(err.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    const value = raw || null;
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
      {!test.ticket_code && <option value={CREATE_TICKET_VALUE}>🎫 Create Ticket</option>}
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

// Re-checks a linked ticket against the SDLC backlog — if someone deleted it there, this
// clears ticket_code locally too so "Create Ticket" reappears instead of the badge silently
// pointing at a dead task forever.
function SyncTicketButton({ test, onTicketCleared }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);

  async function handleClick() {
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch(`/api/analytics/ab-tests/${test.id}/verify-ticket`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to verify ticket');
      if (d.exists) {
        setResult('exists');
      } else {
        setResult('missing');
        onTicketCleared(test.id);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setChecking(false);
      setTimeout(() => setResult(null), 3000);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={checking}
      title="Check if this ticket still exists in the backlog"
      className="text-[10px] text-text-muted hover:text-accent disabled:opacity-50 transition-colors whitespace-nowrap"
    >
      {checking ? 'Checking…' : result === 'exists' ? '✓ Still open' : result === 'missing' ? 'Gone — cleared' : '🔄 Sync'}
    </button>
  );
}

function Chevron({ open }) {
  return (
    <svg className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function TestCard({ test, onStatusChange, onTicketCreated, onTicketCleared, showMetricTag = false }) {
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
          {test.ticket_code && (
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent">🎫 {test.ticket_code}</span>
              <SyncTicketButton test={test} onTicketCleared={onTicketCleared} />
            </span>
          )}
        </div>
        {!pending && (
          <div className="flex items-center gap-2 shrink-0">
            <PriorityBadge level={test.impact} />
            <StatusSelect test={test} onChange={onStatusChange} onTicketCreated={onTicketCreated} />
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

export default function AbTestsTab() {
  const { data: testsData, loading, error, refetch } = useApi('/api/analytics/ab-tests');
  const [localTests, setLocalTests] = useState(null);

  const tests = localTests || testsData?.tests || [];

  // All four updaters use the functional setState form — closing over `tests` directly (a
  // render-time snapshot) instead of reading from `prev` let two in-flight requests that
  // resolve close together (e.g. clicking "Create Ticket" on two cards back to back) silently
  // overwrite each other with stale data, which is exactly how one test ended up with another
  // test's ticket_code linked to it.
  function handleGenerated(newTest) {
    setLocalTests(prev => [newTest, ...(prev || testsData?.tests || [])]);
  }
  function handleStatusChange(id, status) {
    setLocalTests(prev => (prev || testsData?.tests || []).map(t => t.id === id ? { ...t, status } : t));
  }
  function handleTicketCreated(id, code) {
    setLocalTests(prev => (prev || testsData?.tests || []).map(t => t.id === id ? { ...t, ticket_code: code, status: 'picked_up' } : t));
  }
  function handleTicketCleared(id) {
    setLocalTests(prev => (prev || testsData?.tests || []).map(t => t.id === id ? { ...t, ticket_code: null } : t));
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionNav sections={ABTESTS_SECTIONS} />
      <div id="abtests-quarter-plan">
        <CollapsibleCard title="Quarter Plan" subtitle="This quarter's focus areas — the backlog below should trace back to one of these" defaultOpen={false}>
          <ol className="flex flex-col gap-2">
            {QUARTER_FOCUS_AREAS.map((area, i) => (
              <li key={i} className="flex items-center gap-3 bg-bg rounded-md p-3 border border-border/50">
                <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-bold">{i + 1}</span>
                <span className="text-sm text-text-primary">{area}</span>
              </li>
            ))}
          </ol>
        </CollapsibleCard>
      </div>

      {error && <div className="bg-card border border-border rounded-lg p-4"><p className="text-xs text-negative">{error}</p></div>}

      {CATEGORIES.map(({ metric, area }) => {
        const categoryTests = tests.filter(t => t.metric === metric && !t.status);
        return (
          <div id={`abtests-${metric.toLowerCase()}`} key={metric}>
            <CollapsibleCard
              title={METRIC_LABELS[metric]}
              subtitle={`Target area: ${area}`}
              defaultOpen={metric === 'ATC'}
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
                    <TestCard key={test.id} test={test} onStatusChange={handleStatusChange} onTicketCreated={handleTicketCreated} onTicketCleared={handleTicketCleared} />
                  ))}
                </div>
              )}
            </CollapsibleCard>
          </div>
        );
      })}

      {STATUS_CARDS.map(({ key, title }) => {
        const statusTests = tests.filter(t => t.status === key);
        return (
          <CollapsibleCard
            key={key}
            title={title}
            subtitle="Tests moved here after triage, from every metric category"
            defaultOpen={false}
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
                  <TestCard key={test.id} test={test} onStatusChange={handleStatusChange} onTicketCreated={handleTicketCreated} onTicketCleared={handleTicketCleared} showMetricTag />
                ))}
              </div>
            )}
          </CollapsibleCard>
        );
      })}
    </div>
  );
}
