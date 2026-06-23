import express from 'express';
import {
  getHeroProducts, getCommerceSnapshot, getPagePerformance, getCroFunnelDeltas, getWebVitalsFlags, getProductInsights
} from '../services/analytics.js';
import { readRows } from '../db/sheetsDb.js';
import { fetchAnomalies, fetchDailyVisitors } from '../services/croSheets.js';
import { getAppOverview, getWebOverview } from '../services/ga.js';
import { getAlerts } from '../services/alerts.js';
import { fetchLowStockAlerts } from '../services/shopify.js';

const router = express.Router();

router.get('/commerce-snapshot', async (req, res) => {
  try {
    res.json(await getCommerceSnapshot());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/hero-products', async (req, res) => {
  const { start, end, limit } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });
  try {
    res.json({ products: await getHeroProducts(start, end, limit ? parseInt(limit, 10) : 5) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/page-performance', async (req, res) => {
  const { start, end, sourceField } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });
  try {
    res.json({ pages: await getPagePerformance(start, end, sourceField || 'utm_source') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cro-funnel-deltas', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });
  try {
    res.json(await getCroFunnelDeltas(start, end));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/web-vitals-flags', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });
  try {
    res.json({ flagged: await getWebVitalsFlags(start, end) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/visitors', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required' });
  try {
    const visitors = await fetchDailyVisitors(date);
    res.json({ date, visitors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products', async (req, res) => {
  const { limit, date } = req.query;
  try {
    res.json(await getProductInsights(limit ? parseInt(limit, 10) : 40, date || null));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/anomalies', async (req, res) => {
  const { start } = req.query;
  try {
    res.json({ anomalies: await fetchAnomalies(start || null) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ga-app', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });
  try { res.json(await getAppOverview(start, end)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/ga-web', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });
  try { res.json(await getWebOverview(start, end)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Meta reports are date-range snapshots, not daily rows — just return everything uploaded,
// frontend filters/sorts client-side since volume is low (one row per campaign per upload).
router.get('/meta-reports', async (req, res) => {
  try {
    res.json({ reports: await readRows('meta_reports') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/alerts', async (req, res) => {
  const { limit } = req.query;
  try {
    res.json({ alerts: await getAlerts(limit ? parseInt(limit, 10) : 50) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/low-stock', async (req, res) => {
  try {
    res.json({ alerts: await fetchLowStockAlerts() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
