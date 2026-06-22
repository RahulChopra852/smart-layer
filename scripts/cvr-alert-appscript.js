// ============================================================
// GNC Smart Layer — Web CVR Alert + Slash Command Bot
// Paste this into: https://script.google.com → New Project
// Deploy as Web App (Execute as: Me, Access: Anyone)
// Then set up triggers + Slack slash command (see setup instructions below)
// ============================================================

const CRO_SHEET_ID = '1uj4fNlMkPPqGFuHgJaKyOg__Abi46KB8F-0cq-t4TF4';
const SLACK_WEBHOOK = 'https://hooks.slack.com/services/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';
const CVR_DROP_THRESHOLD = 20;
const ALERT_LOG_TAB = 'CVR Alerts';

// ============================================================
// SLASH COMMAND HANDLER — /gnc
// Usage: /gnc cvr  →  buttons for Web / App
//        /gnc cvr web  →  web CVR directly
//        /gnc cvr app  →  app CVR directly
//        /gnc sessions  →  today's sessions
//        /gnc summary  →  full funnel snapshot
// ============================================================

function doPost(e) {
  var params = e.parameter;

  // Slack interactive button callback
  if (e.postData && e.postData.type === 'application/x-www-form-urlencoded') {
    var body = e.postData.contents;
    var decoded = decodeURIComponent(body);

    // Check if it's an interactive payload (button click)
    if (decoded.indexOf('payload=') === 0) {
      var payload = JSON.parse(decodeURIComponent(decoded.replace('payload=', '')));
      var action = payload.actions[0].value;
      var responseUrl = payload.response_url;

      var result = handleAction(action);
      sendDelayed(responseUrl, result);
      return ContentService.createTextOutput('');
    }
  }

  // Slash command
  var text = (params.text || '').trim().toLowerCase();
  var responseUrl = params.response_url;

  if (!text || text === 'help') {
    return jsonResponse({
      response_type: 'ephemeral',
      text: ':robot_face: *GNC Smart Layer Commands*\n'
        + '`/gnc cvr` — Conversion rate (pick Web or App)\n'
        + '`/gnc cvr web` — Web CVR directly\n'
        + '`/gnc cvr app` — App CVR directly\n'
        + '`/gnc sessions` — Today\'s sessions breakdown\n'
        + '`/gnc funnel` — Full funnel snapshot\n'
        + '`/gnc summary` — Everything at a glance'
    });
  }

  if (text === 'cvr') {
    return jsonResponse({
      response_type: 'in_channel',
      text: ':bar_chart: Which CVR do you want?',
      attachments: [{
        fallback: 'Choose Web or App CVR',
        callback_id: 'cvr_select',
        actions: [
          { name: 'cvr', text: ':globe_with_meridians: Web CVR', type: 'button', value: 'cvr_web', style: 'primary' },
          { name: 'cvr', text: ':iphone: App CVR', type: 'button', value: 'cvr_app' },
          { name: 'cvr', text: ':chart_with_upwards_trend: Both', type: 'button', value: 'cvr_both' }
        ]
      }]
    });
  }

  // Direct commands — respond immediately with "loading", then send full data via response_url
  if (responseUrl) {
    var action = text.replace(/\s+/g, '_');
    sendDelayedAsync(responseUrl, action);
    return jsonResponse({ response_type: 'in_channel', text: ':hourglass_flowing_sand: Fetching data...' });
  }

  var result = handleAction(text.replace(/\s+/g, '_'));
  return jsonResponse({ response_type: 'in_channel', text: result });
}

function handleAction(action) {
  if (action === 'cvr_web' || action === 'cvr web') return getCvrData('web');
  if (action === 'cvr_app' || action === 'cvr app') return getCvrData('app');
  if (action === 'cvr_both' || action === 'cvr both') return getCvrData('web') + '\n\n' + getCvrData('app');
  if (action === 'sessions') return getSessionsData();
  if (action === 'funnel') return getFunnelData();
  if (action === 'summary') return getCvrData('web') + '\n\n' + getCvrData('app') + '\n\n' + getSessionsData();
  return ':thinking_face: Unknown command. Try `/gnc help`';
}

function sendDelayed(responseUrl, text) {
  UrlFetchApp.fetch(responseUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ response_type: 'in_channel', text: text, replace_original: false }),
    muteHttpExceptions: true
  });
}

function sendDelayedAsync(responseUrl, action) {
  var result = handleAction(action);
  sendDelayed(responseUrl, result);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// DATA FETCHERS
// ============================================================

function getCroData() {
  var ss = SpreadsheetApp.openById(CRO_SHEET_ID);
  var sheet = ss.getSheetByName('CRO-Auto');
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var idx = {};
  var cols = ['date', 'sessions', 'web sess', 'app sess', 'atc', 'ic', 'rpp',
    'total orders', 'web orders', 'app orders', 'atc%', 'ic%', 'rpp%',
    'total cvr', 'web cvr', 'app cvr'];
  for (var c = 0; c < cols.length; c++) {
    idx[cols[c]] = findCol(headers, cols[c]);
  }

  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (r[idx['date']] && r[idx['date']] !== '') rows.push(r);
  }
  return { idx: idx, rows: rows };
}

function getCvrData(type) {
  var cro = getCroData();
  if (!cro || cro.rows.length < 2) return ':warning: Not enough CRO data';

  var latest = cro.rows[cro.rows.length - 1];
  var prev = cro.rows[cro.rows.length - 2];
  var idx = cro.idx;

  var cvrCol = type === 'web' ? 'web cvr' : 'app cvr';
  var sessCol = type === 'web' ? 'web sess' : 'app sess';
  var ordCol = type === 'web' ? 'web orders' : 'app orders';
  var label = type === 'web' ? ':globe_with_meridians: Web' : ':iphone: App';

  var currCvr = parseNum(latest[idx[cvrCol]]);
  var prevCvr = parseNum(prev[idx[cvrCol]]);
  var currDate = formatDate(latest[idx['date']]);
  var prevDate = formatDate(prev[idx['date']]);
  var sessions = idx[sessCol] !== -1 ? parseNum(latest[idx[sessCol]]) : null;
  var orders = idx[ordCol] !== -1 ? parseNum(latest[idx[ordCol]]) : null;

  if (isNaN(currCvr)) return ':warning: No ' + type + ' CVR data available';

  var changePct = prevCvr > 0 ? ((currCvr - prevCvr) / prevCvr) * 100 : 0;
  var arrow = changePct > 0 ? ':small_red_triangle:' : changePct < 0 ? ':small_red_triangle_down:' : ':left_right_arrow:';

  var msg = label + ' *CVR*\n'
    + '`' + currDate + '`: *' + currCvr.toFixed(2) + '%*  ' + arrow + ' ' + (changePct > 0 ? '+' : '') + changePct.toFixed(1) + '% vs ' + prevDate + ' (' + prevCvr.toFixed(2) + '%)';
  if (sessions != null && !isNaN(sessions)) msg += '\nSessions: ' + Math.round(sessions).toLocaleString();
  if (orders != null && !isNaN(orders)) msg += '  |  Orders: ' + Math.round(orders).toLocaleString();

  return msg;
}

function getSessionsData() {
  var cro = getCroData();
  if (!cro || cro.rows.length < 1) return ':warning: No session data';

  var latest = cro.rows[cro.rows.length - 1];
  var prev = cro.rows.length > 1 ? cro.rows[cro.rows.length - 2] : null;
  var idx = cro.idx;
  var date = formatDate(latest[idx['date']]);

  var total = parseNum(latest[idx['sessions']]);
  var web = parseNum(latest[idx['web sess']]);
  var app = parseNum(latest[idx['app sess']]);

  var msg = ':bar_chart: *Sessions* — `' + date + '`\n'
    + 'Total: *' + fmt(total) + '*\n'
    + ':globe_with_meridians: Web: *' + fmt(web) + '*\n'
    + ':iphone: App: *' + fmt(app) + '*';

  if (prev) {
    var prevTotal = parseNum(prev[idx['sessions']]);
    var pDate = formatDate(prev[idx['date']]);
    if (prevTotal > 0) {
      var chg = ((total - prevTotal) / prevTotal * 100).toFixed(1);
      msg += '\n_' + (chg > 0 ? '+' : '') + chg + '% vs ' + pDate + '_';
    }
  }
  return msg;
}

function getFunnelData() {
  var cro = getCroData();
  if (!cro || cro.rows.length < 1) return ':warning: No funnel data';

  var latest = cro.rows[cro.rows.length - 1];
  var idx = cro.idx;
  var date = formatDate(latest[idx['date']]);

  return ':funnel: *Funnel Snapshot* — `' + date + '`\n'
    + 'Sessions: *' + fmt(parseNum(latest[idx['sessions']])) + '*\n'
    + 'ATC: *' + fmt(parseNum(latest[idx['atc']])) + '* (' + safe(latest[idx['atc%']]) + ')\n'
    + 'IC: *' + fmt(parseNum(latest[idx['ic']])) + '* (' + safe(latest[idx['ic%']]) + ')\n'
    + 'RPP: *' + fmt(parseNum(latest[idx['rpp']])) + '* (' + safe(latest[idx['rpp%']]) + ')\n'
    + 'Orders: *' + fmt(parseNum(latest[idx['total orders']])) + '* (CVR: ' + safe(latest[idx['total cvr']]) + ')';
}

function fmt(n) {
  if (isNaN(n) || n == null) return '—';
  return Math.round(n).toLocaleString();
}

function safe(val) {
  if (val == null || val === '') return '—';
  var s = String(val);
  if (s.indexOf('%') === -1) {
    var n = parseFloat(s.replace(/,/g, ''));
    if (!isNaN(n)) return n.toFixed(2) + '%';
  }
  return s;
}

// ============================================================
// SCHEDULED ALERT (every 2 hours) — same as before
// ============================================================

function checkWebCVR() {
  var cro = getCroData();
  if (!cro || cro.rows.length < 2) {
    postToSlack(':warning: Not enough CRO data for CVR comparison');
    return;
  }

  var latest = cro.rows[cro.rows.length - 1];
  var previous = cro.rows[cro.rows.length - 2];
  var idx = cro.idx;

  var currCvr = parseNum(latest[idx['web cvr']]);
  var prevCvr = parseNum(previous[idx['web cvr']]);
  var currDate = formatDate(latest[idx['date']]);
  var prevDate = formatDate(previous[idx['date']]);
  var webSess = idx['web sess'] !== -1 ? parseNum(latest[idx['web sess']]) : null;
  var orders = idx['total orders'] !== -1 ? parseNum(latest[idx['total orders']]) : null;

  if (isNaN(currCvr) || isNaN(prevCvr) || prevCvr === 0) {
    postToSlack(':warning: CVR values not usable — curr: ' + currCvr + ', prev: ' + prevCvr);
    return;
  }

  var changePct = ((currCvr - prevCvr) / prevCvr) * 100;
  var isAlert = changePct <= -CVR_DROP_THRESHOLD;

  logCheck(currDate, currCvr, prevDate, prevCvr, changePct, isAlert);

  if (isAlert) {
    var msg = ':rotating_light: *Web CVR ALERT*\n'
      + 'Dropped *' + Math.abs(changePct).toFixed(1) + '%* day-over-day\n'
      + '`' + prevDate + '`: ' + prevCvr.toFixed(2) + '%  →  `' + currDate + '`: ' + currCvr.toFixed(2) + '%\n';
    if (webSess != null) msg += 'Web Sessions: ' + Math.round(webSess).toLocaleString() + '\n';
    if (orders != null) msg += 'Orders: ' + Math.round(orders).toLocaleString() + '\n';
    msg += '_Threshold: >' + CVR_DROP_THRESHOLD + '% drop_';
    postToSlack(msg);
  } else if (shouldPostDailySummary()) {
    var emoji = changePct > 0 ? ':chart_with_upwards_trend:' : changePct < -5 ? ':chart_with_downwards_trend:' : ':white_check_mark:';
    var msg = emoji + ' *Web CVR Daily Check*\n'
      + '`' + currDate + '`: *' + currCvr.toFixed(2) + '%*  (' + (changePct > 0 ? '+' : '') + changePct.toFixed(1) + '% vs ' + prevDate + ')';
    if (webSess != null) msg += '\nWeb Sessions: ' + Math.round(webSess).toLocaleString();
    if (orders != null) msg += '  |  Orders: ' + Math.round(orders).toLocaleString();
    postToSlack(msg);
  }
}

// ============================================================
// UTILITIES
// ============================================================

function findCol(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === name) return i;
  }
  return -1;
}

function parseNum(val) {
  if (val === '' || val == null) return NaN;
  return parseFloat(String(val).replace(/[%,]/g, ''));
}

function formatDate(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    var parts = s.split('/');
    return parts[2] + '-' + parts[0].padStart(2, '0') + '-' + parts[1].padStart(2, '0');
  }
  return s;
}

function shouldPostDailySummary() {
  var now = new Date();
  var hour = now.getHours();
  return hour >= 8 && hour < 10;
}

function logCheck(currDate, currCvr, prevDate, prevCvr, changePct, isAlert) {
  var ss = SpreadsheetApp.openById(CRO_SHEET_ID);
  var logSheet = ss.getSheetByName(ALERT_LOG_TAB);

  if (!logSheet) {
    logSheet = ss.insertSheet(ALERT_LOG_TAB);
    logSheet.appendRow(['Checked At', 'Date', 'Web CVR', 'Prev Date', 'Prev CVR', 'Change %', 'Status']);
    logSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  }

  logSheet.appendRow([
    new Date(), currDate, currCvr.toFixed(2) + '%', prevDate,
    prevCvr.toFixed(2) + '%', changePct.toFixed(1) + '%', isAlert ? 'ALERT' : 'OK'
  ]);
}

function postToSlack(text) {
  UrlFetchApp.fetch(SLACK_WEBHOOK, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true
  });
}

function testAlert() {
  postToSlack(':test_tube: *GNC Smart Layer* — CVR Alert system connected! Checking every 2 hours.');
  checkWebCVR();
}

function testSlashCommand() {
  Logger.log(getCvrData('web'));
  Logger.log(getCvrData('app'));
  Logger.log(getSessionsData());
  Logger.log(getFunnelData());
}
