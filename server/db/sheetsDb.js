import { google } from 'googleapis';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// "Dashboard DB" spreadsheet — created once via Drive, ID locked here.
// Do not change without creating a new sheet; this is the single source of truth ID.
export const SPREADSHEET_ID = '1CQg8P2jxdO9mWrB2-bP_zrrUWFQ2HgfFvQ5imGk2fbE';

// Tab name -> header row. The app creates any missing tab + header on first run.
// Column order here IS the column order in the sheet — keep stable, only append new cols at the end.
export const TAB_SCHEMAS = {
  shopify_daily: ['date', 'order_count', 'units_sold', 'revenue'],
  shopify_products: ['date', 'product_id', 'product_title', 'units_sold', 'revenue'],
  page_sessions: ['date', 'landing_page', 'source_field', 'source_value', 'sessions', 'atc_count', 'atc_rate'],
  cro_daily: ['date', 'channel', 'sessions', 'web_sess', 'app_sess', 'atc', 'ic', 'rpp', 'orders', 'web_orders', 'app_orders', 'atc_pct', 'ic_pct', 'rpp_pct', 'cvr_pct', 'web_cvr', 'app_cvr', 'atc_to_ci', 'ci_to_rpp', 'rpp_to_ord', 'comment'],
  webvitals: ['run_at', 'page_title', 'url', 'lcp', 'fcp', 'inp', 'cls', 'ttfb', 'speed_index', 'performance_score'],
  meta_reports: [
    'uploaded_at', 'reporting_start', 'reporting_end', 'campaign_name', 'day', 'ad_name',
    'amount_spent', 'ctr_all', 'cpm', 'cpc', 'ctr_link', 'cost_per_lpv', 'cost_per_purchase', 'aov',
    'lc_to_lpv', 'lpv_to_a2c', 'a2c_to_ci', 'a2c_to_order', 'ci_to_order',
    'website_checkouts', 'website_purchases', 'roas', 'cvr_pct',
    'lpv', 'link_clicks', 'hook_rate', 'cost_per_purchase_new_customer'
  ],
  rca_notes: ['id', 'date', 'source', 'metric_tag', 'note', 'created_at'],
  vwo_campaigns: ['id', 'name', 'status', 'started', 'goal', 'type', 'visitors', 'control_conv', 'control_visitors', 'control_rate', 'control_rpv', 'var_conv', 'var_visitors', 'var_rate', 'var_rpv', 'improvement', 'confidence', 'variations', 'synced_at'],
  psi_daily: ['date', 'page', 'lcp', 'fcp', 'inp', 'cls', 'ttfb', 'speed_index', 'performance', 'lcp_avg3d', 'fcp_avg3d', 'perf_avg3d', 'alerts'],
  alerts: ['id', 'created_at', 'type', 'metric', 'current_value', 'previous_value', 'change_pct', 'threshold', 'status', 'message'],
  ga_app_daily: ['date', 'platform', 'active_users', 'new_users', 'sessions', 'engaged_sessions', 'screen_page_views', 'avg_session_duration', 'event_count'],
  _sync_state: ['source', 'last_synced_date', 'last_synced_at']
};

let sheetsClient = null;

// Auth: expects a service-account key file path in GOOGLE_APPLICATION_CREDENTIALS env var,
// OR falls back to Application Default Credentials (e.g. if running where gcloud auth is set up).
// This is the one piece of setup the user must do locally before first run — documented in README.
async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return sheetsClient;
}

async function getExistingTabTitles(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  return new Set(meta.data.sheets.map(s => s.properties.title));
}

// Idempotent — call on every server start. Creates any tab that doesn't exist yet with its header row.
// Never drops or re-creates existing tabs (that would destroy cached data).
export async function ensureTabs() {
  const sheets = await getSheetsClient();
  const existing = await getExistingTabTitles(sheets);
  const missing = Object.keys(TAB_SCHEMAS).filter(name => !existing.has(name));

  if (missing.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: missing.map(title => ({ addSheet: { properties: { title } } }))
      }
    });
    // Write header rows for newly created tabs
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: missing.map(title => ({
          range: `${title}!A1`,
          values: [TAB_SCHEMAS[title]]
        }))
      }
    });
  }

  // The default "Sheet1" Google creates on a brand-new spreadsheet is harmless to leave;
  // we simply never write to it. Not auto-deleting it to avoid surprising destructive behavior.
  return { created: missing };
}

// Clear all data from a tab (keeps header) and rewrite the header to match current schema.
export async function clearTab(tabName) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A1:ZZ`
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [TAB_SCHEMAS[tabName]] }
  });
}

// Append rows (array of arrays, matching TAB_SCHEMAS[tabName] column order) in a single batched call.
export async function appendRows(tabName, rows) {
  if (!rows || rows.length === 0) return;
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  });
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

export async function deleteRowsByDate(tabName, date, channelCol = null, channelVal = null) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A2:ZZ`
  });
  const cols = TAB_SCHEMAS[tabName];
  const dateIdx = cols.indexOf('date');
  const chanIdx = channelCol ? cols.indexOf(channelCol) : -1;
  const values = res.data.values || [];
  const rowsToDelete = [];
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    if (row[dateIdx] === date && (chanIdx === -1 || row[chanIdx] === channelVal)) {
      rowsToDelete.push(i);
    }
  }
  if (rowsToDelete.length === 0) return 0;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets.find(s => s.properties.title === tabName);
  const sheetId = sheet.properties.sheetId;

  const requests = rowsToDelete.map(i => ({
    deleteDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: i + 1, endIndex: i + 2 }
    }
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests }
  });
  return rowsToDelete.length;
}

export async function getSyncState(source) {
  const rows = await readRows('_sync_state');
  return rows.find(r => r.source === source) || null;
}

export async function setSyncState(source, lastSyncedDate) {
  const sheets = await getSheetsClient();
  const rows = await readRows('_sync_state');
  const idx = rows.findIndex(r => r.source === source);
  const nowIso = new Date().toISOString();

  if (idx === -1) {
    await appendRows('_sync_state', [[source, lastSyncedDate, nowIso]]);
  } else {
    // Sheet row number = header(1) + index(0-based) + 1
    const rowNumber = idx + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `_sync_state!A${rowNumber}:C${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[source, lastSyncedDate, nowIso]] }
    });
  }
}

// Explicit full re-crawl escape hatch — user-triggered only, never automatic.
// Clears all data rows in a tab (keeps header) and removes its sync_state row.
export async function clearSource(source, tabName) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A2:ZZ`
  });
  const rows = await readRows('_sync_state');
  const idx = rows.findIndex(r => r.source === source);
  if (idx !== -1) {
    const rowNumber = idx + 2;
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `_sync_state!A${rowNumber}:C${rowNumber}`
    });
  }
}
