import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

// GET /api/work-request-photos/:photoId - Photo of an open work request. Public like the
// request list, so <img> tags work without a token; the owner's identity is not involved.
router.get('/:photoId', async (req: Request, res: Response): Promise<void> => {
  const { photoId } = req.params;

  if (!/^\d+$/.test(photoId)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT p.content_type, p.data
       FROM work_request_photos p
       JOIN work_requests wr ON wr.id = p.work_request_id
       WHERE p.id = $1 AND wr.status = 'open'`,
      [photoId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Kuvaa ei löytynyt' });
      return;
    }

    const { content_type, data } = result.rows[0];
    res.set({
      'Content-Type': content_type,
      'Content-Length': String(data.length),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      // A photo id never gets new content, only deleted
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(data);
  } catch (error) {
    console.error('Get work request photo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
