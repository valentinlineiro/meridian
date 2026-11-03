# Diseño P0: análisis de LinkedIn Games (2026-11-03)

Estado: **implementado en #91** (`294008d`, 2026-11-03), conforme a este documento (rev. 2). La interpretación (etiquetas y umbrales) sigue sin diseñar. Parte de `linkedin-games-read-view-design-2026-11-03.md` (PR #86, #88).
Separa **medición** (este documento) de **interpretación** (etiquetas y umbrales: PR posterior, fuera de este diseño).

## 0. Decisiones tomadas
- **Backend: opción A.** Se amplía `GET /api/me/linkedin-games/summary` de forma **aditiva** (campos nuevos; los actuales intactos). Reparto: **dominio** = cálculos y reglas estadísticas puros; **caso de uso** = composición; **ruta** = exposición del contrato; **cliente** = presentación, selección de periodo y ordenación. Sin observaciones crudas en el navegador, sin migraciones, sin tabla nueva y sin tocar L10 ni el modelo de datos.
- **Selector de juego: solo juegos individuales.** No hay «Todos (agregado)» en P0: un agregado mezcla comportamientos distintos (escalas, dificultad, n) y se leería mal. Si más adelante se quiere una visión global, se diseñará un indicador con semántica explícita.

## 1. Medición (dominio)
Observación = un juego en un día: `score` (s, segundos, >0) y `avg` (a, media global del día, >0 o ausente).

| Métrica | Definición | n |
|---|---|---|
| Eficiencia de una observación | `a / s` (>1 = más rápido que la media global). Solo con `avg`. | — |
| Eficiencia de una ventana | **mediana** de `a/s` de sus observaciones con `avg` | `nEff` |
| Gana a la media | `k / nBeat`, con `k` = observaciones con `s < a` (empate = no gana) | `nBeat`, `k` |
| Tiempo | mediana, P25 y P75 de `s` (todas las observaciones con `score`, tengan o no `avg`) | `nTime` |

**Denominadores con nombre propio.** `nEff`, `nBeat` y `nTime` son campos distintos aunque hoy `nEff = nBeat` (ambos exigen `avg`): si una regla futura cambia uno, el contrato no se rompe. `nTime ≥ nEff`. Ningún porcentaje ni mediana viaja sin su denominador.
| Percentil | interpolación lineal (R-7: `h=(n-1)p`, interpola entre vecinos) | |

- **Ventanas:** `7`, `28`, `90` días y `all`. Con `today` del cliente: ventana = fechas en `(today-W, today]`; previa = `(today-2W, today-W]`. `all` va de la primera observación a `today` y no tiene previa.
- **Cobertura.** `firstDate` de un juego (su primera observación) fija solo el **inicio de la cobertura**: de ahí en adelante se puede comparar y dibujar. No implica actividad todos los días: un día sin partida **no genera observación** (ni `0`, ni valor imputado); simplemente no cuenta.
- **Periodo equivalente:** la previa solo cuenta si está **cubierta por los datos del juego** (`primera fecha ≤ today-2W+1`). Si no, `prev = null` y no hay diferencia (no se compara 90 días contra 30). Un juego sin observaciones en la previa también da `null`.
- **Diferencias** (solo con ventana y previa válidas): eficiencia relativa `(cur-prev)/prev`; gana a la media en **puntos porcentuales** `rate_cur-rate_prev`; mediana de tiempo en segundos `cur-prev`. **Cada diferencia viaja en el contrato JSON con su `nCur` y su `nPrev`** (los de su propia métrica: `nEff`, `nBeat` o `nTime`).
- **Sin denominador no hay porcentaje:** denominador `= 0` ⇒ `rate`, `median`, `p25`, `p75` = `null` (nunca `0`). El cliente muestra «—» y siempre el denominador.
- **Racha:** la actual (estricta: hueco, día sin `avg` o sin superar la media la rompe). Sin cambios.
- **«Tendencia» de la tabla = la diferencia numérica de eficiencia**, sin flechas ni etiquetas: una flecha ya es interpretación (umbral). Las flechas y etiquetas llegan con el PR de interpretación. El aviso `regression` ya publicado (PR #86) se deja como está hasta ese PR.

## 2. Trayectoria
Dos series **sincronizadas** por bucket (mismo eje X): eficiencia (mediana de `a/s`) y % que gana a la media, cada punto con su `n`.
- **Buckets:** rangos `7` y `28` → por día; `90` y `all` → por semana ISO (lunes, UTC), etiquetada por su fecha de inicio. El bucket parcial (semana en curso o la primera) se dibuja con su `n`; no se extrapola.
- **Buckets vacíos: el eje lo construye el servidor, denso.** `trajectory[W]` trae **todos** los buckets del rango desde `max(inicio de la ventana, firstDate)` hasta `today`, y los vacíos van como `{ "start", "n": 0, "eff": null, "beat": null }`. El cliente dibuja el hueco (línea cortada, sin punto) y **no reconstruye el eje**. Antes de `firstDate` no hay buckets (no se pinta «sin jugar» donde el juego aún no existía).
- **Sin suavizado:** se dibujan los valores crudos por bucket. No hay media móvil en este PR (si se añade, irá con otra línea y leyenda propia). La sparkline de las tarjetas hoy dibuja una mediana móvil de 28 d sin decirlo: se rotula «mediana móvil 28 d» para que sea identificable.
- **Selector de juego:** solo juegos individuales (ver §0). Sin agregado en P0.
- **Rango:** un único selector de periodo 7 / 28 / 90 / Todo (por defecto 28) que gobierna a la vez el gráfico, la tabla y las tarjetas.

## 3. Tabla comparativa
Una fila por juego, ordenable por cualquier columna (en cliente, solo reordena filas ya calculadas):
`Juego · Eficiencia · Gana a la media · Δ eficiencia · Racha · n` y, en la misma fila, la **mediana de tiempo (P25–P75)**.
- El denominador siempre visible junto a cada porcentaje («84 % · nBeat=170»; en la interfaz, «n=170»). Una fila con `n` pequeño no se oculta ni se atenúa en este PR; solo muestra su `n`.
- Δ eficiencia muestra «—» cuando `prev = null` y, en el título accesible, el motivo (previa incompleta o sin datos).

## 4. Estructura de la pestaña
Dentro de Juegos, sin pestañas nuevas: selector de periodo arriba (hero) y bloques plegables `cgroup` como en Ajedrez: **Comparativa** (tabla), **Trayectoria** (gráfico) y **Por juego** (tarjetas actuales + mediana y rango P25–P75).

## 5. Contrato (aditivo)
Campos nuevos **por juego**: `firstDate`, `windows` y `trajectory`. No se añade ningún campo a nivel raíz.
```json
"games": { "zip": {
   "...campos actuales intactos (n, nWithAvg, beatAvgRate, efficiency, best, beatStreak, regression, series)...",
   "firstDate": "2026-05-17",
   "windows": { "28": {
      "eff":  { "median": 2.08, "nEff": 28 },
      "beat": { "rate": 0.84, "k": 24, "nBeat": 28 },
      "time": { "median": 16, "p25": 13, "p75": 20, "nTime": 28 },
      "prev": { "eff": {"median": 1.79, "nEff": 28}, "beat": {"rate": 0.8, "k": 22, "nBeat": 28}, "time": {"median": 18, "p25": 14, "p75": 23, "nTime": 28} },
      "delta": {
        "effRel":    { "value": 0.16, "nCur": 28, "nPrev": 28 },
        "beatPp":    { "value": 4.1,  "nCur": 28, "nPrev": 28 },
        "medianSec": { "value": -2,   "nCur": 28, "nPrev": 28 } } },
     "all": { "eff": {}, "beat": {}, "time": {}, "prev": null, "delta": null } },
   "trajectory": { "28": [ { "start": "2026-10-07", "n": 1, "eff": 2.1, "beat": 1 }, { "start": "2026-10-08", "n": 0, "eff": null, "beat": null } ], "7": [], "90": [], "all": [] } } }
```
- `windows.W.prev` y `delta` son `null` si no aplican (previa incompleta o sin datos); `delta.*.value` es `null` si falta alguno de sus dos lados. La ventana `all` no tiene previa.
- **Sin colisiones:** la respuesta actual solo tiene `days`, `from`, `to`, `playStreak` y `games`, y por juego `n`, `nWithAvg`, `beatAvgRate`, `efficiency`, `best`, `beatStreak`, `regression` y `series` (comprobado contra `Summary` y `GameSummary` en `GameStats.ts`). `all` no existe hoy en ningún nivel; en el contrato nuevo solo aparece como **clave de ventana** dentro de `windows` y `trajectory`, nunca como campo hermano de `games`. No hay agregado global en P0.
- Los campos actuales `efficiency.last28/prev28/change` se mantienen por compatibilidad aunque `windows["28"]` los generalice; si coinciden en valor, la prueba de contrato lo exige.

## 6. Casos límite
Juego sin observaciones en la ventana; día o semana sin partida dentro de la cobertura (bucket `n=0`, valores `null`, nunca `0`); fecha anterior a `firstDate` (sin bucket); una sola observación (mediana = valor, P25 = P75); observaciones sin `avg` (cuentan en tiempo, no en eficiencia ni gana a la media); empate `s = a`; previa parcial; juego nuevo (Tango, Wend desde 2026-09-07); hueco del 2026-09-16; día actual sin registrar; semana parcial; `today` inválido (400, como ahora); cero datos (todo `null`, sin errores).

## 7. Pruebas (nombres `shouldXWhenY`)
Dominio (sin mocks): `shouldComputeTheWindowMedianEfficiencyWhenThereAreObservations`; `shouldReturnNullRatesWhenTheWindowHasNoObservations`; `shouldInterpolatePercentilesLinearly`; `shouldCountAnObservationWithoutAvgInTimeButNotInEfficiency`; `shouldNotCompareWhenThePreviousWindowIsNotFullyCovered`; `shouldReportRelativeEfficiencyAndPercentagePointDeltas`; `shouldBucketByDayForShortRangesAndByIsoWeekForLongOnes`; `shouldKeepGapsInsteadOfFillingEmptyBuckets`; `shouldKeepNEffNBeatAndNTimeSeparateInTheContract`; `shouldCarryNCurAndNPrevInEveryDelta`; `shouldEmitEmptyBucketsAsNullWithZeroNWithinCoverage`; `shouldNotEmitBucketsBeforeTheFirstObservation`; `shouldNotCreateObservationsForDaysWithoutPlay`; `shouldNotAddAnyRootLevelAllField`; `shouldKeepTheExistingSummaryFieldsUnchanged`.
Integración (D1 real): el resumen sirve `windows` y `trajectory` del propietario. Página: selector de periodo, orden de la tabla, `n` visible, gráfico por juego individual (sin agregado), hueco visible en los buckets vacíos sin reconstruir el eje, mismos controles accesibles que el resto (foco, `aria-sort`). Verificación de datos: cifras de los 170 días contra el cálculo independiente en Python del estudio.

## 8. Fuera de este PR
Etiquetas interpretativas y umbrales; anotaciones de método y bloqueos; cambios en L10 o en el modelo de datos; análisis por día de la semana; fichas por juego al pulsar; indicador agregado global.
