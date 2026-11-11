# Informe individual de juego — Fase 3: metodología del diagnóstico (borrador para aprobar)

Fecha: 2026-11-11 · Estado: **borrador, sin implementar. Necesita aprobación explícita antes de leer producción o escribir código.**
Contexto: la fase 1 (informe) y la fase 2 (agregaciones y su pantalla) están en producción. Ver
`2026-11-10-games-individual-report-design.md` §5 (fase 3) y §7.

## 1. Qué se promete y qué no

Se añade al informe un bloque **«Qué destaca»** con, como mucho, tres frases, cada una con su `n` y su estado:

- **Fortaleza**: la mayor desviación *favorable* que supera el ruido.
- **Debilidad**: la mayor desviación *desfavorable* que supera el ruido.
- **Próximo aspecto a observar**: el aspecto cuya estimación reciente se ha movido más frente a su propia base, pero **sin** superar aún el ruido (se dice «estimado», nunca «detectado»).

**No se promete** que siempre haya una fortaleza, una debilidad o algo que observar. Si ningún aspecto supera el ruido, el bloque dice «ninguna desviación destacable con estos datos (n = …)». Con pocos datos, dice qué falta, como el veredicto actual.

**No se promete** explicar *por qué*: solo se guarda el tiempo total de cada partida (§4 de la spec, «límite de lo medible»). Las hipótesis (una frase tipo «puede deberse a…») quedan **fuera de la primera entrega** de la fase 3; si se añaden, van en una PR aparte y marcadas como hipótesis.

## 2. Aspectos que compiten (solo los que los datos ya sostienen)

Tres dimensiones, todas ya calculadas por el servidor o derivables de campos existentes:

| Aspecto | Medida de desviación | Dato base |
|---|---|---|
| **Día de la semana** | tasa de derrotas del día menos la tasa global, con el intervalo que ya envía el servidor | `losses.cells` (mínimo 8 partidas por casilla, `MIN_CELL`) |
| **Regularidad** | amplitud de la velocidad (P75/P25) de los últimos 56 días frente a los 56 anteriores | `weekly` y `series` (fase 2) |
| **Tendencia** | cambio de los últimos 28 días frente a los 56 anteriores, y la pendiente a 112 días | `recent28vBase56`, `trend112` (ya calibrados) |

No se añade ninguna dimensión nueva (tiempo en segundos por sí solo, «días malos» por segundos, dificultad del día): las dos primeras no son comparables entre juegos por la resolución de 1 s, y la tercera ya está descontada en `adjusted`.

## 3. Cómo se decide «supera el ruido»

Al elegir *la mayor* de varias desviaciones, un umbral por aspecto subestima el azar (comparaciones múltiples). Por eso:

1. **Estadístico común.** Cada desviación se convierte en una puntuación estandarizada `s` (desviación dividida entre su error típico bootstrap, el mismo procedimiento por bloques de 4 semanas que ya usa `AdjustedForm`).
2. **Umbral por juego, calibrado offline con datos reales**, como `noise-bands.json`: se simula la hipótesis «sin estructura» barajando los días **dentro de cada día de la semana** (se conserva el efecto semanal ya conocido) y se toma el **percentil 95 del máximo de `|s|` entre las tres dimensiones**. Un solo umbral por juego controla el riesgo de falso hallazgo del *conjunto*, no de cada aspecto.
3. **Artefacto versionado** `diagnosis-thresholds.json` con `calibratedThrough`, generado por un script offline (`docs/audits/…`) y copiado tal cual, nunca editado a mano ni recalculado en el servidor.
4. **Estabilidad.** Como en `GameInterpretation`, un hallazgo solo se publica si el **mismo aspecto y el mismo signo** estaban también una semana antes; si no, se queda como «próximo aspecto a observar» (estimado).

## 4. Qué se valida antes de aceptarlo

- **Falsos positivos:** sobre datos barajados, la proporción de juegos con algún hallazgo publicado debe ser ≤ 5 %. Si no, el umbral se sube y se repite.
- **Estabilidad temporal:** aplicar las reglas en cada domingo del histórico y medir cuántas veces cambia el hallazgo publicado de una semana a la siguiente. Objetivo a fijar tras ver el resultado; si el diagnóstico cambia casi cada semana, **no se publica**.
- **Coherencia con el veredicto:** el bloque no puede contradecir la etiqueta calibrada existente (p. ej. «Mejora sostenida» con una «debilidad» de tendencia). Si hay conflicto, manda la etiqueta.
- **Datos escasos:** con menos de 60 observaciones con media (`MIN_FIT`) el bloque no aparece. Tango y Wend (64 días) quedarán probablemente en «datos insuficientes» o con un solo aspecto evaluable: es un resultado válido.

## 5. Qué se necesita de producción (lectura, aparte)

Un permiso **solo de lectura y puntual**, que se pide cuando este documento esté aprobado:

- Los resultados diarios de los 6 juegos (≈ 600 filas: fecha, segundos propios y media publicada), por la misma ruta de solo lectura de la sesión (`/api/me/linkedin-games/summary` y su detalle), guardados **fuera del repositorio**.
- Sin escrituras, sin tocar D1 directamente, sin migraciones. Los números salen en un informe offline en `docs/audits/`, con el script que los produce.

## 6. Entrega por PRs (cada una con su «go»)

1. Script offline de calibración + informe + `diagnosis-thresholds.json` (sin tocar el servidor).
2. Dominio: reglas puras con tests primero, que leen el artefacto, y el campo nuevo `diagnosis` en `GameSummary` (aditivo).
3. Interfaz: el bloque «Qué destaca» con sus textos, `n` y estado (estimado / detectable).

## 7. Qué hay que decidir (mi recomendación entre paréntesis)

1. ¿Las tres dimensiones de §2 o se quita alguna? (las tres)
2. ¿Máximo de las tres con percentil 95 y barajado dentro de día de la semana? (sí; alternativa más simple pero más laxa: un umbral por aspecto)
3. ¿Regla de estabilidad de una semana antes, como el veredicto? (sí)
4. ¿Sin hipótesis en la primera entrega? (sí)
5. ¿Está bien que el bloque diga «ninguna desviación destacable» y no fuerce un hallazgo? (sí)

## 8. Riesgos conocidos

- **Potencia baja:** con 177 días y tres dimensiones, lo normal es que casi nada supere el umbral. Eso es correcto, pero puede decepcionar: conviene decirlo con antelación.
- **Dependencia semanal:** el barajado por día de la semana asume independencia entre semanas; los bloques de 4 semanas del bootstrap mitigan, no eliminan, la autocorrelación.
- **Umbrales caducan:** igual que `noise-bands.json`, hay que recalibrar cuando cambie la población o pase tiempo (fecha en `calibratedThrough`).
