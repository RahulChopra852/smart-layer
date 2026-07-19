// Short-TTL in-memory memoization for live connector queries. This is a cache, not storage —
// losing an entry just means the next call re-queries the source. Exists to keep repeated
// dashboard renders fast and stay under source API rate limits (see docs/ARCHITECTURE.md §9.4).
const store = new Map(); // key -> { value, expiresAt }

export async function cached(key, ttlSeconds, fn) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await fn();
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  return value;
}

export function invalidate(keyPrefix) {
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) store.delete(key);
  }
}
