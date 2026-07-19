import { Router } from 'express';
import { requireAuth } from '../auth/jwt.js';
import { requireWorkspace } from '../auth/workspace.js';
import { getReportConfig } from '../db/supabaseDb.js';
import { getConnector } from '../connectors/index.js';
import { getReportDefinition } from '../reports/registry.js';
import { cached } from '../cache/liveCache.js';
import { computeOosState } from '../reports/compute/oos.js';
import { getConnection as getConnectionById } from '../db/supabaseDb.js';

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

// Every route below calls connector.query() LIVE — nothing here is pre-synced. Results pass
// through liveCache keyed by workspace+connection+params so repeated dashboard loads within the
// TTL don't re-hit Shopify. See docs/ARCHITECTURE.md §9.4 on rate-limit mitigation.

router.get('/products/snapshot', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params are required' });

  try {
    const ctx = await loadLiveConnection(req.workspace.id, 'products', res);
    if (!ctx) return;
    const key = `products-snapshot:${req.workspace.id}:${start}:${end}`;
    const data = await cached(key, ctx.def.cache?.ttlSeconds ?? 120, () =>
      ctx.connector.query(ctx.connection, ctx.rc.config, { type: 'commerce-snapshot', start, end })
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products/catalog', async (req, res) => {
  try {
    const ctx = await loadLiveConnection(req.workspace.id, 'products', res);
    if (!ctx) return;
    const key = `products-catalog:${req.workspace.id}`;
    const catalog = await cached(key, ctx.def.cache?.ttlSeconds ?? 120, () =>
      ctx.connector.query(ctx.connection, ctx.rc.config, { type: 'catalog' })
    );
    const settings = ctx.rc.config?.settings || {};
    const { oos, lowStock } = await computeOosState(req.workspace.id, catalog, settings);
    res.json({ products: catalog, oos, lowStock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
