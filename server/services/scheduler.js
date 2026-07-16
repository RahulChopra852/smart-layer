import cron from 'node-cron';
import { syncCroWeb, syncCroApp, runFullSync } from './sync.js';

// The CRO sheet (Google Sheets API) is cheap and already the near-real-time source of truth
// for orders/sessions/funnel — safe to poll frequently.
const CRO_SHEET_CRON = '*/2 * * * *'; // every 2 minutes

// Every other source (Shopify orders, GA App, web vitals, the GoKwik/Google Ads/PSI sheet
// mirror) used to only refresh via the manual "Sync Now" button, or — for Shopify specifically —
// once a night at 00:15. A missed/failed nightly run meant a full extra day of staleness before
// anyone noticed (e.g. yesterday's revenue/units showing as a false zero because Shopify hadn't
// actually been re-pulled). Running the full sync on a 2-hour cadence instead bounds staleness
// to at most ~2 hours even if one run fails, and Shopify's Admin API rate limits are nowhere
// near strict enough for 12 calls/day to matter.
const FULL_SYNC_CRON = '0 */2 * * *'; // every 2 hours, on the hour

export function startSyncCron() {
  cron.schedule(FULL_SYNC_CRON, async () => {
    console.log('[Scheduler] Running 2-hourly full sync...');
    try {
      const results = await runFullSync();
      console.log('[Scheduler] Full sync done:', results);
    } catch (err) {
      console.error('[Scheduler] Full sync failed:', err.message);
    }
  });
  console.log(`[Scheduler] Full sync scheduled: ${FULL_SYNC_CRON}`);

  cron.schedule(CRO_SHEET_CRON, async () => {
    try {
      await Promise.all([syncCroWeb(), syncCroApp()]);
    } catch (err) {
      console.error('[Scheduler] CRO sheet sync failed:', err.message);
    }
  });
  console.log(`[Scheduler] CRO sheet sync scheduled: ${CRO_SHEET_CRON}`);
}
