# Contrato: señales descartadas (evaluaciones de hallazgo)

**Fecha:** 2026-10-06
**Estado:** 🔒 **CONGELADO (2026-10-06), sin implementar.** D1–D4, D6 y D7 aprobadas; D5 y D8 fuera de este contrato (§7). `LANG_FOCUS_SHIFT_LONGITUDINAL` pendiente de un contrato propio. Cualquier cambio posterior entra por enmienda explícita. **Enmienda A3 (2026-10-08, aprobada y desplegada, §10): criterios en la evaluación y redacción de `LANG_XP_ACCELERATION`.** **Enmienda A4 (2026-10-09, aprobada e implementada, §12): el ELO de un snapshot solo se atribuye a la partida ancla de su lote; excepción acotada a la igualdad de `findings` de D3.** **Enmiendas A5 y A6 (2026-10-13, §13 y §14; implementadas en el PR #49, merge `ba27302`, 2026-10-13): A5 aprobada parcialmente (§13.2–13.4; §13.5 abierta) y A6 aprobada con condición explícita (§14.4 y §14.2); comparabilidad de la tasa de XP de `LANG_XP_ACCELERATION` y ganancia comparable por curso en Trayectoria. Implementación ≠ validación con datos reales: O1, O3, P1, P2 y P4 siguen abiertas.** **Enmienda A2 (2026-10-08, aprobada y desplegada, §9): `CHESS_RATING_JUMP` — sin ELO observado en la ventana no es "Δ = 0".** **Enmienda 2026-10-06:** el invariante de trazabilidad de §4 pasa de igualdad a inclusión (*Inconcluso* ⊇ eliminados por IC); la definición operativa y §8 no cambian.
**Origen:** hoy un hallazgo cuya evidencia no basta **desaparece**: What-changed y Trayectoria solo devuelven lo que se emite. Tras P1.5 eso oculta la distinción más útil: *"no hay señal"* frente a *"hay indicio, pero los datos no permiten afirmarlo"*. Es también el requisito previo de cualquier capa de interpretación (LLM): esta no debe decidir qué se descartó ni por qué.

**Principio:** *Insufficient evidence no significa ausencia de señal.* Meridian decide, de forma determinista, qué se afirma, qué queda inconcluso y por qué. Nada de esto lo decide un modelo.

---

## 1. Qué es una evaluación

Cada regla de hallazgo produce **una evaluación por ejecución**, emitida o no:

```text
Evaluation {
  id:        el id del hallazgo (CHESS_COLOR_ASYMMETRY, …)
  kind:      "statistical" | "threshold" | "event"        (§2)
  status:    "emitted" | "not_emitted"
  reasons:   Reason[]        vacío si emitted; todas las condiciones que fallan si not_emitted
  metrics:   los mismos campos que hoy lleva el hallazgo, cuando se pueden calcular
}
```

- La clasificación *Inconcluso* se reproduce solo con la evaluación transportada (sin datos ni reglas).
- `emitted` ⇔ el hallazgo existe hoy con el mismo contenido. **El conjunto de hallazgos emitidos no cambia** respecto al comportamiento vigente; esto es una vista añadida, no una regla nueva.
- Un hallazgo emitido se identifica igual que ahora; las `not_emitted` no se presentan como hallazgos.

## 2. Tipos de regla (qué admite descarte informativo)

| `kind` | Reglas actuales | Descartes |
|---|---|---|
| `statistical` | `CHESS_COLOR_ASYMMETRY`, `CHESS_COLOR_ASYMMETRY_LONGITUDINAL` | **Sí**: comparan proporciones con n, umbral e IC |
| `threshold` | `CHESS_RATING_JUMP`, `LANG_XP_ACCELERATION` (`LANG_FOCUS_SHIFT_LONGITUDINAL` queda fuera, §3.1) | **Sí, sin incertidumbre**: cumplen o no un umbral determinista; no hay IC y no se inventa |
| `event` | `LANG_ACTIVE_COURSE_SWITCH`, `STREAK_MILESTONE`, `STREAK_BROKEN` | **No**: el evento ocurrió o no; no ocurrir no es una señal descartada |

## 3. Motivos de no emisión (enumerado cerrado)

| `reason` | Significa | Aplica a |
|---|---|---|
| `insufficient_sample` | Falla el gate de n (decididas) o de volumen (XP mínimo, días mínimos de actividad) | statistical, threshold |
| `effect_below_threshold` | El efecto **observado** no alcanza el umbral | statistical, threshold |
| `interval_includes_zero` | El IC95 de la diferencia incluye 0 (`lower ≤ 0 ≤ upper`, como la etiqueta de la UI) | statistical |
| `persistence_not_met` | Trayectoria: el efecto no se mantiene con el mismo signo en las dos eras | statistical |
| `span_too_short` | Trayectoria: la ventana cubre menos días que el mínimo de la regla | statistical, threshold |
| `data_unavailable` | Falta un dato necesario (sin baseline, un color sin partidas decididas, tasa histórica 0) | statistical, threshold |

Reglas:

1. **Se informan todas las condiciones que fallan**, no solo la primera. Si dos fallan, hay dos motivos.
2. Una condición que no puede evaluarse por falta de datos es `data_unavailable`, **nunca** un fallo del umbral.
3. **Los motivos describen condiciones evaluadas por la regla, no etapas de un algoritmo secuencial.** El orden de evaluación no decide qué motivos existen: una implementación con cortocircuitos debe poder producir, p. ej., `[insufficient_sample, data_unavailable, persistence_not_met]`. El conjunto es estable para tests y consumidores; **no hay orden semántico entre motivos**.
4. `effect_below_threshold` **no** afirma ausencia de efecto: el IC puede contener el umbral. Meridian no ofrece un resultado "no hay efecto" (eso exigiría equivalencia estadística; fuera de alcance).

### 3.1 Qué condición cae en qué motivo

Tres fallos distintos, que no se mezclan:

| Motivo | Criterio operativo |
|---|---|
| `insufficient_sample` | La cantidad está **definida** pero su **recuento** (decididas, XP, días con actividad) queda bajo el mínimo |
| `span_too_short` | Solo **longitud calendario** de la ventana (días entre extremos) bajo el mínimo; no cuenta actividad |
| `data_unavailable` | Una magnitud necesaria **no está definida** (sin baseline, grupo con 0 decididas, tasa histórica 0, extremos temporales ausentes). Nunca cuenta como efecto bajo el umbral |

Si el efecto no es calculable (`data_unavailable`), la evaluación **no puede ser inconclusa**: no hay efecto observado que alcance el umbral.

Correspondencia con las reglas vigentes (comprobada contra el código):

| Regla | Condición | Motivo |
|---|---|---|
| `CHESS_COLOR_ASYMMETRY` | decididas ≥ 10 | `insufficient_sample` |
| | ambos colores con decididas | `data_unavailable` |
| | \|blancas − negras\| ≥ 15 pp | `effect_below_threshold` |
| | IC95 excluye 0 | `interval_includes_zero` (`data_unavailable` si no hay IC) |
| `CHESS_COLOR_ASYMMETRY_LONGITUDINAL` | decididas ≥ 40 por color | `insufficient_sample` |
| | días con actividad ≥ 60 | `insufficient_sample` |
| | días calendario ≥ 60 | `span_too_short` |
| | cada era con ambos colores decididos | `data_unavailable` |
| | \|diferencia global\| ≥ 15 pp | `effect_below_threshold` |
| | IC95 de la diferencia global excluye 0 | `interval_includes_zero` |
| | ≥ 10 pp y mismo signo en ambas eras | `persistence_not_met` |
| `CHESS_RATING_JUMP` | ELO inicial y final disponibles | `data_unavailable` |
| | dos ELO observados en snapshots distintos (anclas) alrededor de la ventana (A4, §12) | `data_unavailable` |
| | \|Δ ELO\| ≥ 25 | `effect_below_threshold` |
| `LANG_XP_ACCELERATION` | intervalo ≥ 3 días (A5, §13.4: días naturales completos contenidos en la ventana, no tiempo transcurrido) | `span_too_short` |
| | XP ganado ≥ 200 | `insufficient_sample` |
| | tasa histórica definida y > 0 (A5, §13.4: sin días con registro en la referencia, la tasa no está definida) | `data_unavailable` |
| | ritmo ≥ 1,3 × histórico | `effect_below_threshold` |

**No representable con este enumerado: `LANG_FOCUS_SHIFT_LONGITUDINAL`.** Sus condiciones se evalúan sobre *candidatos* (cursos) y no sobre una sola magnitud: "curso dominante en H1 (≥ 60 % y ≥ 2000 XP)", "otro curso dominante en H2", "el anterior ≤ 25 % en H2", "el nuevo no era ya dominante en H1". Elegir qué candidato explica el descarte y cómo nombrar "el nuevo ya era dominante" (no es umbral de efecto ni persistencia) es una decisión propia. **Queda fuera de este contrato**: no genera evaluaciones hasta resolverla aparte.

---

## 4. Niveles de saliencia (para el consumidor, no para el cálculo)

Se derivan **solo de la evaluación transportada** (`status`, `reasons` y `metrics`), sin volver a ejecutar la regla ni consultar datos. Por eso `metrics` de una evaluación `not_emitted` **debe conservar el efecto observado** (p. ej. `diffPp`, `ratingDelta`, ratio de ritmo) siempre que sea calculable: `insufficient_sample` por sí solo no dice si el efecto era +40 pp o +2 pp.

| Nivel | Condición | Lectura |
|---|---|---|
| **Hallazgo** | `emitted` | Se afirma |
| **Inconcluso** | `not_emitted` y el efecto observado alcanza el umbral, y solo fallan `insufficient_sample` y/o `interval_includes_zero` | "Hay indicio, los datos no permiten afirmarlo" |
| **Sin indicio** | cualquier otro `not_emitted` | No se muestra por defecto |

**Invariante de trazabilidad:** todo hallazgo que el comportamiento anterior a P1.5b habría emitido y la condición de IC de la regla A(b) elimina es *Inconcluso* (con `interval_includes_zero`). El recíproco **no** se exige: *Inconcluso* también puede existir donde la regla nunca habría emitido un hallazgo, p. ej. por `insufficient_sample` con efecto observado sobre el umbral (9 decididas con +30 pp). La clasificación se determina solo desde la evaluación transportada (`salience`). Es comprobable por test.

## 5. Compatibilidad

- `findings` **no cambia** (forma ni contenido): los consumidores existentes, incluido el cliente externo de ingesta, no se ven afectados.
- Las evaluaciones viajan en un **campo nuevo** (`evaluations`) en `/api/what-changed` y `/api/trajectory`. Aditivo; sin migración.
- Las evaluaciones se calculan en el dominio (funciones puras), junto a las reglas, para que **emitir y descartar sea la misma evaluación** y no puedan divergir. Los adaptadores de persistencia no las calculan.

## 6. Fuera de alcance

- Capa LLM, `evidenceId[]` por afirmación y salida estructurada de interpretación: contrato posterior, que consumirá este.
- "Ausencia de efecto" (equivalencia/TOST), multiplicidad (Bonferroni/FDR).
- UI del *Evidence Brief*; aquí solo el contrato de datos.
- Semántica del ELO (`elo_after` vs `elo_observations`): `CHESS_RATING_JUMP` queda **provisional** hasta P1.3-ELO/P2; sus evaluaciones heredarán esa semántica.

## 7. Decisiones

| ID | Pregunta | Propuesta |
|---|---|---|
| **D1** | ¿Dos estados o tres? | ✅ **Aprobada.** Dos estados; "inconcluso" se deriva solo de `status` + `reasons` + `metrics` transportados (§4). |
| **D2** | ¿El enumerado de §3 es completo? | ✅ **Aprobada.** Seis motivos con las definiciones de §3.1; `LANG_FOCUS_SHIFT_LONGITUDINAL` fuera, pendiente de contrato propio. |
| **D3** | ¿Todos los fallos o solo el primero? | ✅ **Aprobada.** Todos (regla 1 de §3). Amplía la explicación; no cambia el conjunto de hallazgos emitidos. |
| **D4** | ¿Qué `kind` generan evaluación? | ✅ **Aprobada.** `statistical` y `threshold`; `event` no. Los `threshold` no son homogéneos: §3.1 muestra que XP-aceleración y salto de ELO caben en el enumerado; foco de idioma no. |
| **D5** | Formato del `evidenceId` | ⚠️ **Retirada de este contrato:** se decide en el contrato de salida estructurada. |
| **D6** | ¿Campo aditivo `evaluations`? | ✅ **Aprobada.** Aditivo (§5). |
| **D7** | ¿Qué superficies y en qué orden? | ✅ **Aprobada.** What-changed primero; Trayectoria en otro PR. |
| **D8** | ¿Qué muestra por defecto el consumidor? | ⚠️ **Retirada de este contrato:** es presentación, no contrato de datos. |

## 8. Tests exigidos (cuando se congele)

- Cada motivo puede aparecer **solo** (una condición falla, las demás pasan) y combinado.
- `emitted` ⇔ el hallazgo existe hoy: la lista de hallazgos es idéntica antes y después.
- *Inconcluso* ⊇ hallazgos eliminados por la condición de IC de A(b): 5 vs 5 con +40 pp → inconcluso con `interval_includes_zero`; 9 decididas con +30 pp → `insufficient_sample` e inconcluso solo si el resto de condiciones pasan.
- `data_unavailable` nunca se confunde con `effect_below_threshold`.
- Ninguna evaluación de tipo `event`.
- **Invariante de oro (D3)** *(con la excepción acotada de A4, §12.5, y las de A5, §13.6, y A6, §14.6, aprobadas e implementadas el 2026-10-13, PR #49)*: para los mismos inputs, `findings` es idéntico antes y después (mismo contenido, mismo orden); evaluar todas las condiciones solo amplía `evaluations`.
- Los motivos no dependen del orden en que se evalúan las condiciones.

---

## 9. Enmienda A2 (2026-10-08) — ausencia de observación de ELO no es efecto cero

**Estado:** 📝 **PROPUESTA**, pendiente de aprobación del propietario. Hasta entonces el contrato vigente es el de §1–§8. El código y los tests de esta enmienda viajan en la misma rama, **sin mergear**.

### 9.1 Dato que la motiva

- Demo local sobre `main` (2026-10-08, ventana de 7 días sin partidas): `CHESS_RATING_JUMP` sale `not_emitted` con `reasons = [effect_below_threshold]` y `metrics.ratingDelta = 0`, y la UI muestra "ELO 900 → 900 (0 partidas) · SIN INDICIO". Es la lectura "se comprobó que no cambió", cuando no se observó nada.
- Causa, en `getWhatChangedUseCase`: con `gamesCount = 0` el caso de uso **fabrica** `currentRating = baselineRating` y `ratingDelta = 0`. La regla recibe un efecto observado de 0 y lo descarta por debajo del umbral. `data_unavailable` (§3.1: "una magnitud necesaria **no está definida**; nunca cuenta como efecto bajo el umbral") no puede dispararse nunca para esta causa.
- Procedencia del ELO (contrato del modelo de observación, §0.1, Q1): 1.507 partidas, **0** con `elo_after`, 1.507 con `page_elo`. La serie de ELO que lee What-changed es por partida (`COALESCE(elo_after, page_elo)`). Una observación de ELO en la ventana es, por tanto, **una partida de la ventana con ELO**.

### 9.2 Decisión propuesta

| | Hoy | Con A2 |
|---|---|---|
| `currentRating` | último ELO de una partida de la ventana, o el inicial si no hay | **solo** el último ELO de una partida de la ventana; `null` si no hay |
| `ratingDelta` | `0` si `gamesCount = 0`; si no, `current − baseline` | `current − baseline` si ambos existen; **`null`** en otro caso |
| `CHESS_RATING_JUMP`, ventana sin ELO observado | `[effect_below_threshold]` (`SIN INDICIO`) | **`[data_unavailable]`** (`INSUFICIENTE`) |

Se añade a la tabla de §3.1, fila de `CHESS_RATING_JUMP`: *"ELO observado **dentro de la ventana** (al menos una partida con ELO)" → `data_unavailable`*. El resto de condiciones de la regla no cambian.

### 9.3 Qué no cambia

- El umbral (`|Δ| ≥ 25`), el enumerado de motivos, `kind`, `salience()` y la forma de `evaluations`.
- **Los hallazgos emitidos (invariante de oro, D3):** un Δ de 0 y un Δ `null` no emiten, así que `findings` es idéntico antes y después para las mismas entradas. Cambia solo `evaluations` de `CHESS_RATING_JUMP` en ventanas sin ELO observado, y los campos `chess.ratingDelta` / `chess.currentRating` de la respuesta de `/api/what-changed`, que pasan de `0` / ELO inicial a `null`.
- No se añade ningún mínimo de partidas: una partida con ELO basta para observarlo; exigir más sería un umbral nuevo sin dato que lo respalde.

### 9.4 Alternativas descartadas

- **`insufficient_sample` con un mínimo de partidas:** introduce un umbral arbitrario, y el fallo real no es de tamaño sino de ausencia de observación (`data_unavailable`, §3.1).
- **Exigir un snapshot de Chess dentro de la ventana** (`elo_observations`, 41 filas): la serie que What-changed lee hoy es por partida; cambiarlo mezcla esta enmienda con el cambio de lecturas de P2. Se reabre cuando las lecturas pasen a `elo_observations`.
- **Parchear la UI** para mostrar INSUFICIENTE cuando `gamesCount = 0`: dejaría dos semánticas para la misma `Evaluation`.

### 9.5 Consecuencias en consumidores

- La UI ya mapea `data_unavailable` a INSUFICIENTE; solo cambia el texto del motivo ("No hay ELO observado al inicio o dentro de la ventana (ninguna partida con ELO)"). La card de Deltas muestra "—" en lugar de "0" para Delta ELO.
- El cliente de ingesta no consume `/api/what-changed` (auditoría de lecturas 2026-10-01: consumidor único, el dashboard).

### 9.6 Tests (en `tests/getWhatChangedUseCase.test.ts` y `tests/frontendEvaluations.test.ts`)

- Sin ELO observado: `ratingDelta` y `currentRating` son `null`, `baselineRating` se conserva.
- `CHESS_RATING_JUMP` sin ELO observado: `reasons = [data_unavailable]`, sin hallazgo.
- Partidas en la ventana pero ninguna con ELO: `data_unavailable`.
- Con una partida con ELO en la ventana: la regla se evalúa como antes (`effect_below_threshold` con Δ 10; hallazgo con Δ 30).
- UI: la evaluación sin ELO observado sale INSUFICIENTE y nunca SIN INDICIO.
- El golden de hallazgos (`whatChangedEvaluations`) sigue pasando sin cambios.

---

## 10. Enmienda A3 (2026-10-08) — criterios dentro de la evaluación y XP observado, no "ritmo de aprendizaje"

**Estado:** ✅ **aprobada y desplegada** (2026-10-08, PR #34).

### 10.1 Datos que la motivan

- **Duplicación (deuda declarada en #29).** El frontend cita en los motivos los umbrales de las reglas (10 decididas, 15 pp, 25 puntos, 200 XP, 1,3×, 3 días) copiados a mano. Si una regla cambia, el texto miente sin que ningún test lo detecte.
- **Contradicción de lenguaje.** `LANG_XP_ACCELERATION` afirma "Aceleración en tu ritmo de aprendizaje", mientras la card de Intensidad del mismo producto dice que sus ratios "no representan eficiencia cognitiva ni velocidad de aprendizaje". Lo observado es XP por día; "aprendizaje" es una interpretación sin respaldo (§7 de la auditoría de producto, "Observed ≠ Interpreted").

### 10.2 Decisión propuesta

1. **`Evaluation.criteria`** (campo nuevo, aditivo como `evaluations` en D6): `Record<string, number>` con los umbrales que la regla aplica. Los valores salen de **una sola constante** (`CRITERIA`) que usan tanto la regla como la evaluación, así que no pueden divergir.

   | Regla | `criteria` |
   |---|---|
   | `CHESS_RATING_JUMP` | `minAbsDelta: 25` |
   | `CHESS_COLOR_ASYMMETRY` | `minDecided: 10`, `minDiffPp: 15` |
   | `LANG_XP_ACCELERATION` | `minDays: 3`, `minXp: 200`, `minRatio: 1.3` |

   Las reglas de Trayectoria no generan evaluaciones todavía (D7) y quedan fuera.
2. **Redacción de `LANG_XP_ACCELERATION`** (el `id` no cambia: es un contrato externo estable):
   - `title`: "Aceleración de ritmo" → **"Mayor XP diario"**.
   - `claim`: "Aceleración en tu ritmo de aprendizaje: creció Nx sobre tu media histórica." → **"Tu XP diario en el periodo fue Nx tu media histórica."**
   - `evidence`, `metrics` y la condición de emisión no cambian.
3. **Frontend:** los motivos leen `evaluation.criteria`; si falta, dicen "no se alcanza el criterio" sin inventar un número. Se eliminan las constantes copiadas.

### 10.3 Qué no cambia

Umbrales y condiciones de emisión, enumerado de motivos, `salience()`, el conjunto de hallazgos emitidos (el golden sigue comparando byte a byte **todos** los hallazgos; solo se mapea `title` y `claim` de `LANG_XP_ACCELERATION`, y la fixture `legacyWhatChanged` queda verbatim), y los demás textos de hallazgos.

### 10.4 Alternativas descartadas

- **Dejar los umbrales copiados con un test de paridad:** protege la copia, pero la copia sigue existiendo.
- **Nombre neutro sin cambiar el claim:** el claim es la frase que el usuario lee; el problema está ahí.
- **Cambiar el `id`:** rompería a cualquier consumidor del id, sin ganancia.

### 10.5 Tests

- Cada evaluación lleva `criteria` igual a `CRITERIA[id]`.
- Cada umbral emite justo en su valor y no un paso por debajo (la constante es la que usa la regla).
- El claim nuevo de `LANG_XP_ACCELERATION` y la ausencia de "aprendizaje" / "Aceleración".
- Golden de hallazgos con el mapeo de redacción como única excepción.
- UI: cita el criterio del payload (cambiado a 77 aparece 77); sin `criteria` no inventa ninguno.

---

## 11. Estado de implementación de D7 (2026-10-08) — Trayectoria

Sin enmienda: es la ejecución de lo ya aprobado (D6 y D7; §3.1 ya enumera las condiciones de `CHESS_COLOR_ASYMMETRY_LONGITUDINAL`).

- `/api/trajectory` devuelve `evaluations` (aditivo). Una evaluación, `CHESS_COLOR_ASYMMETRY_LONGITUDINAL` (`statistical`), con los motivos de la tabla de §3.1: `insufficient_sample` (decididas por color, días con actividad), `span_too_short`, `data_unavailable` (extremos temporales o una era sin un color), `effect_below_threshold`, `interval_includes_zero`, `persistence_not_met` (≥ 10 pp y mismo signo en las dos eras).
- Sus `metrics` conservan el efecto observado aunque no se emita, y añaden las diferencias con signo (global y de cada era) para poder leer la persistencia.
- Sus `criteria` salen de la misma constante `CRITERIA` que la regla (§10).
- `findings` no cambia: el golden compara byte a byte contra una copia verbatim de la función anterior (`tests/fixtures/legacyTrajectory.ts`).
- **Sigue fuera:** `LANG_FOCUS_SHIFT_LONGITUDINAL` (necesita contrato propio, §3.1). Su hallazgo, si se emite, se muestra sin estado epistémico.

---

## 12. Enmienda A4 (2026-10-09) — el ELO de un snapshot no es el ELO de cada partida

**Estado:** ✅ **aprobada por el propietario (2026-10-09) e implementada** en el PR de A4 (adaptador `d1WhatChangedAdapter`, texto de la UI y los tests de §12.8; S1 sigue sin verificar). Completa a A2 (§9); no cambia el umbral (`|Δ| ≥ 25`), el enumerado de motivos, `kind`, `salience()` ni la forma de `evaluations`.

### 12.1 Datos que la motivan
Extracción de solo lectura de producción del 2026-10-09 (cinco `SELECT`; los datos se borraron, solo se conservan agregados):

- `matches.page_elo` es el `eloRating` del snapshot en que se vio por primera vez la partida, copiado a todas las del lote y nunca actualizado (`normalization/matches.ts`, `db/store.ts`). Comprobado: `page_elo` == ELO de su snapshot de primera vista en 29/29 partidas comprobables.
- 1.430 de 1.536 partidas (93,1 %) se jugaron antes del primer snapshot de ajedrez (2026-09-23) y entraron en dos lotes (1.000 y 430). Las 1.000 del primero comparten un único valor (992). Hay 25 valores de `page_elo` en 1.536 partidas y 29 snapshots de primera vista distintos.
- Consecuencia medida: en las ventanas con baseline y observación, el Δ de ELO es **0 por construcción** (baseline y actual del mismo snapshot) en 243/256 (1 d), 307/325 (3 d), 337/359 (7 d), 344/373 (14 d) y 320/365 (30 d). Hoy eso se evalúa como `effect_below_threshold` («SIN INDICIO»), que se lee como «se comprobó que no cambió».
- Las 106 partidas posteriores al 2026-09-24 sí tienen `page_elo` variable (1–5 valores por día). El desfase entre jugar y verse por primera vez va de 0,05 h a 66,6 h (mediana 2,8 h, p90 46,7 h). **No se midió cuánto de esto llega a lo que el propietario ve en la ventana «desde tu última visita».**
- **Lo que no se pudo establecer:** cuántos de esos ceros ocultan un movimiento real. La serie independiente `elo_observations` tenía 9 puntos (desde 2026-10-06).

### 12.2 Regla de atribución
Un snapshot S observa **un** ELO de cuenta, en su instante de lectura. Ese valor se asocia a una única partida, el **ancla** de S: la de mayor `played_at` entre las vistas por primera vez en S. Las demás partidas del lote comparten el valor del snapshot pero **no tienen ELO observado propio**. Si el máximo `played_at` del lote está empatado, el lote no tiene ancla. No se reconstruye ni se interpola el ELO de ninguna otra partida, ni el del historial anterior al primer snapshot.

| | Hoy | Con A4 |
|---|---|---|
| Serie de ELO de What Changed | `COALESCE(elo_after, page_elo)` de cualquier partida | `page_elo` **solo de anclas** (una por snapshot de primera vista); `elo_after` queda fuera de la serie hasta que se defina su procedencia (§12.2.1) |
| `baselineRating` | último ELO de partida ≤ `since` | ELO del último ancla ≤ `since`; `null` si no existe |
| `currentRating` | último ELO de partida en (`since`, `until`] | ELO del último ancla en (`since`, `until`]; `null` si no existe |
| `ratingDelta` | `current − baseline` | `current − baseline` si existen ambos **y proceden de snapshots distintos**; `null` en otro caso |
| `CHESS_RATING_JUMP` sin comparación válida | `[effect_below_threshold]` con Δ = 0 | `[data_unavailable]` (INSUFICIENTE) |

Se añade a la tabla de §3.1, fila de `CHESS_RATING_JUMP`: *«dos ELO observados en snapshots distintos (anclas) alrededor de la ventana» → `data_unavailable`*. Un Δ que no puede evaluarse con fiabilidad es `null`, nunca 0.

#### 12.2.0 Qué es «el lote» y qué instante describe cada cifra
- **Lote = partidas con el mismo `matches.snapshot_id`.** El identificador es `NOT NULL`, se escribe una sola vez en la primera vista de la partida (`upsertMatches` solo actualiza `last_seen_at` y `played_at`) y es único por ingesta (`crypto.randomUUID()` por snapshot nuevo). Un snapshot posterior que repite una partida no la mueve de lote (probado con la ingesta real).
- **Excepción conocida:** la ingesta escribe las partidas *antes* que la fila de `snapshots` (para que el reintento no se tome por duplicado). Si el intento falla entre ambos pasos, las partidas quedan con el id del intento fallido, que no tiene fila en `snapshots`, y el reintento guarda el snapshot con otro id (reproducido en test). **Un lote cuyo `snapshot_id` no existe como snapshot de ajedrez no aporta ELO** (prefiero un ELO ausente a uno atribuido).
- **Caso residual no resuelto:** un fallo a mitad de la escritura por tandas (>50 partidas nuevas) podría repartir un mismo payload entre dos ids; el lote con fila de snapshot tendría un «ancla» que quizá no es la última partida del payload. No hay forma de detectarlo con el esquema actual; es del mismo orden que S1 (§12.3) y queda acotado por la misma limitación de la afirmación.
- **Dos instantes distintos en la respuesta.** `baseline.observedAt` y los contadores de resultados (`lifetime*`) describen la **última partida** ≤ `since`. El ELO (`chess.baselineRating`) es otra observación: el del último **ancla** ≤ `since`, colocado en `chess.baselineRatingAt` (`played_at` del ancla); `chess.currentRatingAt` hace lo mismo para el actual. Pueden diferir, y el ELO se leyó de un snapshot en o después de ese instante: **no se afirma** que sea el ELO exacto tras esa partida (S1). `baselineAt` de los hallazgos sigue siendo `baseline.observedAt` (la ventana de resultados), no el instante del ELO.

#### 12.2.1 Fuentes de ELO: `page_elo` frente a `elo_after`
Son dos cosas distintas y A4 no las trata igual:

- **`page_elo`** procede del snapshot (`eloRating` de la lectura). Es una observación **de snapshot**, y se le aplica la regla del ancla.
- **`elo_after`** (`match_details`) sería una observación **de partida** solo si garantizase «ELO de la cuenta tras esta partida». **Hoy no lo garantiza:** `normalizeChessDetail` lo rellena con `eloAfter ?? elo_after ?? eloRating` (`normalization/chessDetail.ts`), y `eloRating` es el nombre del ELO de cuenta *en el momento de la lectura* que usa el snapshot; la fila no guarda cuál de las tres claves lo aportó. Por tanto un `elo_after` puede ser el ELO de la hidratación y no el posterior a la partida. Además, en la medición del 2026-10-06 (observation-model §0.1, Q1) 0 de 1.507 partidas lo tenían; **no se volvió a medir** el 2026-10-09 (el `match_details` no entró en la extracción).
- **Decisión de A4:** mientras no se registre su procedencia, `elo_after` **no se usa** como observación de partida en la serie de ELO. No se descarta por «no ser ancla»: se descarta por no tener semántica garantizada, y el contrato lo dice expresamente.
- **Camino para admitirlo (otra enmienda, no ésta):** (1) guardar qué clave lo aportó (`eloAfter` explícito frente al respaldo `eloRating`), (2) una comprobación con datos de que, para las partidas con `elo_after` explícito, coincide con el `page_elo` del ancla cuando ambos existen para la misma partida. Con eso, un `elo_after` explícito sería una observación de partida válida aunque la partida no sea ancla, y se usaría con preferencia sobre `page_elo`.
- Hoy el efecto práctico es nulo si `elo_after` sigue vacío; si no lo está, A4 puede reducir la serie, y eso queda cubierto por la prueba 7 de §12.8.

### 12.3 Supuesto explícito (S1) y límite de lo que se afirma
**S1:** entre la partida ancla y la lectura de S no hay partidas jugadas que S aún no haya visto. Solo bajo S1 el ELO leído en S es el ELO *tras* el ancla.

- **S1 no está demostrado.** Los datos no permiten comprobarlo (tras la extracción solo quedan agregados). Una comprobación posible, que requiere una autorización de lectura nueva: contar partidas vistas por primera vez en un snapshot posterior a otro que ya existía **después** de su `played_at` (partidas que aparecen con retraso); si hay alguna, S1 es falso para ese lote.
- **Por tanto la afirmación del contrato se limita a lo observable:** «el ELO de la cuenta leído en el snapshot S, asociado a la última partida que S ve». No se afirma «el ELO exacto tras esa partida» ni se coloca el punto con más precisión que el intervalo [`played_at` del ancla, `created_at` de S].
- Si una comprobación futura refuta S1 para una parte de los lotes, esos lotes se tratan como **sin ancla** (nueva enmienda). Hasta entonces, la UI no debe presentar el ELO ancla como ELO «tras la partida».

### 12.4 Qué no cambia
Umbral `|Δ| ≥ 25`, motivos, `kind`, `salience()`, `criteria`, la forma de `evaluations`; `/api/stats/summary` y la línea de ELO (leen `snapshots.eloRating`, una observación de snapshot declarada como tal); `matches.page_elo` (no se toca ni se borra); el historial.

### 12.5 Excepción acotada a D3 (invariante de oro)
El propietario aprueba (2026-10-09) esta precisión: lo que se preserva no es que los hallazgos anteriores permanezcan idénticos tras corregir una semántica defectuosa, sino que **emitir y descartar consumen la misma evaluación y sus estados epistemológicos**.

- A4 puede **hacer desaparecer** un hallazgo `CHESS_RATING_JUMP` que antes se emitía, si el ELO en que se apoyaba no es de un ancla o no hay dos anclas de snapshots distintos. Es aceptable porque ese hallazgo no tenía evidencia suficiente; ahora aparece como INSUFICIENTE, con `data_unavailable`.
- La excepción solo cubre `CHESS_RATING_JUMP` y solo por esta causa. Los demás hallazgos de What Changed y de Trayectoria mantienen la igualdad byte a byte del golden.
- **Compatibilidad histórica:** no se exige igualdad de hallazgos antes y después de A4. Se exige que cada cambio de resultado esté **explicado y probado** (§12.8, prueba 5). Los hallazgos de ELO ya mostrados no se corrigen retroactivamente en ningún almacén (no se persisten).
- Qué no se puede decir de las consecuencias históricas: no se midió cuántos hallazgos `CHESS_RATING_JUMP` se emitieron realmente con ELO no ancla. Esa cifra no se conoce.

### 12.6 Consecuencias en consumidores
- La UI ya mapea `data_unavailable` a INSUFICIENTE; cambia el texto del motivo de ELO a «no hay dos observaciones de ELO en snapshots distintos alrededor de la ventana». La card de Deltas muestra «—» en lugar de 0. La línea observada de la evaluación dice «ELO leído en snapshots: a → b (n partidas en la ventana)»: no presenta el valor como ELO exacto tras una partida mientras S1 siga sin verificar. El texto de los hallazgos emitidos (dominio) no cambia.
- Cobertura: con los datos del 2026-10-09, 29 de 1.536 partidas tienen ELO observable. Reproducida sobre las mismas ventanas (1/3/7/14/30 d), la regla deja el delta disponible en 14/17/17/17/17; en 2 ventanas por longitud que hoy muestran Δ = 0 habría un delta resoluble, y entre 1 y 30 ventanas (según la longitud) que hoy muestran Δ ≠ 0 pasarían a `data_unavailable`. Es una descripción de los datos de ese día, no una validación de la regla.
- `elo_observations` mejoraría la cobertura (una fila por snapshot, con o sin partidas nuevas), pero A4 no la necesita y no autoriza su backfill.

### 12.7 Alternativas descartadas
- **Umbral de desfase (p. ej. ≤ 6 h):** el desfase reciente va de 0,05 h a 66,6 h; cualquier corte es arbitrario.
- **Pasar ya a `elo_observations`:** no resuelve ventanas anteriores al 2026-09-23 (no existe ninguna fuente) y su serie era de 9 filas.
- **Interpolar o reconstruir el ELO de partidas antiguas:** inventaría una observación.
- **Congelar `findings` y cambiar solo `evaluations`:** emitiría con un ELO que la propia evaluación declara no observado.
- **Parchear la UI:** dejaría dos semánticas para la misma `Evaluation`.

### 12.8 Tests exigidos (en el PR de implementación, no en este)
1. Una partida ancla y otra no ancla del mismo lote: solo la ancla tiene ELO observado.
2. Dos anclas de snapshots distintos con delta calculable: se evalúa como antes (`effect_below_threshold` con Δ 10; hallazgo con Δ 30).
3. Comparaciones sin evidencia suficiente (ventana anterior al primer snapshot, baseline y actual del mismo lote, lote sin ancla por empate, sin ELO en la ventana): `ratingDelta = null`, `[data_unavailable]`, nunca un Δ 0 artificial.
4. Consistencia: para las mismas entradas, `CHESS_RATING_JUMP` emitido ⇔ evaluación `emitted` y descartado ⇔ `not_emitted` con sus `reasons` (una sola evaluación alimenta ambos).
5. Regresión: los casos en que un hallazgo desaparece tras A4 se fijan como tests con su explicación (el ELO usado no era de un ancla / no había dos snapshots distintos), y el golden del resto de hallazgos sigue byte a byte.
6. Empate en el máximo `played_at` del lote: sin ancla.
7. `elo_after` presente en una partida no ancla (y en una ancla): no entra en la serie; la serie usa solo `page_elo` del ancla. Un `elo_after` rellenado por el respaldo `eloRating` no se confunde con un ELO posterior a la partida.
8. Un lote cuyo `snapshot_id` no tiene fila de snapshot de ajedrez (intento de ingesta fallido) no aporta ELO; probado con la ingesta real y un fallo en la escritura del snapshot.
9. Un snapshot posterior que repite partidas no las mueve de lote (ingesta real).
10. Empate en el máximo `played_at` del lote del **baseline**: sin ELO ni `ratingAt`; combinado con un ancla posterior válida, `ratingDelta` es `null` (ni 0 ni un valor inventado).
11. `baselineRatingAt` / `currentRatingAt` son el `played_at` del ancla y pueden diferir de `baseline.observedAt`.
12. Los hallazgos y evaluaciones distintos de `CHESS_RATING_JUMP` no dependen de las observaciones de ELO (mismos datos de partidas y XP con y sin ELO ⇒ igualdad), además del golden de `evaluateChanges` (el dominio no cambia en este PR).

---

## 13. Enmienda A5 (2026-10-13) — la tasa de XP compara días naturales con días naturales

**Estado:** ✅ **aprobada parcialmente por el propietario (2026-10-13); implementada en el PR #49 (merge `ba27302`).** Lo implementado es solo §13.2–13.4; §13.5 (O1, O3) sigue abierta.
- **Aprobado (§13.2–13.4):** unidades temporales equivalentes, días naturales UTC completos, exclusión explícita de los extremos parciales, y un dato desconocido no es 0.
- **Aceptado para avanzar, no definitivo (§13.5):** la base provisional «XP por día con registro». **No demuestra** que la tasa represente la actividad diaria real; es una base internamente coherente, nada más.
- **Abierto:** O1 (qué significa una fila ausente) y O3 (cuánta cobertura es suficiente; **sin cifra**). Resueltos: O2 (no se incluyen días parciales, §13.9) y la excepción a D3 (§13.6).

No cambia `minXp`, `minRatio`, el enumerado de motivos, `kind`, `salience()` ni la forma de `evaluations`. Alcance: `LANG_XP_ACCELERATION` y los campos de What Changed que alimentan su evaluación.

### 13.1 Datos que la motivan
Reproducción sintética (`tests/e1/xpRateComparability.test.ts`, 7 tests de caracterización; **ninguna cifra procede de datos reales**):

- Numerador y divisor miden tiempos distintos. El XP del intervalo se suma por **días naturales** `(día(since), día(until)]` (`getLanguagesInterval`, fijado por `d1WhatChangedAdapter.test.ts`); el divisor es el **tiempo transcurrido en milisegundos** (`getWhatChangedUseCase`, `durationDays`).
- Con las mismas cuatro filas (600 XP), tres ventanas que solo difieren en la hora de sus extremos dan ratio 1,5 / ≥ 1,9 / ≤ 1,25 y estados `emitted / emitted / not_emitted`: el estado epistémico depende del reloj de la ventana, no de los datos.
- El día de `until` entra entero aunque `until` sea las 00:01; el XP posterior a `until` entra en la ventana si `until` está en el pasado (las filas de `xp_summaries` se sobrescriben en sitio). El día de `since` no entra en ninguna ventana del flujo por defecto (ancla → ahora), porque sus filas se asignan a la referencia (`date <= día(since)`).
- La referencia es `SUM(gained_xp) / COUNT(DISTINCT date)` **sobre filas existentes**: «XP por día con registro». Con la misma actividad, guardar los días inactivos como filas con 0 o no guardarlos da 50 frente a 100 XP/día de referencia.
- `normalizeLanguagePayload` convierte un `gainedXp` ausente en `0` (y `gained_xp` es `NOT NULL` desde la migración `0008`).

**Lo que no se ha podido establecer** (requiere lectura de datos reales, hoy no autorizada): si la fuente entrega filas para los días sin actividad (§13.5); la magnitud del sesgo en ventanas reales; cuántos hallazgos `LANG_XP_ACCELERATION` se emitieron o se perdieron por esta causa. Esa cifra no se conoce.

### 13.2 Regla de comparabilidad
**Principio (aprobado conceptualmente).** El ritmo del intervalo y la referencia son cantidades de la **misma base**: XP por unidad de un mismo conjunto de días naturales UTC, sin ningún día parcial en ninguno de los dos.

| | Hoy | Con A5 |
|---|---|---|
| Unidad de tiempo del ritmo del intervalo | ms transcurridos entre `since` y `until` | nº de días naturales UTC **contenidos** en la ventana |
| XP del intervalo | filas con `día(since) < date ≤ día(until)` | filas de los días contenidos |
| Referencia | filas con `date ≤ día(since)`, dividida entre filas | filas de los días naturales **anteriores** a `since`, dividida con la misma base que el intervalo (§13.5) |
| Días parciales | el de `until` entra entero; el de `since` queda en la referencia | **no entran** en ninguno; se declaran |

#### 13.2.1 Día contenido
Un día natural UTC `d` (de `00:00:00Z` a `24:00:00Z`) está **contenido** en la ventana `(since, until]` si empieza en o después de `since` y termina en o antes de `until`. El día que contiene a `since` y el que contiene a `until`, salvo que el extremo caiga en una medianoche, son **parciales**: no suman XP al intervalo ni cuentan en la referencia. La referencia usa los días que terminan en o antes de `since`; **ningún día pertenece a la vez al intervalo y a la referencia**.

`metrics` conserva `partialDaysExcluded` (0, 1 o 2) para que el consumidor pueda decir qué quedó fuera. No se fracciona un día: `xp_summaries` no tiene resolución horaria (alternativa descartada, §13.7).

#### 13.2.2 Invariantes
1. Homogeneidad: numerador y divisor de ritmo y referencia se calculan sobre conjuntos de días definidos con la misma regla.
2. Estabilidad: dos ventanas con el mismo conjunto de días contenidos y las mismas filas dan **el mismo ritmo y el mismo estado**, sea cual sea la hora de sus extremos.
3. Partición: ningún día cuenta en el intervalo y en la referencia.
4. Un día no observado no se convierte en actividad ni en inactividad (§13.3, §13.5).

### 13.3 Datos desconocidos
- Un `gainedXp` ausente en la fuente **no es 0** (se alinea con observation-model §4, invariante 6, que hasta hoy solo cubría las tablas de observación). Como `gained_xp` es `NOT NULL`, la regla es: **no se persiste fila** en `xp_summaries` para un día sin `gainedXp` numérico. No requiere migración. Un `gainedXp = 0` observado sí se persiste y es un cero observado.
- Un ritmo o una referencia sin ningún día con registro **no están definidos**: son `data_unavailable` (§3), nunca «0 XP/día» ni «sin cambio».
- **La cobertura debe poder calcularse y exponerse antes de decidir cuánto es suficiente.** Campos aditivos en las métricas, **sin ningún umbral asociado**:

  | Campo | Significado |
  |---|---|
  | `containedDays` | días naturales UTC contenidos en la ventana (§13.2.1), con o sin fila |
  | `observedDays` | de ellos, los que tienen fila con `gainedXp` numérico |
  | `historicalSpanStart` | primer día natural del intervalo histórico de referencia (definición abajo) |
  | `historicalSpanDays` | días naturales del intervalo histórico: **todos** los de `[historicalSpanStart, último día completo anterior a since]`, tengan o no fila |
  | `historicalObservedDays` | de ellos, los que tienen fila con `gainedXp` numérico |

- **El intervalo histórico es reproducible y, salvo su extremo inicial, no depende de qué días tienen registro.** Su extremo final es el último día natural completo anterior a `since` (§13.2.1) y su extremo inicial es `historicalSpanStart`, el **primer día natural con alguna fila** del usuario en `xp_summaries`. Todos los días intermedios cuentan en `historicalSpanDays` aunque no tengan fila: un día ausente **nunca sale del denominador** (hacerlo inflaría la cobertura). El primer día con fila es el único elemento que depende de los registros, y es deliberado: antes de él Meridian no tiene evidencia de haber observado la fuente, de modo que esos días no son «ausentes» sino anteriores al registro; se expone `historicalSpanStart` para que sea visible. Un registro anterior que aparezca después (p. ej. un backfill autorizado) amplía el intervalo, nunca lo estrecha. Sin ninguna fila anterior a `since`, `historicalSpanStart`, `historicalSpanDays` e `historicalObservedDays` son `null` (no 0) y la referencia es `data_unavailable`.
- **Cobertura descriptiva:** `historicalObservedDays / historicalSpanDays`. Es un dato, no un criterio: ninguna condición de emisión depende de él mientras O3 siga abierta. Es la medida de cuánto del intervalo tiene registro; **no dice** si un día sin registro fue inactividad o falta de observación (O1).
- **No confundir los dos denominadores.** La *cobertura* usa `historicalSpanDays` (todos los días del intervalo). La *tasa de referencia* bajo la base provisional (§13.5) divide el XP entre `historicalObservedDays` (días con registro). Son magnitudes distintas con propósitos distintos y no se sustituyen entre sí.

### 13.4 Estados epistémicos permitidos
Los motivos de §3 no cambian; cambia **qué mide** cada condición:

| Condición | Motivo | Cambio |
|---|---|---|
| días naturales contenidos ≥ `minDays` | `span_too_short` | la unidad pasa de «días transcurridos» a «días naturales contenidos». El valor `minDays = 3` **no se toca**; una ventana de 3 días que empieza a media jornada contiene 2 y pasa a `span_too_short` |
| XP de los días contenidos ≥ `minXp` | `insufficient_sample` | el XP es el de los días contenidos |
| referencia definida y > 0 | `data_unavailable` | «definida» = `historicalObservedDays ≥ 1` (§13.3) |
| ritmo ≥ `minRatio` × referencia | `effect_below_threshold` | ambos sobre la base de §13.5 |

`metrics` conserva el efecto observado aunque no se emita (§4). `metrics.intervalDays` pasa a ser el nº de días contenidos.

### 13.5 Ausencia de una fila en `xp_summaries` — **PENDIENTE de evidencia (no aprobada)**
**Hechos disponibles.** (a) La clave primaria es `(user_id, date)` y solo se guardan las filas que el payload trae; el payload de ejemplo del contrato de ingesta muestra un bloque de `xpSummaries` y **no dice** si los días sin actividad aparecen como filas con 0. (b) El contrato de analítica define `calendar_days = (max(date) − min(date)) / 86400 + 1` y `activity_density = active_days / calendar_days`: **presupone** que puede haber días sin actividad dentro del rango, y es **mudo** sobre si son filas con 0 o filas ausentes. (c) observation-model: ausencia de observación ≠ `null` ≠ 0. (d) Los fixtures con `gainedXp: 0` (`core.test.ts`, `languagesAnalyticsContract.test.ts`) son inventados y no prueban nada sobre la fuente.

**Lecturas posibles** (ninguna asumida):
- **L0:** una fila ausente es un día **no observado**.
- **L1:** una fila ausente es un día **sin actividad** (0 XP): la fuente solo emite días con actividad.
- **L2:** mixta: ausente dentro del bloque emitido por la fuente = 0; fuera del bloque = no observado.

**Evidencia que decidiría** (lectura de solo lectura, requiere autorización nueva): (1) en los payloads guardados, si hay días con `gainedXp = 0` y si las fechas de cada bloque `xpSummaries` forman una serie contigua de 90 días o solo los días con actividad; (2) si el rango `date` de las filas de un snapshot coincide con el de un bloque contiguo; (3) si existen huecos de `date` entre `min` y `max` en `xp_summaries` que no corresponden a un hueco de sincronización (los hay entre snapshots de cuenta, observation-model §7.2, D-b).

**Regla provisional mientras no se resuelva (aceptada por el propietario para avanzar, no definitiva):** la base de ritmo y referencia es **«día con registro»**: ambos lados se dividen entre el nº de días **contenidos con fila**. Esto cumple el principio de §13.2 bajo L0, L1 y L2 (misma base en los dos lados), y **no afirma nada sobre qué es un día ausente**. Lo que mide cambia de significado, y debe decirse: es «XP por día con registro», no «XP por día natural», y **no demuestra** que represente la actividad diaria real. En consecuencia, la redacción de A3 («Tu XP diario en el periodo fue Nx tu media histórica», §10.2) deja de ser exacta hasta que se resuelva. **Decisión del propietario (C5):** el copy se revisa durante la implementación para que describa exactamente la métrica calculada; no se fija aquí.

**Limitación que se acepta explícitamente:** bajo la regla provisional el ratio depende de si la fuente emite filas con 0 (test 4 y 5 de `tests/e1`): es dependencia de la **fuente**, no del reloj. Un cambio de comportamiento de la fuente cambiaría el ratio sin cambio de conducta del usuario. Solo L1 o una definición explícita de «día natural» la elimina.

**Cuando se resuelva** (nueva enmienda A5.1, no esta): si L1/L2, la base pasa a «día natural» y los días ausentes cuentan como 0 (dentro de lo que la evidencia permita); si L0, quedan como desconocidos y la referencia exige una cobertura mínima **cuyo valor se fija con la distribución real, no ahora** (decisión O3). **O1 permanece abierta:** no se atribuye semántica a una fila inexistente sin verificar el origen.

### 13.6 Excepción acotada a D3 (invariante de oro) — **aprobada (2026-10-13)**
Como en A4 (§12.5): lo que se preserva es que **emitir y descartar consumen la misma evaluación**, no que los hallazgos anteriores permanezcan idénticos tras corregir una semántica defectuosa.

- A5 puede **cambiar en ambos sentidos** la emisión de `LANG_XP_ACCELERATION`: ventanas que hoy emiten pueden pasar a `span_too_short` o `effect_below_threshold`; ventanas que hoy no emiten pueden emitir. No es una dirección única y no se estima.
- La excepción cubre solo `LANG_XP_ACCELERATION` y solo por esta causa. El golden de los demás hallazgos sigue byte a byte; `legacyWhatChanged` queda verbatim salvo para este id.
- No se midió cuántos hallazgos de esta regla se emitieron realmente con ventanas desalineadas. Esa cifra no se conoce.

### 13.7 Alternativas descartadas
- **Fraccionar el día parcial** con el tiempo transcurrido: no hay datos horarios; inventaría una observación.
- **Incluir el día parcial por instante de observación** (`updated_at` frente a `until`): puede ser razonable para `until = ahora`, pero introduce una segunda definición de ventana; descartada por el propietario (2026-10-13, O2 resuelta, §13.9).
- **Alinear las ventanas del cliente a medianoche UTC:** cambia el contrato de la API y oculta la recencia sin resolver la referencia.
- **Tratar toda fila ausente como 0 por defecto:** inventa una observación mientras L0 sea posible.
- **Fijar ya una cobertura mínima de la referencia:** no hay distribución real de días con registro que la respalde.

### 13.8 Consecuencias en consumidores (a tratar en la implementación)
- **Recencia (aceptada por el propietario, C6):** con `until = ahora`, el XP del día en curso no entra en la regla hasta que el día termina. Es un cambio visible en el flujo «desde tu última visita». No se sacrifica comparabilidad para obtener una respuesta más reciente.
- **`languages.xpGained` y la tarjeta «Actividad en la ventana»:** deben usar la misma definición que la evaluación; dos totales de XP en una respuesta serían una contradicción nueva. Se decide en la implementación.
- El frontend lee `intervalDays`, `historicalRate` y `criteria` de la evaluación; el texto de `span_too_short` pasa a hablar de «días completos».
- Puertos: `getLanguagesInterval` y `getHistoricalDailyXpRate` deben devolver también los campos de cobertura de §13.3.

### 13.9 Decisiones
| ID | Pregunta | Estado |
|---|---|---|
| **O1** | ¿Qué significa la ausencia de una fila en `xp_summaries` (L0, L1, L2)? | **Abierta.** Se resuelve con la lectura autorizada de §13.5 |
| **O2** | ¿Entra el día parcial de `until` (y el de `since`)? | **Resuelta (2026-10-13): no.** Un día parcial no entra; se declara en `partialDaysExcluded`. Reabrir exigiría una enmienda |
| **O3** | ¿Cobertura mínima de la referencia? | **Abierta, sin cifra.** Primero se calcula y se expone (§13.3); después, con la distribución real, se decide cuánto es suficiente |

### 13.10 Tests exigidos (en el PR de implementación, no en este)
1. Mismas filas, ventanas con extremos a distinta hora y el mismo conjunto de días contenidos: mismo ritmo y mismo estado (invierte el test 1 de `tests/e1`).
2. `until` a las 00:01: el día de `until` no entra; `since` a las 23:59: el día de `since` no entra; `partialDaysExcluded` los cuenta.
3. Partición: ningún día está a la vez en el intervalo y en la referencia (propiedad sobre una rejilla de ventanas).
4. Ventana de ≥ 3 días transcurridos con 2 días contenidos: `span_too_short`.
5. Sin ningún día con registro en la referencia: `data_unavailable`, nunca ratio con 0.
6. `gainedXp` ausente: no se escribe fila (ingesta real); `gainedXp = 0` observado: se escribe y cuenta como día con registro.
7. Bajo la regla provisional, ritmo y referencia comparten base: mismo `observedDays` usado en ambos (test de unidades).
8. El resto de evaluaciones y hallazgos no dependen de `xp_summaries` (igualdad con y sin XP), y el golden se mantiene salvo `LANG_XP_ACCELERATION`.
9. `containedDays`, `observedDays`, `historicalSpanStart`, `historicalSpanDays` e `historicalObservedDays` se exponen y son correctos; **ninguna** condición de emisión depende de su cociente (misma emisión con cobertura 10 % y 100 % para los mismos días con registro).
9b. El intervalo histórico es reproducible: añadir o quitar filas **interiores** no cambia `historicalSpanDays`; un día sin fila no sale del denominador de cobertura; la tasa de referencia usa `historicalObservedDays` y la cobertura usa `historicalSpanDays`.
10. `null` y `0` no son equivalentes: un día sin `gainedXp` no cuenta como día con registro; un `gainedXp = 0` observado sí.

---

## 14. Enmienda A6 (2026-10-13) — la ganancia de XP de un curso exige dos observaciones del mismo curso

**Estado:** ✅ **aprobada con condición explícita por el propietario (2026-10-13); implementada en el PR #49 (merge `ba27302`).** La fuente sigue siendo `raw_json` con el límite declarado de §14.2; P2 y P4 siguen abiertas.
- **Aprobado:** la distinción entre ganancia observada, dato desconocido, discontinuidad y curso nuevo (§14.2); mantener `LANG_FOCUS_SHIFT_LONGITUDINAL` en `SIN EVALUAR`; no introducir el filtro `is_auxiliary = 0` sin evidencia adicional (§14.3).
- **Condición:** (i) P3 queda decidido y precisado (§14.4): el hallazgo **no se emite cuando la evidencia comparable no permite determinar el desplazamiento sin sesgo**; no se sustituyen desconocidos por 0 ni se renormalizan cuotas en silencio, y un `new_course` **no** silencia la regla por el solo hecho de existir; (ii) un descenso del XP acumulado produce una **discontinuidad explícita**, nunca un resultado vacío indistinguible de la falta de actividad (§14.2).
- **Abierto:** P1 (antigüedad máxima), P2 (fuente) y P4 (emisiones pasadas). La fuente (`raw_json` o `course_observations`) no se mezcla con la corrección semántica.

`LANG_FOCUS_SHIFT_LONGITUDINAL` **permanece `SIN EVALUAR`**: esta enmienda define su **entrada** (la ganancia comparable por curso), no su regla, sus umbrales ni sus motivos (§3.1 sigue en pie) y no fija ninguna cifra. Complementa a observation-model §7 (D-c/D-e, condición de `start` de R4) y no la contradice.

### 14.1 Datos que la motivan
Reproducción sintética (`tests/e1/courseGainSemantics.test.ts`, 7 tests de caracterización; **sin datos reales**) sobre `getLanguagesTrajectoryData` y la regla de idiomas de `evaluateTrajectory`:

- El XP por curso de un snapshot es **vitalicio** (observation-model, `course_observations.xp`). El adaptador calcula `max(0, xp(mid) − xp(start))` con `xp = 0` si el curso falta en `start`, y `xp(start)` si falta en `mid`.
- Curso ausente en `start` y presente en `mid` con 4000 de XP vitalicio: «ganó 4000 en H1».
- Extremo a extremo: con solo +100 de XP real en un curso, la regla **emite** «foco desplazado de B a C» entre dos cursos que no ganaron nada, solo porque entraron en los snapshots en momentos distintos.
- Un descenso del XP acumulado (5000 → 4000) se recorta a 0 y es indistinguible de «sin actividad».
- Un curso ausente de `mid` se trata como «sin cambio» y su ganancia cae entera en H2.
- Un solo snapshot devuelve mitades vacías, con la misma forma que «observado, sin ganancia».
- Precedente en el propio contrato: observation-model §7 (D-c/D-e) ya midió que, sin condicionar el `start`, «el XP de H1 se multiplica por 120». Es el mismo mecanismo (XP vitalicio leído como ganancia), visto desde otra causa.

**Lo que no se ha podido establecer:** la forma de los snapshots auxiliares reales (observation-model §4 afirma que el catálogo `courses[]` es completo en cualquier snapshot; no se ha vuelto a verificar con datos); con qué frecuencia entran cursos nuevos en el catálogo; si algún hallazgo `LANG_FOCUS_SHIFT_LONGITUDINAL` ya mostrado fue un artefacto. Esa cifra no se conoce.

### 14.2 Regla de ganancia comparable
**Observación de curso.** La entrada de `courses[]` de un snapshot que (i) tiene `id`, (ii) cumple el predicado vigente de curso de idiomas (D4) y (iii) trae `xp` numérico. Una entrada sin `xp` numérico es una observación **sin XP**, no con 0.

**Observación vigente de un curso.** La observación de un curso `c` en un instante `t` es **la última observación de `c` con `observed_at ≤ t`**, y no «el XP del snapshot de `t`». Un snapshot que no trae `c` **no dice nada de `c`**.

**Estado de un curso `c` en una mitad `H = [a, b]`.** Sea `o_a` la última observación de `c` con `observed_at ≤ a` y `o_b` la última con `observed_at` en `(a, b]`. El estado es **uno** de cuatro, y es explícito:

| Estado | Condición | Valor |
|---|---|---|
| **`gain` (ganancia observada)** | existen `o_a` y `o_b`, y ninguna pareja consecutiva de observaciones leídas entre ellas desciende | `xp(o_b) − xp(o_a)` (puede ser 0 **observado**), con `observedFrom`/`observedTo` |
| **`new_course` (curso nuevo)** | no existe `o_a` pero sí `o_b`: la primera observación de `c` es posterior a `a` | sin ganancia; conserva `firstObservedAt`. Es un hecho observado («apareció»), nunca XP ganado |
| **`discontinuity` (discontinuidad)** | existen `o_a` y `o_b`, pero alguna pareja consecutiva entre ellas desciende | sin ganancia; conserva las dos observaciones del descenso (`fromAt`, `toAt`, `xpBefore`, `xpAfter`) |
| **`unknown` (desconocido)** | no existe `o_b`: el curso no fue observado en la mitad | sin ganancia; motivo `not_observed_in_period` |

- **El XP vitalicio no es ganancia, y un descenso no es ganancia negativa ni «sin actividad».** Es una discontinuidad de la serie (corrección, reinicio o reestructuración; la causa no está establecida). **No se recorta a 0 ni se omite el curso del resultado.** La observación se conserva. Una ganancia posterior medida desde una observación **posterior al descenso** es `gain`.
- **Un curso sin ninguna observación en la mitad** no aparece como 0: aparece como `unknown`. Si no hubo ninguna observación de `c` en toda la span, `c` no existe en el resultado (no se inventa).
- **Una mitad no se devuelve nunca vacía sin explicación.** Si ningún curso tiene observaciones (p. ej. un solo snapshot), el resultado es «no disponible», un estado distinto de «ningún curso ganó XP».
- **Límite declarado de la fuente actual (decisión del propietario, 2026-10-13, opción (a)):** la continuidad solo está verificada **entre las observaciones leídas** (el primer snapshot y los últimos de cada frontera; la implementación lee 3 por frontera), no entre todos los snapshots existentes. Una caída y recuperación intermedias no observadas pueden pasar inadvertidas y una ganancia `gain` es entonces la **diferencia neta observada**, no una prueba de continuidad. Esto es una limitación de la fuente, **no una garantía contractual**: ningún consumidor debe presentarla como «serie continua». No se convierte en `unknown` por snapshots no leídos (alternativa descartada, §14.7).
- La ganancia lleva `observedFrom`/`observedTo` (instantes de `o_a` y `o_b`), porque la distancia real entre ambas puede no coincidir con la mitad. **No se fija una antigüedad máxima admisible** (decisión P1).

#### 14.2.1 Invariantes
1. XP vitalicio ≠ XP ganado: una ganancia siempre es una diferencia de dos observaciones **del mismo curso**.
2. Desconocido ≠ 0: ningún curso `unknown`, `new_course` o `discontinuity` se convierte en 0, en «sin cambio» ni en el XP vitalicio, y ninguno **desaparece** del resultado.
3. Un curso sin observación en un extremo no puede ser resuelto con el valor del otro extremo (se elimina el respaldo `?? startXp`).
4. Un 0 solo existe como diferencia observada de dos valores iguales.
5. Evidencia insuficiente se distingue de «sin ganancia»: con un solo snapshot, o sin curso observable, la salida es «no disponible», no mitades vacías.
6. Una discontinuidad es un **elemento explícito del resultado**, distinguible por su estado de un curso sin ganancia y de un curso sin actividad.

### 14.3 Snapshots auxiliares — **decisión del propietario (C1, 2026-10-13): no introducir el filtro `is_auxiliary = 0` sin evidencia adicional**
- **Conflicto semántico que esta enmienda resuelve, y que cambia la propuesta de E1:** observation-model §4 establece que el catálogo `courses[]` es completo en cualquier snapshot, por lo que un snapshot auxiliar es una **observación válida del XP por curso** (`course_observations`: «válida»). El contrato de cuenta (§5) filtra `is_auxiliary = 0` para el **estado de cuenta** (`totalXp`, racha, curso activo), no para el XP por curso. Filtrar `is_auxiliary = 0` en el XP por curso descartaría observaciones válidas y dejaría la serie anclada a snapshots de cuenta, que tienen un hueco de 9 días (observation-model §7.2, D-b: 2026-09-26…2026-10-04).
- **Regla de A6:** la admisibilidad de un snapshot **no depende de `is_auxiliary`** sino de si **trae el curso** (§14.2). Con la regla «última observación del curso», un snapshot auxiliar que no lo traiga no puede ocultar ni alterar la ganancia de ese curso (es el caso del test «auxiliar como fin de span» de `tests/e1`: la ganancia de A se calcula entre las observaciones de A, no entre el último snapshot de cualquier tipo).
- **Los extremos de la span** (`startedAt`, mitad, `endedAt`) siguen la condición de D-c/D-e: el primer instante con una observación de curso de idiomas, no el primer snapshot cronológico. A6 no la modifica.
- **Qué NO se afirma:** que ningún auxiliar real traiga un catálogo parcial. La regla es correcta en ambos casos; si el catálogo es completo, sobran observaciones, si es parcial, no se atribuye nada a los cursos que faltan.
- **Qué reabriría el filtro:** evidencia con datos reales de que el XP por curso de un snapshot auxiliar difiere del de un snapshot de cuenta contemporáneo. Hasta entonces se mantiene la semántica contractual del catálogo completo.

### 14.4 Estados epistémicos, relación con `SIN EVALUAR` y decisión P3
- A6 **no** añade `Evaluation`, `criteria` ni motivos nuevos al enumerado de §3, y no promueve `LANG_FOCUS_SHIFT_LONGITUDINAL` a evaluable. Sigue sin contrato propio (§3.1) y sigue mostrándose como `SIN EVALUAR`. La regla seguirá sin evaluar hasta que tenga criterios propios aprobados, con sus tests.
- **P3, decidido y precisado (2026-10-13): la condición de bloqueo es la suficiencia de la evidencia comparable, no la presencia de un estado.** Qué cuenta como evidencia comparable lo fija §14.2; qué se hace con ella lo decide la regla en su contrato propio. A6 solo exige las siguientes invariantes de entrada:
  1. **Solo las ganancias `gain` son comparables.** El XP vitalicio de un `new_course` **no** se cuenta como ganancia ni entra en las cuotas comparables; un curso `unknown` o `discontinuity` no aporta un valor, ni 0 ni otro.
  2. **Cada curso no comparable tiene un rango de valores compatibles con la evidencia**, no un valor: `[0, U]`, donde `U` es la cota que la propia serie permite, o sin cota si no la hay. Para un `new_course`, `U` es su XP vitalicio en la primera observación (la ganancia dentro de la mitad no puede exceder lo que ya acumulaba cuando se vio). Para un curso `unknown` con una observación posterior a la mitad, `U` es la diferencia entre esa observación y `o_a`. Para una `discontinuity`, o un `unknown` sin observación posterior, no hay cota.
  3. **Determinable sin sesgo** significa que la conclusión de la regla (haya desplazamiento de foco o no) es **la misma para todo valor compatible** de los cursos no comparables. Si lo es, el curso no comparable **no silencia** la regla. Si no lo es, o si algún rango no tiene cota y su valor posible altera la conclusión, **no se emite**.
  4. **La exclusión es explícita, no silenciosa.** Cuando un curso no comparable queda fuera de las cuotas, el resultado lo declara (curso, estado y cota `U`), y las cuotas se presentan como «sobre los cursos comparables». No se renormalizan cuotas sobre los conocidos sin declararlo, y no se sustituye ningún desconocido por 0.
- **Lo que A6 no define:** la función que toma las ganancias y decide si hay desplazamiento (sus umbrales, cuotas, persistencia): pertenece al contrato propio de la regla (§3.1). Hasta que exista, la implementación aplica las invariantes 1–4 usando como función de decisión la que el código ya tiene, **sin aprobarla ni modificarla**, y el patrón sigue `SIN EVALUAR`. Cómo se comprueba la invariancia sobre los rangos (p. ej. en los extremos de cada `[0, U]`) es un detalle de implementación que debe justificarse con tests, no un criterio de este contrato.
- Los motivos `data_unavailable`/`insufficient_sample` solo serán vocabulario de este patrón cuando exista su contrato; hoy no se emiten evaluaciones.
- **Qué no se afirma:** que la cota `U` sea ajustada. Es una cota de seguridad derivada de que el XP vitalicio no es negativo y no decrece sin discontinuidad; puede ser holgada, y entonces la regla bloqueará más de lo estrictamente necesario (falso negativo aceptado).

### 14.5 Qué no cambia
`CHESS_COLOR_ASYMMETRY_LONGITUDINAL` y su evaluación; `CRITERIA` (los criterios de `LANG_FOCUS_SHIFT_LONGITUDINAL` siguen sin aprobarse y por eso no están allí); el estado de cuenta de What Changed (§5 del contrato de cuenta); el predicado de curso de idiomas (D4): A6 se aplica al conjunto de cursos que ese predicado define en cada momento. La divergencia documentada de R4 (criterio amplio frente a `subject === 'language'`, D-e) **no se toca aquí**.

### 14.6 Excepción acotada a D3 y consecuencias — **aprobada (2026-10-13)**
- Igual que A4 (§12.5) y A5 (§13.6): lo preservado es que emitir y descartar consumen la misma evaluación. A6 **hace desaparecer** hallazgos `LANG_FOCUS_SHIFT_LONGITUDINAL` que dependan de un curso sin observación en un extremo o de un descenso; **rompe a propósito** el golden byte a byte de Trayectoria (`tests/fixtures/legacyTrajectory.ts`) para ese id, y solo para él.
- Puede **perder un desplazamiento real** cuando un curso solo se observó a partir de `mid`, o cuando un curso no comparable impide determinar el desplazamiento sin sesgo (§14.4). Es un falso negativo aceptado frente al falso positivo demostrado.
- Fuente de las observaciones: el adaptador lee hoy tres snapshots de `raw_json`; una regla con «todas las parejas consecutivas» necesita leer más observaciones. `course_observations` existe, pero su cobertura histórica depende de que se haya ejecutado el backfill diseñado en `2026-10-08-observation-backfill-design.md` (**no verificado en este documento**): sin él, conmutar la fuente reduce la historia disponible a las observaciones escritas por la ingesta. **Esta es la decisión P2, que sigue abierta y no se mezcla con la corrección semántica**; A6 es independiente de la fuente. **Siguiente paso acordado (2026-10-13, sin conmutar):** estudiar `course_observations` como fuente de la serie completa y medir antes (1) cobertura histórica, (2) paridad semántica con `raw_json`, (3) coste real de consulta. La migración de fuente se decide aparte de esta corrección.

### 14.7 Alternativas descartadas
- **Filtrar `is_auxiliary = 0`:** descarta observaciones válidas y deja un hueco de 9 días (§14.3).
- **Recortar descensos a 0 (hoy):** convierte una discontinuidad en «sin actividad».
- **Contar el XP vitalicio del curso nuevo como ganancia (hoy):** produce el artefacto de §14.1.
- **Ganancia neta primero-último de toda la span:** no distingue mitades ni descensos intermedios.
- **Interpolar el XP en `mid`:** inventa una observación.
- **Imputar 0 al curso ausente:** es el defecto que se corrige.
- **Marcar `unknown` cuando haya snapshots intermedios sin leer (2026-10-13):** con la frecuencia actual de snapshots casi todo curso quedaría desconocido y la señal sería inutilizable; es conservadora pero demasiado costosa. La mejora de la serie pertenece a P2.

### 14.8 Decisiones
| ID | Pregunta | Estado |
|---|---|---|
| **P1** | ¿Antigüedad máxima de `o_a`/`o_b` para considerar comparable la ganancia? Sin número | **Abierta.** Se decide con la distribución real de intervalos entre observaciones por curso |
| **P2** | ¿Fuente de las observaciones: `raw_json` o `course_observations`? | **Abierta.** Decisión del propietario sobre el backfill (no autorizado aquí) y paridad de R4 (observation-model §7.3). No se mezcla con la corrección semántica |
| **P3** | ¿Qué hace `LANG_FOCUS_SHIFT_LONGITUDINAL` con ganancias no comparables? | **Resuelta y precisada (2026-10-13):** no emite si la evidencia comparable no permite determinar el desplazamiento sin sesgo; un `new_course` no silencia la regla por existir (§14.4) |
| **P4** | ¿Cuántas emisiones pasadas fueron artefactos? | **Abierta.** Requiere lectura autorizada |

### 14.9 Tests exigidos (en el PR de implementación, no en este)
1. Curso presente en start, mid y end: `gain` = diferencias de sus propias observaciones.
2. Curso ausente en `start`: `new_course` (con `firstObservedAt`), nunca su XP vitalicio como ganancia.
3. Curso ausente en `mid`: `unknown` en la mitad afectada; su ganancia no se desplaza a H2.
4. XP decreciente: `discontinuity` **explícita** (con las dos observaciones), distinguible de un resultado vacío y de «sin actividad»; nunca 0 ni recortado. Una ganancia posterior medida desde una observación posterior al descenso es `gain`.
5. Snapshot auxiliar con catálogo parcial como último snapshot: no altera la ganancia de los cursos que no trae; con catálogo completo, aporta observaciones válidas. **No se filtra por `is_auxiliary`.**
6. Un solo snapshot: «no disponible», distinto de «sin ganancia».
7. Curso nuevo frente a preexistente con el mismo XP vitalicio: el nuevo no aporta ganancia.
8. Regla de idiomas (P3, sobre la entrada; los números de los fixtures son los del código actual, no criterios del contrato):
   - `new_course` cuyo rango `[0, U]` no altera la conclusión: **no silencia** la regla; queda declarado como excluido, con su cota, y su XP vitalicio no entra en las cuotas.
   - `new_course` cuyo `U` puede alterar la conclusión: no se emite.
   - `unknown` sin observación posterior (sin cota) o `discontinuity` que puede alterar la conclusión: no se emite.
   - Ninguna cuota se renormaliza en silencio y ningún desconocido se sustituye por 0.
   - No hay `Evaluation` para el patrón (sigue `SIN EVALUAR`).
9. `CHESS_COLOR_ASYMMETRY_LONGITUDINAL` y su golden no cambian.
