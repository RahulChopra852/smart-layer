import { cached } from '../cache/liveCache.js';
import { decryptSecret } from '../crypto/secrets.js';
import { setConnectionStatus } from '../db/supabaseDb.js';

const API_VERSION = '2025-10';
const TOKEN_CACHE_TTL_SECONDS = 50 * 60; // conservative default; tighten once the connector
// app's real expires_at contract is confirmed (see docs/ARCHITECTURE.md §6.1 — "finalize field
// names against the connector repo before implementing")

// Resolves a live Shopify Admin access token for a connection: either vended by the Smart Layer
// connector app (the normal path, connection.meta.shop_domain set, no secret stored here), or a
// manually pasted token (fallback path, connection.meta.manual_token=true, secret_ciphertext set).
async function getAccessToken(connection) {
  if (connection.meta?.manual_token) {
    const secret = decryptSecret(connection.secret_ciphertext);
    return secret.access_token;
  }

  const shop = connection.meta?.shop_domain;
  if (!shop) throw new Error(`Connection ${connection.id} has no shop_domain in meta`);

  return cached(`shopify-token:${connection.id}`, TOKEN_CACHE_TTL_SECONDS, async () => {
    const url = `${process.env.CONNECTOR_URL}/api/token?shop=${encodeURIComponent(shop)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CONNECTOR_API_KEY}` } });
    if (!res.ok) {
      await setConnectionStatus(connection.id, 'error', `Token vending failed: HTTP ${res.status}`);
      throw new Error(`Connector token vending failed for ${shop}: HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.access_token;
  });
}

async function shopifyGraphQL(connection, query, variables = {}) {
  const shop = connection.meta?.shop_domain;
  const token = await getAccessToken(connection);
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

const ORDERS_QUERY = `
  query OrdersSince($q: String!, $after: String) {
    orders(first: 50, query: $q, after: $after, sortKey: CREATED_AT) {
      edges {
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

async function fetchCommerceSnapshot(connection, { start, end }) {
  const dailyMap = new Map();
  const productMap = new Map();
  let after = null;
  let hasNextPage = true;
  const q = `created_at:>='${start}' AND created_at:<='${end}T23:59:59Z'`;

  while (hasNextPage) {
    const data = await shopifyGraphQL(connection, ORDERS_QUERY, { q, after });
    for (const { node } of data.orders.edges) {
      const date = node.createdAt.slice(0, 10);
      const revenue = parseFloat(node.currentTotalPriceSet.shopMoney.amount);
      if (!dailyMap.has(date)) dailyMap.set(date, { date, order_count: 0, units_sold: 0, revenue: 0 });
      const day = dailyMap.get(date);
      day.order_count += 1;
      day.revenue += revenue;

      for (const { node: li } of node.lineItems.edges) {
        if (!li.product) continue;
        day.units_sold += li.quantity;
        const key = `${date}|${li.product.id}`;
        if (!productMap.has(key)) {
          productMap.set(key, { date, product_id: li.product.id, product_title: li.product.title, units_sold: 0, sku: li.variant?.sku || '' });
        }
        productMap.get(key).units_sold += li.quantity;
      }
    }
    hasNextPage = data.orders.pageInfo.hasNextPage;
    after = data.orders.pageInfo.endCursor;
  }

  return { daily: [...dailyMap.values()], products: [...productMap.values()] };
}

const CATALOG_QUERY = `
  query Catalog($after: String) {
    products(first: 50, after: $after, query: "status:active") {
      edges {
        node {
          id
          title
          handle
          status
          variants(first: 50) {
            edges { node { id sku inventoryQuantity } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// Live catalog + inventory snapshot — the ONLY source of "is this product OOS right now".
// No history is persisted here; see docs/ARCHITECTURE.md §9.2 for the accepted limitation.
async function fetchCatalogSnapshot(connection) {
  const products = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await shopifyGraphQL(connection, CATALOG_QUERY, { after });
    for (const { node: p } of data.products.edges) {
      const variants = p.variants.edges.map(({ node: v }) => ({ id: v.id, sku: v.sku, inventoryQuantity: v.inventoryQuantity }));
      const totalInventory = variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);
      products.push({ product_id: p.id, title: p.title, handle: p.handle, status: p.status, sku: variants[0]?.sku || '', total_inventory: totalInventory, variants });
    }
    hasNextPage = data.products.pageInfo.hasNextPage;
    after = data.products.pageInfo.endCursor;
  }

  return products;
}

// probe() answers "can we actually query this shop with this connection right now" — the setup
// form's field checklist. Shopify's fields are fixed (not brand-configurable like GA4 dimensions),
// so this is really an auth + reachability check per required query.
export async function probe(connection) {
  const fields = [];
  try {
    await shopifyGraphQL(connection, `query { shop { name } }`);
    fields.push({ name: 'Admin API access', present: true });
  } catch (err) {
    fields.push({ name: 'Admin API access', present: false, error: err.message });
    return { ok: false, fields };
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetchCommerceSnapshot(connection, { start: today, end: today });
    fields.push({ name: 'Orders query', present: true });
  } catch (err) {
    fields.push({ name: 'Orders query', present: false, error: err.message });
  }

  try {
    await shopifyGraphQL(connection, `query { products(first: 1) { edges { node { id } } } }`);
    fields.push({ name: 'Product catalog + inventory', present: true });
  } catch (err) {
    fields.push({ name: 'Product catalog + inventory', present: false, error: err.message });
  }

  return { ok: fields.every(f => f.present), fields };
}

export async function query(connection, config, { type, start, end }) {
  if (type === 'commerce-snapshot') return fetchCommerceSnapshot(connection, { start, end });
  if (type === 'catalog') return fetchCatalogSnapshot(connection);
  throw new Error(`Unknown Shopify query type: ${type}`);
}
