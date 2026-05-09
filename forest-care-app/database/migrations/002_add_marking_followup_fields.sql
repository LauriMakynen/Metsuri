-- Migration: add operation date and follow-up recommendation fields for markings

ALTER TABLE markings
  ADD COLUMN IF NOT EXISTS operation_date DATE,
  ADD COLUMN IF NOT EXISTS follow_up_date_start DATE,
  ADD COLUMN IF NOT EXISTS follow_up_date_end DATE,
  ADD COLUMN IF NOT EXISTS follow_up_note TEXT;

CREATE INDEX IF NOT EXISTS markings_operation_date_idx ON markings(operation_date);
CREATE INDEX IF NOT EXISTS markings_follow_up_start_idx ON markings(follow_up_date_start);
