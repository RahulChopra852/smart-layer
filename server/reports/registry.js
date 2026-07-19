// The heart of the product: one entry per dashboard tab. The client builds the tab bar and
// every setup form directly from this list via GET /api/reports. Adding a new tab = adding an
// entry here + a connector query()/probe (if a new source type) + a dashboard component.
// See docs/ARCHITECTURE.md §7-8.
export const REPORT_DEFINITIONS = [
  {
    id: 'products',
    title: 'Products',
    sourceTypes: ['shopify'],
    requires: {
      queries: ['commerce-snapshot', 'catalog'],
    },
    settings: [
      { key: 'oos_session_threshold', label: 'Sessions-while-OOS alert threshold', type: 'number', default: 500 },
      { key: 'low_stock_threshold', label: 'Low stock threshold (units)', type: 'number', default: 10 },
      { key: 'product_aliases', label: 'Product name aliases (e.g. pp → whey)', type: 'keyvalue', default: {} },
    ],
    cache: { ttlSeconds: 120 },
  },
];

export function getReportDefinition(id) {
  return REPORT_DEFINITIONS.find(r => r.id === id);
}
