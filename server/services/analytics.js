import { readRows, appendRows, updateRowByKey } from '../db/sheetsDb.js';
import { fetchLowStockAlerts } from './shopify.js';

function dateDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Top N products by units sold within a date range, with prior-period comparison for the same range length.
export async function getHeroProducts(startDate, endDate, limit = 5) {
  const rows = await readRows('shopify_products');
  const inRange = rows.filter(r => r.date >= startDate && r.date <= endDate);

  const rangeDays = (new Date(endDate) - new Date(startDate)) / 86400000 + 1;
  const priorStart = new Date(new Date(startDate).getTime() - rangeDays * 86400000).toISOString().slice(0, 10);
  const priorEnd = new Date(new Date(startDate).getTime() - 86400000).toISOString().slice(0, 10);
  const priorRange = rows.filter(r => r.date >= priorStart && r.date <= priorEnd);

  const sumByProduct = (data) => {
    const map = new Map();
    for (const r of data) {
      const units = parseInt(r.units_sold, 10) || 0;
      if (!map.has(r.product_id)) map.set(r.product_id, { product_id: r.product_id, product_title: r.product_title, units_sold: 0 });
      map.get(r.product_id).units_sold += units;
    }
    return map;
  };

  const current = sumByProduct(inRange);
  const prior = sumByProduct(priorRange);

  const ranked = [...current.values()]
    .sort((a, b) => b.units_sold - a.units_sold)
    .slice(0, limit)
    .map(p => {
      const priorUnits = prior.get(p.product_id)?.units_sold || 0;
      const delta = p.units_sold - priorUnits;
      const deltaPct = priorUnits > 0 ? (delta / priorUnits) * 100 : null;
      return { ...p, priorUnits, delta, deltaPct };
    });

  return ranked;
}

// Commerce snapshot — total units/orders for a range plus DoD comparison (today vs yesterday) and
// WoW comparison (this 7d window vs prior 7d window), all computed from already-synced data.
export async function getCommerceSnapshot() {
  const rows = await readRows('shopify_daily');
  const byDate = new Map(rows.map(r => [r.date, r]));

  const today = dateDaysAgo(0);
  const yesterday = dateDaysAgo(1);
  const todayRow = byDate.get(today);
  const yesterdayRow = byDate.get(yesterday);

  const sumRange = (start, end) => {
    let orders = 0, units = 0, revenue = 0;
    for (const r of rows) {
      if (r.date >= start && r.date <= end) {
        orders += parseInt(r.order_count, 10) || 0;
        units += parseInt(r.units_sold, 10) || 0;
        revenue += parseFloat(r.revenue) || 0;
      }
    }
    return { orders, units, revenue };
  };

  const last7 = sumRange(dateDaysAgo(6), dateDaysAgo(0));
  const prior7 = sumRange(dateDaysAgo(13), dateDaysAgo(7));

  return {
    today: todayRow || null,
    yesterday: yesterdayRow || null,
    dod: {
      orderDelta: (parseInt(todayRow?.order_count, 10) || 0) - (parseInt(yesterdayRow?.order_count, 10) || 0),
      unitsDelta: (parseInt(todayRow?.units_sold, 10) || 0) - (parseInt(yesterdayRow?.units_sold, 10) || 0)
    },
    last7,
    prior7,
    wow: {
      orderDelta: last7.orders - prior7.orders,
      unitsDelta: last7.units - prior7.units,
      revenueDelta: last7.revenue - prior7.revenue
    }
  };
}

// Product insights — top products by units sold with DoD and WoW deltas.
export async function getProductInsights(limit = 40, selectedDate = null) {
  const rows = await readRows('shopify_products');
  if (rows.length === 0) return { products: [], dates: {}, availableDates: [] };

  const allDates = [...new Set(rows.map(r => r.date))].sort();

  let today;
  if (selectedDate && allDates.includes(selectedDate)) {
    today = selectedDate;
  } else if (selectedDate) {
    const earlier = allDates.filter(d => d <= selectedDate);
    today = earlier.length ? earlier[earlier.length - 1] : allDates[allDates.length - 1];
  } else {
    today = allDates[allDates.length - 1];
  }

  const todayIdx = allDates.indexOf(today);
  const yesterday = todayIdx > 0 ? allDates[todayIdx - 1] : null;

  const todayDate = new Date(today + 'T00:00:00Z');
  const weekAgoDate = new Date(todayDate);
  weekAgoDate.setUTCDate(weekAgoDate.getUTCDate() - 7);
  const weekAgoStr = weekAgoDate.toISOString().slice(0, 10);
  const weekAgo = allDates.includes(weekAgoStr) ? weekAgoStr : null;

  const byDateProduct = {};
  for (const r of rows) {
    const key = `${r.date}|${r.product_id}`;
    if (!byDateProduct[key]) byDateProduct[key] = { ...r, units_sold: 0 };
    byDateProduct[key].units_sold += parseInt(r.units_sold, 10) || 0;
  }

  const todayProducts = Object.values(byDateProduct).filter(r => r.date === today);
  const yesterdayMap = {};
  const weekAgoMap = {};
  if (yesterday) Object.values(byDateProduct).filter(r => r.date === yesterday).forEach(r => { yesterdayMap[r.product_id] = r; });
  if (weekAgo) Object.values(byDateProduct).filter(r => r.date === weekAgo).forEach(r => { weekAgoMap[r.product_id] = r; });

  const products = todayProducts
    .sort((a, b) => b.units_sold - a.units_sold)
    .slice(0, limit)
    .map(p => {
      const yUnits = yesterdayMap[p.product_id]?.units_sold || 0;
      const wUnits = weekAgoMap[p.product_id]?.units_sold || 0;
      return {
        product_id: p.product_id,
        product_title: p.product_title,
        units_sold: p.units_sold,
        units_dod: yesterday ? p.units_sold - yUnits : null,
        units_dod_pct: yesterday && yUnits > 0 ? ((p.units_sold - yUnits) / yUnits * 100) : null,
        units_wow: weekAgo ? p.units_sold - wUnits : null,
        units_wow_pct: weekAgo && wUnits > 0 ? ((p.units_sold - wUnits) / wUnits * 100) : null,
        yesterday_units: yUnits,
        week_ago_units: wUnits,
      };
    });

  return { products, dates: { today, yesterday, weekAgo }, availableDates: allDates };
}

// Page performance — sessions + ATC% by landing page, broken down by source, for a date range.
// sourceField filter lets the caller pick 'utm_source' or 'referrer_source' (see SPEC.md note on
// utm_source being more precise but having gaps for untagged traffic).
export async function getPagePerformance(startDate, endDate, sourceField = 'utm_source') {
  const rows = await readRows('page_sessions');
  const inRange = rows.filter(r => r.date >= startDate && r.date <= endDate && r.source_field === sourceField);

  const byPage = new Map();
  for (const r of inRange) {
    const key = r.landing_page;
    if (!byPage.has(key)) byPage.set(key, { landing_page: key, sessions: 0, atc_count: 0, bySource: new Map() });
    const page = byPage.get(key);
    const sessions = parseInt(r.sessions, 10) || 0;
    const atc = parseInt(r.atc_count, 10) || 0;
    page.sessions += sessions;
    page.atc_count += atc;

    if (!page.bySource.has(r.source_value)) page.bySource.set(r.source_value, { source: r.source_value, sessions: 0, atc_count: 0 });
    const src = page.bySource.get(r.source_value);
    src.sessions += sessions;
    src.atc_count += atc;
  }

  return [...byPage.values()]
    .map(p => ({
      landing_page: p.landing_page,
      sessions: p.sessions,
      atc_count: p.atc_count,
      atc_rate: p.sessions > 0 ? p.atc_count / p.sessions : 0,
      bySource: [...p.bySource.values()]
        .map(s => ({ ...s, atc_rate: s.sessions > 0 ? s.atc_count / s.sessions : 0 }))
        .sort((a, b) => b.sessions - a.sessions)
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

// CRO funnel deltas — DoD and WoW movement in ATC%/IC%/RPP% for web and app.
export async function getCroFunnelDeltas(startDate, endDate) {
  const rows = await readRows('cro_daily');
  const allSorted = rows.sort((a, b) => a.date.localeCompare(b.date));

  const byChannelAll = { web: [], app: [] };
  for (const r of allSorted) {
    if (byChannelAll[r.channel]) byChannelAll[r.channel].push(r);
  }

  const pf = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const safeDelta = (a, b) => (a != null && b != null) ? a - b : null;

  const deltas = { web: [], app: [] };
  for (const channel of ['web', 'app']) {
    const chRows = byChannelAll[channel];
    const inRange = chRows.filter(r => r.date >= startDate && r.date <= endDate);

    for (let ri = 0; ri < inRange.length; ri++) {
      const curr = inRange[ri];
      const currIdx = chRows.findIndex(r => r.date === curr.date && r === curr);
      const prev = currIdx > 0 ? chRows[currIdx - 1] : null;
      const weekAgoDate = new Date(curr.date + 'T00:00:00Z');
      weekAgoDate.setUTCDate(weekAgoDate.getUTCDate() - 7);
      const weekAgoStr = weekAgoDate.toISOString().slice(0, 10);
      const weekAgo = chRows.find(r => r.date === weekAgoStr);

      const c = {};
      for (const k of ['sessions','web_sess','app_sess','atc','ic','rpp','orders','web_orders','app_orders','atc_pct','ic_pct','rpp_pct','cvr_pct','web_cvr','app_cvr','atc_to_ci','ci_to_rpp','rpp_to_ord']) {
        c[k] = pf(curr[k]);
      }
      // Fix ATC when raw value looks wrong (e.g. 516400 instead of 5164)
      if (c.atc != null && c.sessions != null && c.atc_pct != null && c.atc > c.sessions) {
        c.atc = Math.round(c.sessions * c.atc_pct / 100);
      }

      deltas[channel].push({
        date: curr.date,
        ...c,
        atc_pct_dod: prev ? safeDelta(c.atc_pct, pf(prev.atc_pct)) : null,
        ic_pct_dod: prev ? safeDelta(c.ic_pct, pf(prev.ic_pct)) : null,
        rpp_pct_dod: prev ? safeDelta(c.rpp_pct, pf(prev.rpp_pct)) : null,
        cvr_pct_dod: prev ? safeDelta(c.cvr_pct, pf(prev.cvr_pct)) : null,
        web_cvr_dod: prev ? safeDelta(c.web_cvr, pf(prev.web_cvr)) : null,
        sessions_dod: prev ? safeDelta(c.sessions, pf(prev.sessions)) : null,
        orders_dod: prev ? safeDelta(c.orders, pf(prev.orders)) : null,
        atc_pct_wow: weekAgo ? safeDelta(c.atc_pct, pf(weekAgo.atc_pct)) : null,
        ic_pct_wow: weekAgo ? safeDelta(c.ic_pct, pf(weekAgo.ic_pct)) : null,
        rpp_pct_wow: weekAgo ? safeDelta(c.rpp_pct, pf(weekAgo.rpp_pct)) : null,
        cvr_pct_wow: weekAgo ? safeDelta(c.cvr_pct, pf(weekAgo.cvr_pct)) : null,
        web_cvr_wow: weekAgo ? safeDelta(c.web_cvr, pf(weekAgo.web_cvr)) : null,
        sessions_wow: weekAgo ? safeDelta(c.sessions, pf(weekAgo.sessions)) : null,
        orders_wow: weekAgo ? safeDelta(c.orders, pf(weekAgo.orders)) : null,
      });
    }
  }
  return deltas;
}

// Web vitals — threshold breach flags. Thresholds match standard Core Web Vitals "good" bounds,
// consistent with the column headers seen in the source sheet (LCP <=2.5s, INP <=0.2s, CLS <=0.1).
const THRESHOLDS = { lcp: 2.5, inp: 0.2, cls: 0.1 };

export async function getWebVitalsFlags(startDate, endDate) {
  const rows = await readRows('webvitals');
  const inRange = rows.filter(r => r.run_at >= startDate && r.run_at <= endDate);

  return inRange
    .map(r => {
      const flags = [];
      if (parseFloat(r.lcp) > THRESHOLDS.lcp) flags.push('LCP');
      if (parseFloat(r.inp) > THRESHOLDS.inp) flags.push('INP');
      if (parseFloat(r.cls) > THRESHOLDS.cls) flags.push('CLS');
      return { ...r, flags };
    })
    .filter(r => r.flags.length > 0);
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

// Fetches live low-stock alerts, reconciles them against the oos_log sheet (opening/closing
// OOS windows as products go fully out of stock or get restocked), and joins currently-OOS
// products against page_sessions (by /products/<handle> landing page) to show sessions lost
// while the product couldn't be purchased.
export async function getOosWithSessions() {
  const [alerts, log, pageRows] = await Promise.all([
    fetchLowStockAlerts(),
    readRows('oos_log'),
    readRows('page_sessions'),
  ]);

  // A product is truly OOS (not just low-stock) when its total inventory across all variants is 0.
  const byProduct = new Map();
  for (const a of alerts) {
    if (!byProduct.has(a.product_id)) {
      byProduct.set(a.product_id, { product_id: a.product_id, product_title: a.product_title, handle: a.handle, total_inventory: a.total_inventory, variants: [] });
    }
    byProduct.get(a.product_id).variants.push(a);
  }
  const fullyOos = [...byProduct.values()].filter(p => (parseInt(p.total_inventory, 10) || 0) === 0);
  const fullyOosIds = new Set(fullyOos.map(p => p.product_id));

  const today = todayIso();
  const openLogByProduct = new Map();
  for (const r of log) {
    if (r.status === 'oos' && !r.restocked_at) openLogByProduct.set(r.product_id, r);
  }

  // Open new log entries for newly-detected OOS products.
  const newRows = [];
  for (const p of fullyOos) {
    if (!openLogByProduct.has(p.product_id)) {
      newRows.push([p.product_id, p.product_title, p.handle, p.variants[0]?.sku || '', today, '', 'oos']);
    }
  }
  if (newRows.length) await appendRows('oos_log', newRows);

  // Close out log entries for products that restocked since we last checked.
  for (const [productId, entry] of openLogByProduct) {
    if (!fullyOosIds.has(productId)) {
      await updateRowByKey('oos_log', 'product_id', productId, { restocked_at: today, status: 'restocked' });
    }
  }

  // Re-read so oos_since reflects any rows just opened.
  const freshLog = newRows.length ? await readRows('oos_log') : log;
  const oosSinceByProduct = new Map();
  for (const r of freshLog) {
    if (r.status === 'oos' && !r.restocked_at) oosSinceByProduct.set(r.product_id, r.oos_since);
  }

  // Sessions per landing page, summed across the full page_sessions history (date-indexed).
  const sessionsByPage = new Map();
  for (const r of pageRows) {
    const sess = parseInt(r.sessions, 10) || 0;
    if (!sessionsByPage.has(r.landing_page)) sessionsByPage.set(r.landing_page, []);
    sessionsByPage.get(r.landing_page).push({ date: r.date, sessions: sess });
  }

  const result = fullyOos.map(p => {
    const oosSince = oosSinceByProduct.get(p.product_id) || today;
    const landingPage = p.handle ? `/products/${p.handle}` : null;
    const pageEntries = landingPage ? (sessionsByPage.get(landingPage) || []) : [];
    const sessionsDuringOos = pageEntries
      .filter(e => e.date >= oosSince)
      .reduce((s, e) => s + e.sessions, 0);

    return {
      product_id: p.product_id,
      product_title: p.product_title,
      handle: p.handle,
      landing_page: landingPage,
      sku: p.variants[0]?.sku || '',
      oos_since: oosSince,
      sessions_during_oos: sessionsDuringOos,
    };
  }).sort((a, b) => b.sessions_during_oos - a.sessions_during_oos);

  return { alerts, oosWithSessions: result };
}
