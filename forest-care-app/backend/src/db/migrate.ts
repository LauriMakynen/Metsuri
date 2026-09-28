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

    // Backfill newer markings fields for older databases.
    await client.query('ALTER TABLE markings ADD COLUMN IF NOT EXISTS area_ha NUMERIC(10,2)');
    await client.query('ALTER TABLE markings ADD COLUMN IF NOT EXISTS operation_date DATE');
    await client.query('ALTER TABLE markings ADD COLUMN IF NOT EXISTS follow_up_date_start DATE');
    await client.query('ALTER TABLE markings ADD COLUMN IF NOT EXISTS follow_up_date_end DATE');
    await client.query('ALTER TABLE markings ADD COLUMN IF NOT EXISTS follow_up_note TEXT');
    await client.query(
      'CREATE INDEX IF NOT EXISTS markings_operation_date_idx ON markings(operation_date)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS markings_follow_up_start_idx ON markings(follow_up_date_start)'
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

    // Work requests – forest owners publish a marking as work that needs a doer.
    // One request per marking; withdrawing deletes the row.
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        marking_id INTEGER NOT NULL UNIQUE REFERENCES markings(id) ON DELETE CASCADE,
        note TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS work_requests_status_idx ON work_requests(status)'
    );

    // Who pays: owner_receives = timber sale (highest offer best), owner_pays = service (lowest best).
    // The owner picks this when publishing; older rows are backfilled from the marking type.
    await client.query(`
      ALTER TABLE work_requests ADD COLUMN IF NOT EXISTS pricing VARCHAR(20)
        CHECK (pricing IN ('owner_receives', 'owner_pays'))
    `);
    await client.query(`
      UPDATE work_requests wr
      SET pricing = CASE WHEN m.type IN ('avohakkuu', 'harvennus') THEN 'owner_receives' ELSE 'owner_pays' END
      FROM markings m
      WHERE m.id = wr.marking_id AND wr.pricing IS NULL
    `);
    await client.query('ALTER TABLE work_requests ALTER COLUMN pricing SET NOT NULL');

    // Work requests are planned work, independent of markings (which record done work):
    // own parcel, type, title, area and the owner's price. Older rows are backfilled from
    // the marking they were published from.
    await client.query(`
      ALTER TABLE work_requests
        ADD COLUMN IF NOT EXISTS property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS type VARCHAR(50),
        ADD COLUMN IF NOT EXISTS title VARCHAR(255),
        ADD COLUMN IF NOT EXISTS geometry GEOMETRY(GEOMETRY, 4326),
        ADD COLUMN IF NOT EXISTS area_ha NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS target_price_eur NUMERIC(12,2) CHECK (target_price_eur > 0)
    `);
    await client.query(`
      UPDATE work_requests wr
      SET type = m.type, title = m.title, geometry = m.geometry, area_ha = m.area_ha, property_id = m.property_id
      FROM markings m
      WHERE m.id = wr.marking_id AND wr.type IS NULL
    `);
    await client.query('ALTER TABLE work_requests ALTER COLUMN marking_id DROP NOT NULL');
    await client.query('ALTER TABLE work_requests ALTER COLUMN type SET NOT NULL');
    await client.query('ALTER TABLE work_requests ALTER COLUMN title SET NOT NULL');
    await client.query('ALTER TABLE work_requests ALTER COLUMN geometry SET NOT NULL');
    // Deleting a done-work marking must no longer delete a work request made from it
    await client.query('ALTER TABLE work_requests DROP CONSTRAINT IF EXISTS work_requests_marking_id_fkey');
    await client.query(`
      ALTER TABLE work_requests ADD CONSTRAINT work_requests_marking_id_fkey
        FOREIGN KEY (marking_id) REFERENCES markings(id) ON DELETE SET NULL
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS work_requests_property_id_idx ON work_requests(property_id)'
    );

    // Price offers on work requests. Bidder identity is never shown publicly.
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_request_bids (
        id SERIAL PRIMARY KEY,
        work_request_id INTEGER NOT NULL REFERENCES work_requests(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount_eur NUMERIC(12,2) NOT NULL CHECK (amount_eur > 0),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS work_request_bids_request_idx ON work_request_bids(work_request_id)'
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
