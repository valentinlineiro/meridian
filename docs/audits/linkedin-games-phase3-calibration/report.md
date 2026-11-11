# Calibración de la fase 3 — informe (2026-11-11)

Entrega 1 de 3 de la metodología (`docs/superpowers/specs/2026-11-11-games-report-phase3-methodology.md`, §6). **No toca el servidor ni la interfaz.**
Datos: exportación de solo lectura (`GET /api/me/linkedin-games/export.csv`, sesión del propietario, 2026-11-11): 843 filas, 6 juegos, 2026-05-17 a 2026-11-11.
Los datos se guardaron fuera del repositorio; aquí solo hay agregados. `calibratedThrough = 2026-11-11`, `R = 1000`, α = 0,05, entropía 20261112.

## 1. Qué juegos se pueden evaluar

| Juego | Observaciones con media | Semanas | Día de la semana | Regularidad |
|---|---|---|---|---|
| Mini Sudoku, Patches, Queens, Zip | 178 | 27 | sí | sí |
| Tango, Wend | 65 | 10 | sí (9-10 partidas por día) | **no** (necesita 112 días) |

Mínimo para calibrar: 60 observaciones con media (`MIN_FIT`) y al menos una dimensión evaluable. Los seis lo cumplen.

## 2. Resultado de hoy

`p ajustado` según §3.3 (conjunto de 1001 elementos, empates contados). Hay hallazgo si `p ajustado ≤ 0,05`.

| Juego | p (día) | p (regularidad) | p ajustado | Hallazgo |
|---|---|---|---|---|
| Queens | 0,001 | 0,655 | **0,002** | día: **lunes**, más derrotas que su tasa global (14 de 26) |
| Tango | 0,048 | no evaluable | **0,048** | día: lunes, más derrotas (7 de 10), **en el límite** |
| Zip | 0,389 | 0,170 | 0,274 | ninguno |
| Mini Sudoku | 0,980 | 0,137 | 0,151 | ninguno |
| Patches | 0,580 | 0,276 | 0,483 | ninguno |
| Wend | 1,000 | no evaluable | 1,000 | ninguno |

## 3. Estabilidad de la regla en el histórico

Se aplicó la regla cada domingo con al menos 60 observaciones (con 500 réplicas por corte, semillas distintas) y se contó el hallazgo «publicable»
(el mismo aspecto, signo y día una semana antes, §3.4).

| Juego | Cortes | Con hallazgo bruto | Publicable | Cambios del hallazgo publicable |
|---|---|---|---|---|
| Queens | 17 | 15 | 12 | 3 |
| Zip, Mini Sudoku, Patches | 17 | 0 | 0 | 0 |
| Tango, Wend | 1 | 1 / 0 | 0 | 0 |

Queens es estable (lunes casi siempre). Tango solo tiene **un** corte con datos suficientes: **no se puede publicar nada todavía** (la regla exige el mismo hallazgo una semana antes). Los cortes de un mismo juego no son independientes.

## 4. Lo que los datos reales enseñan y la metodología no decía

1. **Wend no tiene ninguna derrota** (0 de 65) y **Mini Sudoku tiene 3 de 178**. En ellos la dimensión «día» (tasa de derrotas) es informativamente vacía: nunca podrá detectar nada. Hoy sale «ninguna desviación destacable», que sería **engañoso**: debería decir «sin derrotas suficientes para contrastar el día». Propuesta para la entrega 2 (a aprobar): exigir un mínimo de derrotas totales (p. ej. ≥ 10) para evaluar el día y, si no, decirlo.
2. **Tango está en el borde** (p = 0,048) con 65 observaciones: un hallazgo así, con una sola semana de histórico, no es fiable aunque pase el umbral. La regla de estabilidad lo contiene; conviene no relajarla.
3. **La nula depende de los datos**: las réplicas se generan permutando los datos reales (conservan sus resultados y su máscara), así que el artefacto es válido para esta exportación y se degrada al llegar datos nuevos. Hay que fijar en la entrega 2 una caducidad (p. ej. recalibrar cada 4 semanas o al cambiar el número de semanas) y qué muestra el informe cuando está caducado. Es la misma limitación que `noise-bands.json` (`calibratedThrough`), más acusada aquí.
4. **«Próximo aspecto a observar»**: el corte mínimo de `u` no se ha fijado. Con estos datos, `1 − p` por encima de 0,8 lo cumplirían Mini Sudoku (regularidad, p = 0,137) y Zip (regularidad, p = 0,170), ambos sin hallazgo. Es una decisión de presentación, no estadística: **se propone, no se fija**.

## 5. Qué no se ha hecho

- No se ha comprobado la coherencia con la etiqueta del veredicto (necesita el resumen del servidor; es parte de la entrega 2).
- La potencia y el error de tipo I se validaron con datos sintéticos (simulaciones), **no** con estos datos: con datos reales no se conoce la verdad de cada dimensión.
- El artefacto no se ha integrado en ninguna parte: nada lo lee todavía.

## 6. Reproducir

`calibrate.py --selftest` (sin datos personales) y, con la exportación del propietario, `calibrate.py EXPORT.csv SALIDA`. Es determinista; el resultado debe coincidir con los ficheros de esta carpeta.
