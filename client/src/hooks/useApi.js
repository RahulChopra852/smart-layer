import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useWorkspace } from '../lib/workspace';

async function authedFetch(url, workspaceId) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = {};
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  if (workspaceId) headers['x-workspace-id'] = workspaceId;
  return fetch(url, { headers });
}

export function useApi(url, { skip = false } = {}) {
  const workspace = useWorkspace();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(url, workspace?.id);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `${res.status} ${res.statusText}`);
      }
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url, workspace]);

  useEffect(() => {
    if (!skip) refetch();
  }, [refetch, skip]);

  return { data, loading, error, refetch };
}

export function usePolling(url, intervalMs = 60000) {
  const { data, loading, error, refetch } = useApi(url);

  useEffect(() => {
    const id = setInterval(refetch, intervalMs);
    return () => clearInterval(id);
  }, [refetch, intervalMs]);

  return { data, loading, error, refetch };
}
