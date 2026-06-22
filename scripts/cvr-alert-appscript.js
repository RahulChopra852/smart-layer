// ============================================================
// GNC Smart Layer — Web CVR Alert (Google Apps Script)
// Paste this into: https://script.google.com → New Project
// Then: Triggers → Add Trigger → checkWebCVR → Time-driven → Every 2 hours
// ============================================================

const CRO_SHEET_ID = '1uj4fNlMkPPqGFuHgJaKyOg__Abi46KB8F-0cq-t4TF4';
const SLACK_WEBHOOK = 'https://hooks.slack.com/services/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';
const CVR_DROP_THRESHOLD = 20; // alert if Web CVR drops more than 20% vs previous day
const ALERT_LOG_TAB = 'CVR Alerts';

function checkWebCVR() {
  var ss = SpreadsheetApp.openById(CRO_SHEET_ID);
  var sheet = ss.getSheetByName('CRO-Auto');
  if (!sheet) { postToSlack(':warning: CRO-Auto tab not found'); return; }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var dateIdx = findCol(headers, 'date');
  var webCvrIdx = findCol(headers, 'web cvr');
  var webSessIdx = findCol(headers, 'web sess');
  var ordersIdx = findCol(headers, 'total orders');

  if (dateIdx === -1 || webCvrIdx === -1) {
    postToSlack(':warning: Could not find Date or Web CVR column in CRO-Auto');
    return;
  }

  // Filter valid rows (skip header, skip empty)
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (r[dateIdx] && r[webCvrIdx] !== '' && r[webCvrIdx] != null) {
      rows.push(r);
    }
  }

  if (rows.length < 2) {
    postToSlack(':warning: Not enough CRO data for CVR comparison');
    return;
  }

  var latest = rows[rows.length - 1];
  var previous = rows[rows.length - 2];

  var currCvr = parseNum(latest[webCvrIdx]);
  var prevCvr = parseNum(previous[webCvrIdx]);
  var currDate = formatDate(latest[dateIdx]);
  var prevDate = formatDate(previous[dateIdx]);
  var webSess = webSessIdx !== -1 ? parseNum(latest[webSessIdx]) : null;
  var orders = ordersIdx !== -1 ? parseNum(latest[ordersIdx]) : null;

  if (isNaN(currCvr) || isNaN(prevCvr) || prevCvr === 0) {
    postToSlack(':warning: CVR values not usable — curr: ' + currCvr + ', prev: ' + prevCvr);
    return;
  }

  var changePct = ((currCvr - prevCvr) / prevCvr) * 100;
  var isAlert = changePct <= -CVR_DROP_THRESHOLD;

  // Log every check
  logCheck(currDate, currCvr, prevDate, prevCvr, changePct, isAlert);

  // Post to Slack
  if (isAlert) {
    var msg = ':rotating_light: *Web CVR ALERT*\n'
      + 'Dropped *' + Math.abs(changePct).toFixed(1) + '%* day-over-day\n'
      + '`' + prevDate + '`: ' + prevCvr.toFixed(2) + '%  →  `' + currDate + '`: ' + currCvr.toFixed(2) + '%\n';
    if (webSess != null) msg += 'Web Sessions: ' + Math.round(webSess).toLocaleString() + '\n';
    if (orders != null) msg += 'Orders: ' + Math.round(orders).toLocaleString() + '\n';
    msg += '_Threshold: >' + CVR_DROP_THRESHOLD + '% drop_';
    postToSlack(msg);
  } else {
    // Quiet status — only post once daily (at the first check of the day)
    if (shouldPostDailySummary()) {
      var emoji = changePct > 0 ? ':chart_with_upwards_trend:' : changePct < -5 ? ':chart_with_downwards_trend:' : ':white_check_mark:';
      var msg = emoji + ' *Web CVR Daily Check*\n'
        + '`' + currDate + '`: *' + currCvr.toFixed(2) + '%*  (' + (changePct > 0 ? '+' : '') + changePct.toFixed(1) + '% vs ' + prevDate + ')';
      if (webSess != null) msg += '\nWeb Sessions: ' + Math.round(webSess).toLocaleString();
      if (orders != null) msg += '  |  Orders: ' + Math.round(orders).toLocaleString();
      postToSlack(msg);
    }
  }
}

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
  // Post daily summary between 8-10 AM (first trigger of the day)
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
    new Date(),
    currDate,
    currCvr.toFixed(2) + '%',
    prevDate,
    prevCvr.toFixed(2) + '%',
    changePct.toFixed(1) + '%',
    isAlert ? 'ALERT' : 'OK'
  ]);
}

function postToSlack(text) {
  var payload = JSON.stringify({ text: text });
  UrlFetchApp.fetch(SLACK_WEBHOOK, {
    method: 'post',
    contentType: 'application/json',
    payload: payload,
    muteHttpExceptions: true
  });
}

// Manual test — run this to verify everything works
function testAlert() {
  postToSlack(':test_tube: *GNC Smart Layer* — CVR Alert system connected! Checking every 2 hours.');
  checkWebCVR();
}
