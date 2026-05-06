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
        property_code TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        area_ha NUMERIC,
        geometry GEOMETRY(GEOMETRY, 4326) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Ensure new columns exist for older databases
    await client.query('ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_code TEXT');
    await client.query("ALTER TABLE properties ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'");
    await client.query('ALTER TABLE properties ADD COLUMN IF NOT EXISTS area_ha NUMERIC');
    await client.query('ALTER TABLE properties ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');

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
    await client.query(
      'CREATE INDEX IF NOT EXISTS properties_property_code_idx ON properties(property_code)'
    );
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS properties_user_property_code_unique
      ON properties(user_id, property_code)
      WHERE property_code IS NOT NULL
    `);

    // Forest stand data – future Metsäkeskus avoin metsävaratieto integration
    await client.query(`
      CREATE TABLE IF NOT EXISTS forest_stand_data (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pine_volume_m3 NUMERIC,
        spruce_volume_m3 NUMERIC,
        birch_volume_m3 NUMERIC,
        other_volume_m3 NUMERIC,
        total_volume_m3 NUMERIC,
        development_class VARCHAR(10),
        soil_type VARCHAR(50),
        data_source TEXT,
        data_year INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS forest_stand_data_property_id_idx ON forest_stand_data(property_id)'
    );

    // Forest valuation – future timber value estimation
    await client.query(`
      CREATE TABLE IF NOT EXISTS forest_valuation (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        estimated_value_eur NUMERIC,
        timber_value_eur NUMERIC,
        land_value_eur NUMERIC,
        valuation_method TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS forest_valuation_property_id_idx ON forest_valuation(property_id)'
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
