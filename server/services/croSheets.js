import { google } from 'googleapis';
import 'dotenv/config';

// Source workbook — the existing CRO-Auto / Funnel App / Real time webvitals sheet.
// This is READ-ONLY access (Viewer share needed for the service account, per SPEC.md setup).
const SOURCE_SPREADSHEET_ID = process.env.CRO_SOURCE_SPREADSHEET_ID || '1uj4fNlMkPPqGFuHgJaKyOg__Abi46KB8F-0cq-t4TF4';
const ANOMALY_SPREADSHEET_ID = process.env.ANOMALY_SPREADSHEET_ID || '1gvK7RRYnCffvfuLTHA8wwG4kylEkBPI6TlnfgvULwss';

let sheetsClient = null;
async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const authClient = await auth.getClient();
  sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  return sheetsClient;
}

function parseDateCell(val) {
  // Sheet dates may come through as serial numbers or strings depending on cell formatting.
  // Normalize to YYYY-MM-DD. If it's already a string date, pass through; numeric serials are
  // intentionally NOT auto-converted here — if this fires, the raw value is logged so it's visible
  // rather than silently producing a wrong date.
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  if (typeof val === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(val)) {
    const [m, d, y] = val.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // "Mon D, YYYY" format (e.g. "Jul 1, 2025") — use UTC to avoid timezone shift
  if (typeof val === 'string') {
    const parts = Date.parse(val + ' UTC');
    if (!isNaN(parts)) {
      return new Date(parts).toISOString().slice(0, 10);
    }
  }
  return val;
}

function toNum(val) {
  if (val === '' || val == null) return null;
  const n = parseFloat(String(val).replace(/[%,]/g, ''));
  return isNaN(n) ? null : n;
}

// Reads the "CRO-Auto" tab (web channel) since a given date.
// Column layout confirmed from prior session (see chat history) — columns A,B,C,D,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC
// per the user-provided screenshot: Date, Sessions, ATC, IC, RPP, ATC%, IC%, RPP%, CVR%, Comments etc.
// IMPORTANT: column letters are read from the live header row at runtime, NOT hardcoded by position,
// to avoid silently breaking if the source sheet's columns shift.
export async function fetchCroWebSince(sinceDate, tabName = 'CRO-Auto') {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SOURCE_SPREADSHEET_ID,
    range: `'${tabName}'!A1:AC10000`
  });
  const values = res.data.values || [];
  if (values.length < 2) return [];

  const headerRow = values[0];
  const colIndex = (label) => headerRow.findIndex(h => (h || '').trim().toLowerCase() === label.toLowerCase());

  const idx = {
    date: colIndex('Date'),
    sessions: colIndex('Sessions'),
    webSess: colIndex('Web Sess'),
    appSess: colIndex('App Sess'),
    atc: colIndex('ATC'),
    ic: colIndex('IC'),
    rpp: colIndex('RPP'),
    orders: colIndex('Total Orders'),
    webOrders: colIndex('Web Orders'),
    appOrders: colIndex('App Orders'),
    atcPct: colIndex('ATC%'),
    icPct: colIndex('IC%'),
    rppPct: colIndex('RPP%'),
    cvrPct: colIndex('Total CVR'),
    webCvr: colIndex('Web CVR'),
    appCvr: colIndex('App CVR'),
    atcToCi: colIndex('ATC to CI'),
    ciToRpp: colIndex('CI to RPP'),
    rppToOrd: colIndex('RPP to Ord'),
    comment: colIndex('Comments')
  };

  if (idx.date === -1) {
    throw new Error(`CRO-Auto sheet: could not find 'Date' column in header row — schema may have changed. Header was: ${headerRow.join(', ')}`);
  }

  const rows = [];
  for (let i = 2; i < values.length; i++) { // skip header(0) and formula-total row(1), per known sheet structure
    const row = values[i];
    if (!row || !row[idx.date]) continue;
    const date = parseDateCell(row[idx.date]);
    if (sinceDate && date <= sinceDate) continue;

    rows.push([
      date, 'web',
      toNum(row[idx.sessions]), toNum(row[idx.webSess]), toNum(row[idx.appSess]),
      toNum(row[idx.atc]), toNum(row[idx.ic]), toNum(row[idx.rpp]),
      toNum(row[idx.orders]), toNum(row[idx.webOrders]), toNum(row[idx.appOrders]),
      toNum(row[idx.atcPct]), toNum(row[idx.icPct]), toNum(row[idx.rppPct]),
      toNum(row[idx.cvrPct]), toNum(row[idx.webCvr]), toNum(row[idx.appCvr]),
      toNum(row[idx.atcToCi]), toNum(row[idx.ciToRpp]), toNum(row[idx.rppToOrd]),
      idx.comment !== -1 ? (row[idx.comment] || '') : ''
    ]);
  }
  return rows;
}

// Reads the "Funnel APP" tab (app channel), same incremental + dynamic-header pattern.
export async function fetchCroAppSince(sinceDate, tabName = 'Funnel(App)') {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SOURCE_SPREADSHEET_ID,
    range: `'${tabName}'!A2:R10000`
  });
  const values = res.data.values || [];
  if (values.length < 2) return [];

  const headerRow = values[0];
  const colIndex = (label) => headerRow.findIndex(h => (h || '').trim().toLowerCase() === label.toLowerCase());

  const idx = {
    date: colIndex('Date'),
    sessions: colIndex('Sessions'),
    atc: colIndex('ATC'),
    ic: colIndex('IC'),
    rpp: colIndex('RPP'),
    orders: colIndex('Orders (App)'),
    atcPct: colIndex('ATC%'),
    icPct: colIndex('IC%'),
    rppPct: colIndex('RPP%'),
    cvrPct: colIndex('CVR%'),
    atcToCi: colIndex('atc to ci'),
    ciToRpp: colIndex('ci to rpp'),
    rppToOrd: colIndex('rpp to order'),
    revenue: colIndex('Revenue(App)'),
    aov: colIndex('AOV')
  };

  if (idx.date === -1) {
    throw new Error(`Funnel APP sheet: could not find 'Date' column in header row — schema may have changed. Header was: ${headerRow.join(', ')}`);
  }

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || !row[idx.date]) continue;
    const date = parseDateCell(row[idx.date]);
    if (sinceDate && date <= sinceDate) continue;

    rows.push([
      date, 'app',
      toNum(row[idx.sessions]), null, null,
      toNum(row[idx.atc]), toNum(row[idx.ic]), toNum(row[idx.rpp]),
      toNum(row[idx.orders]), null, null,
      toNum(row[idx.atcPct]), toNum(row[idx.icPct]), toNum(row[idx.rppPct]), toNum(row[idx.cvrPct]),
      null, null,
      toNum(row[idx.atcToCi]), toNum(row[idx.ciToRpp]), toNum(row[idx.rppToOrd]),
      ''
    ]);
  }
  return rows;
}

// Reads "Real time webvitals" tab since a given run timestamp.
export async function fetchWebVitalsSince(sinceRunAt, tabName = 'Real time webvitals') {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SOURCE_SPREADSHEET_ID,
    range: `'${tabName}'!A1:N20000`
  });
  const values = res.data.values || [];
  if (values.length < 2) return [];

  const headerRow = values[0];
  const colIndex = (label) => headerRow.findIndex(h => (h || '').trim().toLowerCase().startsWith(label.toLowerCase()));

  const idx = {
    date: colIndex('Date'),
    pageTitle: colIndex('Page Title'),
    url: colIndex('URL'),
    lcp: colIndex('LCP'),
    fcp: colIndex('FCP'),
    inp: colIndex('INP'),
    cls: colIndex('CLS'),
    ttfb: colIndex('TTFB'),
    speedIndex: colIndex('Speed Index'),
    performance: colIndex('Performance')
  };

  if (idx.date === -1) {
    throw new Error(`Real time webvitals sheet: could not find 'Date' column — schema may have changed. Header was: ${headerRow.join(', ')}`);
  }

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || !row[idx.date]) continue;
    const runAt = row[idx.date]; // kept as-is (includes time), not date-normalized — used as a unique key
    if (sinceRunAt && runAt <= sinceRunAt) continue;

    rows.push([
      runAt,
      idx.pageTitle !== -1 ? row[idx.pageTitle] : '',
      idx.url !== -1 ? row[idx.url] : '',
      toNum(row[idx.lcp]), toNum(row[idx.fcp]), toNum(row[idx.inp]), toNum(row[idx.cls]),
      toNum(row[idx.ttfb]), toNum(row[idx.speedIndex]), toNum(row[idx.performance])
    ]);
  }
  return rows;
}

// Reads unique visitors from the anomaly sheet's daily tabs.
export async function fetchDailyVisitors(date) {
  const sheets = await getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: ANOMALY_SPREADSHEET_ID,
      range: `'${date}'!A1:C500`
    });
    const values = res.data.values || [];
    if (values.length < 2) return null;
    let total = 0;
    for (let i = 1; i < values.length; i++) {
      total += parseInt(String(values[i][2] || '0').replace(/,/g, ''), 10) || 0;
    }
    return total;
  } catch {
    return null;
  }
}

// Reads anomalies from the Anomaly_Log sheet (session drops, ATC changes by page).
export async function fetchAnomalies(sinceDate) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ANOMALY_SPREADSHEET_ID,
    range: 'Anomaly_Log!A2:J10000'
  });
  const values = res.data.values || [];
  return values
    .filter(row => row[0] && (!sinceDate || row[0] >= sinceDate))
    .map(row => ({
      date: row[0],
      page: row[1] || '',
      type: row[2] || '',
      session_delta: toNum(row[3]),
      atc_delta: toNum(row[4]),
      yesterday_sessions: toNum(row[5]),
      last_7d_sessions: toNum(row[6]),
      prev_7d_sessions: toNum(row[7]),
      trend: toNum(row[8]),
      impact: toNum(row[9]),
    }));
}

export async function fetchCroWebForDate(date) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SOURCE_SPREADSHEET_ID,
    range: `'CRO-Auto'!A1:AC10000`
  });
  const values = res.data.values || [];
  if (values.length < 2) return null;

  const headerRow = values[0];
  const colIndex = (label) => headerRow.findIndex(h => (h || '').trim().toLowerCase() === label.toLowerCase());
  const idx = {
    date: colIndex('Date'), sessions: colIndex('Sessions'), webSess: colIndex('Web Sess'),
    appSess: colIndex('App Sess'), atc: colIndex('ATC'), ic: colIndex('IC'), rpp: colIndex('RPP'),
    orders: colIndex('Total Orders'), webOrders: colIndex('Web Orders'), appOrders: colIndex('App Orders'),
    atcPct: colIndex('ATC%'), icPct: colIndex('IC%'), rppPct: colIndex('RPP%'),
    cvrPct: colIndex('Total CVR'), webCvr: colIndex('Web CVR'), appCvr: colIndex('App CVR'),
    atcToCi: colIndex('ATC to CI'), ciToRpp: colIndex('CI to RPP'), rppToOrd: colIndex('RPP to Ord'),
    comment: colIndex('Comments')
  };

  for (let i = 2; i < values.length; i++) {
    const row = values[i];
    if (!row || !row[idx.date]) continue;
    const d = parseDateCell(row[idx.date]);
    if (d === date) {
      return [
        d, 'web',
        toNum(row[idx.sessions]), toNum(row[idx.webSess]), toNum(row[idx.appSess]),
        toNum(row[idx.atc]), toNum(row[idx.ic]), toNum(row[idx.rpp]),
        toNum(row[idx.orders]), toNum(row[idx.webOrders]), toNum(row[idx.appOrders]),
        toNum(row[idx.atcPct]), toNum(row[idx.icPct]), toNum(row[idx.rppPct]),
        toNum(row[idx.cvrPct]), toNum(row[idx.webCvr]), toNum(row[idx.appCvr]),
        toNum(row[idx.atcToCi]), toNum(row[idx.ciToRpp]), toNum(row[idx.rppToOrd]),
        idx.comment !== -1 ? (row[idx.comment] || '') : ''
      ];
    }
  }
  return null;
}

export async function fetchCroAppForDate(date) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SOURCE_SPREADSHEET_ID,
    range: `'Funnel(App)'!A2:R10000`
  });
  const values = res.data.values || [];
  if (values.length < 2) return null;

  const headerRow = values[0];
  const colIndex = (label) => headerRow.findIndex(h => (h || '').trim().toLowerCase() === label.toLowerCase());
  const idx = {
    date: colIndex('Date'), sessions: colIndex('Sessions'), atc: colIndex('ATC'), ic: colIndex('IC'),
    rpp: colIndex('RPP'), orders: colIndex('Orders (App)'), atcPct: colIndex('ATC%'), icPct: colIndex('IC%'),
    rppPct: colIndex('RPP%'), cvrPct: colIndex('CVR%'), atcToCi: colIndex('atc to ci'),
    ciToRpp: colIndex('ci to rpp'), rppToOrd: colIndex('rpp to order')
  };

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || !row[idx.date]) continue;
    const d = parseDateCell(row[idx.date]);
    if (d === date) {
      return [
        d, 'app',
        toNum(row[idx.sessions]), null, null,
        toNum(row[idx.atc]), toNum(row[idx.ic]), toNum(row[idx.rpp]),
        toNum(row[idx.orders]), null, null,
        toNum(row[idx.atcPct]), toNum(row[idx.icPct]), toNum(row[idx.rppPct]), toNum(row[idx.cvrPct]),
        null, null,
        toNum(row[idx.atcToCi]), toNum(row[idx.ciToRpp]), toNum(row[idx.rppToOrd]),
        ''
      ];
    }
  }
  return null;
}

// Extracts dated comments from already-fetched CRO web rows — feeds the RCA inferred-notes layer.
// Operates on the row arrays produced by fetchCroWebSince (date is index 0, comment is last index).
export function extractCommentsAsRcaCandidates(croWebRows) {
  return croWebRows
    .filter(row => row[row.length - 1] && String(row[row.length - 1]).trim() !== '')
    .map(row => ({
      date: row[0],
      source: 'inferred_comment',
      metric_tag: 'cro_web',
      note: row[row.length - 1]
    }));
}
