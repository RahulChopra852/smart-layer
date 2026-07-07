// Google Apps Script — App Funnel Sync (GA4 + Shopify)
// Writes Sessions, ATC, IC, Orders (App), Revenue(App) + derived %/AOV columns into the
// "Funnel(App)" tab of the CRO-Auto workbook. Does NOT touch RPP, RPP%, ci to rpp, or
// rpp to order — those are filled by a separate script/process.
//
// Setup:
// 1. Paste into https://script.google.com (same or new project)
// 2. Editor -> Services (+) -> add "Google Analytics Data API" (adds the `AnalyticsData`
//    advanced service). This authenticates as YOUR Google account, so you need at least
//    Viewer access to the GA4 App property yourself.
// 3. Project Settings -> Script Properties -> add:
//      GA_APP_PROPERTY_ID = 422590924
//      SHOPIFY_STORE_DOMAIN = guardian-gnc.myshopify.com
//      SHOPIFY_TOKEN = shpat_xxxxx   (Admin API token, read_orders scope)
// 4. Run testSyncAppFunnel() once to grant Sheets + external request permissions
// 5. Set a daily trigger for syncAppFunnel() (covers the last DAILY_SYNC_DAYS days each run)
// 6. Reload the spreadsheet — a "🚀 GNC Scripts" menu appears with "Run Daily Update" and
//    "Update Date Range (Popup)" for manually backfilling any specific range on demand.

var CRO_SHEET_ID = '1uj4fNlMkPPqGFuHgJaKyOg__Abi46KB8F-0cq-t4TF4';
var FUNNEL_APP_TAB = 'Funnel(App)';
var SHOPIFY_APP_CHANNEL = 'GNC <> Gokwik (App)'; // NOT 'GNC <> Gokwik' — that's the web channel
var SHOPIFY_API_VERSION = '2025-10';
var DAILY_SYNC_DAYS = 7; // trailing window the daily trigger re-checks; GA/Shopify data settles for a few days

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚀 GNC Scripts')
    .addItem('Run Daily Update', 'syncAppFunnel')
    .addItem('Update Date Range (Popup)', 'promptAndSyncDateRange')
    .addToUi();
}

// Daily-trigger entry point — re-checks a short trailing window (recent data still settling).
function syncAppFunnel() {
  var today = new Date();
  var start = new Date(today.getTime() - DAILY_SYNC_DAYS * 86400000);
  runAppFunnelSync(formatDate(start), formatDate(today));
}

// Menu entry point — prompts for an explicit start/end date, for backfilling any specific
// range (e.g. dates that fell outside a past daily window before this sync existed).
function promptAndSyncDateRange() {
  var ui = SpreadsheetApp.getUi();
  var startResp = ui.prompt('Sync Date Range', 'Start date (YYYY-MM-DD):', ui.ButtonSet.OK_CANCEL);
  if (startResp.getSelectedButton() !== ui.Button.OK) return;
  var startStr = startResp.getResponseText().trim();

  var endResp = ui.prompt('Sync Date Range', 'End date (YYYY-MM-DD):', ui.ButtonSet.OK_CANCEL);
  if (endResp.getSelectedButton() !== ui.Button.OK) return;
  var endStr = endResp.getResponseText().trim();

  var dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(startStr) || !dateRe.test(endStr)) {
    ui.alert('Invalid date format — please use YYYY-MM-DD for both dates.');
    return;
  }

  runAppFunnelSync(startStr, endStr);
  ui.alert('Done — synced ' + startStr + ' to ' + endStr + '.');
}

function runAppFunnelSync(startStr, endStr) {
  var props = PropertiesService.getScriptProperties();
  var gaPropertyId = props.getProperty('GA_APP_PROPERTY_ID');
  var shopifyDomain = props.getProperty('SHOPIFY_STORE_DOMAIN');
  var shopifyToken = props.getProperty('SHOPIFY_TOKEN');
  if (!gaPropertyId || !shopifyDomain || !shopifyToken) {
    throw new Error('Missing Script Properties — set GA_APP_PROPERTY_ID, SHOPIFY_STORE_DOMAIN, SHOPIFY_TOKEN');
  }

  var sessionsByDate = getGaMetricByDate(gaPropertyId, 'sessions', startStr, endStr);
  var atcByDate = getGaEventCountByDate(gaPropertyId, 'add_to_cart', startStr, endStr);
  var icByDate = getGaEventCountByDate(gaPropertyId, 'begin_checkout', startStr, endStr);
  var ordersRevByDate = getShopifyAppOrdersByDate(shopifyDomain, shopifyToken, startStr, endStr);

  writeToSheet(sessionsByDate, atcByDate, icByDate, ordersRevByDate);
}

function formatDate(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// Converts a UTC createdAt timestamp to its IST calendar date (store reports in IST; a plain
// UTC date would misbucket orders created in the ~18:30-23:59 UTC window into the wrong day).
function toIstDateStr(utcIsoString) {
  var istMs = new Date(utcIsoString).getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

function gaDateToIso(d) {
  return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
}

// ── GA4 helpers (Analytics Data API advanced service) ──

function getGaMetricByDate(propertyId, metricName, startDate, endDate) {
  var request = {
    dateRanges: [{ startDate: startDate, endDate: endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: metricName }]
  };
  var response = AnalyticsData.Properties.runReport(request, 'properties/' + propertyId);
  var map = {};
  (response.rows || []).forEach(function (row) {
    map[gaDateToIso(row.dimensionValues[0].value)] = parseFloat(row.metricValues[0].value) || 0;
  });
  return map;
}

function getGaEventCountByDate(propertyId, eventName, startDate, endDate) {
  var request = {
    dateRanges: [{ startDate: startDate, endDate: endDate }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: eventName } }
    }
  };
  var response = AnalyticsData.Properties.runReport(request, 'properties/' + propertyId);
  var map = {};
  (response.rows || []).forEach(function (row) {
    map[gaDateToIso(row.dimensionValues[0].value)] = parseFloat(row.metricValues[0].value) || 0;
  });
  return map;
}

// ── Shopify helper — app sales-channel orders + revenue, by day ──

function getShopifyAppOrdersByDate(domain, token, startDate, endDate) {
  var query = 'query($q: String!, $after: String) {' +
    ' orders(first: 250, query: $q, after: $after, sortKey: CREATED_AT) {' +
    '   edges { node { createdAt channelInformation { app { title } } currentTotalPriceSet { shopMoney { amount } } } }' +
    '   pageInfo { hasNextPage endCursor }' +
    ' } }';

  var map = {}; // iso date -> { orders, revenue }
  var after = null, hasNextPage = true;
  // Store reports in IST (UTC+5:30) — a plain UTC day boundary shifts late-evening IST orders
  // into the wrong calendar day. Query using IST-aligned UTC instants instead.
  var startUtc = new Date(startDate + 'T00:00:00+05:30').toISOString();
  var endBoundary = new Date(endDate + 'T00:00:00+05:30');
  endBoundary.setUTCDate(endBoundary.getUTCDate() + 1); // start of the day AFTER endDate, IST
  var endUtc = endBoundary.toISOString();
  // status:any is required — Shopify's default order query silently excludes archived/closed
  // orders, which is most orders older than a few days (auto-archived after fulfillment).
  var q = "status:any AND created_at:>='" + startUtc + "' AND created_at:<'" + endUtc + "'";

  while (hasNextPage) {
    var res = UrlFetchApp.fetch('https://' + domain + '/admin/api/' + SHOPIFY_API_VERSION + '/graphql.json', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Shopify-Access-Token': token },
      payload: JSON.stringify({ query: query, variables: { q: q, after: after } }),
      muteHttpExceptions: true
    });
    var json = JSON.parse(res.getContentText());
    if (json.errors) throw new Error('Shopify GraphQL error: ' + JSON.stringify(json.errors));

    var edges = json.data.orders.edges;
    for (var i = 0; i < edges.length; i++) {
      var node = edges[i].node;
      var appTitle = (node.channelInformation && node.channelInformation.app) ? node.channelInformation.app.title : '';
      if (appTitle !== SHOPIFY_APP_CHANNEL) continue;
      var date = toIstDateStr(node.createdAt);
      if (!map[date]) map[date] = { orders: 0, revenue: 0 };
      map[date].orders += 1;
      map[date].revenue += parseFloat(node.currentTotalPriceSet.shopMoney.amount) || 0;
    }
    hasNextPage = json.data.orders.pageInfo.hasNextPage;
    after = json.data.orders.pageInfo.endCursor;
  }
  return map;
}

// ── Sheet writer — touches only Sessions/ATC/IC/%/Orders/Revenue/AOV columns.
// RPP, RPP%, ci to rpp, rpp to order are left exactly as they are. ──

function writeToSheet(sessionsByDate, atcByDate, icByDate, ordersRevByDate) {
  var ss = SpreadsheetApp.openById(CRO_SHEET_ID);
  var sheet = ss.getSheetByName(FUNNEL_APP_TAB);
  if (!sheet) throw new Error('Tab not found: ' + FUNNEL_APP_TAB);

  // Row 1 is a title row, not headers — the real header row is row 2 (matches the existing
  // reader for this same tab in server/services/croSheets.js, which requests A2:R10000).
  var lastRow = Math.max(sheet.getLastRow(), 2);
  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var headers = data[0];

  function colIndex(label) {
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim().toLowerCase() === label.toLowerCase()) return i;
    }
    return -1;
  }

  var idx = {
    date: colIndex('Date'), sessions: colIndex('Sessions'), atc: colIndex('ATC'), ic: colIndex('IC'),
    orders: colIndex('Orders (App)'), atcPct: colIndex('ATC%'), icPct: colIndex('IC%'), cvrPct: colIndex('CVR%'),
    atcToCi: colIndex('atc to ci'), revenue: colIndex('Revenue(App)'), aov: colIndex('AOV')
  };
  if (idx.date === -1) throw new Error('Could not find Date column in ' + FUNNEL_APP_TAB);

  // Use the SPREADSHEET's timezone, not the script project's, to interpret existing Date-typed
  // cells — they can differ (script timezone defaults arbitrarily), and a mismatch here silently
  // matches a date to the wrong row, pairing one day's Sessions with a different day's ATC/IC
  // (this is what produces a nonsense ratio like ATC% > 1000%).
  var sheetTz = ss.getSpreadsheetTimeZone();
  var rowByDate = {};
  for (var r = 1; r < data.length; r++) {
    var cell = data[r][idx.date];
    var iso = cell instanceof Date ? Utilities.formatDate(cell, sheetTz, 'yyyy-MM-dd') : String(cell).slice(0, 10);
    if (iso) rowByDate[iso] = r + 2; // data[0] is sheet row 2, so data[r] is sheet row r+2
  }

  var allDates = {};
  [sessionsByDate, atcByDate, icByDate, ordersRevByDate].forEach(function (m) {
    Object.keys(m).forEach(function (d) { allDates[d] = true; });
  });

  Object.keys(allDates).sort().forEach(function (date) {
    var sessions = sessionsByDate[date] || 0;
    var atc = atcByDate[date] || 0;
    var ic = icByDate[date] || 0;
    var or = ordersRevByDate[date] || { orders: 0, revenue: 0 };

    // Raw fractions, not x100 — the sheet's %-formatted cells already multiply by 100 for
    // display (confirmed against the existing Jun 11-19 rows: e.g. 0.096 shows as "9.60%").
    // Writing an already-multiplied value here double-multiplies on display (14.5 -> "1450%").
    var atcPct = sessions > 0 ? (atc / sessions) : '';
    var icPct = sessions > 0 ? (ic / sessions) : '';
    var cvrPct = sessions > 0 ? (or.orders / sessions) : '';
    var atcToCi = atc > 0 ? (ic / atc) : '';
    var aov = or.orders > 0 ? (or.revenue / or.orders) : '';

    var rowNum = rowByDate[date];
    if (!rowNum) {
      rowNum = sheet.getLastRow() + 1;
      sheet.getRange(rowNum, idx.date + 1).setValue(date);
    }
    sheet.getRange(rowNum, idx.sessions + 1).setValue(sessions);
    sheet.getRange(rowNum, idx.atc + 1).setValue(atc);
    sheet.getRange(rowNum, idx.ic + 1).setValue(ic);
    sheet.getRange(rowNum, idx.atcPct + 1).setValue(atcPct);
    sheet.getRange(rowNum, idx.icPct + 1).setValue(icPct);
    sheet.getRange(rowNum, idx.cvrPct + 1).setValue(cvrPct);
    sheet.getRange(rowNum, idx.atcToCi + 1).setValue(atcToCi);
    sheet.getRange(rowNum, idx.orders + 1).setValue(or.orders);
    sheet.getRange(rowNum, idx.revenue + 1).setValue(or.revenue);
    sheet.getRange(rowNum, idx.aov + 1).setValue(aov);
  });
}

function testSyncAppFunnel() {
  syncAppFunnel();
  Logger.log('Done — check the Funnel(App) tab. RPP-related columns were left untouched.');
}
