import { readRows as readSheetRows } from '../db/sheetsDb.js';
import { appendRows as writeSupabaseRows } from '../db/supabaseDb.js';

// These tabs are populated by separate Google Apps Script projects (scripts/*-appscript.js)
// that parse Gmail reports and write straight into the Dashboard DB sheet — left as-is per
// design. This mirrors them into Supabase (full-table upsert, cheap at this volume) so
// they're queryable alongside everything else the Node app now owns directly.
const MIRROR_TABS = [
  'gokwik_daily', 'gokwik_products', 'gokwik_utm', 'gokwik_landing_pages',
  'google_ads_daily', 'google_ads_campaigns', 'psi_daily'
];

export async function mirrorAllSheetTabs() {
  const results = [];
  for (const tab of MIRROR_TABS) {
    try {
      const rows = await readSheetRows(tab);
      const written = rows.length ? await writeSupabaseRows(tab, rows) : [];
      results.push({ tab, mirrored: written.length });
    } catch (err) {
      results.push({ tab, error: err.message });
    }
  }
  return results;
}
