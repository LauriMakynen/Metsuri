-- Migration: Add area_ha column to markings table
-- Purpose: Store calculated area in hectares for polygon markings

ALTER TABLE markings ADD COLUMN IF NOT EXISTS area_ha NUMERIC(10,2);

-- Create index for querying markings by area
CREATE INDEX IF NOT EXISTS idx_markings_area_ha ON markings(area_ha);

-- Add comment to document the field
COMMENT ON COLUMN markings.area_ha IS 'Calculated area in hectares (only for polygon geometry_type)';
