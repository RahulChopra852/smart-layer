import { parse } from 'csv-parse/sync';

function toNumOrNull(val) {
  if (val === '' || val == null) return null;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

const col = (r, ...candidates) => {
  for (const c of candidates) {
    const cl = c.toLowerCase();
    const exact = Object.keys(r).find(k => k.trim().toLowerCase() === cl);
    if (exact && r[exact] !== undefined) return r[exact];
  }
  return '';
};

// Discount failure report — already aggregated at source, one row per date+channel+code+reason.
// "GNC India Smart DB Connector - Discount Failures Report" export format.
export function parseDiscountFailures(fileBuffer) {
  const content = Buffer.isBuffer(fileBuffer) ? fileBuffer.toString('utf-8') : fileBuffer;
  const records = parse(content, { columns: true, skip_empty_lines: true, bom: true });
  if (records.length === 0) throw new Error('Discount failures CSV parsed to zero rows — check the file format.');

  return records
    .filter(r => col(r, 'Date') && col(r, 'Coupon Code'))
    .map(r => [
      col(r, 'Date'),
      col(r, 'Sales Channel'),
      col(r, 'Coupon Code'),
      col(r, 'Failure Reason'),
      toNumOrNull(col(r, 'Total Failed Attempts')),
      toNumOrNull(col(r, 'Total Unique Users')),
    ]);
}

// GoKwik's "Created At" / "Updated At" columns are DD/M/YYYY HH:MM AM/PM (e.g. "15/7/2026 04:38 PM"),
// which JS's Date constructor cannot parse unambiguously — build the ISO string by hand instead.
function parseGokwikTimestamp(val) {
  if (!val) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(val.trim());
  if (!m) return null;
  const [, dd, mm, yyyy, hh12, min, ampm] = m;
  let hh = parseInt(hh12, 10) % 12;
  if (ampm.toUpperCase() === 'PM') hh += 12;
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${String(hh).padStart(2, '0')}:${min}:00`;
  return iso;
}

// Abandoned cart report — row-level GoKwik export, one row per abandoned checkout attempt.
// Keyed by the "ID" column so re-uploading the same date range overwrites in place.
export function parseAbandonedCarts(fileBuffer) {
  const content = Buffer.isBuffer(fileBuffer) ? fileBuffer.toString('utf-8') : fileBuffer;
  const records = parse(content, { columns: true, skip_empty_lines: true, bom: true });
  if (records.length === 0) throw new Error('Abandoned cart CSV parsed to zero rows — check the file format.');

  return records
    .filter(r => col(r, 'ID'))
    .map(r => [
      col(r, 'ID'),
      parseGokwikTimestamp(col(r, 'Created At')),
      parseGokwikTimestamp(col(r, 'Updated At')),
      col(r, 'Customer Name'),
      col(r, 'Phone Number'),
      col(r, 'Email ID'),
      toNumOrNull(col(r, 'Amount')),
      toNumOrNull(col(r, 'Discount Total')),
      toNumOrNull(col(r, 'MRP Total')),
      col(r, 'Drop Stage'),
      col(r, 'Drop Off Reasons'),
      col(r, 'Utm Source'),
      col(r, 'Utm Campaign'),
      col(r, 'Utm Medium'),
      col(r, 'Discount Code'),
      col(r, 'Landing Page'),
      col(r, 'Store Platform'),
      col(r, 'Risk Flag'),
    ]);
}
