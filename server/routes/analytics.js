import express from 'express';
import {
  getCommerceSnapshot, getPagePerformance, getCroFunnelDeltas, getWebVitalsFlags, getProductInsights, getOosWithSessions,
  getOosHistory, getLowStockTrafficWatch, getMainMovers
} from '../services/analytics.js';
import { readRows, updateRowByKey } from '../db/supabaseDb.js';
import { generateAbTest } from '../services/abTests.js';
import { fetchAnomalies, fetchDailyVisitors } from '../services/croSheets.js';
import { getAppOverview, getWebOverview, getProductPageInsights } from '../services/ga.js';
import { fetchLowStockAlerts, fetchHourlyOrders } from '../services/shopify.js';
import { createSdlcTask, taskExists } from '../services/sdlcMcp.js';

const router = express.Router();

router.get('/commerce-snapshot', async (req, res) => {
  try {
    res.json(await getCommerceSnapshot());
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

router.get('/main-movers', async (req, res) => {
  const { window, end } = req.query;
  const windowDays = parseInt(window, 10) || 7;
  const endDate = end || new Date().toISOString().slice(0, 10);
  try {
    res.json(await getMainMovers(windowDays, endDate));
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

// GET /api/analytics/products-raw — full unaggregated shopify_products rows across every
// synced date. getProductInsights only returns one date's top-N snapshot with DoD/WoW deltas;
// the Focus Product search+trend chart needs the whole history to filter and plot client-side.
router.get('/products-raw', async (req, res) => {
  try {
    res.json({ rows: await readRows('shopify_products') });
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

router.get('/ga-app-products', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });
  try { res.json(await getProductPageInsights(start, end)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/ga-app-stored', async (req, res) => {
  try {
    const rows = await readRows('ga_app_daily');
    const daily = rows.map(r => ({
      date: r.date,
      platform: r.platform,
      activeUsers: parseFloat(r.active_users) || 0,
      newUsers: parseFloat(r.new_users) || 0,
      sessions: parseFloat(r.sessions) || 0,
      engagedSessions: parseFloat(r.engaged_sessions) || 0,
      screenPageViews: parseFloat(r.screen_page_views) || 0,
      averageSessionDuration: parseFloat(r.avg_session_duration) || 0,
      eventCount: parseFloat(r.event_count) || 0,
    }));
    res.json({ daily: daily.sort((a, b) => a.date.localeCompare(b.date)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

router.get('/vwo-campaigns', async (req, res) => {
  try {
    res.json({ campaigns: await readRows('vwo_campaigns') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/vwo-campaigns', async (req, res) => {
  const { campaigns } = req.body;
  if (!campaigns?.length) return res.status(400).json({ error: 'campaigns array required' });
  try {
    const { clearTab, appendRows } = await import('../db/supabaseDb.js');
    await clearTab('vwo_campaigns');
    const rows = campaigns.map(c => [
      c.id, c.name, c.status, c.started, c.goal, c.type, c.visitors,
      c.control_conv, c.control_visitors, c.control_rate, c.control_rpv,
      c.var_conv, c.var_visitors, c.var_rate, c.var_rpv,
      c.improvement, c.confidence, c.variations || 2, new Date().toISOString()
    ]);
    await appendRows('vwo_campaigns', rows);
    res.json({ ok: true, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/vwo-sync', async (req, res) => {
  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
    const VWO_SHEET_ID = '1NSCArMCEs5E08DAhT1UjIsPO9kTx_1aaI-VCJAFGW9c';

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: VWO_SHEET_ID,
      range: 'A1:J200',
    });
    const values = result.data.values || [];
    if (values.length < 2) return res.json({ ok: true, count: 0 });

    const headers = values[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const col = (name) => headers.indexOf(name);

    const { clearTab, appendRows } = await import('../db/supabaseDb.js');
    await clearTab('vwo_campaigns');

    const abTests = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const type = (row[col('type')] || '').toLowerCase();
      if (type !== 'ab' && type !== 'split') continue;
      const status = (row[col('status')] || '').toUpperCase();
      if (status === 'NOT_STARTED' || status === 'STOPPED') continue;
      const started = row[col('started_on')] || '';
      if (started && started < '2026-02-16') continue;
      if (!started) continue;

      abTests.push([
        row[col('campaign_id')] || '',
        row[col('campaign_name')] || '',
        status === 'RUNNING' ? 'RUNNING' : 'PAUSED',
        row[col('started_on')] || '',
        '', // goal
        type === 'split' ? 'split' : 'conversion',
        '', // visitors
        '', '', '', '', // control metrics
        '', '', '', '', // variation metrics
        '', '', // improvement, confidence
        row[col('variations_count')] || 2,
        new Date().toISOString()
      ]);
    }

    if (abTests.length) await appendRows('vwo_campaigns', abTests);
    res.json({ ok: true, count: abTests.length, running: abTests.filter(r => r[2] === 'RUNNING').length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/psi-daily', async (req, res) => {
  try {
    const rows = await readRows('psi_daily');
    res.json({ entries: rows.sort((a, b) => (b.date || '').localeCompare(a.date || '')) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/gokwik-daily', async (req, res) => {
  try {
    const rows = await readRows('gokwik_daily');
    res.json({ daily: rows.sort((a, b) => (b.date || '').localeCompare(a.date || '')) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/day-trend', async (req, res) => {
  try {
    const selectedDate = req.query.date || new Date().toISOString().slice(0, 10);
    const croRows = await readRows('cro_daily');
    const shopifyRows = await readRows('shopify_daily');
    const gaAppRows = await readRows('ga_app_daily');

    const revenueByDate = {};
    const ordersByDate = {};
    shopifyRows.forEach(r => {
      revenueByDate[r.date] = (revenueByDate[r.date] || 0) + (parseFloat(r.revenue) || 0);
      ordersByDate[r.date] = (ordersByDate[r.date] || 0) + (parseInt(r.order_count) || 0);
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const selectedDow = new Date(selectedDate + 'T00:00:00').getDay();

    // Web: sessions + atc from CRO (web_sess), orders + NSV from Shopify
    const webByDate = {};
    croRows.forEach(r => {
      if (!webByDate[r.date]) webByDate[r.date] = { sessions: 0, atc: 0 };
      webByDate[r.date].sessions += parseInt(r.web_sess) || 0;
      webByDate[r.date].atc += parseInt(r.atc) || 0;
    });

    // App: from GA app daily (date format YYYYMMDD)
    const appByDate = {};
    gaAppRows.forEach(r => {
      const d = r.date ? `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}` : '';
      if (!appByDate[d]) appByDate[d] = { sessions: 0, activeUsers: 0, newUsers: 0 };
      appByDate[d].sessions += parseInt(r.sessions) || 0;
      appByDate[d].activeUsers += parseInt(r.active_users) || 0;
      appByDate[d].newUsers += parseInt(r.new_users) || 0;
    });

    const buildRow = (date) => {
      const web = webByDate[date] || { sessions: 0, atc: 0 };
      const app = appByDate[date] || { sessions: 0, activeUsers: 0, newUsers: 0 };
      const dow = new Date(date + 'T00:00:00').getDay();
      return {
        date, day: dayNames[dow],
        webSessions: web.sessions, webAtc: web.atc,
        shopifyOrders: ordersByDate[date] || 0, nsv: revenueByDate[date] || 0,
        appSessions: app.sessions, appActiveUsers: app.activeUsers, appNewUsers: app.newUsers,
      };
    };

    const selectedRow = buildRow(selectedDate);
    const prevDt = new Date(selectedDate + 'T12:00:00');
    prevDt.setDate(prevDt.getDate() - 1);
    const prevDate = prevDt.toISOString().slice(0, 10);
    const prevRow = buildRow(prevDate);

    const sameDays = [];
    const allDates = [...new Set([...Object.keys(webByDate), ...Object.keys(revenueByDate)])].sort();
    for (const d of allDates) {
      if (d >= selectedDate) continue;
      if (new Date(d + 'T00:00:00').getDay() === selectedDow) sameDays.push(buildRow(d));
    }
    sameDays.reverse();

    res.json({ selected: selectedRow, previous: prevRow, sameDayHistory: sameDays.slice(0, 5), dayName: dayNames[selectedDow] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/rca-snapshot', async (req, res) => {
  try {
    const now = new Date();
    // Use IST for "today" and hours elapsed
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const today = istNow.toISOString().slice(0, 10);
    const hoursElapsed = Math.max(istNow.getUTCHours() + istNow.getUTCMinutes() / 60, 1);
    const yDt = new Date(today + 'T12:00:00');
    yDt.setDate(yDt.getDate() - 1);
    const yesterday = yDt.toISOString().slice(0, 10);

    const [croRows, shopifyRows, pageRows, gokwikRows, adsRows, gaAppRows] = await Promise.all([
      readRows('cro_daily'), readRows('shopify_daily'), readRows('page_sessions'),
      readRows('gokwik_daily'), readRows('google_ads_daily'), readRows('ga_app_daily'),
    ]);

    const getWeb = (date) => {
      const rows = croRows.filter(r => r.date === date && r.channel === 'web');
      const sessions = rows.reduce((s, r) => s + (parseInt(r.web_sess) || 0), 0);
      const atcPct = rows.length ? parseFloat(rows[0].atc_pct) || 0 : 0;
      const atc = Math.round(sessions * atcPct / 100);
      const orders = rows.reduce((s, r) => s + (parseInt(r.web_orders) || 0), 0);
      const cvr = rows.length ? parseFloat(rows[0].web_cvr) || 0 : 0;
      return { sessions, atc, atcPct, orders, cvr };
    };

    const getNsv = (date) => {
      return shopifyRows.filter(r => r.date === date).reduce((s, r) => s + (parseFloat(r.revenue) || 0), 0);
    };

    const getApp = (date) => {
      const gaDate = date.replace(/-/g, '');
      const rows = gaAppRows.filter(r => r.date === gaDate);
      return {
        sessions: rows.reduce((s, r) => s + (parseInt(r.sessions) || 0), 0),
        activeUsers: rows.reduce((s, r) => s + (parseInt(r.active_users) || 0), 0),
      };
    };

    const todayWeb = getWeb(today);
    const yesterdayWeb = getWeb(yesterday);
    const todayApp = getApp(today);
    const yesterdayApp = getApp(yesterday);

    // Hourly orders from Shopify — channel "GNC <> Gokwik" (web only)
    const [todayHourly, yesterdayHourly] = await Promise.all([
      fetchHourlyOrders(today, 'GNC <> Gokwik'),
      fetchHourlyOrders(yesterday, 'GNC <> Gokwik'),
    ]);

    const currentHour = Math.floor(hoursElapsed);
    const todayOrdersSoFar = todayHourly.totalOrders;
    const todayNsvSoFar = todayHourly.totalRevenue;
    let yesterdayOrdersAtHour = 0, yesterdayNsvAtHour = 0;
    for (let h = 0; h < currentHour; h++) {
      yesterdayOrdersAtHour += yesterdayHourly.hourly[h].orders;
      yesterdayNsvAtHour += yesterdayHourly.hourly[h].revenue;
    }
    const yesterdayOrdersFull = yesterdayHourly.totalOrders;
    const yesterdayNsvFull = yesterdayHourly.totalRevenue;

    const project = (soFar) => Math.round(soFar * (24 / hoursElapsed));
    const estAtHour = (fullDay) => Math.round(fullDay * (hoursElapsed / 24));
    const delta = (curr, prev) => prev > 0 ? parseFloat(((curr - prev) / prev * 100).toFixed(1)) : null;

    const webSignals = [];
    const addWebPace = (metric, todayVal, yesterdayFull, unit) => {
      const yAtHour = estAtHour(yesterdayFull);
      const projected = project(todayVal);
      const paceChange = delta(todayVal, yAtHour);
      if (paceChange !== null) {
        webSignals.push({ metric, actual: todayVal, projected, yesterdayFull, yesterdayAtHour: yAtHour, change: paceChange, unit: unit || '' });
      }
    };

    addWebPace('Sessions', todayWeb.sessions, yesterdayWeb.sessions);
    addWebPace('ATC', todayWeb.atc, yesterdayWeb.atc);

    const orderChange = delta(todayOrdersSoFar, yesterdayOrdersAtHour);
    if (orderChange !== null) {
      webSignals.push({ metric: 'Orders', actual: todayOrdersSoFar, projected: project(todayOrdersSoFar), yesterdayFull: yesterdayOrdersFull, yesterdayAtHour: yesterdayOrdersAtHour, change: orderChange, unit: '', hourWise: true });
    }
    const nsvChange = delta(todayNsvSoFar, yesterdayNsvAtHour);
    if (nsvChange !== null) {
      webSignals.push({ metric: 'NSV', actual: todayNsvSoFar, projected: project(todayNsvSoFar), yesterdayFull: yesterdayNsvFull, yesterdayAtHour: yesterdayNsvAtHour, change: nsvChange, unit: '₹', hourWise: true });
    }

    const appSignals = [];
    const addApp = (metric, todayVal, yesterdayFull) => {
      const yAtHour = estAtHour(yesterdayFull);
      const projected = project(todayVal);
      const paceChange = delta(todayVal, yAtHour);
      if (paceChange !== null) {
        appSignals.push({ metric, actual: todayVal, projected, yesterdayFull, yesterdayAtHour: yAtHour, change: paceChange, unit: '' });
      }
    };
    addApp('App Sessions', todayApp.sessions, yesterdayApp.sessions);
    addApp('App Active Users', todayApp.activeUsers, yesterdayApp.activeUsers);

    const getGokwik = (date) => gokwikRows.find(r => r.date === date);
    const getAds = (date) => adsRows.find(r => r.date === date);

    const otherSignals = [];
    const gkT = getGokwik(today), gkY = getGokwik(yesterday);
    if (gkT && gkY) {
      const tVal = parseInt(gkT.total_orders) || 0, yVal = parseInt(gkY.total_orders) || 0;
      const c = delta(tVal, estAtHour(yVal));
      if (c !== null) otherSignals.push({ metric: 'GoKwik Orders', actual: tVal, projected: project(tVal), yesterdayFull: yVal, yesterdayAtHour: estAtHour(yVal), change: c, unit: '' });
    }
    const adT = getAds(today), adY = getAds(yesterday);
    if (adT && adY) {
      const tCost = parseFloat(adT.total_cost) || 0, yCost = parseFloat(adY.total_cost) || 0;
      const sc = delta(tCost, estAtHour(yCost));
      if (sc !== null) otherSignals.push({ metric: 'Ad Spend', actual: tCost, projected: project(tCost), yesterdayFull: yCost, yesterdayAtHour: estAtHour(yCost), change: sc, unit: '₹' });
      const roasT = parseFloat(adT.roas) || 0, roasY = parseFloat(adY.roas) || 0;
      const rc = delta(roasT, roasY);
      if (rc !== null) otherSignals.push({ metric: 'ROAS', actual: roasT, projected: roasT, yesterdayFull: roasY, yesterdayAtHour: roasY, change: rc, unit: 'x', isRate: true });
    }

    // Affected pages
    const pagesToday = {}, pagesYesterday = {};
    pageRows.forEach(r => {
      const sess = parseInt(r.sessions) || 0;
      if (r.date === today) pagesToday[r.landing_page] = (pagesToday[r.landing_page] || 0) + sess;
      if (r.date === yesterday) pagesYesterday[r.landing_page] = (pagesYesterday[r.landing_page] || 0) + sess;
    });
    const affectedPages = Object.keys({ ...pagesToday, ...pagesYesterday })
      .map(page => {
        const t = pagesToday[page] || 0, yFull = pagesYesterday[page] || 0;
        const yAtH = estAtHour(yFull);
        const change = yAtH > 0 ? parseFloat(((t - yAtH) / yAtH * 100).toFixed(1)) : (t > 0 ? 100 : 0);
        return { page, today: t, yesterdayAtHour: yAtH, yesterdayFull: yFull, change };
      })
      .filter(p => Math.abs(p.change) > 20 && (p.today > 30 || p.yesterdayAtHour > 30))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 8);

    // Health: compare pace, not raw totals
    const problems = [];
    webSignals.forEach(s => { if (s.change < -10 && s.metric !== 'Ad Spend') problems.push(s.metric); });
    appSignals.forEach(s => { if (s.change < -10) problems.push(s.metric); });

    res.json({ date: today, hoursElapsed: Math.round(hoursElapsed * 10) / 10, webSignals, appSignals, otherSignals, affectedPages, problems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/google-ads-daily', async (req, res) => {
  try {
    const rows = await readRows('google_ads_daily');
    res.json({ daily: rows.sort((a, b) => (b.date || '').localeCompare(a.date || '')) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/google-ads-campaigns', async (req, res) => {
  try {
    const rows = await readRows('google_ads_campaigns');
    res.json({ campaigns: rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (parseFloat(b.cost) || 0) - (parseFloat(a.cost) || 0)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/gokwik-products', async (req, res) => {
  try {
    const rows = await readRows('gokwik_products');
    res.json({ products: rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (parseInt(b.order_count) || 0) - (parseInt(a.order_count) || 0)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/gokwik-utm', async (req, res) => {
  try {
    const rows = await readRows('gokwik_utm');
    res.json({ utm: rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (parseInt(b.order_count) || 0) - (parseInt(a.order_count) || 0)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/gokwik-landing-pages', async (req, res) => {
  try {
    const rows = await readRows('gokwik_landing_pages');
    res.json({ pages: rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (parseInt(b.order_count) || 0) - (parseInt(a.order_count) || 0)) });
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

router.get('/oos-sessions', async (req, res) => {
  try {
    res.json(await getOosWithSessions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/oos-history', async (req, res) => {
  try {
    res.json(await getOosHistory());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/low-stock-watch', async (req, res) => {
  try {
    res.json(await getLowStockTrafficWatch());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ab-tests', async (req, res) => {
  try {
    const rows = await readRows('ab_tests');
    res.json({ tests: rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ab-tests/generate', async (req, res) => {
  const { metric, area } = req.body;
  if (!metric || !area) return res.status(400).json({ error: 'metric and area required' });
  try {
    const test = await generateAbTest(metric, area);
    res.json({ test });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/ab-tests/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['picked_up', 'already_exists', null];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'invalid status' });
  try {
    const ok = await updateRowByKey('ab_tests', 'id', req.params.id, { status });
    if (!ok) return res.status(404).json({ error: 'test not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/ab-tests/:id/create-ticket — files this test as a backlog task in the
// SDLC tool (Ananta), populating the description with the hypothesis and objective so whoever
// picks it up doesn't have to come back to this dashboard for context.
router.post('/ab-tests/:id/create-ticket', async (req, res) => {
  try {
    const rows = await readRows('ab_tests');
    // ab_tests.id is numeric in Postgres but req.params.id is always a string — compare as
    // strings so this doesn't silently fail to match like a strict === would.
    const test = rows.find(r => String(r.id) === req.params.id);
    if (!test) return res.status(404).json({ error: 'test not found' });
    if (test.ticket_code) return res.json({ ok: true, code: test.ticket_code, alreadyExisted: true });

    const metricLabel = test.metric || 'Conversion';
    const title = `AB Test: ${test.name && test.name !== 'Pending Claude analysis' ? test.name : `${metricLabel} — ${test.area || 'Site'}`}`;

    // The SDLC task description is a rich-text (HTML) field, not a markdown renderer — a
    // discovery made the hard way when **bold** showed up as literal asterisks. Real <strong>
    // tags render correctly there; escape dynamic values first since they're user-entered data.
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const description = [
      `<p><strong>Objective:</strong> Improve ${esc(metricLabel)} on ${esc(test.area || 'the target page')} by validating the hypothesis below with an A/B test.</p>`,
      `<p><strong>Hypothesis:</strong> ${esc(test.hypothesis)}</p>`,
      `<p><strong>Target metric:</strong> ${esc(metricLabel)}</p>`,
      test.page_url ? `<p><strong>Page:</strong> ${esc(test.page_url)}</p>` : null,
      test.impact ? `<p><strong>Estimated impact:</strong> ${esc(test.impact)}</p>` : null,
      '<p><em>Filed from the GNC Smart Layer dashboard AB Tests tab.</em></p>',
    ].filter(Boolean).join('');

    const { code } = await createSdlcTask({ title, description, discipline: 'DEVELOPMENT', type: 'FEATURE' });
    if (code) await updateRowByKey('ab_tests', 'id', test.id, { ticket_code: code, status: 'picked_up' });
    res.json({ ok: true, code, status: code ? 'picked_up' : test.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/ab-tests/:id/verify-ticket — re-checks the linked ticket against the
// SDLC backlog. If it's gone (e.g. deleted there), clears ticket_code here too so "Create
// Ticket" reappears in the status dropdown instead of the badge pointing at a dead task forever.
router.post('/ab-tests/:id/verify-ticket', async (req, res) => {
  try {
    const rows = await readRows('ab_tests');
    const test = rows.find(r => String(r.id) === req.params.id);
    if (!test) return res.status(404).json({ error: 'test not found' });
    if (!test.ticket_code) return res.status(400).json({ error: 'this test has no ticket to verify' });

    const exists = await taskExists(test.ticket_code);
    if (!exists) await updateRowByKey('ab_tests', 'id', test.id, { ticket_code: null });
    res.json({ exists, code: test.ticket_code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
