import express from 'express';
import { runFullSync, syncShopifyOrders, syncShopifySessions, syncCroWeb, syncCroApp, syncWebVitals } from '../services/sync.js';
import { ensureTabs, readRows, clearTab, setSyncState } from '../db/sheetsDb.js';

const router = express.Router();

// POST /api/sync/all — runs every incremental sync in sequence, returns per-source results.
router.post('/all', async (req, res) => {
  try {
    const results = await runFullSync();
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/:source — runs a single source's sync. Useful for isolating a slow/failing source.
const SOURCE_MAP = {
  shopify_orders: syncShopifyOrders,
  shopify_sessions: syncShopifySessions,
  cro_web: syncCroWeb,
  cro_app: syncCroApp,
  webvitals: syncWebVitals
};

router.post('/:source', async (req, res) => {
  const fn = SOURCE_MAP[req.params.source];
  if (!fn) return res.status(404).json({ error: `Unknown source: ${req.params.source}` });
  try {
    const result = await fn();
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/status — last sync timestamps for each source.
router.get('/status', async (req, res) => {
  try {
    const rows = await readRows('_sync_state');
    const sources = {};
    for (const r of rows) sources[r.source] = { last_synced_date: r.last_synced_date, last_synced_at: r.last_synced_at };
    res.json({ status: 'ok', sources, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/init — idempotent, ensures all Dashboard DB tabs exist. Safe to call on server start.
router.post('/init', async (req, res) => {
  try {
    const result = await ensureTabs();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/rebuild/:tab — clears a tab, resets watermark, and re-syncs from source.
router.post('/rebuild/:tab', async (req, res) => {
  const tab = req.params.tab;
  const sourceMap = { cro_daily: ['cro_web', 'cro_app'], meta_reports: [] };
  const sources = sourceMap[tab];
  if (!sources) return res.status(404).json({ error: `No rebuild supported for tab: ${tab}` });
  try {
    await clearTab(tab);
    for (const src of sources) await setSyncState(src, '');
    const results = [];
    for (const src of sources) {
      const fn = SOURCE_MAP[src];
      if (fn) results.push(await fn());
    }
    res.json({ rebuilt: tab, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
