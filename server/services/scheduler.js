import cron from 'node-cron';
import { syncShopifyOrders, syncCroWeb, syncCroApp } from './sync.js';

// Shopify Orders API is the one source we want to go easy on — sync once a night, just after
// midnight, so it picks up the full prior day in one pass instead of being hit repeatedly
// through the day.
const SHOPIFY_ORDERS_CRON = '15 0 * * *'; // 00:15 daily

// The CRO sheet (Google Sheets API) is cheap and already the near-real-time source of truth
// for orders/sessions/funnel — safe to poll frequently.
const CRO_SHEET_CRON = '*/2 * * * *'; // every 2 minutes

export function startSyncCron() {
  cron.schedule(SHOPIFY_ORDERS_CRON, async () => {
    console.log('[Scheduler] Running nightly Shopify orders sync...');
    try {
      const result = await syncShopifyOrders();
      console.log('[Scheduler] Shopify orders sync done:', result);
    } catch (err) {
      console.error('[Scheduler] Shopify orders sync failed:', err.message);
    }
  });
  console.log(`[Scheduler] Shopify orders sync scheduled: ${SHOPIFY_ORDERS_CRON}`);

  cron.schedule(CRO_SHEET_CRON, async () => {
    try {
      await Promise.all([syncCroWeb(), syncCroApp()]);
    } catch (err) {
      console.error('[Scheduler] CRO sheet sync failed:', err.message);
    }
  });
  console.log(`[Scheduler] CRO sheet sync scheduled: ${CRO_SHEET_CRON}`);
}
