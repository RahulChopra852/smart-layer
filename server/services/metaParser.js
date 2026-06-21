import { parse } from 'csv-parse/sync';

function toNumOrNull(val) {
  if (val === '' || val == null) return null;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

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
      const key = Object.keys(r).find(k => k.trim().toLowerCase().startsWith(c.toLowerCase()));
      if (key && r[key] !== undefined) return r[key];
    }
    return '';
  };

  const toRow = (r) => [
    col(r, 'Reporting starts'),
    col(r, 'Reporting ends'),
    col(r, 'Campaign name'),
    col(r, 'Day'),
    col(r, 'Ad name'),
    toNumOrNull(col(r, 'Amount spent')),
    toNumOrNull(col(r, 'CTR (all)')),
    toNumOrNull(col(r, 'CPM')),
    toNumOrNull(col(r, 'CPC')),
    toNumOrNull(col(r, 'CTR (link')),
    toNumOrNull(col(r, 'Cost per lan', 'Cost per landing')),
    toNumOrNull(col(r, 'Cost per pur', 'Cost per purchase')),
    toNumOrNull(col(r, 'AOV')),
    toNumOrNull(col(r, 'LC TO LPV', 'LC to LPV')),
    toNumOrNull(col(r, 'LPV to A2C')),
    toNumOrNull(col(r, 'A2C to CI')),
    toNumOrNull(col(r, 'A2C to Order', 'A2C to Ordered')),
    toNumOrNull(col(r, 'CI to ORDER', 'CI to Order')),
    toNumOrNull(col(r, 'Website check', 'Website checkouts')),
    toNumOrNull(col(r, 'Website pur', 'Website purchases')),
    toNumOrNull(col(r, 'ROAS')),
    toNumOrNull(col(r, 'Conversion')),
    toNumOrNull(col(r, 'Landing page', 'Landing page views')),
    toNumOrNull(col(r, 'Link clicks')),
    toNumOrNull(col(r, 'Hook Rate', 'Hook rate')),
  ];

  const accountTotalRow = records[0]['Campaign name'] || col(records[0], 'Campaign name') ? null : toRow(records[0]);
  const campaignRows = records
    .slice(accountTotalRow ? 1 : 0)
    .filter(r => col(r, 'Campaign name'))
    .map(toRow);

  return { accountTotalRow, campaignRows };
}
