import { google } from 'googleapis';
import 'dotenv/config';

const GA_APP_PROPERTY = process.env.GA_APP_PROPERTY || '422590924';
const GA_WEB_PROPERTY = process.env.GA_WEB_PROPERTY || '308908921';

let gaClient = null;
async function getGaClient() {
  if (gaClient) return gaClient;
  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
  const authClient = await auth.getClient();
  gaClient = google.analyticsdata({ version: 'v1beta', auth: authClient });
  return gaClient;
}

async function runReport(propertyId, { startDate, endDate, metrics, dimensions }) {
  const client = await getGaClient();
  const res = await client.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      metrics: metrics.map(m => ({ name: m })),
      dimensions: dimensions.map(d => ({ name: d })),
    }
  });
  return (res.data.rows || []).map(row => {
    const obj = {};
    dimensions.forEach((d, i) => { obj[d] = row.dimensionValues[i].value; });
    metrics.forEach((m, i) => { obj[m] = parseFloat(row.metricValues[i].value) || 0; });
    return obj;
  });
}

export async function getAppOverview(startDate, endDate) {
  const [daily, topEvents, topScreens] = await Promise.all([
    runReport(GA_APP_PROPERTY, {
      startDate, endDate,
      metrics: ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'averageSessionDuration', 'screenPageViews', 'eventCount'],
      dimensions: ['date', 'platform']
    }),
    runReport(GA_APP_PROPERTY, {
      startDate, endDate,
      metrics: ['eventCount', 'totalUsers'],
      dimensions: ['eventName']
    }),
    runReport(GA_APP_PROPERTY, {
      startDate, endDate,
      metrics: ['screenPageViews', 'activeUsers', 'averageSessionDuration'],
      dimensions: ['unifiedScreenName']
    }),
  ]);

  return {
    daily: daily.sort((a, b) => a.date.localeCompare(b.date)),
    topEvents: topEvents.sort((a, b) => b.eventCount - a.eventCount).slice(0, 15),
    topScreens: topScreens.sort((a, b) => b.screenPageViews - a.screenPageViews).slice(0, 15),
  };
}

export async function getWebOverview(startDate, endDate) {
  const [daily, topSources, topPages, topChannels] = await Promise.all([
    runReport(GA_WEB_PROPERTY, {
      startDate, endDate,
      metrics: ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'bounceRate', 'averageSessionDuration', 'screenPageViews', 'conversions'],
      dimensions: ['date']
    }),
    runReport(GA_WEB_PROPERTY, {
      startDate, endDate,
      metrics: ['sessions', 'activeUsers', 'conversions', 'engagedSessions'],
      dimensions: ['sessionSource']
    }),
    runReport(GA_WEB_PROPERTY, {
      startDate, endDate,
      metrics: ['screenPageViews', 'activeUsers', 'averageSessionDuration', 'bounceRate'],
      dimensions: ['pagePath']
    }),
    runReport(GA_WEB_PROPERTY, {
      startDate, endDate,
      metrics: ['sessions', 'activeUsers', 'conversions', 'newUsers'],
      dimensions: ['sessionDefaultChannelGroup']
    }),
  ]);

  return {
    daily: daily.sort((a, b) => a.date.localeCompare(b.date)),
    topSources: topSources.sort((a, b) => b.sessions - a.sessions).slice(0, 15),
    topPages: topPages.sort((a, b) => b.screenPageViews - a.screenPageViews).slice(0, 20),
    topChannels: topChannels.sort((a, b) => b.sessions - a.sessions),
  };
}
