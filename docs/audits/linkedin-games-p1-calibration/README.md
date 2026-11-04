# Calibración P1 de LinkedIn Games (2026-11-04)

Scripts que producen las cifras de `../linkedin-games-p1-interpretation-design-2026-11-04.md`. Python 3 con numpy, pandas y scipy. Semillas fijas: todo es reproducible.

**Entrada (`prod_days.json`, no se versiona: datos personales del propietario).** Se reconstruye desde producción con `p1_export_days.py` (consulta y comando en su cabecera): la versión vigente de cada fecha (última por `created_at, id`, contrato L2) de los snapshots `source='linkedin-games'` del propietario.

**Una sola regla para el artefacto.** `noise-bands.json` contiene los límites agrupados de **5 semillas × 20000 remuestreos** (`SEEDS`, `B_ART` en `p1_calibrate.py`), puntos 2,5 % y 97,5 % de cada cola, redondeados a 4 decimales. Es la **única fuente de límites** de la simulación de falsos avisos, de los datos reales, de las pruebas y de producción; no se promedian ni se mezclan otras semillas.

| Script | Qué hace | Tiempo |
|---|---|---|
| `p1_export_days.py` | `snapshots.json` (salida de `wrangler d1 execute --json`) → `prod_days.json` | s |
| `p1_artifact.py` | escribe `noise-bands.json`; con `--check` regenera y falla si no coincide exactamente con el fichero versionado | ≈ 1 min |
| `p1_calibrate.py <días> limits` | límites agrupados (los del artefacto y los exploratorios de 7, 14 y 56 d) | ≈ 1 min |
| `p1_calibrate.py <días> stability` | desviación típica entre 5 semillas según B (300–20000) | ≈ 5 min |
| `p1_calibrate.py <días> trajectories` | falsos avisos en 500 trayectorias nulas de **52 evaluaciones semanales**, en los **7 desfases**, con 2,5 % y 0,5 % por cola; las del 2,5 % leen el artefacto | ≈ 8 min |
| `p1_calibrate.py <días> real` | etiquetas semanales sobre los datos reales, con y sin la regla de dos semanas | ≈ 1 min |
| `p1_calibrate.py <días> rule` / `horizons` | falsos positivos de la regla actual y de Mann-Whitney; detección por horizonte de tendencia | ≈ 2 min |

Nulo: remuestreo de **bloques de 7 días** completos del historial del propio juego (sin tendencia; se conserva el ciclo semanal y la dependencia corta). Los límites se evalúan al final del último bloque completo de cada historial remuestreado: una ventana que cruza el borde de dos semanas remuestreadas mezcla datos independientes y subestima la varianza de una ventana real.
