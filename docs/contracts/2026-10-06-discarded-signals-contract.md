# Contrato: señales descartadas (evaluaciones de hallazgo)

**Fecha:** 2026-10-06
**Estado:** 🔒 **CONGELADO (2026-10-06), sin implementar.** D1–D4, D6 y D7 aprobadas; D5 y D8 fuera de este contrato (§7). `LANG_FOCUS_SHIFT_LONGITUDINAL` pendiente de un contrato propio. Cualquier cambio posterior entra por enmienda explícita. **Enmienda A3 (2026-10-08, aprobada y desplegada, §10): criterios en la evaluación y redacción de `LANG_XP_ACCELERATION`.** **Enmienda A4 (2026-10-09, dirección aprobada, SIN implementar, §12): el ELO de un snapshot solo se atribuye a la partida ancla de su lote; excepción acotada a la igualdad de `findings` de D3.** **Enmienda A2 (2026-10-08, aprobada y desplegada, §9): `CHESS_RATING_JUMP` — sin ELO observado en la ventana no es "Δ = 0".** **Enmienda 2026-10-06:** el invariante de trazabilidad de §4 pasa de igualdad a inclusión (*Inconcluso* ⊇ eliminados por IC); la definición operativa y §8 no cambian.
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
| | \|Δ ELO\| ≥ 25 | `effect_below_threshold` |
| `LANG_XP_ACCELERATION` | intervalo ≥ 3 días | `span_too_short` |
| | XP ganado ≥ 200 | `insufficient_sample` |
| | tasa histórica > 0 | `data_unavailable` |
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
- **Invariante de oro (D3)** *(con la excepción acotada de A4, §12.5)*: para los mismos inputs, `findings` es idéntico antes y después (mismo contenido, mismo orden); evaluar todas las condiciones solo amplía `evaluations`.
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

**Estado:** 📝 **dirección aprobada por el propietario (2026-10-09); sin implementar.** Este PR es solo documental. El código, la UI y los tests de §12.7 entran en un PR posterior que el propietario revisará antes. Completa a A2 (§9); no cambia el umbral (`|Δ| ≥ 25`), el enumerado de motivos, `kind`, `salience()` ni la forma de `evaluations`.

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
| Serie de ELO de What Changed | `COALESCE(elo_after, page_elo)` de cualquier partida | `elo_after` o `page_elo` **solo de anclas** (una por snapshot de primera vista) |
| `baselineRating` | último ELO de partida ≤ `since` | ELO del último ancla ≤ `since`; `null` si no existe |
| `currentRating` | último ELO de partida en (`since`, `until`] | ELO del último ancla en (`since`, `until`]; `null` si no existe |
| `ratingDelta` | `current − baseline` | `current − baseline` si existen ambos **y proceden de snapshots distintos**; `null` en otro caso |
| `CHESS_RATING_JUMP` sin comparación válida | `[effect_below_threshold]` con Δ = 0 | `[data_unavailable]` (INSUFICIENTE) |

Se añade a la tabla de §3.1, fila de `CHESS_RATING_JUMP`: *«dos ELO observados en snapshots distintos (anclas) alrededor de la ventana» → `data_unavailable`*. Un Δ que no puede evaluarse con fiabilidad es `null`, nunca 0.

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
- **Compatibilidad histórica:** no se exige igualdad de hallazgos antes y después de A4. Se exige que cada cambio de resultado esté **explicado y probado** (§12.7, prueba 5). Los hallazgos de ELO ya mostrados no se corrigen retroactivamente en ningún almacén (no se persisten).
- Qué no se puede decir de las consecuencias históricas: no se midió cuántos hallazgos `CHESS_RATING_JUMP` se emitieron realmente con ELO no ancla. Esa cifra no se conoce.

### 12.6 Consecuencias en consumidores
- La UI ya mapea `data_unavailable` a INSUFICIENTE; cambia el texto del motivo de ELO a «no hay dos observaciones de ELO en snapshots distintos alrededor de la ventana». La card de Deltas muestra «—» en lugar de 0.
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
