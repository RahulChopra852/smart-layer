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

async function runReport(propertyId, { startDate, endDate, metrics, dimensions, dimensionFilter }) {
  const client = await getGaClient();
  const requestBody = {
    dateRanges: [{ startDate, endDate }],
    metrics: metrics.map(m => ({ name: m })),
    dimensions: dimensions.map(d => ({ name: d })),
  };
  if (dimensionFilter) requestBody.dimensionFilter = dimensionFilter;
  const res = await client.properties.runReport({ property: `properties/${propertyId}`, requestBody });
  return (res.data.rows || []).map(row => {
    const obj = {};
    dimensions.forEach((d, i) => { obj[d] = row.dimensionValues[i].value; });
    metrics.forEach((m, i) => { obj[m] = parseFloat(row.metricValues[i].value) || 0; });
    return obj;
  });
}

// GA's `newUsers` metric is deduped by GA's identity resolution — a real install can fail to
// increment it if the device gets matched to an identity GA already knows. "Installs" should
// instead be the raw first_open EVENT count, which is what GA's own Explore reports show and
// what matches how people actually read "installs".
async function getFirstOpenByDatePlatform(startDate, endDate) {
  const rows = await runReport(GA_APP_PROPERTY, {
    startDate, endDate,
    metrics: ['eventCount'],
    dimensions: ['date', 'platform'],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'first_open' } }
    }
  });
  const map = new Map();
  for (const r of rows) map.set(`${r.date}_${r.platform}`, r.eventCount);
  return map;
}

export async function getAppOverview(startDate, endDate) {
  const [daily, topEvents, topScreens, firstOpenByDatePlatform] = await Promise.all([
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
    getFirstOpenByDatePlatform(startDate, endDate),
  ]);

  // Overwrite newUsers with the first_open event count — "Downloads/Installs" downstream should
  // read as installs, not GA's identity-deduped new-user count.
  const dailyWithInstalls = daily.map(r => ({
    ...r,
    newUsers: firstOpenByDatePlatform.get(`${r.date}_${r.platform}`) ?? 0,
  }));

  return {
    daily: dailyWithInstalls.sort((a, b) => a.date.localeCompare(b.date)),
    topEvents: topEvents.sort((a, b) => b.eventCount - a.eventCount).slice(0, 15),
    topScreens: topScreens.sort((a, b) => b.screenPageViews - a.screenPageViews).slice(0, 15),
  };
}

// GA4's `conversions` metric sums whatever events are marked "Key events" in the property's
// Admin settings — on this property that includes plain browsing events (view_item, session_start,
// view_item_list), so it inflates to ~3x sessions and doesn't mean "conversion" in the normal
// sense. Query the `purchase` event directly instead — a real, meaningful conversion count.
async function getPurchasesBy(dimensionName, startDate, endDate) {
  const rows = await runReport(GA_WEB_PROPERTY, {
    startDate, endDate,
    metrics: ['eventCount'],
    dimensions: [dimensionName],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'purchase' } }
    }
  });
  const map = new Map();
  for (const r of rows) map.set(r[dimensionName], r.eventCount);
  return map;
}

export async function getWebOverview(startDate, endDate) {
  const [daily, topSources, topPages, topChannels, purchasesByDate, purchasesBySource, purchasesByChannel] = await Promise.all([
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
    getPurchasesBy('date', startDate, endDate),
    getPurchasesBy('sessionSource', startDate, endDate),
    getPurchasesBy('sessionDefaultChannelGroup', startDate, endDate),
  ]);

  daily.forEach(r => { r.conversions = purchasesByDate.get(r.date) ?? 0; });
  topSources.forEach(r => { r.conversions = purchasesBySource.get(r.sessionSource) ?? 0; });
  topChannels.forEach(r => { r.conversions = purchasesByChannel.get(r.sessionDefaultChannelGroup) ?? 0; });

  return {
    daily: daily.sort((a, b) => a.date.localeCompare(b.date)),
    topSources: topSources.sort((a, b) => b.sessions - a.sessions).slice(0, 15),
    topPages: topPages.sort((a, b) => b.screenPageViews - a.screenPageViews).slice(0, 20),
    topChannels: topChannels.sort((a, b) => b.sessions - a.sessions),
  };
}
