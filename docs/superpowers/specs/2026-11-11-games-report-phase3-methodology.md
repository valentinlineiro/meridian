# Informe individual de juego — Fase 3: metodología del diagnóstico (borrador para aprobar)

Fecha: 2026-11-11 · Revisión 2 (corrige la hipótesis nula de §3 tras la revisión del propietario) · Estado: **borrador, sin implementar. Necesita aprobación explícita antes de leer producción o escribir código.**
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
| **Tendencia** | pendiente a 112 días (el cambio de 28 frente a 56 días ya está en el veredicto y no compite) | `trend112` (ya calibrado) |

No se añade ninguna dimensión nueva (tiempo en segundos por sí solo, «días malos» por segundos, dificultad del día): las dos primeras no son comparables entre juegos por la resolución de 1 s, y la tercera ya está descontada en `adjusted`.

## 3. Cómo se decide «supera el ruido» (rev. 2, tras la revisión del 2026-11-11)

**Corrección.** El borrador anterior barajaba los días *dentro de cada día de la semana*. Eso conserva exactamente la distribución de cada día y, por tanto, el efecto que la dimensión «día de la semana» quiere medir: no sirve como hipótesis nula para ella. Tampoco es la mejor nula para las otras dos, porque rompe la dependencia dentro de la semana y subestima el ruido. Se sustituye por una nula **a medida de cada dimensión** y una forma explícita de combinarlas.

### 3.1 Dos generadores de «sin estructura»

| Generador | Qué destruye | Qué conserva | Se usa para |
|---|---|---|---|
| **A. Permutar los días de la semana dentro de cada semana natural** (se reparten los resultados de esa semana entre los días que sí se registraron esa semana) | el efecto de un día concreto | el nivel de cada semana y su orden en el tiempo | **Día de la semana** |
| **B. Permutar las semanas completas** (bloques de lunes a domingo, sin tocar el interior de cada bloque) | el orden temporal: tendencia y cambios de amplitud | el efecto semanal y la dependencia dentro de la semana | **Regularidad** y **Tendencia** |

Semanas incompletas (inicio, fin, días sin registro): en A se reparten solo entre los días presentes; en B se permutan como bloques de su longitud y solo con semanas del mismo tamaño. Si el juego tiene menos de 10 semanas no vacías (`MIN_WEEKS`), no se evalúa la dimensión.

### 3.2 Una puntuación comparable: el percentil de la propia nula

Cada dimensión produce un estadístico bruto y se convierte en `u`, su posición bilateral en la distribución nula **de esa dimensión** (0 = normal, 1 = extremo). Así no hace falta una escala común ni comparar peras con manzanas, y «la mayor desviación» significa la de mayor `u`.

- **Día de la semana:** estadístico = máximo, sobre los 7 días con al menos `MIN_CELL` (8) partidas, de |tasa de derrotas del día − tasa global|. El máximo *dentro* de la dimensión ya corrige las 7 comparaciones. Se guarda **qué día** y **el signo**.
- **Regularidad:** log(P75/P25) de los últimos 56 días menos el de los 56 anteriores. Signo: más amplio / más estrecho.
- **Tendencia:** pendiente a 112 días (la de `trend112`). Signo: sube / baja.

### 3.3 Un único umbral familiar P95

El hallazgo de un juego es la dimensión de mayor `u`; se publica solo si el **conjunto** tiene un falso positivo ≤ 5 %. Se construye así, por juego:

1. Se generan `B = 2000` réplicas con A y `B = 2000` con B (semillas propias, §4). De cada una de B salen a la vez `u_regularidad` y `u_tendencia` (comparten generador, así se conserva su dependencia).
2. Se empareja cada réplica de B con **una réplica distinta de A** y se calcula `U = max(u_día, u_regularidad, u_tendencia)`.
3. **Umbral del juego** = percentil 95 de `U`. Un hallazgo existe si `u` de su dimensión lo supera.

**Supuesto declarado:** emparejar réplicas de A y B equivale a suponer que «día de la semana» es independiente de «orden temporal» bajo la nula. Si hubiese dependencia positiva, el umbral resulta algo conservador (menos hallazgos), nunca más permisivo. La validación de §4 lo comprueba con la nula conjunta.

### 3.4 Estabilidad con identidad concreta

Un hallazgo se publica solo si **el mismo aspecto y el mismo signo** estaban también una semana antes, y para el día de la semana, **el mismo día concreto** (un cambio de «martes» a «viernes» no es estable, aunque ambos sean «día de la semana» y ambos desfavorables). En caso contrario queda como «próximo aspecto a observar», estimado. Ese aspecto es la dimensión de mayor `u` que no supera el umbral; el corte mínimo de `u` para mencionarlo (p. ej. 0,8) se fija tras ver la validación de §4, no antes.

### 3.5 Artefacto

`diagnosis-thresholds.json` con el umbral por juego, `calibratedThrough`, número de réplicas, semillas y versión del script. Lo genera un script offline (`docs/audits/…`) y se copia tal cual: nunca se edita a mano ni se recalcula en el servidor.

## 4. Qué se valida antes de aceptarlo

- **Falsos positivos con permutaciones independientes de las de calibración.** La calibración usa un flujo de semillas; la validación genera **réplicas nuevas con otro flujo de semillas** (mismo `B`) y mide la proporción con algún hallazgo bajo la nula **conjunta** (A y B aplicadas a la vez, que es la hipótesis «no hay estructura» completa). Debe ser ≤ 5 %. Si no, se sube el umbral y se repite con semillas nuevas.
- **Potencia con efecto sembrado.** Se inyecta en los datos reales un efecto conocido (p. ej. +X puntos de derrotas un día concreto; una tendencia de Y % cada 4 semanas) y se mide cuántas veces se detecta y se identifica el día correcto. Sirve para decir con honestidad qué tamaño de efecto es detectable con 177 y con 64 días.
- **Estabilidad temporal:** aplicar las reglas cada domingo del histórico y medir cuántas veces cambia el hallazgo publicado de una semana a otra. El objetivo se fija tras ver el resultado; si cambia casi cada semana, **no se publica**.
- **Coherencia con el veredicto:** el bloque no contradice la etiqueta calibrada existente; si hay conflicto, manda la etiqueta.
- **Datos escasos:** con menos de 60 observaciones con media (`MIN_FIT`) el bloque no aparece. Tango y Wend (64 días) pueden quedar sin dimensión evaluable: es un resultado válido y se dice.

## 5. Qué se necesita de producción (lectura, aparte)

Un permiso **solo de lectura y puntual**, que se pide cuando este documento esté aprobado:

- Los resultados diarios de los 6 juegos (≈ 600 filas: fecha, segundos propios y media publicada), por la misma ruta de solo lectura de la sesión (`/api/me/linkedin-games/summary` y su detalle), guardados **fuera del repositorio**.
- Sin escrituras, sin tocar D1 directamente, sin migraciones. Los números salen en un informe offline en `docs/audits/`, con el script que los produce.

## 6. Entrega por PRs (cada una con su «go»)

1. Script offline de calibración + informe + `diagnosis-thresholds.json` (sin tocar el servidor).
2. Dominio: reglas puras con tests primero, que leen el artefacto, y el campo nuevo `diagnosis` en `GameSummary` (aditivo).
3. Interfaz: el bloque «Qué destaca» con sus textos, `n` y estado (estimado / detectable).

## 7. Qué hay que decidir (mi recomendación entre paréntesis)

Estado tras la revisión: aprobadas en principio las tres dimensiones, la estabilidad de una semana, la ausencia de hipótesis y el «ninguna desviación destacable». Queda por aprobar:

1. ¿Los dos generadores de §3.1 (días dentro de la semana para el día; semanas completas para regularidad y tendencia)? (sí)
2. ¿La puntuación `u` por percentil de la propia nula y el umbral P95 de `U = max(u_día, u_reg, u_tend)` con el supuesto de independencia declarado en §3.3? (sí)
3. ¿La identidad concreta (día y signo) en la regla de estabilidad de §3.4? (sí)
4. ¿La validación de §4 con semillas independientes y nula conjunta, más la prueba de potencia con efecto sembrado? (sí)

## 8. Riesgos conocidos

- **Potencia baja:** con 177 días y tres dimensiones, lo normal es que casi nada supere el umbral. Eso es correcto, pero puede decepcionar: conviene decirlo con antelación.
- **Dependencia entre semanas:** permutar semanas completas supone que, sin tendencia, las semanas son intercambiables; una estacionalidad más larga (p. ej. mensual) no está contemplada y podría inflar «tendencia».
- **Días sin registro:** el registro es manual; los huecos se tratan como ausencia, no como cero, pero un hábito de registrar solo ciertos días puede parecer un efecto de día de la semana.
- **Umbrales caducan:** igual que `noise-bands.json`, hay que recalibrar cuando cambie la población o pase tiempo (fecha en `calibratedThrough`).
