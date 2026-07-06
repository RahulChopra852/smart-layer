import { google } from 'googleapis';

// "Dashboard DB" spreadsheet — legacy source, still populated by separate Apps Script projects
// (scripts/*-appscript.js) that parse Gmail reports. Only read from here now (mirrored into
// Supabase by server/services/sheetMirror.js); the Node app no longer writes to this sheet.
const SPREADSHEET_ID = '1CQg8P2jxdO9mWrB2-bP_zrrUWFQ2HgfFvQ5imGk2fbE';

// Column order for the tabs sheetMirror.js actually reads — must match the sheet's real headers.
const TAB_SCHEMAS = {
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
  psi_daily: ['date', 'page', 'lcp', 'fcp', 'inp', 'cls', 'ttfb', 'speed_index', 'performance', 'lcp_avg3d', 'fcp_avg3d', 'perf_avg3d', 'alerts'],
};

let sheetsClient = null;

// Auth: expects a service-account key file path in GOOGLE_APPLICATION_CREDENTIALS env var,
// OR falls back to Application Default Credentials (e.g. if running where gcloud auth is set up).
async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return sheetsClient;
}

// Read all rows from a tab (excluding header), returned as array of objects keyed by TAB_SCHEMAS column names.
export async function readRows(tabName) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A2:ZZ`
  });
  const cols = TAB_SCHEMAS[tabName];
  const values = res.data.values || [];
  return values.map(row => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i] ?? ''; });
    return obj;
  });
}
