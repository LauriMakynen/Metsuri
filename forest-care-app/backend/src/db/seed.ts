import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from './pool';

// Local test accounts. Password comes from SEED_PASSWORD in backend/.env
// (start.sh generates one if it is missing). Safe to run repeatedly.

const OWNER_EMAIL = 'admin@metsuri.test';
const PROVIDER_EMAIL = 'yrittaja@metsuri.test';

const PARCEL = {
  type: 'Polygon',
  coordinates: [[
    [25.0, 62.0], [25.0062, 61.9998], [25.0066, 62.0026],
    [25.0031, 62.0033], [24.9996, 62.0029], [25.0, 62.0],
  ]],
};

const HARVENNUS = {
  type: 'Polygon',
  coordinates: [[
    [25.0038, 62.0004], [25.0058, 62.0003], [25.006, 62.0016],
    [25.0041, 62.0018], [25.0038, 62.0004],
  ]],
};

const VESAKKO = {
  type: 'Polygon',
  coordinates: [[
    [25.0004, 62.0019], [25.0022, 62.0018], [25.0024, 62.0027],
    [25.0003, 62.0026], [25.0004, 62.0019],
  ]],
};

async function upsertUser(email: string, passwordHash: string): Promise<number> {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [email, passwordHash]
  );
  return result.rows[0].id;
}

async function seed() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('SEED_PASSWORD (min 8 merkkiä) puuttuu backend/.env-tiedostosta.');
  }
  const passwordHash = await bcrypt.hash(password, 10);

  const ownerId = await upsertUser(OWNER_EMAIL, passwordHash);
  await upsertUser(PROVIDER_EMAIL, passwordHash);

  // Example parcel with markings and one open work request for the owner (only once)
  const existing = await pool.query('SELECT id FROM properties WHERE user_id = $1 LIMIT 1', [ownerId]);
  if (existing.rows.length === 0) {
    const property = await pool.query(
      `INSERT INTO properties (user_id, name, source, area_ha, geometry)
       VALUES ($1, 'Testipalsta', 'manual', 11.2, ST_GeomFromGeoJSON($2)) RETURNING id`,
      [ownerId, JSON.stringify(PARCEL)]
    );
    const propertyId = property.rows[0].id;

    const harvennus = await pool.query(
      `INSERT INTO markings (user_id, property_id, type, geometry_type, title, description, geometry,
                             area_ha, operation_date)
       VALUES ($1, $2, 'harvennus', 'area', 'Ensiharvennus, kuusikko', 'Testidataa', ST_GeomFromGeoJSON($3),
               1.52, '2025-10-14') RETURNING id`,
      [ownerId, propertyId, JSON.stringify(HARVENNUS)]
    );
    await pool.query(
      `INSERT INTO markings (user_id, property_id, type, geometry_type, title, description, geometry,
                             area_ha, operation_date)
       VALUES ($1, $2, 'vesakonhoito', 'area', 'Taimikon vesakonhoito', 'Testidataa', ST_GeomFromGeoJSON($3),
               0.9, '2026-06-02')`,
      [ownerId, propertyId, JSON.stringify(VESAKKO)]
    );
    await pool.query(
      `INSERT INTO work_requests (user_id, marking_id, note) VALUES ($1, $2, 'Toive: syksy 2026. Tieyhteys hyvä.')`,
      [ownerId, harvennus.rows[0].id]
    );
  }

  console.log(`Testitunnukset valmiina: ${OWNER_EMAIL} ja ${PROVIDER_EMAIL} (salasana: SEED_PASSWORD backend/.env)`);
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
