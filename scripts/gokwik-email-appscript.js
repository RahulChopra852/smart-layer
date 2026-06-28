// Google Apps Script — GoKwik Email Parser
// Crawls Gmail for GoKwik order report emails, downloads CSV from S3 link,
// aggregates by date, writes daily summaries + breakdowns to Dashboard DB sheet.
//
// Setup:
// 1. Create new Apps Script project at script.google.com
// 2. Paste this entire file
// 3. Set a daily trigger for processGoKwikEmails()
// 4. On first run, grant Gmail + Sheets + UrlFetch permissions

const DASHBOARD_SHEET_ID = '1CQg8P2jxdO9mWrB2-bP_zrrUWFQ2HgfFvQ5imGk2fbE';
const GOKWIK_TAB = 'gokwik_daily';
const PRODUCTS_TAB = 'gokwik_products';
const UTM_TAB = 'gokwik_utm';
const LANDING_TAB = 'gokwik_landing_pages';

const DAILY_HEADERS = [
  'date', 'total_orders', 'prepaid_orders', 'cod_orders',
  'avg_rto_score', 'high_rto_pct',
  'loyalty_points_redeemed', 'total_discount',
  'top_coupon', 'coupon_usage_count', 'unique_coupons',
  'top_utm_source', 'top_utm_medium', 'top_utm_campaign',
  'new_customers', 'returning_customers',
  'top_landing_page', 'top_store_source',
  'synced_at'
];

const PRODUCT_HEADERS = ['date', 'product_name', 'order_count', 'quantity', 'revenue', 'payment_prepaid', 'payment_cod', 'avg_rto_score', 'high_rto_pct', 'top_coupon', 'top_utm_source', 'avg_discount'];
const UTM_HEADERS = ['date', 'utm_source', 'utm_medium', 'utm_campaign', 'order_count'];
const LANDING_HEADERS = ['date', 'landing_page', 'order_count', 'top_utm_source'];

function processGoKwikEmails() {
  const threads = GmailApp.search('from:no-reply@gokwik.co subject:"Gokwik Orders Report"', 0, 10);
  if (!threads.length) {
    Logger.log('No GoKwik email threads found');
    return;
  }

  const ss = SpreadsheetApp.openById(DASHBOARD_SHEET_ID);
  const dailyTab = ensureTab(ss, GOKWIK_TAB, DAILY_HEADERS);
  const productsTab = ensureTab(ss, PRODUCTS_TAB, PRODUCT_HEADERS);
  const utmTab = ensureTab(ss, UTM_TAB, UTM_HEADERS);
  const landingTab = ensureTab(ss, LANDING_TAB, LANDING_HEADERS);

  const existing = getExistingDates(dailyTab);

  let totalProcessed = 0;
  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const msg of messages) {
      const subject = msg.getSubject();
      const dateMatch = subject.match(/(\d{2}-\d{2}-\d{4})\s*-\s*(\d{2}-\d{2}-\d{4})/);
      if (!dateMatch) continue;

      const reportDate = parseDDMMYYYY(dateMatch[1]);
      if (!reportDate) continue;

      const isoDate = formatISO(reportDate);
      if (existing.has(isoDate)) {
        Logger.log('Already have data for ' + isoDate + ', skipping');
        continue;
      }

      const csvUrl = extractS3Link(msg.getBody());
      if (!csvUrl) {
        Logger.log('No S3 link found in email for ' + isoDate);
        continue;
      }

      try {
        const csvText = UrlFetchApp.fetch(csvUrl, { muteHttpExceptions: true }).getContentText();
        const orders = parseCsv(csvText);
        if (!orders.length) {
          Logger.log('No orders parsed from CSV for ' + isoDate);
          continue;
        }

        // Write daily summary
        const summary = aggregateOrders(orders, isoDate);
        dailyTab.appendRow(summary);

        // Write product breakdown
        const productRows = buildProductBreakdown(orders, isoDate);
        if (productRows.length) appendBatch(productsTab, productRows);

        // Write UTM breakdown
        const utmRows = buildUtmBreakdown(orders, isoDate);
        if (utmRows.length) appendBatch(utmTab, utmRows);

        // Write landing page breakdown
        const landingRows = buildLandingBreakdown(orders, isoDate);
        if (landingRows.length) appendBatch(landingTab, landingRows);

        existing.add(isoDate);
        totalProcessed++;
        Logger.log('Wrote data for ' + isoDate + ' (' + orders.length + ' orders, ' +
          productRows.length + ' products, ' + utmRows.length + ' UTM combos, ' +
          landingRows.length + ' landing pages)');
      } catch (e) {
        Logger.log('Error processing ' + isoDate + ': ' + e.message);
      }
    }
  }

  Logger.log('Done — processed ' + totalProcessed + ' new date(s)');
}

function ensureTab(ss, name, headers) {
  let tab = ss.getSheetByName(name);
  if (!tab) {
    tab = ss.insertSheet(name);
    tab.appendRow(headers);
  }
  return tab;
}

function appendBatch(tab, rows) {
  if (!rows.length) return;
  tab.getRange(tab.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function getExistingDates(tab) {
  const data = tab.getDataRange().getValues();
  const dates = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) dates.add(String(data[i][0]));
  }
  return dates;
}

function parseDDMMYYYY(str) {
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
}

function formatISO(dt) {
  return dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');
}

function extractS3Link(htmlBody) {
  const patterns = [
    /href="(https:\/\/[^"]*\.s3[^"]*\.csv[^"]*)"/i,
    /href="(https:\/\/[^"]*amazonaws\.com[^"]*)"/i,
    /(https:\/\/[^\s<>"]*\.s3[^\s<>"]*\.csv[^\s<>"]*)/i,
    /(https:\/\/[^\s<>"]*amazonaws\.com[^\s<>"]*)/i,
    /href="(https:\/\/[^"]*gokwik[^"]*\.csv[^"]*)"/i,
    /(https:\/\/[^\s<>"]*gokwik[^\s<>"]*\.csv[^\s<>"]*)/i,
  ];
  for (const p of patterns) {
    const m = htmlBody.match(p);
    if (m) return m[1];
  }
  const csvLink = htmlBody.match(/href="(https:\/\/[^"]*\.csv[^"]*)"/i);
  if (csvLink) return csvLink[1];
  return null;
}

function parseCsv(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const colIndex = {};
  headers.forEach((h, i) => {
    colIndex[h.trim().toLowerCase().replace(/\s+/g, '_')] = i;
  });

  Logger.log('CSV columns found: ' + Object.keys(colIndex).join(', '));

  const orders = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i]);
    if (vals.length < 5) continue;

    const get = (key) => {
      const idx = findCol(colIndex, key);
      return idx !== undefined ? (vals[idx] || '').trim() : '';
    };
    const getAny = function() {
      for (var a = 0; a < arguments.length; a++) {
        var v = get(arguments[a]);
        if (v) return v;
      }
      return '';
    };

    orders.push({
      payment_method: getAny('payment_method', 'payment_mode', 'payment_type', 'mode_of_payment', 'pay_mode'),
      coupon_code: getAny('coupon_code', 'coupon', 'discount_code', 'promo_code'),
      utm_source: getAny('utm_source', 'source'),
      utm_medium: getAny('utm_medium', 'medium'),
      utm_campaign: getAny('utm_campaign', 'campaign'),
      utm_term: getAny('utm_term', 'term'),
      utm_content: getAny('utm_content', 'content'),
      rto_risk: getAny('rto_risk', 'rto_flag', 'rto_status'),
      rto_score: parseFloat(getAny('rto_score', 'rto_percentage', 'rto_%', 'rto')) || 0,
      product_name: fixSpecialChars(getAny('product_name', 'product_title', 'item_name', 'product')),
      product_price: parseFloat(getAny('product_price', 'item_price', 'price', 'selling_price', 'unit_price', 'order_value', 'total_amount')) || 0,
      quantity: parseInt(getAny('quantity', 'qty', 'item_quantity')) || 1,
      landing_page: getAny('landing_page', 'landing_url', 'landing_page_url'),
      store_source: getAny('store_source', 'store_platform', 'source_platform', 'platform_source'),
      platform: getAny('platform', 'device', 'device_type'),
      loyalty_points_discount: parseFloat(getAny('loyalty_points_discount', 'loyalty_discount', 'loyalty_points', 'flits_discount')) || 0,
      total_discount: parseFloat(getAny('total_discount', 'discount', 'discount_amount', 'total_discount_amount')) || 0,
      customer_type: getAny('customer_type', 'customer_tag', 'buyer_type', 'new_returning'),
    });
  }
  return orders;
}

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function findCol(colIndex, key) {
  if (colIndex[key] !== undefined) return colIndex[key];
  for (const k of Object.keys(colIndex)) {
    if (k.includes(key) || key.includes(k)) return colIndex[k];
  }
  return undefined;
}

function fixSpecialChars(str) {
  return str
    .replace(/â‚¹/g, '₹')
    .replace(/â€"/g, '—')
    .replace(/â€˜/g, "'")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"');
}

// ── Aggregation: daily summary ──

function aggregateOrders(orders, date) {
  const total = orders.length;
  const prepaid = orders.filter(o => isPrepaid(o.payment_method)).length;
  const cod = orders.filter(o => isCod(o.payment_method)).length;

  const rtoScores = orders.map(o => o.rto_score).filter(s => s > 0);
  const avgRto = rtoScores.length ? (rtoScores.reduce((a, b) => a + b, 0) / rtoScores.length).toFixed(1) : 0;
  const highRto = rtoScores.filter(s => s >= 70).length;
  const highRtoPct = total > 0 ? ((highRto / total) * 100).toFixed(1) : 0;

  const loyaltyTotal = orders.reduce((s, o) => s + o.loyalty_points_discount, 0).toFixed(2);
  const discountTotal = orders.reduce((s, o) => s + o.total_discount, 0).toFixed(2);

  const couponCounts = {};
  orders.forEach(o => {
    if (o.coupon_code) couponCounts[o.coupon_code] = (couponCounts[o.coupon_code] || 0) + 1;
  });
  const sortedCoupons = Object.entries(couponCounts).sort((a, b) => b[1] - a[1]);
  const topCoupon = sortedCoupons[0] ? sortedCoupons[0][0] : '';
  const topCouponCount = sortedCoupons[0] ? sortedCoupons[0][1] : 0;

  const topUtmSource = getTopValue(orders, 'utm_source');
  const topUtmMedium = getTopValue(orders, 'utm_medium');
  const topUtmCampaign = getTopValue(orders, 'utm_campaign');

  const newCust = orders.filter(o => o.customer_type.toLowerCase().includes('new')).length;
  const retCust = orders.filter(o => o.customer_type.toLowerCase().includes('return') || o.customer_type.toLowerCase().includes('repeat')).length;

  return [
    date, total, prepaid, cod,
    avgRto, highRtoPct,
    loyaltyTotal, discountTotal,
    topCoupon, topCouponCount, Object.keys(couponCounts).length,
    topUtmSource, topUtmMedium, topUtmCampaign,
    newCust, retCust,
    getTopValue(orders, 'landing_page'), getTopValue(orders, 'store_source'),
    new Date().toISOString()
  ];
}

// ── Breakdown: products sold ──

function buildProductBreakdown(orders, date) {
  const products = {};
  orders.forEach(o => {
    const name = o.product_name;
    if (!name) return;
    if (!products[name]) {
      products[name] = {
        count: 0, qty: 0, revenue: 0, prepaid: 0, cod: 0,
        rtoScores: [], coupons: {}, utmSources: {}, discounts: []
      };
    }
    const p = products[name];
    p.count++;
    p.qty += o.quantity;
    p.revenue += o.product_price * o.quantity;
    if (isPrepaid(o.payment_method)) p.prepaid++;
    if (isCod(o.payment_method)) p.cod++;
    if (o.rto_score > 0) p.rtoScores.push(o.rto_score);
    if (o.coupon_code) p.coupons[o.coupon_code] = (p.coupons[o.coupon_code] || 0) + 1;
    if (o.utm_source) p.utmSources[o.utm_source] = (p.utmSources[o.utm_source] || 0) + 1;
    if (o.total_discount > 0) p.discounts.push(o.total_discount);
  });

  return Object.entries(products)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, v]) => {
      const avgRto = v.rtoScores.length
        ? (v.rtoScores.reduce((a, b) => a + b, 0) / v.rtoScores.length).toFixed(1) : 0;
      const highRto = v.count > 0
        ? ((v.rtoScores.filter(s => s >= 70).length / v.count) * 100).toFixed(1) : 0;
      const topCoupon = topEntry(v.coupons);
      const topUtm = topEntry(v.utmSources);
      const avgDiscount = v.discounts.length
        ? (v.discounts.reduce((a, b) => a + b, 0) / v.discounts.length).toFixed(0) : 0;
      return [date, name, v.count, v.qty, v.revenue.toFixed(0), v.prepaid, v.cod,
              avgRto, highRto, topCoupon, topUtm, avgDiscount];
    });
}

function topEntry(obj) {
  const entries = Object.entries(obj);
  if (!entries.length) return '';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0] + ' (' + entries[0][1] + ')';
}

// ── Breakdown: UTM attribution ──

function buildUtmBreakdown(orders, date) {
  const combos = {};
  orders.forEach(o => {
    const src = o.utm_source || '(none)';
    const med = o.utm_medium || '(none)';
    const camp = o.utm_campaign || '(none)';
    if (src === '(none)' && med === '(none)' && camp === '(none)') return;
    const key = src + '|' + med + '|' + camp;
    combos[key] = (combos[key] || 0) + 1;
  });
  return Object.entries(combos)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const [s, m, c] = key.split('|');
      return [date, s, m, c, count];
    });
}

// ── Breakdown: landing pages ──

function buildLandingBreakdown(orders, date) {
  const pages = {};
  orders.forEach(o => {
    const page = o.landing_page;
    if (!page) return;
    if (!pages[page]) pages[page] = { count: 0, sources: {} };
    pages[page].count++;
    const src = o.utm_source || '(direct)';
    pages[page].sources[src] = (pages[page].sources[src] || 0) + 1;
  });
  return Object.entries(pages)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([page, v]) => {
      const topSrc = Object.entries(v.sources).sort((a, b) => b[1] - a[1])[0];
      return [date, page, v.count, topSrc ? topSrc[0] + ' (' + topSrc[1] + ')' : ''];
    });
}

// ── Helpers ──

function isPrepaid(method) {
  const m = method.toLowerCase();
  return m.includes('prepaid') || m.includes('online') || m.includes('upi') || m.includes('card') || m.includes('netbanking');
}

function isCod(method) {
  const m = method.toLowerCase();
  return m.includes('cod') || m.includes('cash');
}

function getTopValue(orders, field) {
  const counts = {};
  orders.forEach(o => {
    const val = o[field];
    if (val && val !== '' && val !== 'null' && val !== 'undefined') {
      counts[val] = (counts[val] || 0) + 1;
    }
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0] ? sorted[0][0] + ' (' + sorted[0][1] + ')' : '';
}

// Manual trigger: reprocess all emails (clears existing data first)
function reprocessAllGoKwik() {
  const ss = SpreadsheetApp.openById(DASHBOARD_SHEET_ID);
  [GOKWIK_TAB, PRODUCTS_TAB, UTM_TAB, LANDING_TAB].forEach(tabName => {
    const tab = ss.getSheetByName(tabName);
    if (tab && tab.getLastRow() > 1) {
      tab.getRange(2, 1, tab.getLastRow() - 1, tab.getLastColumn()).clear();
    }
  });
  processGoKwikEmails();
}
