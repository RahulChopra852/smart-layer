import { readRows, appendRows, updateRowByKey } from '../db/supabaseDb.js';
import { fetchLowStockAlerts } from './shopify.js';

function dateDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Commerce snapshot — two data sources on two different refresh schedules:
//
// - Orders (total/web/app) come from cro_daily (channel='web' row carries Total/Web/App Orders
//   straight from the CRO-Auto sheet). The sheet is cheap to poll, so it's synced every 2 minutes
//   (see server/services/scheduler.js) — "today" here is genuinely live.
// - Revenue and units-sold come from shopify_daily via the Shopify Orders API, which we
//   deliberately do NOT poll through the day to avoid hammering Shopify — it's synced once a
//   night at 00:15 (see scheduler.js), picking up the full prior day in one pass. So "today"
//   never has a meaningful shopify_daily row until that night's run; the freshest complete
//   figure is always "yesterday", and DoD compares yesterday vs the day before.
export async function getCommerceSnapshot() {
  const [shopifyRows, croRows, syncState] = await Promise.all([
    readRows('shopify_daily'), readRows('cro_daily'), readRows('_sync_state')
  ]);
  const shopifyByDate = new Map(shopifyRows.map(r => [r.date, r]));
  const croWebByDate = new Map(croRows.filter(r => r.channel === 'web').map(r => [r.date, r]));
  const shopifyOrdersSyncedAt = syncState.find(s => s.source === 'shopify_orders')?.last_synced_at || null;
  const croWebSyncedAt = syncState.find(s => s.source === 'cro_web')?.last_synced_at || null;

  const ordersFor = (date) => {
    const r = croWebByDate.get(date);
    const sessions = parseFloat(r?.sessions) || 0;
    let atc = parseFloat(r?.atc) || 0;
    const atcPct = parseFloat(r?.atc_pct);
    // Same raw-sheet quirk fixed in getCroFunnelDeltas below (e.g. 805800 instead of ~8058) —
    // recompute from the percentage column whenever the raw count exceeds total sessions.
    if (sessions > 0 && !isNaN(atcPct) && atc > sessions) atc = Math.round(sessions * atcPct / 100);
    return {
      total: parseInt(r?.orders, 10) || 0,
      web: parseInt(r?.web_orders, 10) || 0,
      app: parseInt(r?.app_orders, 10) || 0,
      sessions,
      atc,
    };
  };
  const revenueFor = (date) => {
    const r = shopifyByDate.get(date);
    return { units: parseInt(r?.units_sold, 10) || 0, revenue: parseFloat(r?.revenue) || 0 };
  };

  const today = dateDaysAgo(0);
  const yesterday = dateDaysAgo(1);
  const dayBefore = dateDaysAgo(2);

  const ordersSumRange = (start, end) => {
    let total = 0, web = 0, app = 0, sessions = 0, atc = 0;
    for (const r of croRows) {
      if (r.channel === 'web' && r.date >= start && r.date <= end) {
        total += parseInt(r.orders, 10) || 0;
        web += parseInt(r.web_orders, 10) || 0;
        app += parseInt(r.app_orders, 10) || 0;
        sessions += parseFloat(r.sessions) || 0;
        atc += parseFloat(r.atc) || 0;
      }
    }
    return { total, web, app, sessions, atc };
  };
  const revenueSumRange = (start, end) => {
    let units = 0, revenue = 0;
    for (const r of shopifyRows) {
      if (r.date >= start && r.date <= end) {
        units += parseInt(r.units_sold, 10) || 0;
        revenue += parseFloat(r.revenue) || 0;
      }
    }
    return { units, revenue };
  };

  const todayOrders = ordersFor(today);
  const yesterdayOrders = ordersFor(yesterday);
  const yesterdayRevenue = revenueFor(yesterday);
  const dayBeforeRevenue = revenueFor(dayBefore);

  // Orders trend ends today (live, cheap). Revenue/units trend ends yesterday (last complete
  // Shopify day) so it doesn't silently include an always-empty "today".
  const ordersLast7 = ordersSumRange(dateDaysAgo(6), today);
  const ordersPrior7 = ordersSumRange(dateDaysAgo(13), dateDaysAgo(7));
  const revenueLast7 = revenueSumRange(dateDaysAgo(7), yesterday);
  const revenuePrior7 = revenueSumRange(dateDaysAgo(14), dateDaysAgo(8));

  const cvrFor = (o) => o.sessions > 0 ? o.total / o.sessions * 100 : null;
  const todayCvr = cvrFor(todayOrders);
  const yesterdayCvr = cvrFor(yesterdayOrders);
  const last7Cvr = cvrFor(ordersLast7);
  const prior7Cvr = cvrFor(ordersPrior7);

  // 8-point trailing series for the one-line sparkline cards. Orders/ATC/Sessions end today
  // (live, cheap); revenue ends yesterday (last complete Shopify day) for the same reason the
  // rest of the revenue block does.
  const ordersTrendDates = Array.from({ length: 8 }, (_, i) => dateDaysAgo(7 - i));
  const revenueTrendDates = Array.from({ length: 8 }, (_, i) => dateDaysAgo(8 - i));
  const sessionsTrend = ordersTrendDates.map(d => ordersFor(d).sessions);
  const atcTrend = ordersTrendDates.map(d => ordersFor(d).atc);
  const ordersTrend = ordersTrendDates.map(d => ordersFor(d).total);
  const revenueTrend = revenueTrendDates.map(d => revenueFor(d).revenue);

  return {
    sessions: {
      today: { date: today, value: todayOrders.sessions },
      yesterday: { date: yesterday, value: yesterdayOrders.sessions },
      dodDelta: todayOrders.sessions - yesterdayOrders.sessions,
      trend: sessionsTrend,
    },
    orders: {
      today: { date: today, ...todayOrders },
      yesterday: { date: yesterday, ...yesterdayOrders },
      dodDelta: todayOrders.total - yesterdayOrders.total,
      last7: { ...ordersLast7 },
      prior7: { ...ordersPrior7 },
      wowDelta: ordersLast7.total - ordersPrior7.total,
      trend: ordersTrend,
    },
    atc: {
      today: { date: today, value: todayOrders.atc },
      last7: { value: ordersLast7.atc },
      prior7: { value: ordersPrior7.atc },
      dodDelta: todayOrders.atc - yesterdayOrders.atc,
      wowDelta: ordersLast7.atc - ordersPrior7.atc,
      trend: atcTrend,
    },
    cvr: {
      today: { date: today, value: todayCvr },
      yesterday: { date: yesterday, value: yesterdayCvr },
      last7: { value: last7Cvr },
      prior7: { value: prior7Cvr },
      dodDelta: todayCvr != null && yesterdayCvr != null ? todayCvr - yesterdayCvr : null,
      wowDelta: last7Cvr != null && prior7Cvr != null ? last7Cvr - prior7Cvr : null,
    },
    revenue: {
      yesterday: { date: yesterday, ...yesterdayRevenue },
      dayBefore: { date: dayBefore, ...dayBeforeRevenue },
      dodUnitsDelta: yesterdayRevenue.units - dayBeforeRevenue.units,
      dodRevenueDelta: yesterdayRevenue.revenue - dayBeforeRevenue.revenue,
      last7: revenueLast7,
      prior7: revenuePrior7,
      last7Range: { start: dateDaysAgo(7), end: yesterday },
      prior7Range: { start: dateDaysAgo(14), end: dateDaysAgo(8) },
      wowUnitsDelta: revenueLast7.units - revenuePrior7.units,
      wowRevenueDelta: revenueLast7.revenue - revenuePrior7.revenue,
      lastSyncedAt: shopifyOrdersSyncedAt,
      trend: revenueTrend,
    },
    croSyncedAt: croWebSyncedAt,
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
        sku: p.sku || '',
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

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pctChange(curr, prev) {
  if (prev == null || prev === 0 || curr == null) return null;
  return (curr - prev) / prev * 100;
}

// Main Movers — compares a trailing window (7/15/30d) against the equal-length window right
// before it: current = [end-N+1, end], prior = [end-2N+1, end-N]. Two layers:
//  - headline funnel metrics from cro_daily (web+app combined) — this table has a full year of
//    history, so all three window sizes work.
//  - per-landing-page session movers from page_sessions — that table only goes back to whenever
//    sessions sync started (see CLAUDE.md), so wider windows may come back with few/no pages that
//    have a valid prior-window comparison; that's real data-availability, not a bug.
export async function getMainMovers(windowDays, endDate) {
  const currStart = shiftDate(endDate, -(windowDays - 1));
  const currEnd = endDate;
  const priorStart = shiftDate(endDate, -(windowDays * 2 - 1));
  const priorEnd = shiftDate(endDate, -windowDays);

  const [croRows, pageRows, shopifyRows] = await Promise.all([readRows('cro_daily'), readRows('page_sessions'), readRows('shopify_daily')]);

  // ATC/IC/RPP/Orders/CVR% are account-wide (cro_daily has no landing-page dimension), which
  // doesn't fit a page-mover-oriented card — those live in Commerce Snapshot instead. Sessions
  // stays here since it's also the basis for the landing-page gainers/decliners below.
  function sumCro(startDate, endDate) {
    const inRange = croRows.filter(r => r.date >= startDate && r.date <= endDate);
    let sessions = 0;
    for (const r of inRange) sessions += parseFloat(r.sessions) || 0;
    return { sessions };
  }

  const currTotals = sumCro(currStart, currEnd);
  const priorTotals = sumCro(priorStart, priorEnd);

  const metrics = [{
    metric: 'sessions',
    curr: currTotals.sessions,
    prior: priorTotals.sessions,
    change: pctChange(currTotals.sessions, priorTotals.sessions),
  }];

  function sumShopify(startDate, endDate) {
    const inRange = shopifyRows.filter(r => r.date >= startDate && r.date <= endDate);
    let units = 0, revenue = 0;
    for (const r of inRange) {
      units += parseInt(r.units_sold, 10) || 0;
      revenue += parseFloat(r.revenue) || 0;
    }
    return { units, revenue };
  }

  // shopify_daily only completes its nightly sync at 00:15 (see scheduler.js), so if `endDate`
  // is today, that row doesn't exist yet — anchoring the sales window to the funnel metrics'
  // live endDate would count an unsynced day as literal zero and make sales look like they
  // cratered. Anchor to the latest date shopify_daily actually has instead (same fix
  // getCommerceSnapshot uses for its DoD figures), shifting the whole window back so current
  // and prior stay the same length and comparable.
  const latestShopifyDate = shopifyRows.length ? [...new Set(shopifyRows.map(r => r.date))].sort().slice(-1)[0] : null;
  const salesEnd = latestShopifyDate && latestShopifyDate < currEnd ? latestShopifyDate : currEnd;
  const salesCurrStart = shiftDate(salesEnd, -(windowDays - 1));
  const salesPriorEnd = shiftDate(salesEnd, -windowDays);
  const salesPriorStart = shiftDate(salesEnd, -(windowDays * 2 - 1));

  const currSales = sumShopify(salesCurrStart, salesEnd);
  const priorSales = sumShopify(salesPriorStart, salesPriorEnd);

  metrics.push({
    metric: 'revenue',
    curr: currSales.revenue,
    prior: priorSales.revenue,
    change: pctChange(currSales.revenue, priorSales.revenue),
  });
  metrics.push({
    metric: 'units_sold',
    curr: currSales.units,
    prior: priorSales.units,
    change: pctChange(currSales.units, priorSales.units),
  });

  function sumPagesByLandingPage(startDate, endDate) {
    const inRange = pageRows.filter(r => r.date >= startDate && r.date <= endDate && r.source_field === 'utm_source');
    const byPage = new Map();
    for (const r of inRange) {
      const key = r.landing_page;
      if (!byPage.has(key)) byPage.set(key, { landing_page: key, sessions: 0, atc_count: 0 });
      const p = byPage.get(key);
      p.sessions += parseInt(r.sessions, 10) || 0;
      p.atc_count += parseInt(r.atc_count, 10) || 0;
    }
    return byPage;
  }

  const pageDataFrom = pageRows.length ? [...new Set(pageRows.map(r => r.date))].sort()[0] : null;
  // A prior window that starts before page-level sync history began would only be partially
  // covered (e.g. 2 of 15 days), making its total artificially low and the % change misleading —
  // skip page movers entirely rather than compute off an incomplete prior period.
  const priorWindowFullyCovered = pageDataFrom != null && priorStart >= pageDataFrom;

  const pageMovers = [];
  if (priorWindowFullyCovered) {
    const currPages = sumPagesByLandingPage(currStart, currEnd);
    const priorPages = sumPagesByLandingPage(priorStart, priorEnd);
    for (const [page, curr] of currPages) {
      const prior = priorPages.get(page);
      if (!prior || prior.sessions < 20 || curr.sessions < 20) continue; // too little volume for a fair % move
      pageMovers.push({
        landing_page: page,
        currSessions: curr.sessions,
        priorSessions: prior.sessions,
        change: pctChange(curr.sessions, prior.sessions),
      });
    }
    pageMovers.sort((a, b) => b.change - a.change);
  }

  return {
    windowDays,
    currRange: { start: currStart, end: currEnd },
    priorRange: { start: priorStart, end: priorEnd },
    salesRange: { start: salesCurrStart, end: salesEnd },
    metrics,
    gainers: pageMovers.filter(p => p.change > 0).slice(0, 10),
    decliners: pageMovers.filter(p => p.change < 0).sort((a, b) => a.change - b.change).slice(0, 10),
    pageDataFrom,
  };
}

// CRO funnel deltas — DoD and WoW movement in ATC%/IC%/RPP% for web and app.
export async function getCroFunnelDeltas(startDate, endDate) {
  const [rows, gaAppRows] = await Promise.all([readRows('cro_daily'), readRows('ga_app_daily')]);

  // GA app sessions by YYYY-MM-DD (sum across iOS+Android)
  const gaAppSessions = {};
  for (const r of gaAppRows) {
    const d = r.date ? `${r.date.slice(0,4)}-${r.date.slice(4,6)}-${r.date.slice(6,8)}` : '';
    if (d) gaAppSessions[d] = (gaAppSessions[d] || 0) + (parseInt(r.sessions) || 0);
  }

  const allSorted = rows.sort((a, b) => a.date.localeCompare(b.date));

  const byChannelAll = { web: [], app: [] };
  for (const r of allSorted) {
    if (byChannelAll[r.channel]) byChannelAll[r.channel].push(r);
  }

  // Deduplicate: if multiple rows exist for the same date/channel (e.g. after re-syncs), keep the last.
  for (const ch of ['web', 'app']) {
    const seen = new Map();
    for (const r of byChannelAll[ch]) seen.set(r.date, r);
    byChannelAll[ch] = [...seen.values()];
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
      // For app rows, sessions come from GA via ga_app_daily (only if > any funnel step to avoid partial-day nonsense)
      if (channel === 'app' && (c.sessions == null || c.sessions === 0)) {
        const gaSess = gaAppSessions[curr.date] || null;
        const maxFunnel = Math.max(c.ic || 0, c.rpp || 0, c.atc || 0);
        if (gaSess != null && gaSess > maxFunnel) c.sessions = gaSess;
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

  // Track products with at least one fully OOS variant (qty === 0), even if other variants still have stock.
  const byProduct = new Map();
  for (const a of alerts) {
    if (!byProduct.has(a.product_id)) {
      byProduct.set(a.product_id, { product_id: a.product_id, product_title: a.product_title, handle: a.handle, total_inventory: a.total_inventory, variants: [] });
    }
    byProduct.get(a.product_id).variants.push(a);
  }
  // Only count variants that are genuinely unavailable: qty=0 AND inventory_policy is DENY (not CONTINUE which allows oversell)
  const fullyOos = [...byProduct.values()].filter(p =>
    p.variants.some(v => v.qty === 0 && v.inventory_policy !== 'CONTINUE')
  );
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
  // fetchPageSessionsSince writes two overlapping breakdowns of the same traffic — one grouped
  // by utm_source, one by referrer_source — as separate rows with different source_field values.
  // Summing both would double-count real sessions, so only one dimension is used here, matching
  // getPagePerformance's default.
  const sessionsByPage = new Map();
  for (const r of pageRows) {
    if (r.source_field !== 'utm_source') continue;
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

    const oosVariants = p.variants.filter(v => v.qty === 0);
    return {
      product_id: p.product_id,
      product_title: p.product_title,
      handle: p.handle,
      landing_page: landingPage,
      sku: p.variants[0]?.sku || '',
      oos_since: oosSince,
      sessions_during_oos: sessionsDuringOos,
      oos_variant_count: oosVariants.length,
      total_variant_count: p.variants.length,
      total_inventory: parseInt(p.total_inventory, 10) || 0,
    };
  }).sort((a, b) => b.sessions_during_oos - a.sessions_during_oos);

  return { alerts, oosWithSessions: result };
}

function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00Z');
  const d2 = new Date(b + 'T00:00:00Z');
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}

// Full OOS history — every cycle ever logged (open or closed), each with its own sessions-lost
// total for that specific window. Unlike getOosWithSessions (which only shows currently-open
// cycles), a product that has gone OOS and come back multiple times appears as multiple rows,
// one per cycle — that's already how oos_log is written (a new row opens each time a product
// newly goes OOS after having been restocked), so no change was needed there, just a read path
// that doesn't filter down to open-only.
export async function getOosHistory() {
  const [log, pageRows] = await Promise.all([
    readRows('oos_log'),
    readRows('page_sessions'),
  ]);

  // See getOosWithSessions above — only one source_field dimension is summed to avoid
  // double-counting the same sessions across the utm_source/referrer_source breakdowns.
  const sessionsByPage = new Map();
  for (const r of pageRows) {
    if (r.source_field !== 'utm_source') continue;
    const sess = parseInt(r.sessions, 10) || 0;
    if (!sessionsByPage.has(r.landing_page)) sessionsByPage.set(r.landing_page, []);
    sessionsByPage.get(r.landing_page).push({ date: r.date, sessions: sess });
  }

  const today = todayIso();
  const result = log.map(r => {
    const windowEnd = r.restocked_at || null; // null = still open, no upper bound (through today)
    const landingPage = r.handle ? `/products/${r.handle}` : null;
    const pageEntries = landingPage ? (sessionsByPage.get(landingPage) || []) : [];
    const sessionsLost = pageEntries
      .filter(e => e.date >= r.oos_since && (windowEnd == null || e.date < windowEnd))
      .reduce((s, e) => s + e.sessions, 0);

    return {
      product_id: r.product_id,
      product_title: r.product_title,
      sku: r.sku || '',
      oos_since: r.oos_since,
      restocked_at: r.restocked_at || null,
      oos_days: daysBetween(r.oos_since, r.restocked_at || today),
      sessions_lost: sessionsLost,
      status: r.restocked_at ? 'restocked' : 'oos',
    };
  }).sort((a, b) => b.oos_since.localeCompare(a.oos_since));

  return { history: result };
}

// Low-stock "watch" list — total_inventory under the threshold, with each product's recent
// (trailing 7-day) session volume for visibility into how much traffic it's still getting.
const WATCH_QTY_THRESHOLD = 50;
const RECENT_SESSIONS_DAYS = 7;

export async function getLowStockTrafficWatch() {
  const [alerts, pageRows] = await Promise.all([
    fetchLowStockAlerts(),
    readRows('page_sessions'),
  ]);

  const byProduct = new Map();
  for (const a of alerts) {
    if (!byProduct.has(a.product_id)) {
      byProduct.set(a.product_id, { product_id: a.product_id, product_title: a.product_title, handle: a.handle, total_inventory: a.total_inventory, variants: [] });
    }
    byProduct.get(a.product_id).variants.push(a);
  }

  const watchlist = [...byProduct.values()].filter(p => (parseInt(p.total_inventory, 10) || 0) < WATCH_QTY_THRESHOLD);

  // See getOosWithSessions above — only one source_field dimension is summed to avoid
  // double-counting the same sessions across the utm_source/referrer_source breakdowns.
  const sessionsByPage = new Map();
  for (const r of pageRows) {
    if (r.source_field !== 'utm_source') continue;
    const sess = parseInt(r.sessions, 10) || 0;
    if (!sessionsByPage.has(r.landing_page)) sessionsByPage.set(r.landing_page, []);
    sessionsByPage.get(r.landing_page).push({ date: r.date, sessions: sess });
  }

  const result = watchlist.map(p => {
    const landingPage = p.handle ? `/products/${p.handle}` : null;
    const entries = landingPage ? (sessionsByPage.get(landingPage) || []) : [];
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const recentEntries = sorted.slice(-RECENT_SESSIONS_DAYS);
    const recentSessions = recentEntries.reduce((s, e) => s + e.sessions, 0);
    const latestDay = sorted.length ? sorted[sorted.length - 1].date : null;

    const oosVariantCount = p.variants.filter(v => v.qty === 0 && v.inventory_policy !== 'CONTINUE').length;

    return {
      product_id: p.product_id,
      product_title: p.product_title,
      sku: p.variants[0]?.sku || '',
      total_inventory: parseInt(p.total_inventory, 10) || 0,
      oos_variant_count: oosVariantCount,
      total_variant_count: p.variants.length,
      latest_day: latestDay,
      sessions_last_7d: recentSessions,
    };
  }).sort((a, b) => a.total_inventory - b.total_inventory);

  return { watchlist: result };
}

// Revenue Leak — four distinct "money left on the table" signals surfaced together on the CRO
// tab: sessions landing on OOS products (live, reuses getOosWithSessions), CI-to-purchase drop
// (live, from cro_daily), and two manually-uploaded CSV sources (discount failures, abandoned
// carts) that show whatever was most recently uploaded rather than strictly "today", since
// neither is synced automatically yet.
export async function getRevenueLeak() {
  const [oosData, croRows, discountRows, cartRows] = await Promise.all([
    getOosWithSessions(),
    readRows('cro_daily'),
    readRows('discount_failures'),
    readRows('abandoned_carts'),
  ]);

  const oosSessionsTotal = oosData.oosWithSessions.reduce((s, p) => s + p.sessions_during_oos, 0);

  const ciToPurchase = (r) => {
    if (!r) return null;
    const sessions = parseFloat(r.sessions) || 0;
    const icPct = parseFloat(r.ic_pct);
    let ic = parseInt(r.ic, 10) || 0;
    // Same raw-sheet quirk fixed for ATC in getCroFunnelDeltas (e.g. 362100 instead of ~3618) —
    // recompute from the percentage column whenever the raw count exceeds total sessions.
    if (sessions > 0 && !isNaN(icPct) && ic > sessions) ic = Math.round(sessions * icPct / 100);
    const orders = parseInt(r.orders, 10) || 0;
    const dropped = Math.max(0, ic - orders);
    return { date: r.date, ic, orders, dropped, dropPct: ic > 0 ? (dropped / ic) * 100 : null };
  };
  const today = todayIso();
  const yesterday = dateDaysAgo(1);
  const webToday = croRows.find(r => r.channel === 'web' && r.date === today);
  const webYesterday = croRows.find(r => r.channel === 'web' && r.date === yesterday);

  const discountDates = [...new Set(discountRows.map(r => r.date))].sort();
  const latestDiscountDate = discountDates[discountDates.length - 1] || null;
  const latestDiscountRows = discountRows.filter(r => r.date === latestDiscountDate);
  const reasonTotals = {};
  for (const r of latestDiscountRows) {
    reasonTotals[r.failure_reason] = (reasonTotals[r.failure_reason] || 0) + (parseInt(r.total_failed_attempts, 10) || 0);
  }

  const cartsByDate = {};
  for (const r of cartRows) {
    const d = (r.created_at || '').slice(0, 10);
    if (!d) continue;
    if (!cartsByDate[d]) cartsByDate[d] = { count: 0, value: 0 };
    cartsByDate[d].count += 1;
    cartsByDate[d].value += parseFloat(r.amount) || 0;
  }
  const cartDates = Object.keys(cartsByDate).sort();
  const latestCartDate = cartDates[cartDates.length - 1] || null;
  const dropStageTotals = {};
  for (const r of cartRows) {
    if ((r.created_at || '').slice(0, 10) !== latestCartDate) continue;
    const stage = r.drop_stage || 'Unknown';
    dropStageTotals[stage] = (dropStageTotals[stage] || 0) + 1;
  }

  return {
    oosSessions: {
      total: oosSessionsTotal,
      topProducts: oosData.oosWithSessions.slice(0, 5).map(p => ({ product_title: p.product_title, sessions: p.sessions_during_oos })),
    },
    ciToPurchase: { today: ciToPurchase(webToday), yesterday: ciToPurchase(webYesterday) },
    discountFailures: {
      date: latestDiscountDate,
      totalFailedAttempts: latestDiscountRows.reduce((s, r) => s + (parseInt(r.total_failed_attempts, 10) || 0), 0),
      totalUniqueUsers: latestDiscountRows.reduce((s, r) => s + (parseInt(r.total_unique_users, 10) || 0), 0),
      topReasons: Object.entries(reasonTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
    },
    abandonedCarts: {
      date: latestCartDate,
      count: latestCartDate ? cartsByDate[latestCartDate].count : 0,
      value: latestCartDate ? cartsByDate[latestCartDate].value : 0,
      topDropStages: Object.entries(dropStageTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([stage, count]) => ({ stage, count })),
    },
  };
}
