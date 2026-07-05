import express from 'express';
import { addManualNote, getNotesInRange, findUnexplainedAnomalies } from '../services/rca.js';
import { readRows } from '../db/supabaseDb.js';

const router = express.Router();

// POST /api/rca/notes — { date, metricTag, note }
router.post('/notes', async (req, res) => {
  const { date, metricTag, note } = req.body;
  if (!date || !note) return res.status(400).json({ error: 'date and note are required' });
  try {
    const saved = await addManualNote(date, metricTag || '', note);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rca/notes?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/notes', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });
  try {
    const notes = await getNotesInRange(start, end);
    res.json({ notes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/rca/action-items?start=YYYY-MM-DD&end=YYYY-MM-DD
// Cross-references cro_daily metric movements against rca_notes to surface unexplained anomalies.
router.get('/action-items', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end query params required' });
  try {
    const [croDailyRows, notes] = await Promise.all([
      readRows('cro_daily'),
      getNotesInRange(start, end)
    ]);
    const inRange = croDailyRows.filter(r => r.date >= start && r.date <= end);
    const actionItems = findUnexplainedAnomalies(inRange, notes);
    res.json({ actionItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
