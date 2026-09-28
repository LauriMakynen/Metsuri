import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const VALID_TYPES = ['vesakonhoito', 'istutus', 'harvennus', 'avohakkuu', 'muu_tyo'];
const MAX_NOTE_LENGTH = 1000;
const MAX_BID_EUR = 10_000_000;

// Chosen by the owner when publishing:
// owner_receives = timber sale (the buyer pays the owner) → highest offer is best,
// owner_pays = service (the owner pays the doer) → lowest offer is best.
const VALID_PRICING = ['owner_receives', 'owner_pays'];
const PRICING_SQL = 'wr.pricing';

// Bid summary for a work request row aliased wr
const BID_SUMMARY_JOIN = `
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS bid_count,
           CASE WHEN ${PRICING_SQL} = 'owner_receives' THEN MAX(amount_eur) ELSE MIN(amount_eur) END AS best_bid_eur,
           MAX(created_at) AS latest_bid_at
    FROM work_request_bids
    WHERE work_request_id = wr.id
  ) b ON true`;

/**
 * Open work requests as shown to work providers. Owner and bidder identities are never
 * exposed; with a logged-in viewer, is_own and my_bid_eur describe that viewer only.
 */
async function fetchPublicRequests(viewerId: number | null, filters: { type?: string; id?: number }) {
  const values: unknown[] = [viewerId];
  let where = `wr.status = 'open' AND m.geometry IS NOT NULL`;
  if (filters.type) {
    values.push(filters.type);
    where += ` AND m.type = $${values.length}`;
  }
  if (filters.id) {
    values.push(filters.id);
    where += ` AND wr.id = $${values.length}`;
  }

  const result = await pool.query(
    `SELECT wr.id, wr.note, wr.created_at,
            m.type, m.geometry_type, m.title, m.area_ha,
            ST_AsGeoJSON(m.geometry)::json AS geometry,
            ST_Y(ST_PointOnSurface(m.geometry)) AS lat,
            ST_X(ST_PointOnSurface(m.geometry)) AS lng,
            ${PRICING_SQL} AS pricing,
            b.bid_count, b.best_bid_eur, b.latest_bid_at,
            COALESCE(wr.user_id = $1, false) AS is_own,
            mine.my_bid_eur
     FROM work_requests wr
     JOIN markings m ON m.id = wr.marking_id
     ${BID_SUMMARY_JOIN}
     LEFT JOIN LATERAL (
       SELECT amount_eur AS my_bid_eur
       FROM work_request_bids
       WHERE work_request_id = wr.id AND user_id = $1
       ORDER BY created_at DESC
       LIMIT 1
     ) mine ON true
     WHERE ${where}
     ORDER BY wr.created_at DESC
     LIMIT 200`,
    values
  );
  return result.rows;
}

// GET /api/work-requests - Public list of open work requests for work providers.
router.get('/', optionalAuthMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const typeQuery = typeof req.query.type === 'string' ? req.query.type : undefined;

  if (typeQuery && !VALID_TYPES.includes(typeQuery)) {
    res.status(400).json({ error: 'Invalid type' });
    return;
  }

  try {
    res.json(await fetchPublicRequests(req.userId ?? null, { type: typeQuery }));
  } catch (error) {
    console.error('Get work requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/work-requests/mine - The authenticated owner's own work requests with bid summary
router.get('/mine', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT wr.id, wr.marking_id, wr.note, wr.status, wr.created_at, wr.updated_at,
              ${PRICING_SQL} AS pricing, b.bid_count, b.best_bid_eur, b.latest_bid_at
       FROM work_requests wr
       JOIN markings m ON m.id = wr.marking_id
       ${BID_SUMMARY_JOIN}
       WHERE wr.user_id = $1
       ORDER BY wr.created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get own work requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/work-requests/:id/bids - Offer a price (total €) for an open work request
router.post('/:id/bids', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const amount = Number(req.body?.amount_eur);

  if (!/^\d+$/.test(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_BID_EUR) {
    res.status(400).json({ error: `Tarjouksen pitää olla 0–${MAX_BID_EUR} €` });
    return;
  }

  try {
    const request = await pool.query('SELECT user_id, status FROM work_requests WHERE id = $1', [id]);
    if (request.rows.length === 0 || request.rows[0].status !== 'open') {
      res.status(404).json({ error: 'Työpyyntöä ei löytynyt tai se ei ole enää avoinna' });
      return;
    }
    if (request.rows[0].user_id === req.userId) {
      res.status(403).json({ error: 'Omaan työpyyntöön ei voi tehdä tarjousta' });
      return;
    }

    await pool.query(
      'INSERT INTO work_request_bids (work_request_id, user_id, amount_eur) VALUES ($1, $2, $3)',
      [id, req.userId, Math.round(amount * 100) / 100]
    );

    const [updated] = await fetchPublicRequests(req.userId ?? null, { id: Number(id) });
    res.status(201).json(updated);
  } catch (error) {
    console.error('Create bid error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/work-requests - Publish (or re-open) a work request for one of the user's markings
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { marking_id, note, pricing } = req.body;

  if (!Number.isInteger(marking_id)) {
    res.status(400).json({ error: 'marking_id is required' });
    return;
  }
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH)) {
    res.status(400).json({ error: `note must be a string of at most ${MAX_NOTE_LENGTH} characters` });
    return;
  }
  if (!VALID_PRICING.includes(pricing)) {
    res.status(400).json({ error: 'Valitse, onko kyse puukaupasta vai palvelutyöstä' });
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
      `INSERT INTO work_requests (user_id, marking_id, note, pricing)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (marking_id)
       DO UPDATE SET note = EXCLUDED.note, pricing = EXCLUDED.pricing, status = 'open', updated_at = NOW()
       RETURNING id, marking_id, note, status, pricing, created_at, updated_at,
                 0 AS bid_count, NULL AS best_bid_eur, NULL AS latest_bid_at`,
      [req.userId, marking_id, note?.trim() || null, pricing]
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
