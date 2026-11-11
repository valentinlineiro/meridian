# Calibración de la fase 3 — informe (2026-11-11, rev. tras la revisión de #163)

Entrega 1 de 3 de la metodología (`docs/superpowers/specs/2026-11-11-games-report-phase3-methodology.md`, §6). **No toca el servidor ni la interfaz.**
Datos: exportación de solo lectura (`GET /api/me/linkedin-games/export.csv`, sesión del propietario, 2026-11-11): 843 filas, 6 juegos, 2026-05-17 a 2026-11-11.
Se guardaron fuera del repositorio; aquí solo hay agregados. `calibratedThrough = 2026-11-11`, `R = 1000`, α = 0,05, entropía 20261112, artefacto versión 2.

## 1. Evaluabilidad (dos condiciones distintas para el día)

- **Día de la semana:** (a) al menos un día con ≥ 8 resultados (`MIN_CELL`), **y** (b) ≥ 10 derrotas en total (`MIN_LOSSES`). Es una condición de evaluabilidad, **no** una garantía de potencia. Si falla, el artefacto lo anota con su motivo (`sin_derrotas_suficientes` o `sin_dias_con_partidas_suficientes`) para que el informe diga «Sin derrotas suficientes para contrastar el día», **no** «ninguna desviación destacable».
- **Regularidad:** 112 días de histórico con ≥ 20 resultados en cada ventana de 56 días.
- Mínimo para calibrar un juego: 60 observaciones con media (`MIN_FIT`) y al menos una dimensión evaluable.

| Juego | Observaciones con media | Derrotas | Día | Regularidad | Estado |
|---|---|---|---|---|---|
| Queens, Zip, Patches | 178 | 31 / 28 / 23 | sí | sí | calibrado |
| Mini Sudoku | 178 | **3** | **no: sin derrotas suficientes** | sí | calibrado (solo regularidad) |
| Tango | 65 | 22 | sí | no (menos de 112 días) | calibrado (solo día) |
| Wend | 65 | **0** | **no: sin derrotas suficientes** | no | **sin dimensiones evaluables**: se **conserva en el artefacto** (sin réplicas) con su motivo; no es «sin calibración» |

## 2. Resultado de hoy

`p ajustado` según §3.3 (conjunto de 1001 elementos, empates contados). Hay hallazgo si `p ajustado ≤ 0,05`.

| Juego | p (día) | p (regularidad) | p ajustado | Hallazgo |
|---|---|---|---|---|
| Queens | 0,001 | 0,655 | **0,002** | día: **lunes**, más derrotas que su tasa global |
| Tango | 0,048 | — | **0,048** | día: lunes, más derrotas, **en el límite** |
| Zip | 0,389 | 0,170 | 0,274 | ninguno |
| Mini Sudoku | — (sin derrotas suficientes) | 0,137 | 0,137 | ninguno |
| Patches | 0,580 | 0,276 | 0,483 | ninguno |
| Wend | — | — | — | ninguna dimensión evaluable (0 derrotas; menos de 112 días) |

## 3. Estabilidad de la regla en el histórico

La regla se aplicó cada domingo con al menos 60 observaciones y alguna dimensión evaluable (500 réplicas por corte, semillas distintas). Un hallazgo es publicable si **el corte de exactamente 7 días antes** tenía el mismo (aspecto, signo y, para el día, el mismo día). Un hueco de una semana entre cortes impide publicar.

| Juego | Cortes | Con hallazgo bruto | Publicable | Cambios del hallazgo publicable |
|---|---|---|---|---|
| Queens | 17 | 15 | 12 | 3 |
| Zip | 17 | 0 | 0 | 0 |
| Patches | 16 | 0 | 0 | 0 |
| Mini Sudoku | 11 | 1 | 0 | 0 |
| Tango | 1 | 1 | 0 | 0 |

Queens es estable (lunes casi siempre). Tango solo tiene **un** corte: **no se puede publicar nada todavía**. Los cortes de un mismo juego no son independientes.

## 4. Correcciones de esta revisión (hallazgos de la revisión de #163)

1. **Error de selección del día (corregido).** Los días no evaluables (`NaN`) se sustituían por `-1` y luego `abs()`, con lo que recibían una desviación de 1 y podían ganar la selección: con un día por debajo de `MIN_CELL`, el hallazgo podía atribuirse a un día no evaluable. Reproducido (el sábado, con 3 resultados, era el elegido) y corregido; el autotest incluye ese caso y que un día con < 8 resultados nunca sea elegido. **No cambia el resultado actual**: la exportación tiene ≥ 9 resultados por día en todos los juegos.
2. **Estabilidad entre domingos consecutivos.** `publish()` exige que exista el corte de exactamente 7 días antes y que coincida; hay un test con un hueco de semana y con un cambio de día (lunes → viernes).
3. **Derrotas mínimas** (10) aplicadas como condición de evaluabilidad, con su motivo. En el servidor se exigen **en cada corte** (también el de hace una semana), no solo en la calibración.
4. **Wend se conserva en el artefacto** aunque ninguna dimensión sea evaluable (revisión de #164).

## 5. Decisiones ya fijadas para la entrega 2 (no implementadas aquí)

- **Derrotas insuficientes:** el día no se evalúa y el texto es «Sin derrotas suficientes para contrastar el día». Se mantiene aparte el mínimo de resultados por día.
- **Caducidad: 28 días** desde `calibratedThrough`. Pasado ese plazo se **ocultan** los hallazgos y el bloque, con el mensaje «Calibración caducada; pendiente de actualizar». No se dejan hallazgos antiguos con una simple advertencia.
- **«Próximo aspecto a observar»:** `1 − p ≥ 0,8`, tratado como pista exploratoria (no como hallazgo ni como probabilidad de que exista un efecto). La interfaz debe distinguir claramente «observar» de «destaca». Con estos datos lo cumpliría Zip (regularidad, p = 0,170).
- El mínimo de 10 derrotas es evaluabilidad, no potencia; la estabilidad temporal sigue siendo necesaria para publicar.

## 6. Qué no se ha hecho

- Coherencia con la etiqueta del veredicto (necesita el resumen del servidor: entrega 2).
- Error de tipo I con estos datos: con datos reales no se conoce la verdad de cada dimensión; se validó con simulaciones.
- Nada lee todavía el artefacto.

## 7. Reproducir

`calibrate.py --selftest` (sin datos personales) y, con la exportación del propietario, `calibrate.py EXPORT.csv SALIDA`. Es determinista; el resultado debe coincidir con los ficheros de esta carpeta.
