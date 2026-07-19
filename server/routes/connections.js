import { Router } from 'express';
import { requireAuth } from '../auth/jwt.js';
import { requireWorkspace, requireAdmin } from '../auth/workspace.js';
import { listConnections, createConnection } from '../db/supabaseDb.js';
import { encryptSecret } from '../crypto/secrets.js';

const router = Router();
router.use(requireAuth, requireWorkspace);

// Never returns secret_ciphertext — listConnections() already selects a safe column set.
router.get('/', async (req, res) => {
  try {
    res.json({ connections: await listConnections(req.workspace.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Creates a connection for source types that need a form-entered credential (vwo/psi/metabase,
// or a manually pasted Shopify token as a fallback to the connector-app flow). GA4 goes through
// its own OAuth routes (Phase 1), and the primary Shopify path is the connector install hook.
router.post('/', requireAdmin, async (req, res) => {
  const { type, label, secret, meta } = req.body;
  if (!type) return res.status(400).json({ error: 'type is required' });

  try {
    const connection = await createConnection({
      workspaceId: req.workspace.id,
      type,
      label,
      secretCiphertext: secret ? encryptSecret(secret) : null,
      meta: meta || {},
    });
    res.json(connection);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
