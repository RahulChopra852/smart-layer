import { Router } from 'express';
import { requireAuth } from '../auth/jwt.js';
import { listWorkspacesForUser, createWorkspace, addWorkspaceMember } from '../db/supabaseDb.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    res.json({ workspaces: await listWorkspacesForUser(req.user.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual workspace creation (non-Shopify-first onboarding, e.g. a brand connecting via
// Metabase/GA4 first). The creator becomes admin.
router.post('/', async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });
  try {
    const workspace = await createWorkspace({ name, slug });
    await addWorkspaceMember(workspace.id, req.user.id, 'admin');
    res.json(workspace);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
