import express from 'express';
import multer from 'multer';
import { parseMetaReport } from '../services/metaParser.js';
import { appendRows } from '../db/sheetsDb.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/meta/upload — multipart form, field name "file". Appends parsed rows to meta_reports tab.
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded — expected multipart field "file"' });

  try {
    const { accountTotalRow, campaignRows } = parseMetaReport(req.file.buffer);
    const uploadedAt = new Date().toISOString();

    const allRows = [];
    if (accountTotalRow) allRows.push([uploadedAt, ...accountTotalRow]);
    for (const row of campaignRows) allRows.push([uploadedAt, ...row]);

    await appendRows('meta_reports', allRows);

    res.json({
      uploaded: true,
      accountTotalIncluded: !!accountTotalRow,
      campaignRowCount: campaignRows.length
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
