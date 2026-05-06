import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// All marking routes require authentication
router.use(authMiddleware);

// Valid marking types as defined in the database schema
const VALID_TYPES = ['vesakonhoito', 'istutus', 'harvennus', 'avohakkuu', 'muu_tyo'];
const VALID_GEOMETRY_TYPES = ['point', 'line', 'area', 'note'];

// GET /api/markings - Get all markings for the authenticated user
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const propertyIdQuery = typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;

  if (propertyIdQuery && !/^\d+$/.test(propertyIdQuery)) {
    res.status(400).json({ error: 'Invalid propertyId' });
    return;
  }

  try {
    if (propertyIdQuery) {
      const propCheck = await pool.query(
        'SELECT id FROM properties WHERE id = $1 AND user_id = $2',
        [propertyIdQuery, req.userId]
      );

      if (propCheck.rows.length === 0) {
        res.status(404).json({ error: 'Property not found' });
        return;
      }
    }

    const queryValues: unknown[] = [req.userId];
    let whereClause = 'WHERE user_id = $1';
    if (propertyIdQuery) {
      whereClause += ' AND property_id = $2';
      queryValues.push(propertyIdQuery);
    }

    const result = await pool.query(
      `SELECT id, property_id, type, geometry_type, title, description,
              ST_AsGeoJSON(geometry)::json AS geometry,
              created_at, updated_at
       FROM markings
       ${whereClause}
       ORDER BY created_at DESC`,
      queryValues
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get markings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/markings - Create a new map marking
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { property_id, type, geometry_type, title, description, geometry } = req.body;

  if (!type || !geometry_type || !title) {
    res.status(400).json({ error: 'Type, geometry_type, and title are required' });
    return;
  }

  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }

  if (!VALID_GEOMETRY_TYPES.includes(geometry_type)) {
    res.status(400).json({
      error: `Invalid geometry_type. Must be one of: ${VALID_GEOMETRY_TYPES.join(', ')}`,
    });
    return;
  }

  try {
    // If property_id is given, verify the user owns it
    if (property_id) {
      const propCheck = await pool.query(
        'SELECT id FROM properties WHERE id = $1 AND user_id = $2',
        [property_id, req.userId]
      );
      if (propCheck.rows.length === 0) {
        res.status(404).json({ error: 'Property not found' });
        return;
      }
    }

    let result;
    if (geometry) {
      result = await pool.query(
        `INSERT INTO markings (user_id, property_id, type, geometry_type, title, description, geometry)
         VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromGeoJSON($7))
         RETURNING id, property_id, type, geometry_type, title, description,
                   ST_AsGeoJSON(geometry)::json AS geometry,
                   created_at, updated_at`,
        [req.userId, property_id || null, type, geometry_type, title, description || null, JSON.stringify(geometry)]
      );
    } else {
      result = await pool.query(
        `INSERT INTO markings (user_id, property_id, type, geometry_type, title, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, property_id, type, geometry_type, title, description,
                   geometry,
                   created_at, updated_at`,
        [req.userId, property_id || null, type, geometry_type, title, description || null]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create marking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/markings/:id - Update a marking (user must own it)
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { type, geometry_type, title, description, geometry, property_id } = req.body;

  try {
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramCount = 1;

    if (type) {
      if (!VALID_TYPES.includes(type)) {
        res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
        return;
      }
      updates.push(`type = $${paramCount++}`);
      values.push(type);
    }
    if (geometry_type) {
      if (!VALID_GEOMETRY_TYPES.includes(geometry_type)) {
        res.status(400).json({
          error: `Invalid geometry_type. Must be one of: ${VALID_GEOMETRY_TYPES.join(', ')}`,
        });
        return;
      }
      updates.push(`geometry_type = $${paramCount++}`);
      values.push(geometry_type);
    }
    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (geometry) {
      updates.push(`geometry = ST_GeomFromGeoJSON($${paramCount++})`);
      values.push(JSON.stringify(geometry));
    }
    if (property_id !== undefined) {
      updates.push(`property_id = $${paramCount++}`);
      values.push(property_id);
    }

    values.push(id, req.userId);

    const result = await pool.query(
      `UPDATE markings SET ${updates.join(', ')}
       WHERE id = $${paramCount++} AND user_id = $${paramCount}
       RETURNING id, property_id, type, geometry_type, title, description,
                 ST_AsGeoJSON(geometry)::json AS geometry,
                 created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Marking not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update marking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/markings/:id - Delete a marking (user must own it)
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM markings WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Marking not found' });
      return;
    }

    res.json({ message: 'Marking deleted' });
  } catch (error) {
    console.error('Delete marking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
