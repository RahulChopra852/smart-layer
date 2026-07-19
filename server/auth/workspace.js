import { getMembership } from '../db/supabaseDb.js';

// Resolves req.workspace from the `x-workspace-id` header and checks the authenticated user is a
// member. Must run after requireAuth. All /api/data, /api/connections, /api/reports routes are
// workspace-scoped this way — the client sends the header from the workspace switcher.
export async function requireWorkspace(req, res, next) {
  const workspaceId = req.headers['x-workspace-id'];
  if (!workspaceId) return res.status(400).json({ error: 'Missing x-workspace-id header' });

  try {
    const membership = await getMembership(workspaceId, req.user.id);
    if (!membership) return res.status(403).json({ error: 'Not a member of this workspace' });
    req.workspace = { id: workspaceId, role: membership.role };
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export function requireAdmin(req, res, next) {
  if (req.workspace.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
  next();
}
