# Calibración P1 de LinkedIn Games (2026-11-04)

Scripts que producen las cifras de `../linkedin-games-p1-interpretation-design-2026-11-04.md`. Python 3 con numpy, pandas y scipy.

Entrada: `prod_days.json` en el directorio de trabajo = lista de días (`{"date","games":{juego:{scoreSeconds,avgSeconds,...}}}`), la **versión vigente de cada fecha** (la última por `created_at, id`) de `snapshots` con `source='linkedin-games'`. No se versiona (son datos personales del propietario).

Orden y qué responde cada uno (semilla fija `20261104`, remuestreo por bloques de 7 días, B = 300):
1. `p1_load.py`: carga y eficiencia `avg/score` (lo ejecutan los demás con `exec`).
2. `p1_null.py`: ruido entre dos ventanas de 28 días y tasa de falsos avisos de la regla actual y de Mann-Whitney.
3. `p1_more.py`: banda de ruido según el tamaño de ventana (7, 14, 28, 56) y escala del cambio real.
4. `p1_trend.py`: calibración del test de tendencia (Spearman) con horizontes de 56, 84 y 112 días.
5. `p1_final.py`: la regla completa (tendencia 112 d + últimos 28 d frente a los 56 previos) sobre el histórico real y bajo la hipótesis nula.
