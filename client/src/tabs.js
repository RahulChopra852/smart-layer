// Canonical tab id/label list — shared between App.jsx (nav + routing) and SyncStatus.jsx (the
// per-tab sync breakdown), so the two can't silently drift out of sync with each other.
export const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'cro', label: 'CRO' },
  { id: 'gokwik', label: 'GoKwik' },
  { id: 'ga-app', label: 'GA - App' },
  { id: 'ga-web', label: 'GA - Web' },
  { id: 'vitals', label: 'Web Vitals' },
  { id: 'products', label: 'Products' },
  { id: 'google-ads', label: 'Google Ads' },
  { id: 'meta', label: 'Meta Ads' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'abtests', label: 'AB Tests' },
  { id: 'vwo', label: 'VWO' },
];
