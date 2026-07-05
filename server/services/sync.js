import { appendRows, getSyncState, setSyncState, ensureTabs } from '../db/supabaseDb.js';
import { fetchOrdersSince, fetchPageSessionsSince } from './shopify.js';
import { fetchCroWebSince, fetchCroAppSince, fetchWebVitalsSince, extractCommentsAsRcaCandidates } from './croSheets.js';
import { addInferredNotes } from './rca.js';
import { getAppOverview } from './ga.js';
import { mirrorAllSheetTabs } from './sheetMirror.js';

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

const MAX_SESSION_DAYS = 25; // 2 ShopifyQL calls per day → max 50 API calls per sync

async function syncShopifySessions() {
  const state = await getSyncState('shopify_sessions');
  const lastSynced = state?.last_synced_date || SESSIONS_START_DATE;
  const today = todayIso();

  const nextDay = new Date(lastSynced + 'T00:00:00Z');
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const startDate = nextDay.toISOString().slice(0, 10);

  if (startDate > today) return { source: 'shopify_sessions', rowsAdded: 0, since: lastSynced, msg: 'already up to date' };

  let totalRows = 0;
  let latestDate = lastSynced;
  let dayCount = 0;
  const d = new Date(startDate + 'T00:00:00Z');
  const endD = new Date(today + 'T00:00:00Z');

  while (d <= endD && dayCount < MAX_SESSION_DAYS) {
    const dayStr = d.toISOString().slice(0, 10);
    try {
      const rows = await fetchPageSessionsSince(dayStr, dayStr);
      if (rows.length) {
        await appendRows('page_sessions', rows);
        totalRows += rows.length;
        latestDate = dayStr;
      }
    } catch (err) {
      console.error(`Sessions sync failed for ${dayStr}:`, err.message);
    }
    d.setUTCDate(d.getUTCDate() + 1);
    dayCount++;
  }

  if (latestDate > lastSynced) await setSyncState('shopify_sessions', latestDate);
  return { source: 'shopify_sessions', rowsAdded: totalRows, latestDate, since: lastSynced, daysSynced: dayCount };
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

// GA app data keeps settling for several days after it first appears (identity resolution,
// late-arriving events) — a pure watermark-forward sync locks in provisional numbers forever.
// Always re-pull this trailing window too; the DB upsert (keyed on date+platform) corrects
// already-stored rows in place rather than duplicating.
const GA_REFRESH_WINDOW_DAYS = 7;

async function syncGaApp() {
  const state = await getSyncState('ga_app');
  // "since" means "already covered through this date" (the code below starts from since+1) —
  // the default must be the day BEFORE the desired first day, or that first day gets skipped.
  const since = state?.last_synced_date || '2025-12-31';
  const today = todayIso();

  const nextDay = new Date(since);
  nextDay.setDate(nextDay.getDate() + 1);
  const watermarkStart = nextDay.toISOString().slice(0, 10);

  const refreshFrom = new Date(today);
  refreshFrom.setDate(refreshFrom.getDate() - GA_REFRESH_WINDOW_DAYS);
  const refreshStart = refreshFrom.toISOString().slice(0, 10);

  const startDate = watermarkStart < refreshStart ? watermarkStart : refreshStart;
  if (startDate > today) return { source: 'ga_app', rowsAdded: 0, since, msg: 'already up to date' };

  const { daily } = await getAppOverview(startDate, today);
  if (!daily.length) return { source: 'ga_app', rowsAdded: 0, since };

  const rows = daily.map(r => [
    r.date, r.platform,
    r.activeUsers || 0, r.newUsers || 0, r.sessions || 0,
    r.engagedSessions || 0, r.screenPageViews || 0,
    r.averageSessionDuration || 0, r.eventCount || 0
  ]);

  const written = await appendRows('ga_app_daily', rows);

  const latestDate = daily.map(r => r.date).sort().slice(-1)[0];
  if (latestDate) await setSyncState('ga_app', latestDate);

  return { source: 'ga_app', rowsAdded: written.length, since };
}

// GoKwik/Google Ads/PSI are populated by separate Apps Script projects writing straight into
// the Google Sheet — this just mirrors those tabs into Supabase so they're queryable there too.
async function syncSheetMirror() {
  const results = await mirrorAllSheetTabs();
  return { source: 'sheet_mirror', tabs: results };
}

// Runs all incremental syncs in sequence (kept sequential, not parallel, to stay well under
// Sheets API and Shopify API rate limits — this is a manual "Refresh" trigger, not a hot path).
export async function runFullSync() {
  await ensureTabs();
  const results = [];
  for (const fn of [syncShopifyOrders, syncShopifySessions, syncCroWeb, syncCroApp, syncWebVitals, syncGaApp, syncSheetMirror]) {
    try {
      results.push(await fn());
    } catch (err) {
      results.push({ source: fn.name, error: err.message });
    }
  }
  return results;
}

export { syncShopifyOrders, syncShopifySessions, syncCroWeb, syncCroApp, syncWebVitals, syncGaApp, syncSheetMirror };
