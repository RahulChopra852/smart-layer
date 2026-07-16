import express from 'express';
import { runFullSync, syncShopifyOrders, syncShopifySessions, syncCroWeb, syncCroApp, syncWebVitals, syncGaApp, syncSheetMirror } from '../services/sync.js';
import { ensureTabs, readRows, clearTab, setSyncState, appendRows, deleteRowsByDate } from '../db/supabaseDb.js';
import { fetchCroWebForDate, fetchCroAppForDate } from '../services/croSheets.js';

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

// POST /api/sync/cro-date — re-syncs CRO data for specific dates
router.post('/cro-date', async (req, res) => {
  const { dates, channels } = req.body;
  if (!dates?.length) return res.status(400).json({ error: 'dates array required' });
  const chans = channels || ['web', 'app'];
  try {
    const results = [];
    for (const date of dates) {
      for (const ch of chans) {
        const deleted = await deleteRowsByDate('cro_daily', date, 'channel', ch);
        let row = null;
        if (ch === 'web') row = await fetchCroWebForDate(date);
        else if (ch === 'app') row = await fetchCroAppForDate(date);
        if (row) {
          await appendRows('cro_daily', [row]);
          results.push({ date, channel: ch, status: 'synced', deleted });
        } else {
          results.push({ date, channel: ch, status: 'not_found_in_source', deleted });
        }
      }
    }
    res.json({ ok: true, results });
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
  webvitals: syncWebVitals,
  ga_app: syncGaApp,
  sheet_mirror: syncSheetMirror
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

// Maps each dashboard tab to how "last synced" should be computed for it — most read a
// watermark straight out of _sync_state, but a few sources don't fit that model:
//  - ga-web / anomalies pull live from the Google APIs/Sheet on every request, no stored state
//  - meta is a manual CSV upload, so its own meta_reports.uploaded_at is the relevant timestamp
//  - vwo pulls from the VWO API on demand and stamps each row with synced_at itself
//  - abtests are generated/edited in-app, not synced from an external source at all
const TAB_SOURCES = {
  summary: { sources: ['shopify_orders', 'shopify_sessions', 'cro_web', 'cro_app', 'ga_app', 'sheet_mirror'] },
  cro: { sources: ['cro_web', 'cro_app'] },
  gokwik: { sources: ['sheet_mirror'] },
  'ga-app': { sources: ['ga_app'] },
  'ga-web': { live: true },
  vitals: { sources: ['sheet_mirror'] },
  products: { sources: ['shopify_orders'] },
  'google-ads': { sources: ['sheet_mirror'] },
  meta: { table: 'meta_reports', dateField: 'uploaded_at' },
  anomalies: { live: true },
  abtests: { internal: true },
  vwo: { table: 'vwo_campaigns', dateField: 'synced_at' },
};

// GET /api/sync/status — last sync timestamps for each raw source, plus a per-tab rollup so the
// dashboard can show "GoKwik synced 5h ago" / "GA Web: live" etc. instead of one combined figure.
router.get('/status', async (req, res) => {
  try {
    const [syncRows, metaRows, vwoRows] = await Promise.all([
      readRows('_sync_state'), readRows('meta_reports'), readRows('vwo_campaigns'),
    ]);

    const sources = {};
    for (const r of syncRows) sources[r.source] = { last_synced_date: r.last_synced_date, last_synced_at: r.last_synced_at };

    const maxField = (rows, field) => rows.reduce((max, r) => (r[field] && (!max || r[field] > max) ? r[field] : max), null);

    const tabs = {};
    for (const [tabId, config] of Object.entries(TAB_SOURCES)) {
      if (config.live) { tabs[tabId] = { live: true }; continue; }
      if (config.internal) { tabs[tabId] = { internal: true }; continue; }
      if (config.table) {
        const rows = config.table === 'meta_reports' ? metaRows : vwoRows;
        tabs[tabId] = { last_synced_at: maxField(rows, config.dateField) };
        continue;
      }
      const times = config.sources.map(s => sources[s]?.last_synced_at).filter(Boolean);
      tabs[tabId] = { last_synced_at: times.length ? times.sort()[0] : null }; // oldest of its sources — the true bottleneck
    }

    res.json({ status: 'ok', sources, tabs, timestamp: new Date().toISOString() });
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
  const sourceMap = { cro_daily: ['cro_web', 'cro_app'], meta_reports: [], page_sessions: ['shopify_sessions'], ga_app_daily: ['ga_app'] };
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
