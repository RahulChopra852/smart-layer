import { cached, invalidate } from '../../cache/liveCache.js';

// OOS detection from a live Shopify catalog snapshot, diffed against the previous snapshot held
// only in liveCache. There is no persisted OOS history in v1 — see docs/ARCHITECTURE.md §9.2 for
// why, and don't "fix" this with speculative storage without a real brand request driving it.
export async function computeOosState(workspaceId, catalogSnapshot, settings = {}) {
  const lowStockThreshold = settings.low_stock_threshold ?? 10;
  const prevKey = `oos-prev-snapshot:${workspaceId}`;
  const prev = await cached(prevKey, 10, async () => null); // read-only peek; we overwrite below

  const prevByProduct = new Map((prev || []).map(p => [p.product_id, p]));
  const oos = [];
  const lowStock = [];

  for (const p of catalogSnapshot) {
    const wasOos = prevByProduct.get(p.product_id)?.oos ?? (p.total_inventory <= 0);
    const isOos = p.total_inventory <= 0;
    if (isOos) {
      oos.push({
        product_id: p.product_id,
        product_title: p.title,
        handle: p.handle,
        sku: p.sku,
        // "since" is only as good as our snapshot cadence — approximate, not an audit trail
        oos_since_last_check: !wasOos,
      });
    } else if (p.total_inventory > 0 && p.total_inventory <= lowStockThreshold) {
      lowStock.push({ product_id: p.product_id, product_title: p.title, handle: p.handle, sku: p.sku, qty: p.total_inventory });
    }
  }

  invalidate(prevKey);
  await cached(prevKey, 60 * 60 * 24, async () => catalogSnapshot.map(p => ({ product_id: p.product_id, oos: p.total_inventory <= 0 })));

  return { oos, lowStock };
}
