import { appendRows, readRows, getSyncState, setSyncState, ensureTabs } from '../db/sheetsDb.js';
import { fetchOrdersSince, fetchPageSessionsSince } from './shopify.js';
import { fetchCroWebSince, fetchCroAppSince, fetchWebVitalsSince, extractCommentsAsRcaCandidates } from './croSheets.js';
import { addInferredNotes } from './rca.js';
import { getAppOverview } from './ga.js';

const DEFAULT_START_DATE = '2025-10-01';
const SESSIONS_START_DATE = '2026-06-21';

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
  const since = state?.last_synced_date || SESSIONS_START_DATE;
  const rows = await fetchPageSessionsSince(since);

  await appendRows('page_sessions', rows);
  const dates = rows.map(r => r[0]).filter(Boolean).sort();
  const latestDate = dates.length ? dates[dates.length - 1] : null;
  if (latestDate) await setSyncState('shopify_sessions', latestDate);

  return { source: 'shopify_sessions', rowsAdded: rows.length, latestDate, since };
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

async function syncGaApp() {
  const state = await getSyncState('ga_app');
  const since = state?.last_synced_date || '2026-06-01';
  const today = todayIso();

  const nextDay = new Date(since);
  nextDay.setDate(nextDay.getDate() + 1);
  const startDate = nextDay.toISOString().slice(0, 10);
  if (startDate > today) return { source: 'ga_app', rowsAdded: 0, since, msg: 'already up to date' };

  const { daily } = await getAppOverview(startDate, today);
  if (!daily.length) return { source: 'ga_app', rowsAdded: 0, since };

  const existing = await readRows('ga_app_daily');
  const existingKeys = new Set(existing.map(r => `${r.date}_${r.platform}`));

  const newRows = daily
    .filter(r => !existingKeys.has(`${r.date}_${r.platform}`))
    .map(r => [
      r.date, r.platform,
      r.activeUsers || 0, r.newUsers || 0, r.sessions || 0,
      r.engagedSessions || 0, r.screenPageViews || 0,
      r.averageSessionDuration || 0, r.eventCount || 0
    ]);

  if (newRows.length) await appendRows('ga_app_daily', newRows);

  const latestDate = daily.map(r => r.date).sort().slice(-1)[0];
  if (latestDate) await setSyncState('ga_app', latestDate);

  return { source: 'ga_app', rowsAdded: newRows.length, since };
}

// Runs all incremental syncs in sequence (kept sequential, not parallel, to stay well under
// Sheets API and Shopify API rate limits — this is a manual "Refresh" trigger, not a hot path).
export async function runFullSync() {
  await ensureTabs();
  const results = [];
  for (const fn of [syncShopifyOrders, syncShopifySessions, syncCroWeb, syncCroApp, syncWebVitals, syncGaApp]) {
    try {
      results.push(await fn());
    } catch (err) {
      results.push({ source: fn.name, error: err.message });
    }
  }
  return results;
}

export { syncShopifyOrders, syncShopifySessions, syncCroWeb, syncCroApp, syncWebVitals, syncGaApp };
