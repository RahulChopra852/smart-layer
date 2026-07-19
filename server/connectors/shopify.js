import { decryptSecret } from '../crypto/secrets.js';

// The Smart Layer Shopify connector app is a fixed-key GraphQL PROXY, not a token vendor: a
// merchant installs it, it shows them one fixed key (sdbc_live_...), and every query goes
// through the connector's own POST /api/graphql with that key as the Bearer token — the
// connector resolves the shop from the key, refreshes Shopify's token internally, forwards the
// query, and returns Shopify's response verbatim. Smart Layer never sees a raw Shopify token.
// The merchant pastes that fixed key into ConnectionsHub; it's stored encrypted as
// connection.secret_ciphertext = { proxy_key }. See CLAUDE.md in the connector repo.
async function shopifyGraphQL(connection, query, variables = {}) {
  const secret = decryptSecret(connection.secret_ciphertext);
  if (!secret?.proxy_key) throw new Error(`Connection ${connection.id} has no Shopify proxy key stored`);

  const res = await fetch(`${process.env.CONNECTOR_URL}/api/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret.proxy_key}` },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Connector proxy error: HTTP ${res.status}`);
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
// so this is really an auth + reachability check per required query, through the connector proxy.
export async function probe(connection) {
  const fields = [];
  try {
    await shopifyGraphQL(connection, `query { shop { name } }`);
    fields.push({ name: 'Connector proxy access', present: true });
  } catch (err) {
    fields.push({ name: 'Connector proxy access', present: false, error: err.message });
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
