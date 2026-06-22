import 'dotenv/config';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // e.g. guardian-in.myshopify.com
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-10';

function assertConfigured() {
  if (!STORE_DOMAIN || !ACCESS_TOKEN) {
    throw new Error('SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN must be set in .env');
  }
}

async function shopifyGraphQL(query, variables = {}) {
  assertConfigured();
  const res = await fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ACCESS_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function shopifyQL(qlQuery) {
  const data = await shopifyGraphQL(
    `query($q: String!) { shopifyqlQuery(query: $q) { tableData { columns { name } rows } parseErrors } }`,
    { q: qlQuery }
  );
  const result = data.shopifyqlQuery;
  if (result.parseErrors && result.parseErrors.length > 0) {
    throw new Error(`ShopifyQL parse error: ${result.parseErrors.join(', ')}`);
  }
  if (!result.tableData) return [];
  return result.tableData.rows;
}

const ORDERS_QUERY = `
  query OrdersSince($q: String!, $after: String) {
    orders(first: 50, query: $q, after: $after, sortKey: CREATED_AT) {
      edges {
        cursor
        node {
          id
          createdAt
          currentTotalPriceSet { shopMoney { amount } }
          lineItems(first: 50) {
            edges { node { quantity product { id title } } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// Fetches all orders created after `sinceDate` (YYYY-MM-DD), paginating through the connection.
// Returns daily aggregates + per-product daily units-sold (v1: units only, no per-product revenue —
// would need an extra originalTotalSet field on line items; explicitly deferred, not guessed at).
export async function fetchOrdersSince(sinceDate) {
  assertConfigured();
  const dailyMap = new Map();   // date -> { order_count, units_sold, revenue }
  const productMap = new Map(); // `${date}|${product_id}` -> { date, product_id, product_title, units_sold }

  let after = null;
  let hasNextPage = true;
  const queryFilter = `created_at:>='${sinceDate}'`;

  while (hasNextPage) {
    const data = await shopifyGraphQL(ORDERS_QUERY, { q: queryFilter, after });
    const { edges, pageInfo } = data.orders;

    for (const { node } of edges) {
      const date = node.createdAt.slice(0, 10);
      const revenue = parseFloat(node.currentTotalPriceSet.shopMoney.amount);

      if (!dailyMap.has(date)) dailyMap.set(date, { order_count: 0, units_sold: 0, revenue: 0 });
      const dayAgg = dailyMap.get(date);
      dayAgg.order_count += 1;
      dayAgg.revenue += revenue;

      for (const { node: li } of node.lineItems.edges) {
        if (!li.product) continue; // deleted/missing product reference
        dayAgg.units_sold += li.quantity;

        const key = `${date}|${li.product.id}`;
        if (!productMap.has(key)) {
          productMap.set(key, { date, product_id: li.product.id, product_title: li.product.title, units_sold: 0 });
        }
        productMap.get(key).units_sold += li.quantity;
      }
    }

    hasNextPage = pageInfo.hasNextPage;
    after = pageInfo.endCursor;
  }

  const dailyRows = [...dailyMap.entries()].map(([date, agg]) => [
    date, agg.order_count, agg.units_sold, agg.revenue.toFixed(2)
  ]);
  const productRows = [...productMap.values()].map(p => [
    p.date, p.product_id, p.product_title, p.units_sold, '' // revenue col left blank — see note above
  ]);

  return { dailyRows, productRows, latestDate: dailyRows.length ? dailyRows[dailyRows.length - 1][0] : null };
}

// Sessions by landing page + source, capped at 200 rows per source query.
export async function fetchPageSessionsSince(sinceDate) {
  assertConfigured();
  const range = `SINCE ${sinceDate} UNTIL today`;

  const utmRows = await shopifyQL(
    `FROM sessions SHOW sessions, sessions_with_cart_additions GROUP BY day, landing_page_path, utm_source ${range} ORDER BY sessions DESC LIMIT 200 TIMESERIES day`
  );
  const referrerRows = await shopifyQL(
    `FROM sessions SHOW sessions, sessions_with_cart_additions GROUP BY day, landing_page_path, referrer_source ${range} ORDER BY sessions DESC LIMIT 200 TIMESERIES day`
  );

  const rows = [];
  for (const r of utmRows) {
    if (!r.utm_source) continue;
    const sessions = parseInt(r.sessions, 10) || 0;
    const atc = parseInt(r.sessions_with_cart_additions, 10) || 0;
    rows.push([r.day, r.landing_page_path, 'utm_source', r.utm_source, sessions, atc, sessions ? (atc / sessions) : 0]);
  }
  for (const r of referrerRows) {
    const sessions = parseInt(r.sessions, 10) || 0;
    const atc = parseInt(r.sessions_with_cart_additions, 10) || 0;
    rows.push([r.day, r.landing_page_path, 'referrer_source', r.referrer_source, sessions, atc, sessions ? (atc / sessions) : 0]);
  }
  return rows;
}
