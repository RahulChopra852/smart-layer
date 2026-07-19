import { Router } from 'express';
import crypto from 'node:crypto';
import { findWorkspaceByShopDomain, createWorkspace, createConnection, addWorkspaceMember } from '../db/supabaseDb.js';
import { getClient as getSupabase } from '../db/supabaseDb.js';

const router = Router();

// Verifies the shared-secret HMAC on the connector app's install webhook. Contract: see
// docs/ARCHITECTURE.md §6.1 — finalize exact header/signing scheme against the connector repo
// before relying on this in production; this implements the working agreement.
function verifyHmac(req) {
  const signature = req.headers['x-connector-signature'];
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', process.env.CONNECTOR_WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex');
  return signature === expected;
}

function slugify(shopDomain) {
  return shopDomain.replace('.myshopify.com', '').toLowerCase();
}

// Called by the Smart Layer Shopify connector app when a merchant installs it. Idempotent:
// find-or-create the workspace by shop_domain, create the Shopify connection (no secret stored —
// tokens are vended live per-request), invite the merchant's email as workspace admin.
router.post('/connector/install', async (req, res) => {
  if (!verifyHmac(req)) return res.status(401).json({ error: 'Invalid signature' });

  const { shop_domain, email } = req.body;
  if (!shop_domain) return res.status(400).json({ error: 'shop_domain is required' });

  try {
    let workspace = await findWorkspaceByShopDomain(shop_domain);
    if (!workspace) {
      workspace = await createWorkspace({ name: shop_domain, slug: slugify(shop_domain), shopDomain: shop_domain });
      await createConnection({ workspaceId: workspace.id, type: 'shopify', label: shop_domain, meta: { shop_domain } });
    }

    if (email) {
      // inviteUserByEmail creates the auth.users row (or returns the existing one) and emails a
      // sign-in link — one call covers both "find or create the user" and "invite them".
      const { data, error } = await getSupabase().auth.admin.inviteUserByEmail(email);
      if (!error && data?.user) {
        await addWorkspaceMember(workspace.id, data.user.id, 'admin');
      }
      // If invite delivery fails (e.g. SMTP not configured yet), don't fail the whole install —
      // the workspace/connection are already created; membership can be granted manually.
    }

    res.json({ workspace_id: workspace.id, slug: workspace.slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
