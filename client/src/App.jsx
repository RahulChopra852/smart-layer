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

function WorkspaceSwitcher({ workspace, setWorkspace }) {
  const { data } = useApi('/api/workspaces', { skip: !!workspace });
  const workspaces = useMemo(() => data?.workspaces || [], [data]);

  useEffect(() => {
    if (!workspace && workspaces.length > 0) setWorkspace(workspaces[0]);
  }, [workspaces, workspace, setWorkspace]);

  if (workspaces.length <= 1) return null;
  return (
    <select value={workspace?.id || ''} onChange={e => setWorkspace(workspaces.find(w => w.id === e.target.value))}
      className="text-xs bg-bg border border-border rounded px-2 py-1">
      {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
  );
}

function Dashboard({ session }) {
  const [workspace, setWorkspace] = useState(null);

  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="min-h-screen bg-bg">
        <header className="sticky top-0 z-10 bg-card/90 backdrop-blur-md border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-text-primary">Smart Layer</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-positive/15 text-positive uppercase tracking-wide">Live</span>
            </div>
            <div className="flex items-center gap-3">
              <WorkspaceSwitcher workspace={workspace} setWorkspace={setWorkspace} />
              <span className="text-xs text-text-muted">{session.user.email}</span>
              <button onClick={() => supabase.auth.signOut()} className="text-xs text-text-muted hover:text-text-primary">Sign out</button>
            </div>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-4">
          {workspace ? <WorkspaceTabs /> : <p className="text-sm text-text-muted">No workspace yet — install the Shopify app to get started.</p>}
        </main>
      </div>
    </WorkspaceContext.Provider>
  );
}

function WorkspaceTabs() {
  const { data } = useApi('/api/reports');
  const products = (data?.reports || []).find(r => r.id === 'products');
  const { today, weekAgo } = getDefaultDates();

  if (!data) return <p className="text-sm text-text-muted">Loading...</p>;
  return <ProductsTab start={weekAgo} end={today} report={products} />;
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
