/**
 * Markings Service - Backend business logic for managing forest markings
 */

import pool from '../db/pool';

export interface CreateMarkingRequest {
  property_id?: number | null;
  user_id: number;
  type: string;
  geometry_type: string;
  title: string;
  description?: string;
  geometry?: unknown;
  area_ha?: number | null;
  operation_date?: string | null;
  follow_up_date_start?: string | null;
  follow_up_date_end?: string | null;
  follow_up_note?: string | null;
}

export interface UpdateMarkingRequest {
  type?: string;
  geometry_type?: string;
  title?: string;
  description?: string;
  geometry?: unknown;
  property_id?: number | null;
  area_ha?: number | null;
  operation_date?: string | null;
  follow_up_date_start?: string | null;
  follow_up_date_end?: string | null;
  follow_up_note?: string | null;
}

/**
 * Create a new marking with optional area calculation
 */
export async function createMarking(data: CreateMarkingRequest) {
  const {
    user_id,
    property_id,
    type,
    geometry_type,
    title,
    description,
    geometry,
    area_ha,
    operation_date,
    follow_up_date_start,
    follow_up_date_end,
    follow_up_note,
  } = data;

  const query = `
    INSERT INTO markings (
      user_id, property_id, type, geometry_type, title, description,
      geometry, area_ha, operation_date, follow_up_date_start, follow_up_date_end, follow_up_note,
      created_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      CASE WHEN $7::text IS NULL THEN NULL ELSE ST_GeomFromGeoJSON($7::text) END,
      $8, $9, $10, $11, $12,
      NOW(), NOW()
    )
    RETURNING id, user_id, property_id, type, geometry_type, title, description,
              ST_AsGeoJSON(geometry)::jsonb AS geometry, area_ha,
              operation_date, follow_up_date_start, follow_up_date_end, follow_up_note,
              created_at, updated_at
  `;

  const result = await pool.query(query, [
    user_id,
    property_id,
    type,
    geometry_type,
    title,
    description || null,
    geometry ? JSON.stringify(geometry) : null,
    area_ha ?? null,
    operation_date ?? null,
    follow_up_date_start ?? null,
    follow_up_date_end ?? null,
    follow_up_note ?? null,
  ]);

  return result.rows[0];
}

/**
 * Get all markings for a property
 */
export async function getMarkingsByProperty(propertyId: number) {
  const query = `
    SELECT id, user_id, property_id, type, geometry_type, title, description,
      ST_AsGeoJSON(geometry)::jsonb AS geometry, area_ha,
      operation_date, follow_up_date_start, follow_up_date_end, follow_up_note,
      created_at, updated_at
    FROM markings
    WHERE property_id = $1
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query, [propertyId]);
  return result.rows;
}

/**
 * Get all markings for a user
 */
export async function getAllMarkings(userId: number) {
  const query = `
    SELECT id, user_id, property_id, type, geometry_type, title, description,
      ST_AsGeoJSON(geometry)::jsonb AS geometry, area_ha,
      operation_date, follow_up_date_start, follow_up_date_end, follow_up_note,
      created_at, updated_at
    FROM markings
    WHERE user_id = $1
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query, [userId]);
  return result.rows;
}

/**
 * Delete a marking by ID
 */
export async function deleteMarking(id: number, userId: number) {
  const query = `
    DELETE FROM markings
    WHERE id = $1 AND user_id = $2
    RETURNING id
  `;

  const result = await pool.query(query, [id, userId]);
  return result.rows[0];
}

/**
 * Update marking (including area)
 */
export async function updateMarking(id: number, userId: number, data: UpdateMarkingRequest) {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (data.type !== undefined) {
    updates.push(`type = $${paramCount}`);
    values.push(data.type);
    paramCount++;
  }

  if (data.geometry_type !== undefined) {
    updates.push(`geometry_type = $${paramCount}`);
    values.push(data.geometry_type);
    paramCount++;
  }

  if (data.title !== undefined) {
    updates.push(`title = $${paramCount}`);
    values.push(data.title);
    paramCount++;
  }

  if (data.description !== undefined) {
    updates.push(`description = $${paramCount}`);
    values.push(data.description || null);
    paramCount++;
  }

  if (data.geometry !== undefined) {
    updates.push(`geometry = CASE WHEN $${paramCount}::text IS NULL THEN NULL ELSE ST_GeomFromGeoJSON($${paramCount}::text) END`);
    values.push(data.geometry ? JSON.stringify(data.geometry) : null);
    paramCount++;
  }

  if (data.property_id !== undefined) {
    updates.push(`property_id = $${paramCount}`);
    values.push(data.property_id ?? null);
    paramCount++;
  }

  if (data.area_ha !== undefined) {
    updates.push(`area_ha = $${paramCount}`);
    values.push(data.area_ha ?? null);
    paramCount++;
  }

  if (data.operation_date !== undefined) {
    updates.push(`operation_date = $${paramCount}`);
    values.push(data.operation_date ?? null);
    paramCount++;
  }

  if (data.follow_up_date_start !== undefined) {
    updates.push(`follow_up_date_start = $${paramCount}`);
    values.push(data.follow_up_date_start ?? null);
    paramCount++;
  }

  if (data.follow_up_date_end !== undefined) {
    updates.push(`follow_up_date_end = $${paramCount}`);
    values.push(data.follow_up_date_end ?? null);
    paramCount++;
  }

  if (data.follow_up_note !== undefined) {
    updates.push(`follow_up_note = $${paramCount}`);
    values.push(data.follow_up_note ?? null);
    paramCount++;
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  updates.push(`updated_at = NOW()`);

  values.push(id);
  values.push(userId);

  const query = `
    UPDATE markings
    SET ${updates.join(', ')}
    WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
    RETURNING id, user_id, property_id, type, geometry_type, title, description,
              ST_AsGeoJSON(geometry)::jsonb AS geometry, area_ha,
              operation_date, follow_up_date_start, follow_up_date_end, follow_up_note,
              created_at, updated_at
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
}
