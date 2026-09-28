import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const VALID_TYPES = ['vesakonhoito', 'istutus', 'harvennus', 'avohakkuu', 'muu_tyo'];
const VALID_GEOMETRIES = ['Polygon', 'MultiPolygon', 'Point'];
const MAX_NOTE_LENGTH = 1000;
const MAX_TITLE_LENGTH = 255;
const MAX_EUR = 10_000_000;

// Chosen by the owner when publishing:
// owner_receives = timber sale (the buyer pays the owner) → highest offer is best,
// owner_pays = service (the owner pays the doer) → lowest offer is best.
const VALID_PRICING = ['owner_receives', 'owner_pays'];

// Bid summary for a work request row aliased wr
const BID_SUMMARY_JOIN = `
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS bid_count,
           CASE WHEN wr.pricing = 'owner_receives' THEN MAX(amount_eur) ELSE MIN(amount_eur) END AS best_bid_eur,
           MAX(created_at) AS latest_bid_at
    FROM work_request_bids
    WHERE work_request_id = wr.id
  ) b ON true`;

// Columns describing the requested work itself
const REQUEST_COLUMNS = `
  wr.id, wr.note, wr.created_at, wr.type, wr.title, wr.area_ha, wr.pricing, wr.target_price_eur,
  CASE WHEN GeometryType(wr.geometry) = 'POINT' THEN 'point' ELSE 'area' END AS geometry_type,
  ST_AsGeoJSON(wr.geometry)::json AS geometry,
  b.bid_count, b.best_bid_eur, b.latest_bid_at`;

function isValidEur(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_EUR;
}

/**
 * Open work requests as shown to work providers. Owner and bidder identities are never
 * exposed; with a logged-in viewer, is_own and my_bid_eur describe that viewer only.
 */
async function fetchPublicRequests(viewerId: number | null, filters: { type?: string; id?: number }) {
  const values: unknown[] = [viewerId];
  let where = `wr.status = 'open'`;
  if (filters.type) {
    values.push(filters.type);
    where += ` AND wr.type = $${values.length}`;
  }
  if (filters.id) {
    values.push(filters.id);
    where += ` AND wr.id = $${values.length}`;
  }

  const result = await pool.query(
    `SELECT ${REQUEST_COLUMNS},
            ST_Y(ST_PointOnSurface(wr.geometry)) AS lat,
            ST_X(ST_PointOnSurface(wr.geometry)) AS lng,
            COALESCE(wr.user_id = $1, false) AS is_own,
            mine.my_bid_eur
     FROM work_requests wr
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

async function fetchOwnRequests(userId: number, id?: number) {
  const values: unknown[] = [userId];
  let where = 'wr.user_id = $1';
  if (id) {
    values.push(id);
    where += ' AND wr.id = $2';
  }
  const result = await pool.query(
    `SELECT ${REQUEST_COLUMNS}, wr.property_id, wr.status, wr.updated_at
     FROM work_requests wr
     ${BID_SUMMARY_JOIN}
     WHERE ${where}
     ORDER BY wr.created_at DESC`,
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
    res.json(await fetchOwnRequests(req.userId as number));
  } catch (error) {
    console.error('Get own work requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/work-requests - Publish planned work on one of the user's parcels
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { property_id, type, title, geometry, note, pricing, target_price_eur } = req.body ?? {};

  if (!Number.isInteger(property_id)) {
    res.status(400).json({ error: 'property_id is required' });
    return;
  }
  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }
  if (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE_LENGTH) {
    res.status(400).json({ error: 'Anna työpyynnölle otsikko' });
    return;
  }
  if (!geometry || !VALID_GEOMETRIES.includes(geometry.type)) {
    res.status(400).json({ error: 'Merkitse työn alue kartalle' });
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
  if (!isValidEur(target_price_eur)) {
    res.status(400).json({ error: `Anna hinta euroina (0–${MAX_EUR} €)` });
    return;
  }

  try {
    const propCheck = await pool.query('SELECT id FROM properties WHERE id = $1 AND user_id = $2', [
      property_id,
      req.userId,
    ]);
    if (propCheck.rows.length === 0) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }

    // Area is computed on the server from the geometry (geodesic), not trusted from the client
    const inserted = await pool.query(
      `INSERT INTO work_requests (user_id, property_id, type, title, geometry, area_ha, note, pricing, target_price_eur)
       VALUES ($1, $2, $3, $4, ST_GeomFromGeoJSON($5),
               CASE WHEN GeometryType(ST_GeomFromGeoJSON($5)) = 'POINT' THEN NULL
                    ELSE ROUND((ST_Area(ST_GeomFromGeoJSON($5)::geography) / 10000)::numeric, 2) END,
               $6, $7, $8)
       RETURNING id`,
      [
        req.userId, property_id, type, title.trim(), JSON.stringify(geometry),
        typeof note === 'string' && note.trim() ? note.trim() : null,
        pricing, Math.round(target_price_eur * 100) / 100,
      ]
    );
    const [created] = await fetchOwnRequests(req.userId as number, inserted.rows[0].id);
    res.status(201).json(created);
  } catch (error) {
    console.error('Create work request error:', error);
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
  if (!isValidEur(amount)) {
    res.status(400).json({ error: `Tarjouksen pitää olla 0–${MAX_EUR} €` });
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
