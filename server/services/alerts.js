import cron from 'node-cron';
import { readRows, appendRows } from '../db/sheetsDb.js';
import { fetchCroWebSince } from './croSheets.js';

const WEB_CVR_DROP_THRESHOLD = 20; // alert if web CVR drops >20% vs previous day

async function getLatestTwoDays() {
  const since = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const rows = await fetchCroWebSince(since);
  if (rows.length < 2) return null;

  const sorted = rows
    .filter(r => r.web_cvr != null && r.web_sess > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length < 2) return null;
  return { today: sorted[0], yesterday: sorted[1] };
}

async function checkWebCvr() {
  console.log(`[Alerts] Checking web CVR at ${new Date().toISOString()}`);

  try {
    const data = await getLatestTwoDays();
    if (!data) {
      console.log('[Alerts] Not enough CRO data for comparison');
      return;
    }

    const { today, yesterday } = data;
    const currCvr = parseFloat(today.web_cvr);
    const prevCvr = parseFloat(yesterday.web_cvr);

    if (isNaN(currCvr) || isNaN(prevCvr) || prevCvr === 0) {
      console.log('[Alerts] CVR values not usable:', { currCvr, prevCvr });
      return;
    }

    const changePct = ((currCvr - prevCvr) / prevCvr) * 100;
    const isAlert = changePct <= -WEB_CVR_DROP_THRESHOLD;

    const now = new Date().toISOString();
    const id = `wcvr_${now.slice(0, 10)}_${now.slice(11, 16).replace(':', '')}`;

    const status = isAlert ? 'ALERT' : 'OK';
    const message = isAlert
      ? `Web CVR dropped ${Math.abs(changePct).toFixed(1)}% — from ${prevCvr.toFixed(2)}% (${yesterday.date}) to ${currCvr.toFixed(2)}% (${today.date})`
      : `Web CVR stable at ${currCvr.toFixed(2)}% (${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}% vs yesterday)`;

    const alertRow = {
      id,
      created_at: now,
      type: 'web_cvr',
      metric: 'Web CVR',
      current_value: currCvr.toFixed(2),
      previous_value: prevCvr.toFixed(2),
      change_pct: changePct.toFixed(1),
      threshold: `-${WEB_CVR_DROP_THRESHOLD}%`,
      status,
      message,
    };

    await appendRows('alerts', [alertRow]);
    console.log(`[Alerts] ${status}: ${message}`);
  } catch (err) {
    console.error('[Alerts] Check failed:', err.message);
  }
}

export function startAlertCron() {
  // Every 2 hours at minute 0
  cron.schedule('0 */2 * * *', () => {
    checkWebCvr();
  });
  console.log('[Alerts] Web CVR check scheduled every 2 hours');

  // Run once on startup after a short delay
  setTimeout(() => checkWebCvr(), 10000);
}

export async function getAlerts(limit = 50) {
  const rows = await readRows('alerts');
  return rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, limit);
}
