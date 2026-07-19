import { Router } from 'express';
import { requireAuth } from '../auth/jwt.js';
import { requireWorkspace, requireAdmin } from '../auth/workspace.js';
import { REPORT_DEFINITIONS, getReportDefinition } from '../reports/registry.js';
import { getReportConfig, listReportConfigs, upsertReportConfig, getConnection } from '../db/supabaseDb.js';
import { getConnector } from '../connectors/index.js';

const router = Router();
router.use(requireAuth, requireWorkspace);

// Registry + this workspace's config status merged in — the client builds the tab bar and every
// setup form directly from this response.
router.get('/', async (req, res) => {
  try {
    const configs = await listReportConfigs(req.workspace.id);
    const byReportId = Object.fromEntries(configs.map(c => [c.report_id, c]));
    const reports = REPORT_DEFINITIONS.map(def => ({
      ...def,
      status: byReportId[def.id]?.status || 'draft',
      config: byReportId[def.id]?.config || {},
      connectionId: byReportId[def.id]?.connection_id || null,
      lastError: byReportId[def.id]?.last_error || null,
    }));
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/config', async (req, res) => {
  try {
    const config = await getReportConfig(req.workspace.id, req.params.id);
    res.json(config || { report_id: req.params.id, status: 'draft', config: {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/config', requireAdmin, async (req, res) => {
  const def = getReportDefinition(req.params.id);
  if (!def) return res.status(404).json({ error: 'Unknown report' });

  try {
    const saved = await upsertReportConfig({
      workspaceId: req.workspace.id,
      reportId: req.params.id,
      connectionId: req.body.connectionId ?? null,
      config: req.body.config ?? {},
      status: 'draft',
    });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Runs the connector's probe against this report's connection and returns the field checklist.
// On success, advances the config to 'validated'. This is what FieldChecklist.jsx polls.
router.post('/:id/probe', async (req, res) => {
  const def = getReportDefinition(req.params.id);
  if (!def) return res.status(404).json({ error: 'Unknown report' });

  try {
    const existing = await getReportConfig(req.workspace.id, req.params.id);
    if (!existing?.connection_id) return res.status(400).json({ ok: false, error: 'No connection configured for this report yet' });

    const connection = await getConnection(existing.connection_id);
    const connector = getConnector(connection.type);
    const result = await connector.probe(connection, existing.config);

    await upsertReportConfig({
      workspaceId: req.workspace.id,
      reportId: req.params.id,
      connectionId: existing.connection_id,
      config: existing.config,
      status: result.ok ? 'validated' : 'error',
      lastError: result.ok ? null : 'One or more required fields failed the probe',
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
