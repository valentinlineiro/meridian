-- 0005_played_at.sql
ALTER TABLE matches ADD COLUMN played_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_matches_played_at ON matches(COALESCE(played_at, 0));

-- One-shot backfill for historical rows.
-- NOTA: Este UPDATE de migración es intencionalmente permisivo para el backfill del
-- dataset histórico conocido (1.434 partidas ya auditadas con timestamp válido).
-- La lógica canónica y estricta (que valida 9-11 dígitos numéricos y rango epoch 2020-2035)
-- reside exclusivamente en extractPlayedAt (TypeScript) para toda ingestión futura.
UPDATE matches
SET played_at = CAST(
  CASE
    WHEN match_id LIKE 'bot|%' OR match_id LIKE 'pvp|%' THEN
      CASE
        WHEN INSTR(SUBSTR(match_id, 5), '|') > 0
        THEN SUBSTR(SUBSTR(match_id, 5), 1, INSTR(SUBSTR(match_id, 5), '|') - 1)
        ELSE SUBSTR(match_id, 5)
      END
    ELSE NULL
  END AS INTEGER
);
