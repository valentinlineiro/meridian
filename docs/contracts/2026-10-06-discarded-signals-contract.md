# Contrato: señales descartadas (evaluaciones de hallazgo)

**Fecha:** 2026-10-06
**Estado:** 🔒 **CONGELADO (2026-10-06), sin implementar.** D1–D4, D6 y D7 aprobadas; D5 y D8 fuera de este contrato (§7). `LANG_FOCUS_SHIFT_LONGITUDINAL` pendiente de un contrato propio. Cualquier cambio posterior entra por enmienda explícita.
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

**Invariante de trazabilidad:** el conjunto *Inconcluso* de What-changed son exactamente los hallazgos que el comportamiento anterior a P1.5b habría emitido y la regla A(b) elimina. Es comprobable por test.

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
- Conjunto *Inconcluso* = hallazgos eliminados por A(b): 5 vs 5 con +40 pp → inconcluso con `interval_includes_zero`; 9 decididas con +30 pp → `insufficient_sample` e inconcluso solo si el resto de condiciones pasan.
- `data_unavailable` nunca se confunde con `effect_below_threshold`.
- Ninguna evaluación de tipo `event`.
- **Invariante de oro (D3):** para los mismos inputs, `findings` es idéntico antes y después (mismo contenido, mismo orden); evaluar todas las condiciones solo amplía `evaluations`.
- Los motivos no dependen del orden en que se evalúan las condiciones.
