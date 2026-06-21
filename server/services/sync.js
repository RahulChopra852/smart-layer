import { appendRows, getSyncState, setSyncState, ensureTabs } from '../db/sheetsDb.js';
import { fetchOrdersSince, fetchPageSessionsSince } from './shopify.js';
import { fetchCroWebSince, fetchCroAppSince, fetchWebVitalsSince, extractCommentsAsRcaCandidates } from './croSheets.js';
import { addInferredNotes } from './rca.js';

const DEFAULT_START_DATE = '2025-10-01'; // matches earliest known data per existing dashboard skill

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function syncShopifyOrders() {
  const state = await getSyncState('shopify_orders');
  const since = state?.last_synced_date || DEFAULT_START_DATE;
  const { dailyRows, productRows, latestDate } = await fetchOrdersSince(since);

  await appendRows('shopify_daily', dailyRows);
  await appendRows('shopify_products', productRows);
  if (latestDate) await setSyncState('shopify_orders', latestDate);

  return { source: 'shopify_orders', rowsAdded: dailyRows.length, since };
}

async function syncShopifySessions() {
  const state = await getSyncState('shopify_sessions');
  const since = state?.last_synced_date || DEFAULT_START_DATE;
  const rows = await fetchPageSessionsSince(since);

  await appendRows('page_sessions', rows);
  const latestDate = rows.length ? rows.map(r => r[0]).sort().slice(-1)[0] : null;
  if (latestDate) await setSyncState('shopify_sessions', latestDate);

  return { source: 'shopify_sessions', rowsAdded: rows.length, since };
}

async function syncCroWeb() {
  const state = await getSyncState('cro_web');
  const since = state?.last_synced_date || null; // null = pull everything available (sheet itself is bounded)
  const rows = await fetchCroWebSince(since);

  await appendRows('cro_daily', rows);

  // Feed inferred RCA candidates from the comment column on this pull.
  const candidates = extractCommentsAsRcaCandidates(rows);
  await addInferredNotes(candidates);

  const latestDate = rows.length ? rows.map(r => r[0]).sort().slice(-1)[0] : since;
  if (latestDate) await setSyncState('cro_web', latestDate);

  return { source: 'cro_web', rowsAdded: rows.length, since };
}

async function syncCroApp() {
  const state = await getSyncState('cro_app');
  const since = state?.last_synced_date || null;
  const rows = await fetchCroAppSince(since);

  await appendRows('cro_daily', rows);
  const latestDate = rows.length ? rows.map(r => r[0]).sort().slice(-1)[0] : since;
  if (latestDate) await setSyncState('cro_app', latestDate);

  return { source: 'cro_app', rowsAdded: rows.length, since };
}

async function syncWebVitals() {
  const state = await getSyncState('webvitals');
  const since = state?.last_synced_date || null;
  const rows = await fetchWebVitalsSince(since);

  await appendRows('webvitals', rows);
  const latestRunAt = rows.length ? rows.map(r => r[0]).sort().slice(-1)[0] : since;
  if (latestRunAt) await setSyncState('webvitals', latestRunAt);

  return { source: 'webvitals', rowsAdded: rows.length, since };
}

// Runs all incremental syncs in sequence (kept sequential, not parallel, to stay well under
// Sheets API and Shopify API rate limits — this is a manual "Refresh" trigger, not a hot path).
export async function runFullSync() {
  await ensureTabs();
  const results = [];
  for (const fn of [syncShopifyOrders, syncShopifySessions, syncCroWeb, syncCroApp, syncWebVitals]) {
    try {
      results.push(await fn());
    } catch (err) {
      results.push({ source: fn.name, error: err.message });
    }
  }
  return results;
}

export { syncShopifyOrders, syncShopifySessions, syncCroWeb, syncCroApp, syncWebVitals };
