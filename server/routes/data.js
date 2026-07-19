import { Router } from 'express';
import { requireAuth } from '../auth/jwt.js';
import { requireWorkspace } from '../auth/workspace.js';
import { getReportConfig, getConnection as getConnectionById, upsertReportConfig } from '../db/supabaseDb.js';
import { getConnector } from '../connectors/index.js';
import { getReportDefinition } from '../reports/registry.js';
import { cached } from '../cache/liveCache.js';
import { computeOosState } from '../reports/compute/oos.js';

const router = Router();
router.use(requireAuth, requireWorkspace);

async function loadLiveConnection(workspaceId, reportId, res) {
  const def = getReportDefinition(reportId);
  if (!def) { res.status(404).json({ error: 'Unknown report' }); return null; }

  const rc = await getReportConfig(workspaceId, reportId);
  if (!rc?.connection_id) { res.status(409).json({ error: `Report "${reportId}" is not configured yet` }); return null; }

  const connection = await getConnectionById(rc.connection_id);
  return { def, rc, connection, connector: getConnector(connection.type) };
}

// A report only shows up as a persistent tab once status='live' — that transition happens here,
// on the FIRST successful real query after setup (probe only proves the shape is right, not that
// a full query actually works end-to-end). Any query error flips it to 'error' with the reason,
// which sends the tab back to its SetupForm instead of a broken dashboard.
async function markOutcome(ctx, workspaceId, reportId, err) {
  if (!ctx) return;
  if (!err && ctx.rc.status === 'live') return; // already live, nothing to write
  await upsertReportConfig({
    workspaceId,
    reportId,
    connectionId: ctx.rc.connection_id,
    config: ctx.rc.config,
    status: err ? 'error' : 'live',
    lastError: err ? err.message : null,
  });
}

// Every route below calls connector.query() LIVE — nothing here is pre-synced. Results pass
// through liveCache keyed by workspace+connection+params so repeated dashboard loads within the
// TTL don't re-hit Shopify. See docs/ARCHITECTURE.md §9.4 on rate-limit mitigation.

router.get('/products/snapshot', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params are required' });

  let ctx = null;
  try {
    ctx = await loadLiveConnection(req.workspace.id, 'products', res);
    if (!ctx) return;
    const key = `products-snapshot:${req.workspace.id}:${start}:${end}`;
    const data = await cached(key, ctx.def.cache?.ttlSeconds ?? 120, () =>
      ctx.connector.query(ctx.connection, ctx.rc.config, { type: 'commerce-snapshot', start, end })
    );
    await markOutcome(ctx, req.workspace.id, 'products', null);
    res.json(data);
  } catch (err) {
    await markOutcome(ctx, req.workspace.id, 'products', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/products/catalog', async (req, res) => {
  let ctx = null;
  try {
    ctx = await loadLiveConnection(req.workspace.id, 'products', res);
    if (!ctx) return;
    const key = `products-catalog:${req.workspace.id}`;
    const catalog = await cached(key, ctx.def.cache?.ttlSeconds ?? 120, () =>
      ctx.connector.query(ctx.connection, ctx.rc.config, { type: 'catalog' })
    );
    const settings = ctx.rc.config?.settings || {};
    const { oos, lowStock } = await computeOosState(req.workspace.id, catalog, settings);
    await markOutcome(ctx, req.workspace.id, 'products', null);
    res.json({ products: catalog, oos, lowStock });
  } catch (err) {
    await markOutcome(ctx, req.workspace.id, 'products', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
