import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const VALID_TYPES = ['vesakonhoito', 'istutus', 'harvennus', 'avohakkuu', 'muu_tyo'];
const MAX_NOTE_LENGTH = 1000;

// GET /api/work-requests - Public list of open work requests for work providers.
// Owner identity (email, user id) is never exposed here.
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const typeQuery = typeof req.query.type === 'string' ? req.query.type : undefined;

  if (typeQuery && !VALID_TYPES.includes(typeQuery)) {
    res.status(400).json({ error: 'Invalid type' });
    return;
  }

  try {
    const values: unknown[] = [];
    let typeClause = '';
    if (typeQuery) {
      values.push(typeQuery);
      typeClause = 'AND m.type = $1';
    }

    const result = await pool.query(
      `SELECT wr.id, wr.note, wr.created_at,
              m.type, m.geometry_type, m.title, m.area_ha,
              ST_AsGeoJSON(m.geometry)::json AS geometry,
              ST_Y(ST_PointOnSurface(m.geometry)) AS lat,
              ST_X(ST_PointOnSurface(m.geometry)) AS lng
       FROM work_requests wr
       JOIN markings m ON m.id = wr.marking_id
       WHERE wr.status = 'open' AND m.geometry IS NOT NULL ${typeClause}
       ORDER BY wr.created_at DESC
       LIMIT 200`,
      values
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get work requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/work-requests/mine - The authenticated owner's own work requests
router.get('/mine', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, marking_id, note, status, created_at, updated_at
       FROM work_requests
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get own work requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/work-requests - Publish (or re-open) a work request for one of the user's markings
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { marking_id, note } = req.body;

  if (!Number.isInteger(marking_id)) {
    res.status(400).json({ error: 'marking_id is required' });
    return;
  }
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH)) {
    res.status(400).json({ error: `note must be a string of at most ${MAX_NOTE_LENGTH} characters` });
    return;
  }

  try {
    const markingCheck = await pool.query(
      'SELECT id, geometry IS NOT NULL AS has_geometry FROM markings WHERE id = $1 AND user_id = $2',
      [marking_id, req.userId]
    );
    if (markingCheck.rows.length === 0) {
      res.status(404).json({ error: 'Marking not found' });
      return;
    }
    if (!markingCheck.rows[0].has_geometry) {
      res.status(400).json({ error: 'Work requests need a marking with a location on the map' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO work_requests (user_id, marking_id, note)
       VALUES ($1, $2, $3)
       ON CONFLICT (marking_id)
       DO UPDATE SET note = EXCLUDED.note, status = 'open', updated_at = NOW()
       RETURNING id, marking_id, note, status, created_at, updated_at`,
      [req.userId, marking_id, note?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create work request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/work-requests/:id - Withdraw a work request (user must own it)
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  try {
    const result = await pool.query(
      'DELETE FROM work_requests WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Work request not found' });
      return;
    }
    res.json({ message: 'Work request withdrawn' });
  } catch (error) {
    console.error('Delete work request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
