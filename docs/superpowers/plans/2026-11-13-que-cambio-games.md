# «Qué cambió» incorpora Games — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Qué cambió» muestra, por juego, si su veredicto cambió entre dos fechas, con los estados y reglas de la especificación.

**Architecture:** Una pieza pura de dominio (`GamesChange.ts`) traduce `interpretation` (salida del motor existente) a un estado y clasifica dos estados. Un caso de uso (`GetGamesChange`) llama a `summarize` en las dos fechas con el historial truncado y devuelve un resultado cerrado. Un endpoint lo expone; un componente nuevo de la web lo pinta dentro de «Qué cambió». **No se toca `GameInterpretation.ts` ni se reimplementa ninguna regla del motor.**

**Tech Stack:** TypeScript, Hono, vitest (raíz), Angular + vitest vía `ng test` (web).

**Spec:** `docs/superpowers/specs/2026-11-13-que-cambio-games-design.md` (PR #198, rama `docs/que-cambio-games-spec`). Los números de sección (§) del plan remiten a ella.

## Global Constraints

- Sin umbrales ni reglas estadísticas nuevas: todo sale de `interpretation.{label,reason,pending}` de `summarize`.
- Capas: `domain` no importa nada de `application`/`infrastructure`; «Qué cambió» (web) solo conoce el contrato del endpoint, nunca `GameInterpretation`.
- Fechas de juego `YYYY-MM-DD`; cada fecha es el **cierre de ese día, inclusive**; intervalo comparado `(since, until]`; duración = `until − since` (8 oct → 13 nov = 36 días, nunca 37) (§4).
- El historial se **trunca a la fecha evaluada** antes de llamar a `summarize` (§7).
- Solo se comparan estados publicables (`mejorando`, `bajando`, `estable`); `senal` y `pocos_datos` no son cambio (§5.1).
- «Sin cambios» solo con datos suficientes en ambos extremos y sin señal final (§5.2 R5).
- Tests con nombre `shouldXWhenY`; mocks solo en límites de arquitectura (usar `InMemoryDayRecordStore` de `tests/slices/linkedin-games/fakes.ts`).
- No se toca el cálculo de «Qué cambió» para ajedrez/idiomas ni se eliminan sus bloques. Hitos y racha: fuera.
- Un PR de implementación, tras aprobar este plan. Este plan no abre ninguno.

## Review Focus

Lo que la spec implica y ningún criterio de aceptación cubre por sí solo; cada línea tiene su prueba en la tarea indicada:

1. **Juego nuevo.** Un juego con observaciones solo posteriores a `since` no debe romper nada: estado inicial `pocos_datos(cobertura_insuficiente)` → `EVIDENCIA.ganada` (Tarea 2).
2. **Tango y Wend sin calibración.** Solo 4 juegos tienen bandas (`NOISE_BANDS`: zip, mini_sudoku, patches, queens); Tango y Wend darán siempre `pocos_datos(sin_calibracion)`. El texto debe decir «sin calibración», no «faltan partidas» (N4) (Tarea 4). Recalibración prevista hacia 2026-12-28.
3. **Historial vacío o dueño inexistente.** Sin días: `games: []`, la web dice «Aún no hay partidas de Games»; dueño sin cuenta: 404 igual que `/summary` (Tareas 2, 3, 5).
4. **Ventana degenerada.** `since >= until`, o `since` anterior al primer registro, o `until` sin datos (Tareas 2, 4).
5. **Medianoche y zona horaria.** Una ventana cuyo instante cae cerca de medianoche UTC debe resolverse a la fecha **local** del navegador, la misma que usa `localToday()` (Tarea 5).

---

### Task 0: Verificación previa del motor (sin cambios de código)

Ya hecha al escribir el plan; se deja como comprobación ejecutable para quien implemente.

**Files:**
- Test: `tests/slices/linkedin-games/gamesChangeAsOf.test.ts` (se crea aquí y la completa la Tarea 2)

- [ ] **Step 1: Escribir `shouldIgnoreObservationsAfterTodayWhenSummarizing`** — fixture `daily("zip", …)` al estilo de `interpretation.test.ts:176`; añadir 40 días posteriores muy lentos; assert `summarize(all, T).games.zip.interpretation` igual (`toEqual`) a `summarize(all.filter(d => d.date <= T), T).games.zip.interpretation`.
- [ ] **Step 2: Ejecutar** `npx vitest run tests/slices/linkedin-games/gamesChangeAsOf.test.ts` — Expected: PASS (confirma que el motor ya acota sus ventanas). Si FALLA, parar: la spec §7 cambia y hay que avisar.
- [ ] **Step 3: Commit** `test(games): the interpretation at a date ignores later days`.

---

### Task 1: Dominio — estados y clasificación

**Files:**
- Create: `src/slices/linkedin-games/domain/GamesChange.ts`
- Test: `tests/slices/linkedin-games/gamesChange.test.ts`

**Interfaces:**
- Consumes: forma `{ label: Label; reason: Reason | null; pending: Label | null }` de `GameSummary["interpretation"]` (`GameStats.ts`).
- Produces:
```ts
export type Direction = "mejorando" | "bajando";
export type GameState =
  | { kind: "mejorando" } | { kind: "bajando" } | { kind: "estable" }
  | { kind: "senal"; dir: Direction }
  | { kind: "pocos_datos"; reason: "cobertura_insuficiente" | "sin_calibracion" };
export type GameOutcome =
  | { kind: "cambio_confirmado"; from: GameState; to: GameState }
  | { kind: "senal"; to: GameState }
  | { kind: "sin_cambios"; state: GameState }
  | { kind: "evidencia"; sub: "ganada" | "perdida" | "ausente"; from: GameState; to: GameState }
  | { kind: "no_concluyente"; from: GameState; to: GameState };
export function stateOf(i: Pick<Interpretation, "label" | "reason" | "pending">): GameState;
export function classify(from: GameState, to: GameState): GameOutcome;
```

- [ ] **Step 1: Escribir los tests de `stateOf`** — `shouldMapPendingOnEstableToSenal…`, `shouldMapDatosInsuficientesToPocosDatosWithItsReason`, y las tres etiquetas publicadas (§5.1). Un `reason` inesperado en `datos_insuficientes` cae a `cobertura_insuficiente`.
- [ ] **Step 2: Escribir los tests de `classify`, tabla completa**: cada fila de §5.3; R1 con sus tres subtipos (`ganada`: from `pocos_datos` y to con evidencia; `perdida`; `ausente`); R2 (`bajando` → `senal(bajando)` y `mejorando` → `senal(mejorando)` dan `no_concluyente`); R3 (`estable`→`bajando`, `mejorando`⇄`bajando`, `bajando`→`estable`) incluido el caso en que el estado final es `estable` con `pending` pero ya hay una transición confirmada: solo sale la transición, la señal se suprime; R4 (`estable` → `senal(x)` da `senal`, **nunca** `sin_cambios`); R5 (`bajando`→`bajando`, `estable`→`estable`). Casos de orden de reglas: `senal(x)` inicial se trata como `estable` al comparar. Nombre de ejemplo: `shouldNeverSaySinCambiosWhenTheFinalStateIsASenal`.
- [ ] **Step 3: Ejecutar** `npx vitest run tests/slices/linkedin-games/gamesChange.test.ts` — Expected: FAIL (módulo no existe).
- [ ] **Step 4: Implementar `stateOf` y `classify` en `GamesChange.ts`** — `classify` aplica R1→R5 en ese orden; una señal inicial se normaliza a `estable` antes de R2–R5 (R2 compara contra la etiqueta confirmada **antes** de normalizar, sobre el estado inicial publicado).
- [ ] **Step 5: Ejecutar el test** — Expected: PASS. Ejecutar también `python3 scripts/check_architecture_boundaries.py` — Expected: sin violaciones.
- [ ] **Step 6: Commit** `feat(games): state and outcome rules for a verdict between two dates`.

---

### Task 2: Aplicación — `GetGamesChange` con evaluación a fecha

**Files:**
- Create: `src/slices/linkedin-games/application/GetGamesChange.ts`
- Modify: `src/slices/linkedin-games/module.ts` (token `GET_GAMES_CHANGE` + registro, junto a `GET_SUMMARY`)
- Test: `tests/slices/linkedin-games/gamesChangeAsOf.test.ts` (iniciado en la Tarea 0), `tests/slices/linkedin-games/getGamesChange.test.ts`

**Interfaces:**
- Consumes: `summarize(days, today)`, `assertPlayDate`, `OwnerLookup`, `DayRecordStore.all`, `stateOf`, `classify` (Tarea 1).
- Produces:
```ts
export interface GameChangeRow { game: string; from: GameState | null; to: GameState; outcome: GameOutcome | null }
export interface GamesChange {
  mode: "compare" | "current-only" | "invalid-window";
  since: string | null; until: string;
  elapsedDays: number | null;      // until − since; null when not comparing
  playedDaysInWindow: number | null; // days with at least one observation in (since, until]
  games: GameChangeRow[];
}
export class GetGamesChange { execute(q: { ownerEmail: string; since: string | null; until: string }): Promise<GamesChange> }
```
Reglas: sin `since` → `current-only`, `from`/`outcome` nulos. `since >= until` → `invalid-window`, sin filas. Un juego sin observaciones hasta `until` no aparece (N5). Un juego presente en `until` y ausente en `since` tiene `from = pocos_datos(cobertura_insuficiente)`. Dueño sin cuenta → `NotFoundError("no owner account")`, como `GetSummary`.

- [ ] **Step 1: Completar `gamesChangeAsOf.test.ts`** con el helper `stateAt(days, date)` (el que usará el caso de uso) y los tests: `shouldGiveTheSameStateAtSinceWithFullAndTruncatedHistory` (igualdad exacta); `shouldDifferBetweenSinceAndUntilOnTheAdversarialFixture` (zip estable hasta `since` y fuerte empeoramiento después; estado en `until` distinto del de `since` sobre el mismo historial completo); `shouldOnlyConfirmAtSinceWhenTheCandidateHeldSevenDaysEarlier` (candidato a la baja en `since` que no lo era en `since − 7` da `senal`, no `bajando`); `shouldCountARecordOnSinceButNotOnSincePlusOne` (borde de día).
- [ ] **Step 2: Escribir `getGamesChange.test.ts`** con `InMemoryDayRecordStore` + `owners()`: `shouldReturnCurrentOnlyWhenThereIsNoSince`; `shouldReturnInvalidWindowWhenSinceIsNotBeforeUntil`; `shouldGiveEvidenciaGanadaWhenAGameOnlyExistsAfterSince` (Review Focus 1); `shouldNotListAGameWithoutObservationsByUntil`; `shouldCountPlayedDaysOnlyInsideTheHalfOpenWindow`; `shouldReportElapsedDaysAs36BetweenOct8AndNov13` (assert `elapsedDays === 36`); `shouldReturnNoGamesWhenTheHistoryIsEmpty`; `shouldFailWithNotFoundWhenTheOwnerHasNoAccount`; un test por Tango sin calibración: `to` es `pocos_datos` con `reason: "sin_calibracion"`.
- [ ] **Step 3: Ejecutar** ambos ficheros — Expected: FAIL (clase no existe).
- [ ] **Step 4: Implementar `GetGamesChange`** — `stateAt(days, date)`: filtra `d.date <= date`, llama `summarize(filtrados, date)`, y mapea `games[g].interpretation` con `stateOf`. Un día se cuenta como jugado si algún juego tiene `scoreSeconds` positivo (misma noción que `summarize`). Registrar el token en `module.ts`.
- [ ] **Step 5: Ejecutar** `npx vitest run tests/slices/linkedin-games` y `python3 scripts/check_architecture_boundaries.py` — Expected: PASS, sin violaciones.
- [ ] **Step 6: Commit** `feat(games): GetGamesChange compares two dated verdicts without leaking the future`.

---

### Task 3: Entrega — endpoint

**Files:**
- Modify: `src/slices/linkedin-games/delivery/routes.ts` (añadir `GET /changes`)
- Test: `tests/slices/linkedin-games/integration.test.ts` (seguir el patrón existente de ese fichero para llamar a las rutas) o un fichero nuevo `gamesChangeRoute.test.ts` si el patrón no se reutiliza limpiamente

**Interfaces:**
- Consumes: `GET_GAMES_CHANGE` (Tarea 2).
- Produces: `GET /api/me/linkedin-games/changes?since=YYYY-MM-DD&until=YYYY-MM-DD` → `{ ok: true, change: GamesChange }`. `since` es opcional (modo `current-only`); `until` por defecto la fecha de hoy UTC, igual que `/summary`. Fechas mal formadas: la misma respuesta de error que el resto de rutas del slice (comprobarlo en `integration.test.ts`).

- [ ] **Step 1: Escribir los tests de ruta**: `shouldAnswerTheChangeForAValidWindow`; `shouldAnswerCurrentOnlyWithoutSince`; `shouldRejectAMalformedDate` (mismo código que `/summary` ante una fecha inválida); `shouldAnswerNotFoundWhenTheOwnerHasNoAccount`.
- [ ] **Step 2: Ejecutar** — Expected: FAIL (ruta no existe).
- [ ] **Step 3: Añadir la ruta** con zod igual que `body`/`importBody` (`since` opcional, `until` opcional con el valor por defecto de `/summary`).
- [ ] **Step 4: Ejecutar** `npx vitest run` (raíz completa) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(games): GET /api/me/linkedin-games/changes`.

---

### Task 4: Web — modelo de vista (textos y orden)

**Files:**
- Create: `web/src/app/features/changes/games-change.model.ts`
- Test: `web/src/app/features/changes/games-change.model.spec.ts`

**Interfaces:**
- Consumes: la forma JSON de `GamesChange` (copiar los tipos como `interface` locales; no importar de `src/`), `gameName`, `VERDICT_ORDER` (`core/words.ts`).
- Produces:
```ts
export interface GamesChangeView {
  heading: string;                       // «Games · 8 oct → 13 nov (36 días)» o «Games · hoy» (current-only)
  summary: string;                       // «1 cambió, 1 señal, 3 sin cambios, 1 con pocos datos»
  notice: string | null;                 // N6/N7: «No registraste Games en este periodo»…
  rows: { game: string; pill: Verdict; text: string }[];  // ya ordenadas
}
export function gamesChangeView(c: GamesChange): GamesChangeView;
export const playDateOf: (iso: string) => string; // fecha local YYYY-MM-DD de un instante (misma que usa localToday())
```
Reglas: orden `cambio_confirmado` → `senal` → `no_concluyente` → `sin_cambios` → `evidencia`, y dentro de cada grupo por `VERDICT_ORDER`; `elapsedDays` se muestra tal cual, nunca +1. Los seis textos de §6 son el contrato exacto; N1–N7 de §5.4 también.

- [ ] **Step 1: Escribir los tests** con los textos de §6 literales: `shouldWriteAConfirmedChangeWithItsDatesAndEvidence`, `shouldWriteASenalAsPendingNeverAsAChange`, `shouldSaySigueEstableIgualQueElOct8`, `shouldSayAhoraHayDatosSuficientesForEvidenciaGanada`, `shouldSayYaNoHayDatosForEvidenciaPerdida`, `shouldSayNoSePuedeConcluirForNoConcluyente`, `shouldSaySinCalibracionWhenTheReasonIsSinCalibracion` (Review Focus 2), `shouldShowTheNoticeWhenNothingWasRecordedInTheWindow` (N6), `shouldShowTheShortWindowNotice` (N7), `shouldShowAnEmptyHistoryLine` (Review Focus 3), `shouldShow36DaysForOct8ToNov13`, `shouldOrderRowsByOutcomeThenVerdict`, y `shouldNeverCallAChangeAnyTransitionToOrFromPocosDatos`.
- [ ] **Step 2: Ejecutar** `cd web && npx ng test --watch=false --include='src/app/features/changes/games-change.model.spec.ts'` — Expected: FAIL.
- [ ] **Step 3: Implementar `gamesChangeView` y `playDateOf`** — `playDateOf` reutiliza el mismo formateo de fecha local que `localToday()` (`games.model.ts`); si no es reutilizable tal cual, extraer el formateo a una función compartida en lugar de duplicarlo.
- [ ] **Step 4: Ejecutar** el mismo comando — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): the words of a verdict change in Games`.

---

### Task 5: Web — componente e integración en «Qué cambió»

**Files:**
- Create: `web/src/app/features/changes/games-change.ts` (componente `app-games-change`)
- Modify: `web/src/app/features/changes/changes.ts` (importar el componente y colocarlo entre las evaluaciones y «Actividad»; también en el modo «Todo el historial», sin `since`)
- Test: `web/src/app/features/changes/games-change.spec.ts`; ajustar `changes.spec.ts` solo si el nuevo bloque rompe aserciones existentes

**Interfaces:**
- Consumes: `ApiClient`, `GET /api/me/linkedin-games/changes` (Tarea 3), `gamesChangeView`, `playDateOf` (Tarea 4).
- Produces: `<app-games-change [since]="string | null" [until]="string" />`; `since`/`until` son instantes ISO que el componente convierte con `playDateOf` (Review Focus 5). Fallo de la petición → tarjeta «Games: No disponible» (patrón del `ng-template #na` de `changes.ts`), sin afectar al resto de la página.

- [ ] **Step 1: Escribir los tests del componente** con `HttpTestingController` (patrón de `games.spec.ts`): `shouldAskForTheLocalPlayDatesOfTheWindow` (instante `2026-10-08T23:30:00Z` con zona de pruebas que lo lleve al día siguiente → la petición lleva la fecha local); `shouldAskWithoutSinceInTheHistoryMode`; `shouldRenderOneRowPerGameWithItsPill`; `shouldShowNoDisponibleWhenTheRequestFails`. En `changes.spec.ts`: `shouldShowTheGamesSectionWhenChessAndLanguagesHaveNoActivity` (el caso H2) y `shouldShowTheGamesSectionInTheHistoryMode`.
- [ ] **Step 2: Ejecutar** `cd web && npx ng test --watch=false --include='src/app/features/changes/**/*.spec.ts'` — Expected: FAIL.
- [ ] **Step 3: Implementar el componente** con `rxResource` y `catchError` a `null` (igual que `Games.data`); plantilla con el encabezado, el resumen y las filas con `<app-verdict>`.
- [ ] **Step 4: Integrar en `Changes`** pasando `win.since`/`win.until`; en modo historial, `since = null` y `until = ahora`.
- [ ] **Step 5: Ejecutar** el mismo comando y `npx eslint src` — Expected: PASS, lint limpio.
- [ ] **Step 6: Commit** `feat(web): Games enters "Qué cambió"`.

---

### Task 6: Vacío de página honesto y bloque «Actividad» plegado

**Files:**
- Modify: `web/src/app/features/changes/changes.ts` (`bodyView`, plantilla de `#changesEmpty` y `#changesActivity`)
- Test: `web/src/app/features/changes/changes.spec.ts` (aserciones en las líneas ~135, ~471, ~499, ~727 que hoy esperan «No hay actividad registrada entre …» a nivel de página)

**Interfaces:**
- Consumes: `app-section` compartido (`[open]="false"`, patrón de `games.html`).
- Produces: `bodyView` ya no emite el texto «No hay actividad registrada…» como `empty`; esa frase pasa **dentro** del bloque plegado «Actividad en la ventana» («Sin actividad registrada de ajedrez ni idiomas en este periodo»). `empty` sigue existiendo solo para errores (`ERR_HTTP`, `ERR_NET`, `INCOMPLETE`). Los ids `changesEmpty` / `changesActivity` se mantienen cuando siguen teniendo sentido.

- [ ] **Step 1: Actualizar los tests**: `shouldNotClaimNoActivityAtPageLevel`; `shouldFoldTheActivityBlockByDefault`; `shouldSaySinActividadOfChessAndLanguagesInsideTheActivityBlock`; los errores de red/HTTP/incompleto siguen mostrándose a nivel de página (sin cambios de comportamiento).
- [ ] **Step 2: Ejecutar** `cd web && npx ng test --watch=false --include='src/app/features/changes/changes.spec.ts'` — Expected: FAIL en las aserciones antiguas.
- [ ] **Step 3: Implementar el cambio** en `bodyView` y la plantilla.
- [ ] **Step 4: Ejecutar** el mismo comando — Expected: PASS.
- [ ] **Step 5: Commit** `fix(web): "Qué cambió" no longer claims there is no activity; Actividad is a folded block`.

---

### Task 7: Verificación completa y evidencia visual

**Files:**
- Create (no se commitea el script): `<scratchpad>/seed-games-change.mjs` — siembra por `POST /api/me/linkedin-games/import` una historia donde existan las seis situaciones de §6 (cambio confirmado, señal, sin cambios, evidencia ganada, evidencia perdida, no concluyente) más Tango/Wend sin calibración.
- Create: `docs/superpowers/plans/2026-11-13-que-cambio-games-evidence/` con capturas `m-*.png` (390 px) y `d-*.png` (1200 px) de «Qué cambió» en «Desde última visita», «Últimos 30 días» y «Todo el historial».

- [ ] **Step 1: Suite completa** — `npm test`, `npm run typecheck`, `npm run web:lint`, `cd web && npx ng test --watch=false`, `python3 scripts/check_architecture_boundaries.py`. Expected: todo verde.
- [ ] **Step 2: Build y servidor local** — `npm run web:build`; `npx wrangler dev src/dev.ts --port 8787 --var IMPORT_TOKEN:dev-token`; sembrar con el script.
- [ ] **Step 3: Capturas a 390 y 1200 px** de los tres periodos; comprobar a ojo: filas ordenadas (cambio → señal → no concluyente → sin cambios → evidencia), «36 días» en el encabezado, «Actividad» plegada, sin scroll horizontal a 390 px, texto «sin calibración» para Tango/Wend.
- [ ] **Step 4: Commit** las capturas: `docs(plan): visual evidence for Games in "Qué cambió"`.
- [ ] **Step 5: Abrir el PR de implementación** (una sola PR): título `feat(changes): Games in "Qué cambió" (H2)`; descripción con el límite de datos editados (§7) y los datos demo no productivos.

## Orden y dependencias

Tarea 0 → 1 → 2 → 3 (backend, cada una verde por sí sola) → 4 → 5 → 6 (web; 6 es independiente de 4–5 y puede ir antes si se prefiere un diff más pequeño) → 7. Las Tareas 1–3 no cambian nada visible y se pueden revisar como bloque.

## Auto-revisión

- **Cobertura de la spec:** §4 (fechas, 36 días, Tarea 2/4), §5.1–5.4 (Tareas 1, 2, 4), §6 (Tarea 4), §7 (Tarea 2 y 0), §8 criterios 1–9 (1–4: Tarea 1; 5: Tareas 0/2; 6: Tareas 2/5; 7: Tareas 2/4; 8: Tarea 6; 9: Tarea 5), «Actividad» plegada (Tarea 6). Fuera de alcance respetado: hitos/racha, eliminar «Actividad», visitas.
- **Consistencia de tipos:** `GameState`, `GameOutcome`, `GamesChange`, `GameChangeRow` se definen en las Tareas 1–2 y las usan las Tareas 3–5 con los mismos nombres.
- **Proporción:** el plan nombra interfaces y tests; no contiene cuerpos de funciones.
