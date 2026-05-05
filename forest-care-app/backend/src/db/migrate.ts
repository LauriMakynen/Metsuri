import 'dotenv/config';
import pool from './pool';

// Database migration script - creates all required tables
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Enable PostGIS extension for geographic data support
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis');

    // Users table for authentication
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Forest properties table with PostGIS geometry column for polygon areas
    await client.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        geometry GEOMETRY(GEOMETRY, 4326) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Map markings table supporting points, lines, areas, and text notes
    await client.query(`
      CREATE TABLE IF NOT EXISTS markings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN (
          'vesakonhoito', 'istutus', 'harvennus', 'avohakkuu', 'muu_tyo'
        )),
        geometry_type VARCHAR(20) NOT NULL CHECK (geometry_type IN (
          'point', 'line', 'area', 'note'
        )),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        geometry GEOMETRY(GEOMETRY, 4326),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Spatial indexes for faster geographic queries
    await client.query(
      'CREATE INDEX IF NOT EXISTS properties_geometry_idx ON properties USING GIST(geometry)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS markings_geometry_idx ON markings USING GIST(geometry)'
    );

    // Index on user_id for fast user-specific queries
    await client.query(
      'CREATE INDEX IF NOT EXISTS properties_user_id_idx ON properties(user_id)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS markings_user_id_idx ON markings(user_id)'
    );

    await client.query('COMMIT');
    console.log('Migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
