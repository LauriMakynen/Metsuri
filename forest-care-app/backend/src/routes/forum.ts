import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from '../middleware/auth';

// Forum ("Foorumi"): a simple discussion board. Anyone can read; posting needs an account.
// Authors are shown by nickname only: the API never returns emails or user ids.
const router = Router();

export const TITLE_MIN = 3;
export const TITLE_MAX = 150;
export const BODY_MAX = 5000;
export const NAME_MIN = 2;
export const NAME_MAX = 40;

/** Trimmed text within limits, or null. Exported for tests. */
export function cleanText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  // Collapse runs of blank lines so a post can't be padded into a wall of whitespace
  const text = value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.length >= min && text.length <= max ? text : null;
}

/** A nickname: no line breaks, single spaces. Exported for tests. */
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  return name.length >= NAME_MIN && name.length <= NAME_MAX ? name : null;
}

const NAME_ERROR = `Anna nimimerkki (${NAME_MIN}–${NAME_MAX} merkkiä)`;
const BODY_ERROR = `Kirjoita viesti (enintään ${BODY_MAX} merkkiä)`;

async function rememberName(userId: number, name: string): Promise<void> {
  await pool.query('UPDATE users SET display_name = $2 WHERE id = $1', [userId, name]);
}

// GET /api/forum/me - The nickname to prefill
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.userId]);
    res.json({ display_name: result.rows[0]?.display_name ?? null });
  } catch (error) {
    console.error('Get forum name error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/forum/threads - Latest discussions first
router.get('/threads', optionalAuthMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.title, t.created_at, t.last_post_at,
              first.author_name, LEFT(first.body, 200) AS preview,
              (SELECT COUNT(*)::int - 1 FROM forum_posts p WHERE p.thread_id = t.id) AS reply_count,
              COALESCE(t.user_id = $1, false) AS is_own
       FROM forum_threads t
       JOIN LATERAL (
         SELECT author_name, body FROM forum_posts p WHERE p.thread_id = t.id ORDER BY created_at, id LIMIT 1
       ) first ON true
       ORDER BY t.last_post_at DESC
       LIMIT 100`,
      [req.userId ?? null]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get forum threads error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/forum/threads - Start a discussion: { title, body, author_name }
router.post('/threads', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const title = cleanText(req.body?.title, TITLE_MIN, TITLE_MAX);
  const body = cleanText(req.body?.body, 1, BODY_MAX);
  const name = cleanName(req.body?.author_name);
  if (!title) {
    res.status(400).json({ error: `Anna otsikko (${TITLE_MIN}–${TITLE_MAX} merkkiä)` });
    return;
  }
  if (!body) {
    res.status(400).json({ error: BODY_ERROR });
    return;
  }
  if (!name) {
    res.status(400).json({ error: NAME_ERROR });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const thread = await client.query(
      'INSERT INTO forum_threads (user_id, title) VALUES ($1, $2) RETURNING id',
      [req.userId, title]
    );
    await client.query(
      'INSERT INTO forum_posts (thread_id, user_id, author_name, body) VALUES ($1, $2, $3, $4)',
      [thread.rows[0].id, req.userId, name, body]
    );
    await client.query('COMMIT');
    await rememberName(req.userId as number, name);
    res.status(201).json({ id: thread.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create forum thread error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// GET /api/forum/threads/:id - A discussion with its posts, oldest first
router.get('/threads/:id', optionalAuthMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const thread = await pool.query('SELECT id, title, created_at FROM forum_threads WHERE id = $1', [req.params.id]);
    if (thread.rows.length === 0) {
      res.status(404).json({ error: 'Keskustelua ei löytynyt' });
      return;
    }
    const posts = await pool.query(
      `SELECT id, author_name, body, created_at, COALESCE(user_id = $2, false) AS is_own
       FROM forum_posts WHERE thread_id = $1 ORDER BY created_at, id`,
      [req.params.id, req.userId ?? null]
    );
    res.json({ ...thread.rows[0], posts: posts.rows });
  } catch (error) {
    console.error('Get forum thread error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/forum/threads/:id/posts - Reply: { body, author_name }
router.post('/threads/:id/posts', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const body = cleanText(req.body?.body, 1, BODY_MAX);
  const name = cleanName(req.body?.author_name);
  if (!body) {
    res.status(400).json({ error: BODY_ERROR });
    return;
  }
  if (!name) {
    res.status(400).json({ error: NAME_ERROR });
    return;
  }
  try {
    const updated = await pool.query(
      'UPDATE forum_threads SET last_post_at = NOW() WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (updated.rows.length === 0) {
      res.status(404).json({ error: 'Keskustelua ei löytynyt' });
      return;
    }
    const post = await pool.query(
      `INSERT INTO forum_posts (thread_id, user_id, author_name, body) VALUES ($1, $2, $3, $4)
       RETURNING id, author_name, body, created_at, true AS is_own`,
      [req.params.id, req.userId, name, body]
    );
    await rememberName(req.userId as number, name);
    res.status(201).json(post.rows[0]);
  } catch (error) {
    console.error('Create forum post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/forum/posts/:id - Remove an own post; a discussion with no posts left goes too
router.delete('/posts/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const deleted = await pool.query(
      'DELETE FROM forum_posts WHERE id = $1 AND user_id = $2 RETURNING thread_id',
      [req.params.id, req.userId]
    );
    if (deleted.rows.length === 0) {
      res.status(404).json({ error: 'Viestiä ei löytynyt' });
      return;
    }
    const threadId = deleted.rows[0].thread_id;
    const left = await pool.query(
      `DELETE FROM forum_threads t WHERE t.id = $1
         AND NOT EXISTS (SELECT 1 FROM forum_posts p WHERE p.thread_id = t.id)
       RETURNING id`,
      [threadId]
    );
    res.json({ thread_deleted: left.rows.length > 0 });
  } catch (error) {
    console.error('Delete forum post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
