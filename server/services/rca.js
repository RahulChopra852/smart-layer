import { appendRows, readRows } from '../db/supabaseDb.js';

// Adds a manually-entered RCA note. metricTag is free text (e.g. 'atc_pct', 'web_vitals', 'meta_spend')
// so the person tags what the note explains — no fixed taxonomy enforced in v1.
export async function addManualNote(date, metricTag, note) {
  const createdAt = new Date().toISOString();
  const [saved] = await appendRows('rca_notes', [[null, date, 'manual', metricTag, note, createdAt]]);
  return saved;
}

// Appends inferred-comment candidates (from croSheets.extractCommentsAsRcaCandidates), de-duplicated
// against existing inferred notes for the same date+note text so a re-sync doesn't double-write.
export async function addInferredNotes(candidates) {
  if (!candidates || candidates.length === 0) return { added: 0 };
  const existing = await readRows('rca_notes');
  const existingKeys = new Set(
    existing
      .filter(r => r.source === 'inferred_comment')
      .map(r => `${r.date}|${r.note}`)
  );

  const toAdd = candidates.filter(c => !existingKeys.has(`${c.date}|${c.note}`));
  if (toAdd.length === 0) return { added: 0 };
  const rows = toAdd.map(c => [null, c.date, 'inferred_comment', c.metric_tag, c.note, new Date().toISOString()]);
  const inserted = await appendRows('rca_notes', rows);
  return { added: inserted.length };
}

// Returns all RCA notes (manual + inferred) for a date range, sorted by date.
export async function getNotesInRange(startDate, endDate) {
  const all = await readRows('rca_notes');
  return all
    .filter(r => r.date >= startDate && r.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Action-item generator: compares each day's CRO metrics against the prior day, flags movements
// beyond a threshold that have NO rca_notes entry on that date. This is correlational surfacing,
// not causal inference — the output explicitly says "no RCA note on file", not "caused by X".
const FLAG_THRESHOLD_PCT_POINTS = 2; // e.g. ATC% dropping/rising 2+ points day-over-day

export function findUnexplainedAnomalies(croDailyRows, rcaNotes) {
  const notesByDate = new Set(rcaNotes.map(n => n.date));
  const byChannel = { web: [], app: [] };
  for (const r of croDailyRows) {
    if (byChannel[r.channel]) byChannel[r.channel].push(r);
  }

  const actionItems = [];
  for (const channel of ['web', 'app']) {
    const rows = byChannel[channel].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      const metrics = [
        ['atc_pct', 'ATC%'],
        ['ic_pct', 'IC%'],
        ['rpp_pct', 'RPP%']
      ];
      for (const [key, label] of metrics) {
        const prevVal = parseFloat(prev[key]);
        const currVal = parseFloat(curr[key]);
        if (isNaN(prevVal) || isNaN(currVal)) continue;
        const delta = currVal - prevVal;
        if (Math.abs(delta) >= FLAG_THRESHOLD_PCT_POINTS && !notesByDate.has(curr.date)) {
          actionItems.push({
            date: curr.date,
            channel,
            metric: label,
            delta: delta.toFixed(2),
            direction: delta > 0 ? 'up' : 'down',
            message: `${label} (${channel}) moved ${delta > 0 ? '+' : ''}${delta.toFixed(2)}pts on ${curr.date}, no RCA note on file — investigate`
          });
        }
      }
    }
  }
  return actionItems;
}
