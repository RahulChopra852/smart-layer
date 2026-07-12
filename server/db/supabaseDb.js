import { createClient } from '@supabase/supabase-js';

// Same column order as the old Sheets tabs — used to convert positional row arrays into
// named objects for insert/upsert. Kept identical so callers barely had to change.
export const TAB_SCHEMAS = {
  shopify_daily: ['date', 'order_count', 'units_sold', 'revenue'],
  shopify_products: ['date', 'product_id', 'product_title', 'units_sold', 'revenue', 'sku'],
  page_sessions: ['date', 'landing_page', 'source_field', 'source_value', 'sessions', 'atc_count', 'atc_rate'],
  cro_daily: ['date', 'channel', 'sessions', 'web_sess', 'app_sess', 'atc', 'ic', 'rpp', 'orders', 'web_orders', 'app_orders', 'atc_pct', 'ic_pct', 'rpp_pct', 'cvr_pct', 'web_cvr', 'app_cvr', 'atc_to_ci', 'ci_to_rpp', 'rpp_to_ord', 'comment'],
  webvitals: ['run_at', 'page_title', 'url', 'lcp', 'fcp', 'inp', 'cls', 'ttfb', 'speed_index', 'performance_score'],
  meta_reports: [
    'uploaded_at', 'reporting_start', 'reporting_end', 'campaign_name', 'day', 'ad_name', 'ad_set_name',
    'amount_spent', 'ctr_all', 'cpm', 'cpc', 'ctr_link', 'cost_per_lpv', 'cost_per_purchase', 'aov',
    'lc_to_lpv', 'lpv_to_a2c', 'a2c_to_ci', 'a2c_to_order', 'ci_to_order',
    'website_checkouts', 'website_purchases', 'roas', 'cvr_pct',
    'lpv', 'link_clicks', 'hook_rate', 'cost_per_purchase_new_customer',
    'ad_set_budget', 'campaign_budget'
  ],
  rca_notes: ['id', 'date', 'source', 'metric_tag', 'note', 'created_at'],
  vwo_campaigns: ['id', 'name', 'status', 'started', 'goal', 'type', 'visitors', 'control_conv', 'control_visitors', 'control_rate', 'control_rpv', 'var_conv', 'var_visitors', 'var_rate', 'var_rpv', 'improvement', 'confidence', 'variations', 'synced_at'],
  psi_daily: ['date', 'page', 'lcp', 'fcp', 'inp', 'cls', 'ttfb', 'speed_index', 'performance', 'lcp_avg3d', 'fcp_avg3d', 'perf_avg3d', 'alerts'],
  ga_app_daily: ['date', 'platform', 'active_users', 'new_users', 'sessions', 'engaged_sessions', 'screen_page_views', 'avg_session_duration', 'event_count'],
  gokwik_daily: [
    'date', 'total_orders', 'prepaid_orders', 'cod_orders',
    'avg_rto_score', 'high_rto_pct',
    'loyalty_points_redeemed', 'total_discount',
    'top_coupon', 'coupon_usage_count', 'unique_coupons',
    'top_utm_source', 'top_utm_medium', 'top_utm_campaign',
    'new_customers', 'returning_customers',
    'top_landing_page', 'top_store_source',
    'synced_at'
  ],
  google_ads_daily: [
    'date', 'total_cost', 'total_impressions', 'total_clicks', 'total_conversions', 'total_conv_value', 'roas',
    'search_cost', 'search_conv_value', 'search_roas',
    'pmax_cost', 'pmax_conv_value', 'pmax_roas',
    'video_cost', 'video_impressions',
    'app_cost', 'app_conversions',
    'demandgen_cost', 'demandgen_conv_value',
    'synced_at'
  ],
  google_ads_campaigns: [
    'date', 'campaign_name', 'campaign_type', 'status', 'budget', 'cost', 'impressions', 'clicks',
    'conversions', 'conv_value', 'roas', 'cpc', 'conv_rate', 'bid_strategy'
  ],
  gokwik_products: ['date', 'product_name', 'order_count', 'quantity', 'revenue', 'payment_prepaid', 'payment_cod', 'avg_rto_score', 'high_rto_pct', 'top_coupon', 'top_utm_source', 'avg_discount'],
  gokwik_utm: ['date', 'utm_source', 'utm_medium', 'utm_campaign', 'order_count'],
  gokwik_landing_pages: ['date', 'landing_page', 'order_count', 'top_utm_source'],
  oos_log: ['product_id', 'product_title', 'handle', 'sku', 'oos_since', 'restocked_at', 'status'],
  ab_tests: ['id', 'metric', 'area', 'name', 'hypothesis', 'impact', 'status', 'source', 'page_url', 'created_at', 'ticket_code'],
  _sync_state: ['source', 'last_synced_date', 'last_synced_at']
};

// Natural key per table = the ON CONFLICT target for upserts, so re-syncing the same
// date/campaign/etc overwrites in place instead of duplicating. Empty array = append-only
// event log (rca_notes, alerts) — Postgres auto-generates the id, no upsert needed.
const UPSERT_KEYS = {
  shopify_daily: ['date'],
  shopify_products: ['date', 'product_id'],
  page_sessions: ['date', 'landing_page', 'source_field', 'source_value'],
  cro_daily: ['date', 'channel'],
  webvitals: ['run_at', 'url'],
  meta_reports: ['campaign_name', 'ad_name', 'reporting_start', 'reporting_end'],
  rca_notes: [],
  vwo_campaigns: ['id'],
  psi_daily: ['date', 'page'],
  ga_app_daily: ['date', 'platform'],
  gokwik_daily: ['date'],
  google_ads_daily: ['date'],
  google_ads_campaigns: ['date', 'campaign_name'],
  gokwik_products: ['date', 'product_name'],
  gokwik_utm: ['date', 'utm_source', 'utm_medium', 'utm_campaign'],
  gokwik_landing_pages: ['date', 'landing_page'],
  oos_log: ['product_id'],
  ab_tests: [],
  _sync_state: ['source']
};

let sbClient = null;

function getClient() {
  if (sbClient) return sbClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  }
  sbClient = createClient(url, key, { auth: { persistSession: false } });
  return sbClient;
}

// Spreadsheet formula-error artifacts (e.g. a #NUM! left behind by a broken PSI email cell) —
// treat as missing data rather than let Postgres reject the insert.
const SHEET_ERROR_TOKENS = new Set(['#NUM!', '#N/A', '#REF!', '#DIV/0!', '#VALUE!', '#NULL!', '#NAME?']);

function sanitize(val) {
  if (val === '' || val === undefined) return null;
  if (typeof val === 'string' && SHEET_ERROR_TOKENS.has(val.trim())) return null;
  return val;
}

// Postgres can't apply ON CONFLICT DO UPDATE twice to the same row within one statement —
// if a source (e.g. a mirrored sheet with repeated date+dimension rows across report runs)
// hands us duplicate keys in the same batch, keep only the last occurrence (most recent wins).
function dedupeByKey(objects, keyCols) {
  const map = new Map();
  for (const obj of objects) {
    map.set(keyCols.map(c => obj[c]).join(''), obj);
  }
  return [...map.values()];
}

// Accepts either a positional array (matching TAB_SCHEMAS column order — the legacy Sheets
// row shape) or a plain object (already column-keyed, e.g. rows mirrored from Sheets, or
// alerts.js's object literal). 'id' is dropped for append-only tables — Postgres assigns it.
function rowToObject(tabName, row) {
  const cols = TAB_SCHEMAS[tabName];
  const isAppendOnly = UPSERT_KEYS[tabName].length === 0;
  if (Array.isArray(row)) {
    const obj = {};
    cols.forEach((col, i) => {
      if (col === 'id' && isAppendOnly) return;
      obj[col] = sanitize(row[i]);
    });
    return obj;
  }
  const obj = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'id' && isAppendOnly) continue;
    obj[k] = sanitize(v);
  }
  return obj;
}

// No-op: tables are managed via migrations, not created at runtime. Kept so index.js's
// startup call doesn't need to change.
export async function ensureTabs() {
  return { created: [] };
}

// Upserts (or inserts, for append-only tables) rows. Returns the affected rows, including
// any DB-generated id, so callers that need it (e.g. RCA notes) can read it back.
export async function appendRows(tabName, rows) {
  if (!rows || rows.length === 0) return [];
  let objects = rows.map(r => rowToObject(tabName, r));
  const key = UPSERT_KEYS[tabName];
  if (key.length > 0) objects = dedupeByKey(objects, key);
  const sb = getClient();
  const query = key.length > 0
    ? sb.from(tabName).upsert(objects, { onConflict: key.join(',') }).select()
    : sb.from(tabName).insert(objects).select();
  const { data, error } = await query;
  if (error) throw new Error(`Supabase appendRows(${tabName}) failed: ${error.message}`);
  return data || [];
}

const PAGE_SIZE = 1000; // PostgREST caps a single select() response at 1000 rows regardless of table size

export async function readRows(tabName) {
  const sb = getClient();
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from(tabName).select('*').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Supabase readRows(${tabName}) failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function updateRowByKey(tabName, keyCol, keyVal, patch) {
  const sb = getClient();
  const { data, error } = await sb.from(tabName).update(patch).eq(keyCol, keyVal).select();
  if (error) throw new Error(`Supabase updateRowByKey(${tabName}) failed: ${error.message}`);
  return data && data.length > 0;
}

export async function deleteRowsByDate(tabName, date, channelCol = null, channelVal = null) {
  const sb = getClient();
  let query = sb.from(tabName).delete().eq('date', date);
  if (channelCol) query = query.eq(channelCol, channelVal);
  const { data, error } = await query.select();
  if (error) throw new Error(`Supabase deleteRowsByDate(${tabName}) failed: ${error.message}`);
  return (data || []).length;
}

export async function getSyncState(source) {
  const sb = getClient();
  const { data, error } = await sb.from('_sync_state').select('*').eq('source', source).maybeSingle();
  if (error) throw new Error(`Supabase getSyncState failed: ${error.message}`);
  return data;
}

export async function setSyncState(source, lastSyncedDate) {
  const sb = getClient();
  const { error } = await sb.from('_sync_state').upsert(
    { source, last_synced_date: lastSyncedDate, last_synced_at: new Date().toISOString() },
    { onConflict: 'source' }
  );
  if (error) throw new Error(`Supabase setSyncState failed: ${error.message}`);
}

// Deletes every row in a tab (used by the "rebuild tab" escape hatch). Filters on the first
// natural-key column, which is always NOT NULL, as a "match everything" predicate.
export async function clearTab(tabName) {
  const sb = getClient();
  const keyCols = UPSERT_KEYS[tabName].length ? UPSERT_KEYS[tabName] : ['id'];
  const { error } = await sb.from(tabName).delete().not(keyCols[0], 'is', null);
  if (error) throw new Error(`Supabase clearTab(${tabName}) failed: ${error.message}`);
}

export async function clearSource(source, tabName) {
  await clearTab(tabName);
  const sb = getClient();
  await sb.from('_sync_state').delete().eq('source', source);
}
