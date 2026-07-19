import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient';
import { WorkspaceContext } from './lib/workspace';
import { useApi } from './hooks/useApi';
import ProductsTab from './components/ProductsTab';

function getDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  return { today, weekAgo };
}

// One entry per report definition that has a dashboard built — adding a new report to the
// server registry doesn't show up here until its component exists. Each component already
// knows how to render its own SetupForm when report.status !== 'live' (see ProductsTab.jsx).
const REPORT_COMPONENTS = {
  products: ProductsTab,
};

function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 w-80 flex flex-col gap-3">
        <h1 className="text-lg font-semibold text-text-primary">Smart Layer</h1>
        {sent ? (
          <p className="text-sm text-positive">Check your email for a sign-in link.</p>
        ) : (
          <>
            <input type="email" required placeholder="you@brand.com" value={email} onChange={e => setEmail(e.target.value)}
              className="text-sm bg-bg border border-border rounded px-3 py-2" />
            {error && <p className="text-xs text-negative">{error}</p>}
            <button type="submit" className="px-3 py-2 text-sm font-medium rounded-md bg-accent text-white hover:opacity-90">
              Send magic link
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function WorkspaceSwitcher({ workspaces, workspace, setWorkspace }) {
  if (workspaces.length <= 1) return null;
  return (
    <select value={workspace?.id || ''} onChange={e => setWorkspace(workspaces.find(w => w.id === e.target.value))}
      className="text-xs bg-bg border border-border rounded px-2 py-1">
      {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
  );
}

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// The only onboarding path: no connector install webhook exists (see
// docs/ARCHITECTURE.md §6.1), so a brand's first step is always creating a workspace here by
// hand, then pasting their Shopify/GA4/etc. keys into ConnectionsHub one at a time.
function CreateWorkspace({ onCreated }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name, slug: slugify(name) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const workspace = await res.json();
      onCreated(workspace);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-4 max-w-sm flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-text-primary">Create your workspace</h2>
      <p className="text-xs text-text-muted">No connector install hook exists yet — start by naming your brand's workspace, then connect Shopify/GA4/etc. by pasting their API keys.</p>
      <input required placeholder="Brand name" value={name} onChange={e => setName(e.target.value)}
        className="text-sm bg-bg border border-border rounded px-3 py-2" />
      {error && <p className="text-xs text-negative">{error}</p>}
      <button type="submit" disabled={creating}
        className="self-start px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50">
        {creating ? 'Creating...' : 'Create workspace'}
      </button>
    </form>
  );
}

function AddDataSource({ notLiveReports, onPick }) {
  const [open, setOpen] = useState(false);
  if (notLiveReports.length === 0) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="px-2.5 py-1 text-xs font-medium rounded-md border border-border text-text-secondary hover:border-accent/50">
        + Connect a data source
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-card border border-border rounded-md shadow-lg z-20 py-1">
          {notLiveReports.map(r => (
            <button key={r.id} onClick={() => { onPick(r.id); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg flex items-center justify-between">
              {r.title}
              {r.status === 'error' && <span className="text-negative">⚠</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Only reports with status='live' get a persistent nav tab — a report the brand hasn't
// configured yet simply isn't shown until they fill in its form (via "Connect a data source").
function Dashboard({ session }) {
  const [workspace, setWorkspace] = useState(null);
  const { data: wsData, refetch: refetchWorkspaces } = useApi('/api/workspaces');
  const workspaces = useMemo(() => wsData?.workspaces || [], [wsData]);

  useEffect(() => {
    if (!workspace && workspaces.length > 0) setWorkspace(workspaces[0]);
  }, [workspaces, workspace]);

  const { data, refetch } = useApi('/api/reports', { skip: !workspace });
  const reports = useMemo(() => data?.reports || [], [data]);
  const liveReports = useMemo(() => reports.filter(r => ['live', 'validated'].includes(r.status) && REPORT_COMPONENTS[r.id]), [reports]);
  const notLiveReports = useMemo(() => reports.filter(r => !['live', 'validated'].includes(r.status) && REPORT_COMPONENTS[r.id]), [reports]);
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    if (!activeId && liveReports.length > 0) setActiveId(liveReports[0].id);
  }, [liveReports, activeId]);

  const active = reports.find(r => r.id === activeId);
  const ActiveComponent = active ? REPORT_COMPONENTS[active.id] : null;
  const { today, weekAgo } = getDefaultDates();

  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="min-h-screen bg-bg">
        <header className="sticky top-0 z-10 bg-card/90 backdrop-blur-md border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-text-primary">Smart Layer</span>
            </div>
            <div className="flex items-center gap-3">
              <WorkspaceSwitcher workspaces={workspaces} workspace={workspace} setWorkspace={setWorkspace} />
              <span className="text-xs text-text-muted">{session.user.email}</span>
              <button onClick={() => supabase.auth.signOut()} className="text-xs text-text-muted hover:text-text-primary">Sign out</button>
            </div>
          </div>
          {workspace && (
            <div className="max-w-5xl mx-auto px-4 flex items-center justify-between">
              <div className="flex gap-0 overflow-x-auto">
                {liveReports.map(r => (
                  <button key={r.id} onClick={() => setActiveId(r.id)}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeId === r.id ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-secondary'
                    }`}>
                    {r.title}
                  </button>
                ))}
              </div>
              <AddDataSource notLiveReports={notLiveReports} onPick={setActiveId} />
            </div>
          )}
        </header>
        <main className="max-w-5xl mx-auto px-4 py-4">
          {!workspace ? (
            <CreateWorkspace onCreated={(ws) => { refetchWorkspaces(); setWorkspace(ws); }} />
          ) : !active ? (
            <p className="text-sm text-text-muted">No data sources connected yet — use "Connect a data source" above.</p>
          ) : (
            <ActiveComponent start={weekAgo} end={today} report={active} onLive={refetch} />
          )}
        </main>
      </div>
    </WorkspaceContext.Provider>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <SignIn />;
  return <Dashboard session={session} />;
}
