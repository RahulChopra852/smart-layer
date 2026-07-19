import { createClient } from '@supabase/supabase-js';

// The control-plane DB. Lives in the smart_layer schema of the Shopify connector app's own
// Supabase project (shared, NOT a dedicated Smart Layer project — see docs/ARCHITECTURE.md §3).
// This client only ever touches smart_layer.* — never the connector app's `public` schema.
let sbClient = null;

export function getClient() {
  if (sbClient) return sbClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  }
  sbClient = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: 'smart_layer' },
  });
  return sbClient;
}

export async function findWorkspaceByShopDomain(shopDomain) {
  const { data, error } = await getClient().from('workspaces').select('*').eq('shop_domain', shopDomain).maybeSingle();
  if (error) throw new Error(`findWorkspaceByShopDomain failed: ${error.message}`);
  return data;
}

export async function createWorkspace({ name, slug, shopDomain = null }) {
  const { data, error } = await getClient().from('workspaces').insert({ name, slug, shop_domain: shopDomain }).select().single();
  if (error) throw new Error(`createWorkspace failed: ${error.message}`);
  return data;
}

export async function listWorkspacesForUser(userId) {
  const { data, error } = await getClient()
    .from('workspace_members')
    .select('role, workspaces(*)')
    .eq('user_id', userId);
  if (error) throw new Error(`listWorkspacesForUser failed: ${error.message}`);
  return (data || []).map(row => ({ ...row.workspaces, role: row.role }));
}

export async function addWorkspaceMember(workspaceId, userId, role = 'admin') {
  const { error } = await getClient().from('workspace_members').upsert(
    { workspace_id: workspaceId, user_id: userId, role },
    { onConflict: 'workspace_id,user_id' }
  );
  if (error) throw new Error(`addWorkspaceMember failed: ${error.message}`);
}

export async function getMembership(workspaceId, userId) {
  const { data, error } = await getClient()
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`getMembership failed: ${error.message}`);
  return data;
}

export async function listConnections(workspaceId) {
  const { data, error } = await getClient()
    .from('connections')
    .select('id, workspace_id, type, label, meta, status, last_error, created_at, updated_at')
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(`listConnections failed: ${error.message}`);
  return data || [];
}

export async function getConnection(connectionId) {
  const { data, error } = await getClient().from('connections').select('*').eq('id', connectionId).maybeSingle();
  if (error) throw new Error(`getConnection failed: ${error.message}`);
  return data;
}

export async function getConnectionByType(workspaceId, type) {
  const { data, error } = await getClient()
    .from('connections')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('type', type)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(`getConnectionByType failed: ${error.message}`);
  return data;
}

export async function createConnection({ workspaceId, type, label = null, secretCiphertext = null, meta = {} }) {
  const { data, error } = await getClient()
    .from('connections')
    .insert({ workspace_id: workspaceId, type, label, secret_ciphertext: secretCiphertext, meta })
    .select('id, workspace_id, type, label, meta, status, created_at')
    .single();
  if (error) throw new Error(`createConnection failed: ${error.message}`);
  return data;
}

export async function setConnectionStatus(connectionId, status, lastError = null) {
  const { error } = await getClient().from('connections').update({ status, last_error: lastError, updated_at: new Date().toISOString() }).eq('id', connectionId);
  if (error) throw new Error(`setConnectionStatus failed: ${error.message}`);
}

export async function getReportConfig(workspaceId, reportId) {
  const { data, error } = await getClient()
    .from('report_configs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('report_id', reportId)
    .maybeSingle();
  if (error) throw new Error(`getReportConfig failed: ${error.message}`);
  return data;
}

export async function listReportConfigs(workspaceId) {
  const { data, error } = await getClient().from('report_configs').select('*').eq('workspace_id', workspaceId);
  if (error) throw new Error(`listReportConfigs failed: ${error.message}`);
  return data || [];
}

export async function upsertReportConfig({ workspaceId, reportId, connectionId = null, config = {}, status = 'draft', lastError = null }) {
  const { data, error } = await getClient()
    .from('report_configs')
    .upsert(
      { workspace_id: workspaceId, report_id: reportId, connection_id: connectionId, config, status, last_error: lastError, updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id,report_id' }
    )
    .select()
    .single();
  if (error) throw new Error(`upsertReportConfig failed: ${error.message}`);
  return data;
}
