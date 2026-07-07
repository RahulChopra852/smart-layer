import { appendRows } from '../db/supabaseDb.js';
import { getPagePerformance } from './analytics.js';

const STORE_ORIGIN = 'https://www.guardian.in';

// Which live page each funnel-stage category maps to, for whoever (a human or Claude in a
// session) does the actual analysis later.
const AREA_PATHS = {
  'Product Page': null, // resolved dynamically to the top landing page
  'Cart Page': '/cart',
  'Checkout Flow': '/cart', // hosted checkout needs a real cart session; cart is the closest reachable proxy
  'Sitewide': '/',
};

async function resolveTargetPath(area) {
  const configured = AREA_PATHS[area];
  if (configured !== null && configured !== undefined) return configured;
  // Product Page: use whatever landing page is currently getting the most sessions, so
  // whoever analyzes this next looks at a real, high-traffic page rather than a guess.
  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const pages = await getPagePerformance(weekAgo, today, 'utm_source');
    const top = pages.find(p => p.landing_page?.startsWith('/products/'));
    return top?.landing_page || '/collections/all';
  } catch {
    return '/collections/all';
  }
}

// No automated LLM call here — there's no free/available vision LLM wired up. "Generate new"
// queues a placeholder row (source: 'requested') pointing at the real live page to analyze;
// a Claude Code session then browses that page + the funnel data and fills the row in with a
// real, grounded hypothesis (see project conversation history for the manual analysis flow).
export async function generateAbTest(metric, area) {
  if (!(area in AREA_PATHS)) throw new Error(`Unknown area: ${area}`);

  const path = await resolveTargetPath(area);

  const [row] = await appendRows('ab_tests', [{
    metric,
    area,
    name: 'Pending Claude analysis',
    hypothesis: `Requested ${new Date().toISOString().slice(0, 16).replace('T', ' ')} — ask Claude (in a Claude Code session) to browse ${STORE_ORIGIN}${path}, review the current funnel data, and fill this in with a real hypothesis.`,
    impact: null,
    status: null,
    source: 'requested',
    page_url: `${STORE_ORIGIN}${path}`,
    created_at: new Date().toISOString(),
  }]);

  return row;
}
