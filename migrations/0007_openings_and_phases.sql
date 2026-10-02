ALTER TABLE match_details ADD COLUMN opening_key TEXT;
ALTER TABLE match_details ADD COLUMN phase_key TEXT;
ALTER TABLE match_details ADD COLUMN ply_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_match_details_opening ON match_details(opening_key);
CREATE INDEX IF NOT EXISTS idx_match_details_phase ON match_details(phase_key);
