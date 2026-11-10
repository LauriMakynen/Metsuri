import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, type, title, body, link, read_at, created_at,
              COUNT(*) FILTER (WHERE read_at IS NULL) OVER ()::int AS unread_count
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [req.userId]
    );
    res.json({
      notifications: result.rows.map(({ unread_count, ...notification }) => notification),
      unreadCount: result.rows[0]?.unread_count ?? 0,
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Ilmoitusten lataaminen epäonnistui' });
  }
});

router.post('/read-all', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query(
      'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
      [req.userId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Ilmoitusten kuittaaminen epäonnistui' });
  }
});

router.post('/:id/read', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const result = await pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2
       RETURNING id, read_at`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Ilmoitusta ei löytynyt' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Ilmoituksen kuittaaminen epäonnistui' });
  }
});

export default router;
