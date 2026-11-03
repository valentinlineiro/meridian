# Diseño P0: análisis de LinkedIn Games (2026-11-03)

Estado: borrador para revisión. Sin código. Parte de `linkedin-games-read-view-design-2026-11-03.md` (PR #86, #88).
Separa **medición** (este documento) de **interpretación** (etiquetas y umbrales: PR posterior, fuera de este diseño).

## 0. Decisión previa (necesito tu respuesta)
Todo el cálculo vive en el dominio (`GameStats`), como se fijó. El cliente hoy solo recibe un resumen ya agregado (por día solo `eff`/`roll`), así que mediana, P25/P75 y ventanas **no se pueden calcular en el navegador** sin exponer cada observación.
- **A (recomendada):** ampliar `GET /api/me/linkedin-games/summary` de forma **aditiva** (campos nuevos, los actuales intactos). Toca dominio, caso de uso y ruta del slice; **sin migraciones, sin tabla nueva, sin tocar L10 ni el modelo de datos**.
- **B:** endpoint nuevo con las observaciones crudas y calcular en el cliente. Rompe «cálculos puros en dominio» y duplica reglas en JS.
«Sin modificar el backend» solo es posible con B. Parto de A salvo que me digas lo contrario.

## 1. Medición (dominio)
Observación = un juego en un día: `score` (s, segundos, >0) y `avg` (a, media global del día, >0 o ausente).

| Métrica | Definición | n |
|---|---|---|
| Eficiencia de una observación | `a / s` (>1 = más rápido que la media global). Solo con `avg`. | — |
| Eficiencia de una ventana | **mediana** de `a/s` de sus observaciones con `avg` | `n` |
| Gana a la media | `k / n`, con `k` = observaciones con `s < a` (empate = no gana) | `n`, `k` |
| Tiempo | mediana, P25 y P75 de `s` (todas las observaciones con `score`, tengan o no `avg`) | `nTime` |
| Percentil | interpolación lineal (R-7: `h=(n-1)p`, interpola entre vecinos) | |

- **Ventanas:** `7`, `28`, `90` días y `all`. Con `today` del cliente: ventana = fechas en `(today-W, today]`; previa = `(today-2W, today-W]`. `all` va de la primera observación a `today` y no tiene previa.
- **Periodo equivalente:** la previa solo cuenta si está **cubierta por los datos del juego** (`primera fecha ≤ today-2W+1`). Si no, `prev = null` y no hay diferencia (no se compara 90 días contra 30). Un juego sin observaciones en la previa también da `null`.
- **Diferencias** (solo con ventana y previa válidas): eficiencia relativa `(cur-prev)/prev`; gana a la media en **puntos porcentuales** `rate_cur-rate_prev`; mediana de tiempo en segundos `cur-prev`. Cada una expone `nCur` y `nPrev`.
- **Sin denominador no hay porcentaje:** `n = 0` ⇒ `rate`, `median`, `p25`, `p75` = `null` (nunca `0`). El cliente muestra «—» y siempre el `n`.
- **Racha:** la actual (estricta: hueco, día sin `avg` o sin superar la media la rompe). Sin cambios.
- **«Tendencia» de la tabla = la diferencia numérica de eficiencia**, sin flechas ni etiquetas: una flecha ya es interpretación (umbral). Las flechas y etiquetas llegan con el PR de interpretación. El aviso `regression` ya publicado (PR #86) se deja como está hasta ese PR.

## 2. Trayectoria
Dos series **sincronizadas** por bucket (mismo eje X): eficiencia (mediana de `a/s`) y % que gana a la media, cada punto con su `n`.
- **Buckets:** rangos `7` y `28` → por día; `90` y `all` → por semana ISO (lunes, UTC), etiquetada por su fecha de inicio. El bucket parcial (semana en curso o la primera) se dibuja con su `n`; no se rellena ni se extrapola. Un bucket sin observaciones no tiene punto (hueco).
- **Sin suavizado:** se dibujan los valores crudos por bucket. No hay media móvil en este PR (si se añade, irá con otra línea y leyenda propia). La sparkline de las tarjetas hoy dibuja una mediana móvil de 28 d sin decirlo: se rotula «mediana móvil 28 d» para que sea identificable.
- **Selector de juego:** cada juego y «Todos (agregado)». El agregado junta observaciones de todos los juegos; mezcla escalas distintas (Wend ×2,5, Tango ×1,1), así que se rotula como tal.
- **Rango:** un único selector de periodo 7 / 28 / 90 / Todo (por defecto 28) que gobierna a la vez el gráfico, la tabla y las tarjetas.

## 3. Tabla comparativa
Una fila por juego, ordenable por cualquier columna (en cliente, solo reordena filas ya calculadas):
`Juego · Eficiencia · Gana a la media · Δ eficiencia · Racha · n` y, en la misma fila, la **mediana de tiempo (P25–P75)**.
- `n` siempre visible junto a cada porcentaje («84 % · n=170»). Una fila con `n` pequeño no se oculta ni se atenúa en este PR; solo muestra su `n`.
- Δ eficiencia muestra «—» cuando `prev = null` y, en el título accesible, el motivo (previa incompleta o sin datos).

## 4. Estructura de la pestaña
Dentro de Juegos, sin pestañas nuevas: selector de periodo arriba (hero) y bloques plegables `cgroup` como en Ajedrez: **Comparativa** (tabla), **Trayectoria** (gráfico) y **Por juego** (tarjetas actuales + mediana y rango P25–P75).

## 5. Contrato (aditivo)
```json
"games": { "zip": {
   "...campos actuales intactos...",
   "windows": { "28": {
      "eff": { "median": 2.08, "n": 28 },
      "beat": { "rate": 0.84, "k": 24, "n": 28 },
      "time": { "median": 16, "p25": 13, "p75": 20, "n": 28 },
      "prev": { "eff": {..}, "beat": {..}, "time": {..} },
      "delta": { "effRel": 0.16, "beatPp": 4.1, "medianSec": -2 } } },
   "trajectory": { "7": [{"start":"2026-10-28","n":1,"eff":2.1,"beat":1}], "28": [], "90": [], "all": [] } } },
"all": { "windows": {}, "trajectory": {} }
```
`windows.W.prev` y `delta` son `null` si no aplica. `all` = agregado de todos los juegos.

## 6. Casos límite
Juego sin observaciones en la ventana; una sola observación (mediana = valor, P25 = P75); observaciones sin `avg` (cuentan en tiempo, no en eficiencia ni gana a la media); empate `s = a`; previa parcial; juego nuevo (Tango, Wend desde 2026-09-07); hueco del 2026-09-16; día actual sin registrar; semana parcial; `today` inválido (400, como ahora); cero datos (todo `null`, sin errores).

## 7. Pruebas (nombres `shouldXWhenY`)
Dominio (sin mocks): `shouldComputeTheWindowMedianEfficiencyWhenThereAreObservations`; `shouldReturnNullRatesWhenTheWindowHasNoObservations`; `shouldInterpolatePercentilesLinearly`; `shouldCountAnObservationWithoutAvgInTimeButNotInEfficiency`; `shouldNotCompareWhenThePreviousWindowIsNotFullyCovered`; `shouldReportRelativeEfficiencyAndPercentagePointDeltas`; `shouldBucketByDayForShortRangesAndByIsoWeekForLongOnes`; `shouldKeepGapsInsteadOfFillingEmptyBuckets`; `shouldExposeNEverywhere`; `shouldKeepTheExistingSummaryFieldsUnchanged`.
Integración (D1 real): el resumen sirve `windows` y `trajectory` del propietario. Página: selector de periodo, orden de la tabla, `n` visible, selector de juego del gráfico, mismos controles accesibles que el resto (foco, `aria-sort`). Verificación de datos: cifras de los 170 días contra el cálculo independiente en Python del estudio.

## 8. Fuera de este PR
Etiquetas interpretativas y umbrales; anotaciones de método y bloqueos; cambios en L10 o en el modelo de datos; análisis por día de la semana; fichas por juego al pulsar.
