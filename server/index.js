import express from 'express';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import hooksRoutes from './routes/hooks.js';
import workspacesRoutes from './routes/workspaces.js';
import connectionsRoutes from './routes/connections.js';
import reportsRoutes from './routes/reports.js';
import dataRoutes from './routes/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// No JWT — verified via HMAC shared secret with the connector app instead (see routes/hooks.js)
app.use('/api/hooks', hooksRoutes);

// Everything below requires a Supabase JWT; workspace-scoped routes additionally require
// x-workspace-id + membership (enforced per-router via requireAuth/requireWorkspace).
app.use('/api/workspaces', workspacesRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/data', dataRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Smart Layer running at http://localhost:${PORT}`);
});
