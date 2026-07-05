import express from 'express';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureTabs } from './db/supabaseDb.js';

import syncRoutes from './routes/sync.js';
import metaRoutes from './routes/meta.js';
import rcaRoutes from './routes/rca.js';
import analyticsRoutes from './routes/analytics.js';
import chatRoutes from './routes/chat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/sync', syncRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/rca', rcaRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/chat', chatRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, async () => {
  console.log(`GNC Smart Layer running at http://localhost:${PORT}`);
  try {
    const result = await ensureTabs();
    if (result.created.length > 0) {
      console.log(`Created Dashboard DB tabs: ${result.created.join(', ')}`);
    }
  } catch (err) {
    console.error('Could not verify/create Dashboard DB tabs on startup:', err.message);
    console.error('Check your service-account credentials and sheet sharing — see SPEC.md setup section.');
  }
});
