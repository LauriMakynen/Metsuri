import { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { parsePropertyCode } from '../services/cadastreService';
import { getForestValue, getManualForestValue } from '../services/forestValue/forestValueService';
import { validateManualInput } from '../services/forestValue/manualStand';

const router = Router();

// All property routes require authentication
router.use(authMiddleware);

// GET /api/properties - Get all properties for the authenticated user
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, name, property_code, source, area_ha,
              ST_AsGeoJSON(geometry)::json AS geometry,
              created_at, updated_at
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
      `INSERT INTO properties (user_id, name, geometry, source)
       VALUES ($1, $2, ST_GeomFromGeoJSON($3), 'manual')
       RETURNING id, name, property_code, source, area_ha,
                 ST_AsGeoJSON(geometry)::json AS geometry,
                 created_at, updated_at`,
      [req.userId, name, JSON.stringify(geometry)]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/properties/import - Save a cadastre search result as user's property
router.post('/import', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, property_code, geometry, area_ha } = req.body;

  if (!property_code || !geometry) {
    res.status(400).json({ error: 'Property code and geometry are required' });
    return;
  }

  // Store one canonical display form so the same parcel can't be saved twice in different spellings
  const parsedCode = typeof property_code === 'string' ? parsePropertyCode(property_code) : null;
  if (!parsedCode) {
    res.status(400).json({ error: 'Kiinteistötunnus on väärässä muodossa (esim. 91-401-5-24)' });
    return;
  }
  const propertyCode = parsedCode.display;

  const resolvedName = typeof name === 'string' && name.trim()
    ? name.trim()
    : `Kiinteisto ${propertyCode}`;

  try {
    const result = await pool.query(
      `INSERT INTO properties (user_id, name, property_code, source, area_ha, geometry)
       VALUES ($1, $2, $3, 'cadastre', $4, ST_GeomFromGeoJSON($5))
       RETURNING id, name, property_code, source, area_ha,
                 ST_AsGeoJSON(geometry)::json AS geometry,
                 created_at, updated_at`,
      [req.userId, resolvedName, propertyCode, area_ha || null, JSON.stringify(geometry)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === '23505') {
      res.status(409).json({ error: 'Kiinteistö on jo tallennettu omiin kiinteistöihin' });
      return;
    }
    console.error('Import property error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/properties/:id/markings - Get markings for one property the user owns
router.get('/:id/markings', async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const propCheck = await pool.query(
      'SELECT id FROM properties WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (propCheck.rows.length === 0) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }

    const result = await pool.query(
          `SELECT id, user_id, property_id, type, geometry_type, title, description,
            ST_AsGeoJSON(geometry)::json AS geometry, area_ha,
            operation_date, follow_up_date_start, follow_up_date_end, follow_up_note,
              created_at, updated_at
       FROM markings
       WHERE user_id = $1 AND property_id = $2
       ORDER BY created_at DESC`,
      [req.userId, id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get property markings error:', error);
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
    const updates: string[] = ['updated_at = NOW()'];
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
       RETURNING id, name, property_code, source, area_ha,
                 ST_AsGeoJSON(geometry)::json AS geometry,
                 created_at, updated_at`,
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

// GET /api/properties/:id/forest-value - Timber value, stands and recommended operations
// ?refresh=1 bypasses the result cache (external APIs are queried again)
router.get('/:id/forest-value', async (req: AuthRequest, res: Response): Promise<void> => {
  const propertyId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(propertyId)) {
    res.status(400).json({ error: 'Invalid property id' });
    return;
  }
  try {
    const response = await getForestValue(propertyId, req.userId as number, {
      refresh: req.query.refresh === '1',
    });
    if (!response) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    res.json(response);
  } catch (error) {
    console.error('Get forest value error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/properties/:id/forest-value/manual - Value from owner-entered basics
// (species, ageYears, volumeM3PerHa) when there is no forest resource data
router.post('/:id/forest-value/manual', async (req: AuthRequest, res: Response): Promise<void> => {
  const propertyId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(propertyId)) {
    res.status(400).json({ error: 'Invalid property id' });
    return;
  }
  const validated = validateManualInput(req.body);
  if ('error' in validated) {
    res.status(400).json({ error: validated.error });
    return;
  }
  try {
    const response = await getManualForestValue(propertyId, req.userId as number, validated.value);
    if (!response) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    res.json(response);
  } catch (error) {
    console.error('Manual forest value error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
