-- The chess ELO of a snapshot, read once at write time. The timeline, weekly and summary reads used to json_extract it from every chess snapshot
-- (~430 KB each, growing with every sync). NULL = no ELO (language/games snapshots, or a chess snapshot without one).
ALTER TABLE snapshots ADD COLUMN elo REAL;
UPDATE snapshots SET elo = json_extract(raw_json, '$.eloRating') WHERE source = 'duolingo-chess';
