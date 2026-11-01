-- Versioned JSON written by the scheduled engine analysis: NULL = pending, {"status":"ok",...} = analysed, {"status":"invalid",...} = cannot be evaluated.
ALTER TABLE match_details ADD COLUMN engine_eval TEXT;
