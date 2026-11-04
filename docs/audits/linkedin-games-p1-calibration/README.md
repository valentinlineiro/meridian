# Calibración P1 de LinkedIn Games (2026-11-04)

Scripts que producen las cifras de `../linkedin-games-p1-interpretation-design-2026-11-04.md`. Python 3 con numpy, pandas y scipy. Semillas fijas (resultados reproducibles).

**Entrada (`prod_days.json`, no se versiona: son datos personales del propietario).** Se reconstruye desde producción con `p1_export_days.py`; la consulta y el comando están en su cabecera. Es la **versión vigente de cada fecha** (última por `created_at, id`, contrato L2) de los snapshots `source='linkedin-games'` del propietario.

| Script | Qué hace | Tiempo |
|---|---|---|
| `p1_export_days.py` | `snapshots.json` (salida de `wrangler d1 execute --json`) → `prod_days.json` | s |
| `p1_calibrate.py` | límites por cola (B = 5000), estabilidad frente a B y semilla, falsos avisos por trayectoria, regla actual y Mann-Whitney, datos reales | ≈ 2 min |
| `p1_levels.py` | inestabilidad por límite (B = 5000 y 20000), nivel 2,5 % frente a 0,5 % por cola, datos reales con y sin filtro de dos semanas | ≈ 5 min |

Nulo: remuestreo de **bloques de 7 días** completos del propio historial del juego (sin tendencia; se conserva el ciclo semanal y la dependencia corta). Límites = puntos empíricos 2,5 % y 97,5 % del estadístico **firmado**, cada cola por separado, evaluados al final del último bloque completo de cada historial remuestreado (una ventana que cruza el borde de dos semanas remuestreadas rompe la dependencia y subestima la varianza).
