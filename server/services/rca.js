import { appendRows, readRows } from '../db/supabaseDb.js';

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
