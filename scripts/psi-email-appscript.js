// ============================================================
// GNC Smart Layer — PSI Web Vitals Email Parser
// Reads the daily "PSI Web Vitals Degradation" email, parses
// the HTML table, and writes a per-page summary to the Dashboard DB sheet.
//
// Setup:
//   1. Paste into https://script.google.com (same or new project)
//   2. Deploy → Triggers → parsePsiEmail → Time-driven → Day timer → 6pm-7pm
//   3. Run testPsiParse() once to grant Gmail + Sheets permissions
// ============================================================

var DASHBOARD_SHEET_ID = '1CQg8P2jxdO9mWrB2-bP_zrrUWFQ2HgfFvQ5imGk2fbE';
var PSI_TAB = 'psi_daily';
var SENDER_EMAIL = 'rahul.chopra@oneguardian.in';
var SUBJECT_MATCH = 'PSI Web Vitals Degradation';

function parsePsiEmail() {
  var threads = GmailApp.search('from:' + SENDER_EMAIL + ' subject:"' + SUBJECT_MATCH + '" newer_than:2d', 0, 1);
  if (threads.length === 0) {
    Logger.log('No PSI email found in last 2 days');
    return;
  }

  var messages = threads[0].getMessages();
  var latest = messages[messages.length - 1];
  var html = latest.getBody();
  var emailDate = Utilities.formatDate(latest.getDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var rows = parseHtmlTable(html, emailDate);
  if (rows.length === 0) {
    Logger.log('No data parsed from email');
    return;
  }

  writeToDashboard(rows, emailDate);
  Logger.log('Wrote ' + rows.length + ' page entries for ' + emailDate);
}

function parseHtmlTable(html, date) {
  // Extract all <tr>...</tr> blocks
  var trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  var tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  var pageData = {};
  var match;

  while ((match = trRegex.exec(html)) !== null) {
    var rowHtml = match[1];
    // Skip header rows
    if (rowHtml.indexOf('<th') >= 0) continue;

    var cells = [];
    var tdMatch;
    tdRegex.lastIndex = 0;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    // Expect: Page, Metric, Today, 3DayAvg, Change, Status
    if (cells.length < 6) continue;

    var page = cells[0];
    var metric = cells[1].toLowerCase();
    var today = parseFloat(cells[2]);
    var avg3d = parseFloat(cells[3]);
    var status = cells[5];

    if (!page || isNaN(today)) continue;

    if (!pageData[page]) {
      pageData[page] = {
        page: page, lcp: '', fcp: '', inp: '', cls: '', ttfb: '',
        speed_index: '', performance: '', lcp_avg3d: '', fcp_avg3d: '',
        perf_avg3d: '', alertList: []
      };
    }

    var p = pageData[page];
    if (metric === 'lcp') { p.lcp = today; p.lcp_avg3d = avg3d; }
    else if (metric === 'fcp') { p.fcp = today; p.fcp_avg3d = avg3d; }
    else if (metric === 'inp') { p.inp = today; }
    else if (metric === 'cls') { p.cls = today; }
    else if (metric === 'ttfb') { p.ttfb = today; }
    else if (metric === 'speedindex') { p.speed_index = today; }
    else if (metric === 'performance') { p.performance = today; p.perf_avg3d = avg3d; }

    if (status.indexOf('ALERT') >= 0) {
      p.alertList.push(metric.toUpperCase());
    }
  }

  var rows = [];
  for (var key in pageData) {
    var p = pageData[key];
    rows.push({
      date: date,
      page: p.page,
      lcp: p.lcp,
      fcp: p.fcp,
      inp: p.inp,
      cls: p.cls,
      ttfb: p.ttfb,
      speed_index: p.speed_index,
      performance: p.performance,
      lcp_avg3d: p.lcp_avg3d,
      fcp_avg3d: p.fcp_avg3d,
      perf_avg3d: p.perf_avg3d,
      alerts: p.alertList.join(', ')
    });
  }
  return rows;
}

function writeToDashboard(rows, date) {
  var ss = SpreadsheetApp.openById(DASHBOARD_SHEET_ID);
  var sheet = ss.getSheetByName(PSI_TAB);

  if (!sheet) {
    sheet = ss.insertSheet(PSI_TAB);
    sheet.appendRow(['date', 'page', 'lcp', 'fcp', 'inp', 'cls', 'ttfb', 'speed_index', 'performance', 'lcp_avg3d', 'fcp_avg3d', 'perf_avg3d', 'alerts']);
    sheet.getRange(1, 1, 1, 13).setFontWeight('bold');
  }

  // Remove existing rows for this date to avoid duplicates
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    var rowDate = data[i][0];
    if (rowDate instanceof Date) {
      rowDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    if (String(rowDate) === date) {
      sheet.deleteRow(i + 1);
    }
  }

  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    sheet.appendRow([
      row.date, row.page, row.lcp, row.fcp, row.inp, row.cls,
      row.ttfb, row.speed_index, row.performance,
      row.lcp_avg3d, row.fcp_avg3d, row.perf_avg3d, row.alerts
    ]);
  }
}

function testPsiParse() {
  parsePsiEmail();
  Logger.log('Done — check the psi_daily tab in your Dashboard sheet');
}
