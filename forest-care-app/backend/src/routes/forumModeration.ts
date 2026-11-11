import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { forumAdminMiddleware } from '../middleware/forum';
import { MODERATOR_REMOVED_MESSAGE } from './forum';

const router = Router();
router.use(authMiddleware, forumAdminMiddleware);

// GET /api/forum/admin/reports - Open reports grouped by post, without reporter identities
router.get('/reports', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT p.id AS post_id, p.thread_id, t.title AS thread_title, p.user_id AS author_user_id,
              p.author_name, p.body, p.created_at,
              COALESCE(u.forum_banned, false) AS author_banned,
              COUNT(r.id)::int AS report_count,
              json_agg(json_build_object(
                'reason', r.reason, 'note', r.note, 'created_at', r.created_at
              ) ORDER BY r.created_at) AS reports
       FROM forum_reports r
       JOIN forum_posts p ON p.id = r.post_id
       JOIN forum_threads t ON t.id = p.thread_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE r.resolved_at IS NULL
       GROUP BY p.id, t.id, u.forum_banned
       ORDER BY MIN(r.created_at), p.id`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get forum moderation reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/forum/admin/reports/:postId/resolve - Resolve all open reports with no action
router.post('/reports/:postId/resolve', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!/^\d+$/.test(req.params.postId)) {
    res.status(400).json({ error: 'Virheellinen viestin tunniste' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const post = await client.query('SELECT id FROM forum_posts WHERE id = $1 FOR UPDATE', [req.params.postId]);
    if (post.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Viestiä ei löytynyt' });
      return;
    }
    await client.query(
      `UPDATE forum_reports SET resolved_at = NOW(), resolved_by = $2
       WHERE post_id = $1 AND resolved_at IS NULL`,
      [req.params.postId, req.userId]
    );
    await client.query('UPDATE forum_posts SET hidden_at = NULL WHERE id = $1', [req.params.postId]);
    await client.query('COMMIT');
    res.json({ resolved: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Resolve forum reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// DELETE /api/forum/admin/posts/:id - Replace a post body and preserve its place in the thread
router.delete('/posts/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Virheellinen viestin tunniste' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const removed = await client.query(
      `UPDATE forum_posts SET body = $2, hidden_at = NULL, moderator_deleted_at = NOW()
       WHERE id = $1 RETURNING id`,
      [req.params.id, MODERATOR_REMOVED_MESSAGE]
    );
    if (removed.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Viestiä ei löytynyt' });
      return;
    }
    await client.query(
      `UPDATE forum_reports SET resolved_at = NOW(), resolved_by = $2
       WHERE post_id = $1 AND resolved_at IS NULL`,
      [req.params.id, req.userId]
    );
    await client.query('COMMIT');
    res.json({ deleted: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Remove forum post as admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// DELETE /api/forum/admin/threads/:id - Remove an entire discussion
router.delete('/threads/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Virheellinen keskustelun tunniste' });
    return;
  }
  try {
    const removed = await pool.query('DELETE FROM forum_threads WHERE id = $1 RETURNING id', [req.params.id]);
    if (removed.rows.length === 0) {
      res.status(404).json({ error: 'Keskustelua ei löytynyt' });
      return;
    }
    res.json({ deleted: true });
  } catch (error) {
    console.error('Remove forum thread as admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/forum/admin/users/:id/forum-ban - Set or remove a persistent forum writing ban
router.put('/users/:id/forum-ban', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!/^\d+$/.test(req.params.id) || typeof req.body?.banned !== 'boolean') {
    res.status(400).json({ error: 'Virheellinen käyttäjä tai eston tila' });
    return;
  }
  try {
    const updated = await pool.query(
      'UPDATE users SET forum_banned = $2 WHERE id = $1 RETURNING forum_banned',
      [req.params.id, req.body.banned]
    );
    if (updated.rows.length === 0) {
      res.status(404).json({ error: 'Käyttäjää ei löytynyt' });
      return;
    }
    res.json({ banned: updated.rows[0].forum_banned });
  } catch (error) {
    console.error('Update forum writing ban error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
