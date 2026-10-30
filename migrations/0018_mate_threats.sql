-- Versioned JSON written by the scheduled analysis job: NULL = pending, {"status":"ok",...} = analysed, {"status":"invalid",...} = history cannot be replayed.
ALTER TABLE match_details ADD COLUMN mate_threats TEXT;
