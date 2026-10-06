# Contrato: señales descartadas (evaluaciones de hallazgo)

**Fecha:** 2026-10-06
**Estado:** 📝 **DRAFT, sin implementar.** Las decisiones D1–D8 (§7) están abiertas; hasta aprobarlas una a una no hay congelación ni código.
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

- `emitted` ⇔ el hallazgo existe hoy con el mismo contenido. **El conjunto de hallazgos emitidos no cambia** respecto al comportamiento vigente; esto es una vista añadida, no una regla nueva.
- Un hallazgo emitido se identifica igual que ahora; las `not_emitted` no se presentan como hallazgos.

## 2. Tipos de regla (qué admite descarte informativo)

| `kind` | Reglas actuales | Descartes |
|---|---|---|
| `statistical` | `CHESS_COLOR_ASYMMETRY`, `CHESS_COLOR_ASYMMETRY_LONGITUDINAL` | **Sí**: comparan proporciones con n, umbral e IC |
| `threshold` | `CHESS_RATING_JUMP`, `LANG_XP_ACCELERATION`, `LANG_FOCUS_SHIFT_LONGITUDINAL` | **Sí, sin incertidumbre**: cumplen o no un umbral determinista; no hay IC y no se inventa |
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
3. `effect_below_threshold` **no** afirma ausencia de efecto: el IC puede contener el umbral. Meridian no ofrece un resultado "no hay efecto" (eso exigiría equivalencia estadística; fuera de alcance).

## 4. Niveles de saliencia (para el consumidor, no para el cálculo)

Se derivan de la evaluación, sin lógica adicional:

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

## 7. Decisiones abiertas

| ID | Pregunta | Propuesta |
|---|---|---|
| **D1** | ¿Dos estados (`emitted`/`not_emitted`) o tres (con "inconcluso" como estado propio)? | **Dos**; "inconcluso" se deriva (§4), así no hay un tercer estado que mantener en sincronía con los motivos. |
| **D2** | ¿El enumerado de §3 es completo y correcto? | Revisar uno a uno; en particular si `span_too_short` y `data_unavailable` son motivos distintos. |
| **D3** | ¿Todos los fallos o solo el primero? | **Todos** (regla 1 de §3). |
| **D4** | ¿Qué `kind` generan evaluación? | `statistical` y `threshold`; `event` no (§2). |
| **D5** | Formato y estabilidad de un `evidenceId` por evaluación | Abierta. Candidato: id de la regla + intervalo de evaluación, determinista. Decidir en el contrato de salida LLM, no aquí. |
| **D6** | ¿Campo aditivo `evaluations` o sustituir `findings`? | **Aditivo** (§5). |
| **D7** | ¿Incluye Trayectoria o solo What-changed? | Ambos, en PRs separados: What-changed primero. |
| **D8** | ¿Qué muestra por defecto el consumidor? | Hallazgos e inconclusos; "sin indicio" oculto. Es de presentación, no del contrato de datos. |

## 8. Tests exigidos (cuando se congele)

- Cada motivo puede aparecer **solo** (una condición falla, las demás pasan) y combinado.
- `emitted` ⇔ el hallazgo existe hoy: la lista de hallazgos es idéntica antes y después.
- Conjunto *Inconcluso* = hallazgos eliminados por A(b): 5 vs 5 con +40 pp → inconcluso con `interval_includes_zero`; 9 decididas con +30 pp → `insufficient_sample` e inconcluso solo si el resto de condiciones pasan.
- `data_unavailable` nunca se confunde con `effect_below_threshold`.
- Ninguna evaluación de tipo `event`.
