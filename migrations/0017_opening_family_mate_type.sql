ALTER TABLE match_details ADD COLUMN opening_family TEXT;
ALTER TABLE match_details ADD COLUMN mate_type TEXT;

CREATE INDEX IF NOT EXISTS idx_match_details_family ON match_details(opening_family);
