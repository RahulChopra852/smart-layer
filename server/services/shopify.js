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
            edges { node { quantity product { id title } variant { sku } } }
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
          productMap.set(key, { date, product_id: li.product.id, product_title: li.product.title, units_sold: 0, sku: li.variant?.sku || '' });
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
    p.date, p.product_id, p.product_title, p.units_sold, '', p.sku // revenue col left blank — see note above
  ]);

  return { dailyRows, productRows, latestDate: dailyRows.length ? dailyRows[dailyRows.length - 1][0] : null };
}

const HOURLY_ORDERS_QUERY = `
  query HourlyOrders($q: String!, $after: String) {
    orders(first: 250, query: $q, after: $after, sortKey: CREATED_AT) {
      edges {
        node {
          createdAt
          channelInformation { app { title } }
          currentTotalPriceSet { shopMoney { amount } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export async function fetchHourlyOrders(date, channel = 'GNC <> Gokwik') {
  assertConfigured();
  // Store is IST (UTC+5:30). Convert IST date boundaries to UTC for Shopify API.
  // IST midnight = previous day 18:30 UTC
  const istStartUtc = `${date}T00:00:00+05:30`;
  const startUtc = new Date(istStartUtc).toISOString();
  const nextDay = new Date(date + 'T12:00:00');
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDateStr = nextDay.toISOString().slice(0, 10);
  const istEndUtc = `${nextDateStr}T00:00:00+05:30`;
  const endUtc = new Date(istEndUtc).toISOString();

  // hourly buckets in IST (0-23)
  const hourly = Array.from({ length: 24 }, () => ({ orders: 0, revenue: 0 }));
  let totalOrders = 0, totalRevenue = 0;
  let after = null, hasNextPage = true;
  const q = `created_at:>='${startUtc}' AND created_at:<'${endUtc}'`;

  while (hasNextPage) {
    const data = await shopifyGraphQL(HOURLY_ORDERS_QUERY, { q, after });
    const { edges, pageInfo } = data.orders;

    for (const { node } of edges) {
      const appTitle = node.channelInformation?.app?.title || '';
      if (appTitle !== channel) continue;

      // Convert UTC createdAt to IST hour
      const utcDate = new Date(node.createdAt);
      const istHour = (utcDate.getUTCHours() + 5 + Math.floor((utcDate.getUTCMinutes() + 30) / 60)) % 24;
      const rev = parseFloat(node.currentTotalPriceSet.shopMoney.amount) || 0;
      hourly[istHour].orders++;
      hourly[istHour].revenue += rev;
      totalOrders++;
      totalRevenue += rev;
    }

    hasNextPage = pageInfo.hasNextPage;
    after = pageInfo.endCursor;
  }

  return { date, channel, hourly, totalOrders, totalRevenue };
}

// Sessions by landing page + source, capped at 200 rows per source query.
export async function fetchPageSessionsSince(sinceDate, untilDate = null) {
  assertConfigured();
  const range = `SINCE ${sinceDate} UNTIL ${untilDate || 'today'}`;

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

const OOS_KEYWORDS = ['whey', 'plant', 'protein', 'yeast', 'isolate', 'creatine', 'gainer', 'pre-workout'];
const LOW_STOCK_THRESHOLD = 50;

const INVENTORY_QUERY = `
  query LowStock($query: String!, $after: String) {
    products(first: 20, query: $query, after: $after, sortKey: INVENTORY_TOTAL, reverse: true) {
      edges {
        node {
          id
          title
          handle
          status
          totalInventory
          variants(first: 50) {
            edges {
              node {
                id
                title
                sku
                inventoryQuantity
                inventoryPolicy
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export async function fetchLowStockAlerts() {
  assertConfigured();

  const alerts = [];

  for (const keyword of OOS_KEYWORDS) {
    const data = await shopifyGraphQL(INVENTORY_QUERY, {
      query: `status:active ${keyword}`,
      after: null,
    });

    for (const { node: product } of data.products.edges) {
      for (const { node: variant } of product.variants.edges) {
        if (variant.inventoryQuantity < LOW_STOCK_THRESHOLD && !(variant.sku || '').toUpperCase().includes('-CS')) {
          alerts.push({
            product_id: product.id,
            product_title: product.title,
            handle: product.handle,
            variant_title: variant.title,
            sku: variant.sku,
            qty: variant.inventoryQuantity,
            inventory_policy: variant.inventoryPolicy,
            total_inventory: product.totalInventory,
          });
        }
      }
    }
  }

  const seen = new Set();
  return alerts.filter(a => {
    const key = `${a.product_id}|${a.variant_title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.qty - b.qty);
}
