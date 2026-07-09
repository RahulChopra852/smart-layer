import { parse } from 'csv-parse/sync';

function toNumOrNull(val) {
  if (val === '' || val == null) return null;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

// Must match the literal MetaTab.jsx/SummaryTab.jsx check for on the client.
export const TOTAL_MARKER = '(account total)';

export function parseMetaReport(fileBuffer) {
  const content = Buffer.isBuffer(fileBuffer) ? fileBuffer.toString('utf-8') : fileBuffer;
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true
  });

  if (records.length === 0) {
    throw new Error('Meta report CSV parsed to zero rows — check the file format.');
  }

  const col = (r, ...candidates) => {
    for (const c of candidates) {
      const cl = c.toLowerCase();
      // Prefer exact match, fall back to startsWith
      const exact = Object.keys(r).find(k => k.trim().toLowerCase() === cl);
      if (exact && r[exact] !== undefined) return r[exact];
      const prefix = Object.keys(r).find(k => k.trim().toLowerCase().startsWith(cl));
      if (prefix && r[prefix] !== undefined) return r[prefix];
    }
    return '';
  };

  // campaign_name/ad_name are part of meta_reports' primary key (NOT NULL) — Meta's own
  // "Totals" row exports these blank, so give it a sentinel instead of letting it go through
  // as an empty string (which sanitize() would turn into a PK-violating null).
  const toRow = (r) => [
    col(r, 'Reporting starts'),
    col(r, 'Reporting ends'),
    col(r, 'Campaign name') || TOTAL_MARKER,
    col(r, 'Ad set name'),
    col(r, 'Day'),
    col(r, 'Ad name') || TOTAL_MARKER,
    toNumOrNull(col(r, 'Amount spent')),
    toNumOrNull(col(r, 'CTR (all)')),
    toNumOrNull(col(r, 'CPM')),
    toNumOrNull(col(r, 'CPC')),
    toNumOrNull(col(r, 'CTR (link')),
    toNumOrNull(col(r, 'Cost per lan', 'Cost per landing')),
    toNumOrNull(col(r, 'Cost per purchase', 'Cost per purchase (INR)')),
    toNumOrNull(col(r, 'AOV')),
    toNumOrNull(col(r, 'LC TO LPV', 'LC to LPV')),
    toNumOrNull(col(r, 'LPV to A2C')),
    toNumOrNull(col(r, 'A2C to CI')),
    toNumOrNull(col(r, 'A2C to Order', 'A2C to Ordered')),
    toNumOrNull(col(r, 'CI to ORDER', 'CI to Order')),
    toNumOrNull(col(r, 'Website check', 'Website checkouts')),
    toNumOrNull(col(r, 'Website pur', 'Website purchases')),
    toNumOrNull(col(r, 'ROAS Custom', 'ROAS')),
    toNumOrNull(col(r, 'Conversion')),
    toNumOrNull(col(r, 'Landing page', 'Landing page views')),
    toNumOrNull(col(r, 'Link clicks')),
    toNumOrNull(col(r, 'Hook Rate', 'Hook rate')),
    toNumOrNull(col(r, 'Cost per purchase_new', 'Cost per purchase_new_customer')),
  ];

  const accountTotalRow = records[0]['Campaign name'] || col(records[0], 'Campaign name') ? null : toRow(records[0]);
  const campaignRows = records
    .slice(accountTotalRow ? 1 : 0)
    .filter(r => col(r, 'Campaign name'))
    .map(toRow);

  return { accountTotalRow, campaignRows };
}
