# Diseño: vista de lectura de LinkedIn Games (2026-11-03)

Estado: borrador para aprobar. Sin código. Sigue el estudio `linkedin-games-study-2026-11-03.md`.

## 1. Objetivo
Responder, sin abrir el Excel: **¿mejoro en cada juego, dónde estoy flojo y cómo van mis rachas?** Con los 170 días ya cargados (backfill 2026-11-03) y lo que se registre a mano desde hoy.

Fuera de alcance: percentiles de comunidad (la fuente solo da la media), Pinpoint/CrossClimb, tabla `game_results`, colector.

## 2. Qué se muestra (una tarjeta por juego + una global)
Por juego:
| Métrica | Definición |
|---|---|
| Eficiencia | `avgSeconds / scoreSeconds` del día (>1 = más rápido que la media). Ya normaliza la dificultad del día: no hace falta otro ajuste. |
| Tendencia | mediana de eficiencia de los últimos 28 días frente a los 28 anteriores (ventanas de 4 semanas completas: anulan el efecto fin de semana, que sube la eficiencia ~0,5 puntos). |
| Gana a la media | % de días con `scoreSeconds < avgSeconds` (empate = no gana). |
| Mejor marca | mínimo `scoreSeconds` y su fecha. |
| Racha | días seguidos ganando a la media (vigente y máxima). |
| Sparkline | eficiencia con mediana móvil de 28 días, SVG inline sin librerías. |

Global: racha de días jugados (vigente y máxima) y días registrados.

Aviso de regresión: tarjeta resaltada cuando la tendencia cae más de un 10 % con al menos 10 datos en cada ventana. Con los datos de hoy saltaría **Tango** (1,30 → 1,13 entre mitades; también 65 % de días ganando a la media). **El 10 % y el 10 de mínimo son una propuesta, no aprobada** (ver §7).

Reglas de datos:
- Un juego sin `avg` (entrada manual sin promedio) cuenta para mejor marca y rachas de juego, no para eficiencia ni "gana a la media". Se muestra `n con media` por juego.
- Racha de días jugados: fechas consecutivas con al menos un juego. Vigente solo si la última fecha es hoy o ayer (en la zona del cliente). Un hueco (p. ej. 2026-09-16, sin dato) rompe la racha: es estricto y no se infiere nada.
- La versión vigente de cada fecha es la última por `created_at, id` (regla L2 del contrato).

## 3. Arquitectura (slice existente `linkedin-games`)
Sin migración ni tabla nueva: se lee `raw_json` (opción A del estudio).

```text
domain/GameStats.ts        summarize(days: DayRecord[], today: string): Summary   // función pura, aquí viven todas las métricas
ports/DayRecordStore.ts    + all(ownerId): Promise<DayRecord[]>                    // versión vigente por fecha, ascendente
application/GetSummary.ts  resuelve propietario, pide all(), llama a summarize
infrastructure/D1DayRecordStore.ts  all(): SELECT raw_json, created_at, id FROM snapshots WHERE source=? AND user_id=? ORDER BY created_at, id;
                                    se deduplica por fecha en memoria (el último gana)
delivery/routes.ts         GET /api/me/linkedin-games/summary?today=YYYY-MM-DD
module.ts                  token GET_SUMMARY
src/linkedinGamesPage.ts   tarjeta "Resumen" + render del JSON
```

Por qué dedupe en memoria y no SQL: la subconsulta "última por fecha" sería O(n²) sin índice sobre `json_extract`; son ~170 filas (~150 KB) y crecen 1 por día.

Acceso: `GET` bajo `/api/me/` ya exige sesión de propietario; no se toca la política de `router.ts`.

Coste: la consulta lee el índice `idx_snapshots_user` y filtra por `source`; hoy ~1,3 mil filas leídas por visita (medido: 1.338 `rows_read`, 8 ms), 0 escrituras. Un índice `(user_id, source)` sería una migración manual y no se justifica aún.

## 4. Contrato JSON (propuesta)
```json
{ "ok": true,
  "summary": {
    "days": 170, "from": "2026-05-17", "to": "2026-11-03",
    "playStreak": { "current": 48, "max": 122 },
    "games": {
      "tango": { "n": 57, "nWithAvg": 57, "beatAvgRate": 0.65,
                 "efficiency": { "last28": 1.13, "prev28": 1.30, "change": -0.13 },
                 "best": { "seconds": 32, "date": "2026-09-30" },
                 "beatStreak": { "current": 1, "max": 8 },
                 "regression": true,
                 "series": [{ "date": "2026-09-07", "eff": 1.2 }] } } } }
```
`series` va submuestreada (un punto por día, ~170 máximo por juego). Los demás juegos con la misma forma.

## 5. Página
Mismo `/linkedin-games`, sin ruta nueva. Debajo del formulario y colapsable (patrón de bloques plegables del PR #83), un bloque "Resumen": tarjeta global y una por juego, ordenadas con las regresiones primero. Móvil primero, ancho 520 px como hoy, `font-size` 16 px en inputs (ya cubierto). Sin librerías: sparkline en SVG.
Si falla la carga, la página de entrada sigue funcionando y el bloque muestra "No se pudo cargar el resumen".

## 6. Pruebas (nombres `shouldXWhenY`, en `tests/slices/linkedin-games/`)
Dominio (unit, sin mocks):
- `shouldComputeEfficiencyAsAvgOverScoreWhenBothPresent`
- `shouldIgnoreGamesWithoutAvgInEfficiencyAndBeatRate`
- `shouldCountATieAsNotBeatingTheAverage`
- `shouldBreakTheDayStreakWhenADateIsMissing`
- `shouldKeepTheStreakAliveWhenLastDateIsYesterday`
- `shouldFlagRegressionWhenLast28DropMoreThanTenPercentWithEnoughData`
- `shouldNotFlagRegressionWhenFewerThanTenSamplesPerWindow`
- `shouldReturnEmptySummaryWhenThereAreNoDays`
Aplicación: `shouldUseTheLatestVersionOfEachDateWhenAGameWasEdited` (fake del puerto).
Integración (D1 SQLite real): `shouldReturnSummaryWhenOwnerHasSnapshots`, `shouldReturn401WhenNoSession`, `shouldNotIncludeAnotherUsersSnapshots`.
Página: render con datos y con error del endpoint, incluida la tarjeta de regresión.
Verificación de datos: comparar el resumen contra las cifras calculadas en el estudio (Tango 1,13 / 65 %, racha 48, Sudoku 129).

## 7. Decisiones pendientes (tuyas)
1. **Ubicación:** bloque plegable en `/linkedin-games` (recomendado, un solo sitio) frente a página aparte `/linkedin-games/summary`.
2. **Umbral de regresión:** −10 % con ≥ 10 datos por ventana. Propuesta mía, sin base empírica más allá de los datos de Tango; ajustable.
3. **Hueco en la racha:** estricto (recomendado, no se inventa nada) frente a tolerar un día sin dato.

## 8. Tamaño y riesgos
- ~1 archivo de dominio (~80 líneas), 1 caso de uso, 1 método de puerto/adaptador, 1 ruta, ~60 líneas de página y sus pruebas. Un PR.
- Riesgo: el congelado legal sobre cambios en Meridian; no se implementa hasta que lo apruebes, y por tu patrón, cada merge o despliegue con un "mergea" explícito.
- Riesgo de datos: 1 solo usuario y snapshots acumulados por día; si algún día un emisor guarda un día parcial posterior a uno completo (L8), la vista vería menos juegos ese día. Hoy no ocurre.
