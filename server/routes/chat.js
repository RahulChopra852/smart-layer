import express from 'express';
import Groq from 'groq-sdk';
import { readRows } from '../db/sheetsDb.js';
import { getAppOverview, getWebOverview } from '../services/ga.js';
import { fetchAnomalies } from '../services/croSheets.js';

const router = express.Router();

let client = null;
function getClient() {
  if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

async function gatherContext(today) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const results = {};

  const tasks = [
    (async () => {
      try { results.gaApp = await getAppOverview(weekAgo, today); } catch { results.gaApp = null; }
    })(),
    (async () => {
      try { results.gaWeb = await getWebOverview(weekAgo, today); } catch { results.gaWeb = null; }
    })(),
    (async () => {
      try { results.croDaily = await readRows('cro_daily'); } catch { results.croDaily = []; }
    })(),
    (async () => {
      try { results.metaReports = await readRows('meta_reports'); } catch { results.metaReports = []; }
    })(),
    (async () => {
      try { results.anomalies = await fetchAnomalies(weekAgo); } catch { results.anomalies = []; }
    })(),
    (async () => {
      try { results.webVitals = await readRows('web_vitals'); } catch { results.webVitals = []; }
    })(),
  ];

  await Promise.all(tasks);
  return results;
}

function buildSystemPrompt(ctx, today) {
  const croRecent = (ctx.croDaily || []).slice(-14);
  const metaRecent = (ctx.metaReports || []).slice(-30);
  const vitalsRecent = (ctx.webVitals || []).slice(-14);

  let gaAppSummary = 'No GA App data available.';
  if (ctx.gaApp?.daily?.length) {
    const d = ctx.gaApp.daily;
    const totals = d.reduce((t, r) => {
      t.users += r.activeUsers; t.newUsers += r.newUsers; t.sessions += r.sessions;
      return t;
    }, { users: 0, newUsers: 0, sessions: 0 });
    gaAppSummary = `GA App (last 7 days): ${totals.users} active users, ${totals.newUsers} new users (installs), ${totals.sessions} sessions.\nDaily breakdown:\n${d.map(r => `  ${r.date}: ${r.activeUsers} users, ${r.newUsers} new, ${r.sessions} sessions, platform: ${r.platform}`).join('\n')}`;
    if (ctx.gaApp.topEvents?.length) {
      gaAppSummary += `\nTop events: ${ctx.gaApp.topEvents.slice(0, 5).map(e => `${e.eventName}(${e.eventCount})`).join(', ')}`;
    }
  }

  let gaWebSummary = 'No GA Web data available.';
  if (ctx.gaWeb?.daily?.length) {
    const d = ctx.gaWeb.daily;
    const totals = d.reduce((t, r) => {
      t.users += r.activeUsers; t.sessions += r.sessions; t.conversions += r.conversions;
      return t;
    }, { users: 0, sessions: 0, conversions: 0 });
    gaWebSummary = `GA Web (last 7 days): ${totals.users} active users, ${totals.sessions} sessions, ${totals.conversions} conversions.\nDaily breakdown:\n${d.map(r => `  ${r.date}: ${r.activeUsers} users, ${r.sessions} sessions, bounce: ${(r.bounceRate * 100).toFixed(1)}%, conversions: ${r.conversions}`).join('\n')}`;
    if (ctx.gaWeb.topChannels?.length) {
      gaWebSummary += `\nTop channels: ${ctx.gaWeb.topChannels.slice(0, 5).map(c => `${c.sessionDefaultChannelGroup}(${c.sessions} sessions)`).join(', ')}`;
    }
  }

  return `You are the GNC Smart Layer AI assistant for Guardian.in (GNC India), a Shopify Plus D2C store.
Today's date: ${today}

You have access to the following live dashboard data. Answer questions concisely using this data. If you don't have enough data to answer, say so.

## GA App Data
${gaAppSummary}

## GA Web Data
${gaWebSummary}

## CRO Funnel (recent days)
${croRecent.length ? croRecent.map(r => `  ${r.date}: sessions=${r.sessions}, web=${r.web_sess}, app=${r.app_sess}, atc=${r.atc}, ic=${r.ic}, rpp=${r.rpp}, orders=${r.orders}`).join('\n') : 'No CRO data.'}

## Meta Ads (recent uploads)
${metaRecent.length ? metaRecent.slice(0, 15).map(r => `  ${r.campaign_name || 'TOTAL'}: spend=${r.amount_spent}, roas=${r.roas}, purchases=${r.purchases}, ctr=${r.ctr}`).join('\n') : 'No Meta data.'}

## Anomalies (last 7 days)
${(ctx.anomalies || []).length ? ctx.anomalies.slice(0, 10).map(a => `  ${a.date}: ${a.metric} — ${a.description || a.status}`).join('\n') : 'No anomalies detected.'}

## Web Vitals (recent)
${vitalsRecent.length ? vitalsRecent.map(r => `  ${r.date}: LCP=${r.lcp}, FID=${r.fid}, CLS=${r.cls}`).join('\n') : 'No web vitals data.'}

Keep answers short and data-driven. Use numbers from the data above. Format with markdown when helpful.`;
}

router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'messages required' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured in .env — get a free key at console.groq.com' });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const ctx = await gatherContext(today);
    const systemPrompt = buildSystemPrompt(ctx, today);

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const response = await getClient().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: chatMessages,
      max_tokens: 1024,
      temperature: 0.3,
    });

    const text = response.choices[0]?.message?.content || '';
    res.json({ response: text });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
