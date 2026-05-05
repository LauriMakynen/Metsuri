import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// All property routes require authentication
router.use(authMiddleware);

// GET /api/properties - Get all properties for the authenticated user
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, name, ST_AsGeoJSON(geometry)::json AS geometry, created_at
       FROM properties
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/properties - Create a new forest property
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, geometry } = req.body;

  if (!name || !geometry) {
    res.status(400).json({ error: 'Name and geometry are required' });
    return;
  }

  try {
    // Store geometry as PostGIS geometry from GeoJSON
    const result = await pool.query(
      `INSERT INTO properties (user_id, name, geometry)
       VALUES ($1, $2, ST_GeomFromGeoJSON($3))
       RETURNING id, name, ST_AsGeoJSON(geometry)::json AS geometry, created_at`,
      [req.userId, name, JSON.stringify(geometry)]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/properties/:id - Update a property (user must own it)
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, geometry } = req.body;

  if (!name && !geometry) {
    res.status(400).json({ error: 'At least name or geometry is required' });
    return;
  }

  try {
    // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (geometry) {
      updates.push(`geometry = ST_GeomFromGeoJSON($${paramCount++})`);
      values.push(JSON.stringify(geometry));
    }

    values.push(id, req.userId);

    const result = await pool.query(
      `UPDATE properties SET ${updates.join(', ')}
       WHERE id = $${paramCount++} AND user_id = $${paramCount}
       RETURNING id, name, ST_AsGeoJSON(geometry)::json AS geometry, created_at`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/properties/:id - Delete a property (user must own it)
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM properties WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }

    res.json({ message: 'Property deleted' });
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
