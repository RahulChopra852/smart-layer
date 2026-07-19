import * as shopify from './shopify.js';

// Dispatch table from connection.type to its connector module. GA4/Metabase/VWO/PSI/Meta land
// here in Phase 1/2 (see docs/ARCHITECTURE.md §6) — Phase 0 wires up Shopify only.
export const CONNECTORS = {
  shopify,
};

export function getConnector(type) {
  const connector = CONNECTORS[type];
  if (!connector) throw new Error(`No connector registered for type "${type}"`);
  return connector;
}
