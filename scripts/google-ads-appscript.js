// Google Apps Script — Google Ads Report Parser
// Reads Campaign report & Ad group report from Drive folder (or Gmail),
// parses daily data, writes to Dashboard DB sheet.
//
// Setup:
// 1. Create new Apps Script project at script.google.com
// 2. Paste this entire file
// 3. Set a daily trigger for processGoogleAdsReports() at ~9:30 AM
// 4. Grant Drive + Sheets + Gmail permissions

const GADS_DASHBOARD_SHEET_ID = '1CQg8P2jxdO9mWrB2-bP_zrrUWFQ2HgfFvQ5imGk2fbE';
const GADS_DAILY_TAB = 'google_ads_daily';
const GADS_CAMPAIGNS_TAB = 'google_ads_campaigns';
const GADS_DRIVE_FOLDER_ID = '1b5U-zGDoa1sBovYRFKkcFOcTdh5c4Pt2';

const GADS_DAILY_HEADERS = [
  'date', 'total_cost', 'total_impressions', 'total_clicks', 'total_conversions', 'total_conv_value', 'roas',
  'search_cost', 'search_conv_value', 'search_roas',
  'pmax_cost', 'pmax_conv_value', 'pmax_roas',
  'video_cost', 'video_impressions',
  'app_cost', 'app_conversions',
  'demandgen_cost', 'demandgen_conv_value',
  'synced_at'
];

const GADS_CAMPAIGN_HEADERS = [
  'date', 'campaign_name', 'campaign_type', 'status', 'budget', 'cost', 'impressions', 'clicks',
  'conversions', 'conv_value', 'roas', 'cpc', 'conv_rate', 'bid_strategy'
];

function processGoogleAdsReports() {
  const ss = SpreadsheetApp.openById(GADS_DASHBOARD_SHEET_ID);
  const dailyTab = ensureTab_(ss, GADS_DAILY_TAB, GADS_DAILY_HEADERS);
  const campaignsTab = ensureTab_(ss, GADS_CAMPAIGNS_TAB, GADS_CAMPAIGN_HEADERS);
  const existingDates = getExistingDates_(dailyTab);

  // Try Drive folder first, then Gmail
  var files = getReportFilesFromDrive_();
  if (!files.length) {
    files = getReportFilesFromGmail_();
  }

  if (!files.length) {
    Logger.log('No Google Ads report files found');
    return;
  }

  let processed = 0;
  for (const file of files) {
    const reportDate = file.date;
    if (existingDates.has(reportDate)) {
      Logger.log('Already have data for ' + reportDate + ', skipping');
      continue;
    }

    try {
      const campaigns = parseCampaignReport_(file.content);
      if (!campaigns.length) {
        Logger.log('No campaign data parsed for ' + reportDate);
        continue;
      }

      // Write daily summary
      const summary = buildDailySummary_(campaigns, reportDate);
      dailyTab.appendRow(summary);

      // Write active campaigns (cost > 0)
      const activeCampaigns = campaigns.filter(c => c.cost > 0);
      if (activeCampaigns.length) {
        const rows = activeCampaigns
          .sort((a, b) => b.cost - a.cost)
          .map(c => [
            reportDate, c.name, c.type, c.status, c.budget, c.cost.toFixed(2),
            c.impressions, c.clicks, c.conversions.toFixed(2), c.convValue.toFixed(2),
            c.roas.toFixed(2), c.cpc.toFixed(2), c.convRate.toFixed(2), c.bidStrategy
          ]);
        campaignsTab.getRange(campaignsTab.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      }

      existingDates.add(reportDate);
      processed++;
      Logger.log('Wrote Google Ads data for ' + reportDate + ' (' + activeCampaigns.length + ' active campaigns, total cost: ' + summary[1] + ')');
    } catch (e) {
      Logger.log('Error processing ' + reportDate + ': ' + e.message);
    }
  }

  Logger.log('Done — processed ' + processed + ' new date(s)');
}

// ── Get report files from Drive folder ──

function getReportFilesFromDrive_() {
  var results = [];
  try {
    var folder = DriveApp.getFolderById(GADS_DRIVE_FOLDER_ID);
    var files = folder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var name = file.getName().toLowerCase();
      if (!name.includes('campaign')) continue;

      var content = '';
      var mimeType = file.getMimeType();
      if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        var sheet = SpreadsheetApp.openById(file.getId());
        var data = sheet.getSheets()[0].getDataRange().getValues();
        content = data.map(function(row) { return row.join(','); }).join('\n');
      } else if (mimeType === 'text/csv' || name.endsWith('.csv')) {
        content = file.getBlob().getDataAsString();
      } else {
        continue;
      }

      var dateStr = extractDateFromReport_(content);
      if (dateStr && !name.includes('ad group')) {
        results.push({ date: dateStr, content: content, source: 'drive' });
      }
    }
  } catch (e) {
    Logger.log('Drive folder error: ' + e.message);
  }
  return results;
}

// ── Fallback: get from Gmail ──

function getReportFilesFromGmail_() {
  var results = [];
  var threads = GmailApp.search('from:ads-account-noreply@google.com subject:"Campaign report" newer_than:7d', 0, 5);
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      var attachments = messages[m].getAttachments();
      for (var a = 0; a < attachments.length; a++) {
        if (attachments[a].getName().toLowerCase().includes('.csv')) {
          var content = attachments[a].getDataAsString();
          var dateStr = extractDateFromReport_(content);
          if (dateStr) {
            results.push({ date: dateStr, content: content, source: 'gmail' });
          }
        }
      }
    }
  }
  return results;
}

// ── Extract date from report header ──

function extractDateFromReport_(content) {
  // Line 2 has format: "June 26, 2026 - June 26, 2026"
  var lines = content.split('\n');
  if (lines.length < 3) return null;

  var dateLine = lines[1].replace(/"/g, '').trim();
  var match = dateLine.match(/(\w+ \d+, \d{4})\s*-\s*(\w+ \d+, \d{4})/);
  if (!match) return null;

  var d = new Date(match[1]);
  if (isNaN(d.getTime())) return null;

  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// ── Parse campaign report CSV ──

function parseCampaignReport_(content) {
  var lines = content.split('\n');
  if (lines.length < 4) return [];

  // Find header row (line 3, index 2)
  var headerLine = lines[2];
  var headers = splitCsvLine_(headerLine);
  var colIdx = {};
  headers.forEach(function(h, i) {
    colIdx[h.trim().toLowerCase().replace(/\s+/g, '_')] = i;
  });

  var campaigns = [];
  for (var i = 3; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    // Skip total/summary rows
    if (line.startsWith('Total:') || line.startsWith('"Total:')) continue;

    var vals = splitCsvLine_(line);

    var getName = function(keys) {
      for (var k = 0; k < keys.length; k++) {
        for (var col in colIdx) {
          if (col.includes(keys[k])) return (vals[colIdx[col]] || '').trim();
        }
      }
      return '';
    };
    var getNum = function(keys) {
      var v = getName(keys).replace(/,/g, '').replace(/[₹$%]/g, '').trim();
      if (v === '--' || v === '' || v === ' --') return 0;
      return parseFloat(v) || 0;
    };

    var name = getName(['campaign']);
    if (!name) continue;

    var cost = getNum(['cost']);
    // Skip header-like rows
    if (name === 'Campaign') continue;

    campaigns.push({
      name: name,
      status: getName(['campaign_status']),
      type: getName(['campaign_type']),
      budget: getNum(['budget']),
      cost: cost,
      impressions: getNum(['impr']),
      clicks: getNum(['clicks']),
      conversions: getNum(['conversions']),
      convValue: getNum(['conv._value', 'conv_value']),
      roas: getNum(['conv._value_/_cost', 'conv_value_/_cost']),
      cpc: getNum(['avg._cpc', 'avg_cpc']),
      convRate: getNum(['conv._rate', 'conv_rate']),
      bidStrategy: getName(['bid_strategy']),
    });
  }

  return campaigns;
}

// ── Build daily summary ──

function buildDailySummary_(campaigns, date) {
  var total = { cost: 0, impr: 0, clicks: 0, conv: 0, convVal: 0 };
  var byType = {};

  campaigns.forEach(function(c) {
    total.cost += c.cost;
    total.impr += c.impressions;
    total.clicks += c.clicks;
    total.conv += c.conversions;
    total.convVal += c.convValue;

    var type = (c.type || 'Other').toLowerCase().replace(/\s+/g, '');
    if (!byType[type]) byType[type] = { cost: 0, convVal: 0, impr: 0, conv: 0 };
    byType[type].cost += c.cost;
    byType[type].convVal += c.convValue;
    byType[type].impr += c.impressions;
    byType[type].conv += c.conversions;
  });

  var roas = total.cost > 0 ? (total.convVal / total.cost).toFixed(2) : 0;

  var getType = function(key) { return byType[key] || { cost: 0, convVal: 0, impr: 0, conv: 0 }; };
  var typeRoas = function(t) { return t.cost > 0 ? (t.convVal / t.cost).toFixed(2) : 0; };

  var search = getType('search');
  var pmax = getType('performancemax');
  var video = getType('video');
  var app = getType('app');
  var demandgen = getType('demandgen');

  return [
    date,
    total.cost.toFixed(2), total.impr, total.clicks, total.conv.toFixed(2), total.convVal.toFixed(2), roas,
    search.cost.toFixed(2), search.convVal.toFixed(2), typeRoas(search),
    pmax.cost.toFixed(2), pmax.convVal.toFixed(2), typeRoas(pmax),
    video.cost.toFixed(2), video.impr,
    app.cost.toFixed(2), app.conv.toFixed(2),
    demandgen.cost.toFixed(2), demandgen.convVal.toFixed(2),
    new Date().toISOString()
  ];
}

// ── Helpers ──

function ensureTab_(ss, name, headers) {
  var tab = ss.getSheetByName(name);
  if (!tab) {
    tab = ss.insertSheet(name);
    tab.appendRow(headers);
  }
  return tab;
}

function getExistingDates_(tab) {
  var data = tab.getDataRange().getValues();
  var dates = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) dates[String(data[i][0])] = true;
  }
  // Convert to Set-like object
  return {
    has: function(d) { return !!dates[d]; },
    add: function(d) { dates[d] = true; }
  };
}

function splitCsvLine_(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line.charAt(i);
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

// Manual trigger: reprocess all
function reprocessAllGoogleAds() {
  var ss = SpreadsheetApp.openById(GADS_DASHBOARD_SHEET_ID);
  [GADS_DAILY_TAB, GADS_CAMPAIGNS_TAB].forEach(function(tabName) {
    var tab = ss.getSheetByName(tabName);
    if (tab && tab.getLastRow() > 1) {
      tab.getRange(2, 1, tab.getLastRow() - 1, tab.getLastColumn()).clear();
    }
  });
  processGoogleAdsReports();
}
