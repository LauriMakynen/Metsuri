/**
 * Markings Service - Backend business logic for managing forest markings
 */

import { pool } from '../db/pool';
import type { RequestQuery } from 'express-serve-static-core';

export interface CreateMarkingRequest {
  property_id?: number | null;
  type: string;
  geometry_type: string;
  title: string;
  description?: string;
  geometry: GeoJSON.Geometry;
  area_ha?: number | null;
}

export interface UpdateMarkingRequest {
  title?: string;
  description?: string;
  area_ha?: number | null;
}

/**
 * Create a new marking with optional area calculation
 */
export async function createMarking(data: CreateMarkingRequest) {
  const {
    property_id,
    type,
    geometry_type,
    title,
    description,
    geometry,
    area_ha,
  } = data;

  const query = `
    INSERT INTO markings (property_id, type, geometry_type, title, description, geometry, area_ha, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, ST_GeomFromGeoJSON($6), $7, NOW(), NOW())
    RETURNING id, property_id, type, geometry_type, title, description, 
              ST_AsGeoJSON(geometry)::jsonb AS geometry, area_ha, created_at, updated_at
  `;

  const result = await pool.query(query, [
    property_id,
    type,
    geometry_type,
    title,
    description || null,
    JSON.stringify(geometry),
    area_ha || null,
  ]);

  return result.rows[0];
}

/**
 * Get all markings for a property
 */
export async function getMarkingsByProperty(propertyId: number) {
  const query = `
    SELECT id, property_id, type, geometry_type, title, description,
           ST_AsGeoJSON(geometry)::jsonb AS geometry, area_ha, created_at, updated_at
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
    SELECT m.id, m.property_id, m.type, m.geometry_type, m.title, m.description,
           ST_AsGeoJSON(m.geometry)::jsonb AS geometry, m.area_ha, m.created_at, m.updated_at
    FROM markings m
    JOIN properties p ON m.property_id = p.id
    WHERE p.user_id = $1
    ORDER BY m.created_at DESC
  `;

  const result = await pool.query(query, [userId]);
  return result.rows;
}

/**
 * Delete a marking by ID
 */
export async function deleteMarking(id: number, userId: number) {
  const query = `
    DELETE FROM markings m
    USING properties p
    WHERE m.id = $1 AND m.property_id = p.id AND p.user_id = $2
    RETURNING m.id
  `;

  const result = await pool.query(query, [id, userId]);
  return result.rows[0];
}

/**
 * Update marking (including area)
 */
export async function updateMarking(id: number, userId: number, data: UpdateMarkingRequest) {
  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  let paramCount = 1;

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

  if (data.area_ha !== undefined) {
    updates.push(`area_ha = $${paramCount}`);
    values.push(data.area_ha);
    paramCount++;
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  updates.push(`updated_at = NOW()`);

  values.push(id);
  values.push(userId);

  const query = `
    UPDATE markings m
    SET ${updates.join(', ')}
    FROM properties p
    WHERE m.id = $${paramCount} AND m.property_id = p.id AND p.user_id = $${paramCount + 1}
    RETURNING m.id, m.property_id, m.type, m.geometry_type, m.title, m.description,
              ST_AsGeoJSON(m.geometry)::jsonb AS geometry, m.area_ha, m.created_at, m.updated_at
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
}
