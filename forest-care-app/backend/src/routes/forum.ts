import { Router, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import pool from '../db/pool';
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from '../middleware/auth';
import { forumWriteMiddleware } from '../middleware/forum';

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
export const MODERATOR_REMOVED_MESSAGE = 'Viesti poistettu ylläpidon toimesta';
export const REPORTED_HIDDEN_MESSAGE = 'Viesti piilotettu ilmoitusten vuoksi';
export const REPORT_HIDE_THRESHOLD = 3;
export const REPORT_REASONS = [
  'abusive_language',
  'harassment',
  'spam',
  'personal_information',
  'other',
] as const;
export type ForumReportReason = (typeof REPORT_REASONS)[number];

export function isForumReportReason(value: unknown): value is ForumReportReason {
  return REPORT_REASONS.some((reason) => reason === value);
}

export function shouldHideReportedPost(reportCount: number): boolean {
  return reportCount >= REPORT_HIDE_THRESHOLD;
}

const forumPostLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const userId = (req as AuthRequest).userId;
    return userId === undefined ? ipKeyGenerator(req.ip ?? '127.0.0.1') : `user:${userId}`;
  },
  message: { error: 'Voit lähettää enintään 10 viestiä 10 minuutissa.' },
  standardHeaders: true,
  legacyHeaders: false,
});

async function rememberName(userId: number, name: string): Promise<void> {
  await pool.query('UPDATE users SET display_name = $2 WHERE id = $1', [userId, name]);
}

// GET /api/forum/me - The nickname to prefill
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT display_name, role, forum_banned FROM users WHERE id = $1',
      [req.userId]
    );
    res.json({
      display_name: result.rows[0]?.display_name ?? null,
      role: result.rows[0]?.role ?? 'user',
      forum_banned: result.rows[0]?.forum_banned ?? false,
    });
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
              first.author_name,
              CASE WHEN first.hidden_at IS NOT NULL THEN $2 ELSE LEFT(first.body, 200) END AS preview,
              (SELECT COUNT(*)::int - 1 FROM forum_posts p WHERE p.thread_id = t.id) AS reply_count,
              COALESCE(t.user_id = $1, false) AS is_own
       FROM forum_threads t
       JOIN LATERAL (
         SELECT author_name, body, hidden_at
         FROM forum_posts p WHERE p.thread_id = t.id ORDER BY created_at, id LIMIT 1
       ) first ON true
       ORDER BY t.last_post_at DESC
       LIMIT 100`,
      [req.userId ?? null, REPORTED_HIDDEN_MESSAGE]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get forum threads error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/forum/threads - Start a discussion: { title, body, author_name }
router.post('/threads', authMiddleware, forumWriteMiddleware, forumPostLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
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
      `SELECT id, author_name,
              CASE WHEN hidden_at IS NOT NULL THEN $3 ELSE body END AS body,
              created_at, COALESCE(user_id = $2, false) AS is_own,
              hidden_at IS NOT NULL AS is_hidden,
              moderator_deleted_at IS NOT NULL AS is_deleted,
              EXISTS (
                SELECT 1 FROM forum_reports r WHERE r.post_id = forum_posts.id AND r.reporter_id = $2
              ) AS has_reported
       FROM forum_posts WHERE thread_id = $1 ORDER BY created_at, id`,
      [req.params.id, req.userId ?? null, REPORTED_HIDDEN_MESSAGE]
    );
    res.json({ ...thread.rows[0], posts: posts.rows });
  } catch (error) {
    console.error('Get forum thread error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/forum/threads/:id/posts - Reply: { body, author_name }
router.post('/threads/:id/posts', authMiddleware, forumWriteMiddleware, forumPostLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
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
       RETURNING id, author_name, body, created_at, true AS is_own,
                 false AS is_hidden, false AS is_deleted, false AS has_reported`,
      [req.params.id, req.userId, name, body]
    );
    await rememberName(req.userId as number, name);
    res.status(201).json(post.rows[0]);
  } catch (error) {
    console.error('Create forum post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/forum/posts/:id/reports - Report another user's post
router.post('/posts/:id/reports', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!/^\d+$/.test(req.params.id)) {
    res.status(400).json({ error: 'Virheellinen viestin tunniste' });
    return;
  }
  if (!isForumReportReason(req.body?.reason)) {
    res.status(400).json({ error: 'Valitse ilmoitukselle syy' });
    return;
  }

  const rawNote = req.body?.note;
  if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') {
    res.status(400).json({ error: 'Lisätieto ei kelpaa' });
    return;
  }
  const note = typeof rawNote === 'string' ? rawNote.trim() : null;
  if (note && note.length > 1000) {
    res.status(400).json({ error: 'Lisätieto voi olla enintään 1000 merkkiä' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const post = await client.query(
      'SELECT id, user_id, moderator_deleted_at FROM forum_posts WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (post.rows.length === 0 || post.rows[0].moderator_deleted_at) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Viestiä ei löytynyt' });
      return;
    }
    if (post.rows[0].user_id === req.userId) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Et voi ilmoittaa omasta viestistäsi' });
      return;
    }

    const inserted = await client.query(
      `INSERT INTO forum_reports (post_id, reporter_id, reason, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (post_id, reporter_id) DO NOTHING
       RETURNING id`,
      [req.params.id, req.userId, req.body.reason, note || null]
    );
    if (inserted.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Olet jo ilmoittanut tästä viestistä' });
      return;
    }

    const count = await client.query(
      `SELECT COUNT(DISTINCT reporter_id)::int AS count FROM forum_reports
       WHERE post_id = $1 AND resolved_at IS NULL`,
      [req.params.id]
    );
    if (shouldHideReportedPost(count.rows[0].count)) {
      await client.query(
        'UPDATE forum_posts SET hidden_at = COALESCE(hidden_at, NOW()) WHERE id = $1',
        [req.params.id]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ message: 'Kiitos, ilmoitus vastaanotettu' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create forum report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
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
