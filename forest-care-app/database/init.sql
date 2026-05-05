-- Forest Care App - Database Initialization Script
-- Run this with a PostgreSQL superuser if using PostGIS as an extension

-- Create the database (run separately as postgres superuser if needed)
-- CREATE DATABASE forest_care;

-- Connect to forest_care database and run the following:

-- Enable PostGIS extension for geographic/spatial data support
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Forest properties - polygon areas on the map
CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    geometry GEOMETRY(GEOMETRY, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Map markings - points, lines, areas, notes on the map
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
);

-- Spatial indexes for geographic queries
CREATE INDEX IF NOT EXISTS properties_geometry_idx ON properties USING GIST(geometry);
CREATE INDEX IF NOT EXISTS markings_geometry_idx ON markings USING GIST(geometry);

-- User ID indexes for fast user-specific queries
CREATE INDEX IF NOT EXISTS properties_user_id_idx ON properties(user_id);
CREATE INDEX IF NOT EXISTS markings_user_id_idx ON markings(user_id);
