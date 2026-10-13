# Enmienda A7 (borrador): serie compacta de eventos de XP por curso

**Fecha:** 2026-10-13
**Estado:** 📝 **BORRADOR. Autorización del propietario (2026-10-13): continuar con la implementación en una rama y pruebas aisladas.** A7 no está aún en vigor en producción ni autoriza migraciones, backfill, escrituras remotas o cambio de lectores. La validación D1 de §4.5.12 respalda los primitivos y el protocolo de referencia; el runtime está implementado en el borrador de PR #53 y las rutas de ingesta ordenada, tardío, cola posterior al watermark y concurrencia se han probado en D1; los casos P9 de conflicto B1 y corrupción aún deben cubrirse contra el runtime antes de cualquier despliegue. El contrato vigente en producción sigue siendo el [modelo de observaciones](2026-10-05-observation-model-contract.md) (congelado el 2026-10-06, con A1) y las enmiendas A5/A6 del [contrato de señales descartadas](2026-10-06-discarded-signals-contract.md) (§13, §14).
**Qué enmienda:** extiende el modelo de observaciones con **una serie derivada nueva (K10)**; no modifica el texto congelado de §2b, §3, §4, §7 ni §10 de ese contrato. Resuelve, como propuesta, la parte de la decisión **P2** de A6 (§14.6) que trata de *cómo conservar evidencia suficiente para detectar discontinuidades sin releer toda la historia*. Documenta además **A5.1** (§7 de este documento), que no cambia el comportamiento de A5.
**Origen:** experimento de solo lectura sobre el histórico real (2026-10-13) y prototipo local. Las cifras de §1 son mediciones; todo lo demás es propuesta y está marcado.

> **Convención de este documento.** Cada afirmación es una de tres cosas y se marca como tal: **[MEDIDO]** (lo producen los datos reales o el prototipo, con el procedimiento de §1), **[PROPUESTO]** (decisión de contrato aún no tomada) o **[NO DEMOSTRADO]** (límite conocido del prototipo o de los datos). Una estimación nunca se presenta como medición.

---

## 0. Resumen y principio

El experimento mostró que la selección actual de snapshots de Trayectoria (primero + últimos 3 por frontera) no ve un descenso real de `DUOLINGO_RU_ES` (−14 XP), y que **leer toda la serie por petición no escala** (unas 680 filas de `course_observations` por día **[MEDIDO]**, del orden de 250 000 al año **[ESTIMADO]**). Solo el 0,29 % de los pares consecutivos observados cambia el XP **[MEDIDO]**.

**Propuesta:** conservar, por curso, **un evento por cambio de estado observado** (valor distinto, curso ausente, valor inválido), con el valor anterior. La serie es **derivada y reconstruible** desde `raw_json`: nunca es la única copia de la evidencia (§8.0 del contrato congelado sigue vigente).

**Principio rector (lo que esta enmienda no hace):** *la ausencia de eventos no es prueba de observación continua ni de ausencia de discontinuidades.* Un evento demuestra que **hubo un cambio entre dos observaciones**; que el curso se observó entre ambas lo demuestra solo la línea temporal de snapshots (§3).

---

## 1. Hechos medidos (2026-10-13, producción en solo lectura, análisis local)

Procedimiento: `SELECT` remotos de `snapshots` (850 payloads de idiomas), `xp_summaries` y `course_observations`; el extractor real (`extractObservations`) y el lector real de Trayectoria ejecutados sobre una copia en memoria. Los datos descargados y los scripts viven fuera del repositorio. **No se escribió nada en producción.**

### 1.1 Inventario **[MEDIDO]**

| Dato | Valor |
|---|---|
| Snapshots `duolingo-lang` | 850 (551 normales, 299 auxiliares); 100 % JSON objeto válido; un solo usuario |
| Rango | 2026-09-23T12:18:12Z → 2026-10-13T05:53:13Z |
| Cursos por snapshot | 16 en los 850 (catálogo completo, también en los auxiliares) |
| Entradas `courses[]` | 13 600; `xp` numérico en todas; 0 ausentes, 0 inválidas, 0 iguales a cero, 0 ids duplicados |
| Identidad de curso | 16 ids estables; ningún `id` cambia de título ni de idiomas. Solo `subject` pasa de `null` a un valor en los 16 |
| Cobertura temporal | 19 días con snapshot de 21; sin snapshots el 2026-10-03 y el 2026-10-04; **hueco máximo 70,8 h** (2026-10-02T07:15:42Z → 2026-10-05T06:05:55Z); mediana de hueco ≈ 3 s; p99 ≈ 12,7 h |
| Pares consecutivos de los 13 cursos de idiomas | 11 037; **32 con cambio de XP (0,29 %)**; **1 descenso**: `DUOLINGO_RU_ES` 35 721 → 35 707 (−14) dentro del hueco de 70,8 h; recuperado después |
| `course_observations` en producción | 237 snapshots, 3 792 filas, desde 2026-10-07T09:40:50Z; **3 792 / 3 792 filas idénticas** al extractor sobre los mismos snapshots; 613 snapshots sin filas |

### 1.2 Resultados del prototipo **[MEDIDO]**

Prototipo local (función pura `ingestOne` + `decode`; no es código del repositorio):

| Comprobación | Resultado |
|---|---|
| Eventos para los 850 snapshots × 16 cursos | **78** (16 primeras observaciones + 62 cambios de valor) = 0,57 % de las 13 600 celdas, concentrados en **39** snapshots (4,6 %); los otros 811 no escriben ninguna fila |
| Reconstrucción del estado de cada (snapshot, curso) a partir de los eventos y del orden de snapshots | **13 600 / 13 600** celdas idénticas |
| Transiciones (valor anterior → nuevo) | 62 / 62, **mismo conjunto** que el calculado desde `raw_json` (el orden dentro de un mismo snapshot puede diferir); incluye el único descenso |
| Estados A6 de h1 y h2 (13 cursos) calculados solo con eventos | **0 diferencias** frente al evaluador experimental de serie completa |
| Ingesta incremental (estado leído de los eventos ya guardados) frente al lote | idéntica |
| Prueba de estrés sintética (semilla fija; 3 % de entradas eliminadas, 2 % con `xp` inválido, 1 % con descenso de 7 XP) | reconstrucción exacta sobre 13 599 celdas comparadas; **1 588 eventos** (≈ 11,7 % de las celdas) |

### 1.3 Lo que **no** demuestra el prototipo **[NO DEMOSTRADO]**

1. ~~Descensos a través de una ausencia~~ y 2. ~~llegadas tardías o fuera de orden~~: **cubiertos por el prototipo v2 (§1.4)**, con las salvedades de ese apartado (datos reales sin ausencias; perturbaciones sintéticas; almacén simulado en memoria, no D1). El prototipo v1 solo comparaba con el estado del snapshot inmediatamente anterior.
3. **D1 real.** La ingesta se simuló en memoria; no se midieron `rows_written`, `rows_read`, CPU del Worker ni el plan. El coste real de D1 **sigue sin estar confirmado**.
4. **Generalidad.** Un usuario, 20 días, una fuente. El 0,57 % es propiedad de estos datos, no del diseño: la prueba de estrés muestra que el número de eventos crece con la inestabilidad de la fuente.
5. **Chess.** Solo se probó la fuente de idiomas (los cursos no idiomáticos del mismo payload, como `CHESS_CH`, sí entran en los 16).
6. **Que el −14 sea una regresión real o una revisión de la fuente** y la discrepancia de +1 061 XP de §7.3 siguen sin explicación.

### 1.4 Casos límite: prototipo v2 **[MEDIDO]**

Prototipo local con la regla de §2.3 tal como está escrita (`last_xp`, estados `value`/`invalid`/`absent`) y el protocolo de §4.3 simulado en memoria. Base: los 850 snapshots reales; las perturbaciones son **sintéticas** (semilla fija).

| Comprobación | Resultado |
|---|---|
| Semántica en 7 secuencias mínimas (`100,ausente,90` → 1 descenso; `100,inválido,90` → 1; `100,ausente,100` → 0; `100,ausente,ausente,120` → 0; `100,0,50` → 1 (el 0 **observado** no es ausencia); `ausente,ausente,80,70` → 1; `100,90,100,90` → 2) | 7 / 7 iguales al oráculo calculado directamente de la verdad por snapshot |
| `0` observado y ausencia producen estados distintos | Sí |
| Cambio de `course_id` (`A` → `B`) | `A` primera, `A` ausente, `B` primera; **nunca vinculados** |
| Serie real sin perturbar | 78 eventos, 1 descenso (RU_ES 35 721 → 35 707), 0 cadenas rotas, igual al oráculo |
| 40 series reales con 6 % de ausencias, 4 % de inválidos y 2 % de descensos inyectados | descensos desde eventos = oráculo en **40 / 40**; 10 813 descensos comparados; **0** violaciones de I2 |
| I2 detecta corrupción: se altera un `prev_state` | detectada |
| 300 llegadas tardías aleatorias (1–4 snapshots retrasados 1–6 posiciones), serie real | **sin protocolo** (añadir a ciegas): serie incorrecta en **108 / 300**. Con el protocolo de §4.3: 300 / 300 marcadas, **todo lo anterior a la marca ya exacto**, y la reparación deja la serie **idéntica** a la ordenada (300 / 300) y es **idempotente** (300 / 300) |
| Lo mismo sobre la serie perturbada (2 989 eventos) | sin protocolo: incorrecta en **300 / 300**; con protocolo: 300 / 300 en las tres comprobaciones |

**Concurrencia, atomicidad y recuperación (prototipo v3, §4.5).** Ejecutado sobre **SQLite real** (`node:sqlite`, el motor de D1) con las sentencias exactas del protocolo, intercalando lecturas y escrituras de varias ingestas y de reparaciones, con fallos inyectados que revierten el batch entero:

| Comprobación | Resultado |
|---|---|
| 120 000 intercalados aleatorios pequeños (4 semillas × 30 000; 8 snapshots, 3 cursos con `value`/`invalid`/ausencia, fallos de batch del 20 %), invariante comprobada **en cada paso** en que la serie figura limpia | **0 divergencias** |
| **Reparación troceada** (trozos de 1, 2 y 3 snapshots y en un solo batch; 2 semillas × 30 000 intercalados cada configuración; invariante «antes de `dirty_from` exacto» comprobada **en cada paso**, también entre trozos) | **0 divergencias** en las tres configuraciones |
| 600 ensayos mayores con reparación en trozos de 1 snapshot (misma carga y 678 fallos de batch inyectados) y otros 600 con trozos de 3 (709 fallos) | 1 200 / 1 200 convergen, 0 violaciones |
| **Revisión adversarial de las sentencias (§4.5.9)**: 8 000 batches de ingesta y 1 525 de reparación con conflictos de guarda frecuentes (7 713 y 1 064) | 0 abortos, 0 efectos parciales sin incremento de versión, 0 eventos sin avance de `head`, 0 publicaciones incompletas |
| **B1 y B2, pruebas dirigidas (§4.5.10)**: conflicto idéntico / de contenido distinto / evento sobrante; tardío forzado por la rama «en orden»; publicación con «último» anterior a `head`; 7 tipos de alteración histórica sobre 60 series | resultados en §4.5.10; 0 falsos positivos en series limpias; 30 / 60 de la alteración coordinada **no detectadas** por las comprobaciones baratas |
| **Regresión con el SQL endurecido** (predicado temporal, verificación de conflictos, filtros de usuario y fuente, `ON CONFLICT DO NOTHING`): 2 semillas × 2 configuraciones de reparación × 30 000 intercalados, y 600 ensayos mayores con trozos de 2 y 668 fallos inyectados | 0 divergencias; 600 / 600 convergen; 0 violaciones |
| 600 ensayos mayores (60 snapshots reales, 2 a 4 ingestas en vuelo, reparaciones intercaladas, snapshots que llegan entre la lectura y la escritura de una reparación; con y sin perturbaciones; con 765 fallos de batch inyectados) | **600 / 600** convergen a la serie ordenada; **0** violaciones de la invariante en ningún paso; todos los snapshots almacenados; ninguna marca perdida |

**Dos defectos del diseño que esta prueba encontró y que ahora están corregidos en §4.5** (la primera versión del protocolo divergía en el 2–20 % de los ensayos):

1. *Guarda de la reparación por «snapshot más nuevo».* Un snapshot insertado **dentro** del rango tras la lectura de la reparación quedaba sin aplicar y la marca se limpiaba. La guarda debe comparar el **conjunto** (aquí, el conteo, porque los snapshots no se borran).
2. *Guarda de las ingestas por `head_id`.* Tras una reparación el `head` puede volver a ser el mismo snapshot mientras el contenido de la serie cambió (ABA): una ingesta en vuelo escribía eventos calculados contra un estado obsoleto. La guarda debe ser una **versión** que cambia en cada escritura de la serie.

**Salvedades.** (a) La reparación se simuló leyendo el estado de los eventos y recomputando desde los payloads en memoria; el coste en D1 es una estimación (§8.1). (b) El protocolo marca **toda** llegada tardía como sucia, también las que no habrían alterado la serie (en la serie real, 192 / 300 (64 %) no producían diferencia): es conservador a propósito; cuánto cuesta esa conservadurez no está medido (D-A7-7). (c) La concurrencia se **modeló** (intercalado determinista de pasos sobre una sola conexión SQLite) y los fallos se modelaron como reversión atómica, que es la semántica documentada de `db.batch`; **no** se ejecutó contra D1 ni se verificó allí la atomicidad.

---

## 2. Modelo A7 **[PROPUESTO]**

### 2.1 Estado observado de un curso en un snapshot

Para un snapshot `s` de la fuente de idiomas y un `course_id`, el estado observado es **uno** de:

| Estado | Condición | Nota |
|---|---|---|
| `value` | `courses[]` de `s` trae una entrada con ese id y `xp` es un número finito | `xp` se conserva tal cual (incluido 0 **observado**) |
| `invalid` | trae la entrada con ese id, pero `xp` no es un número finito (ausente, `null`, texto, `NaN`, `Infinity`) | Es una observación **sin XP**: no es 0 ni «sin cambio» (A6 §14.2) |
| `absent` | `s` no trae ninguna entrada con ese id | **No dice nada del curso** (A6 §14.2); no es 0 |

Reglas heredadas del extractor, sin cambios: el id es `id ?? courseId` y debe ser texto; una entrada sin id utilizable no se atribuye a ningún curso y **no genera estado**; ante ids duplicados en un mismo snapshot gana la primera entrada. La pertenencia a «curso de idiomas» (D4) **no** se decide aquí: se decide al leer, como en `course_observations`.

El estado de un curso **no observado nunca** (sin entrada en ningún snapshot anterior) y ausente en `s` es «sin historia»; no genera evento.

### 2.2 Evento (serie K10)

Una fila **inmutable** por cambio de estado, hija de un snapshot, con `extractor_version` (mismo régimen que §4.8 y §5 del contrato congelado). Esquema **lógico** (no es una migración):

| Campo | Contenido |
|---|---|
| `snapshot_id` | snapshot en el que **se observó** el nuevo estado |
| `course_id` | clave del curso (§2.4) |
| `user_id`, `observed_at` | de `snapshots` (`observed_at = created_at`, §4.1 del contrato congelado) |
| `state` | `value` \| `invalid` \| `absent` |
| `xp` | valor si `state = value`; `NULL` en otro caso (nunca 0) |
| `prev_state` | estado del snapshot inmediatamente anterior de la línea temporal; `NULL` si es la primera observación del curso |
| `last_xp` | **último valor observado** del curso antes de este evento (el que usa A6 para decidir si hay descenso), `NULL` si no hubo; es el dato que permite detectar un descenso **a través de una ausencia** (§1.3.1) |
| `extractor_version` | versión de la regla que escribió la fila |

Clave: `(snapshot_id, course_id)` (como `course_observations`); a lo sumo un evento por curso y snapshot. Índices secundarios: **decisión pendiente** (D-A7-2).

### 2.3 Cuándo hay evento

Sea `E(s)` el estado observado en `s` y `P` el estado vigente del curso tras el snapshot anterior de la línea temporal (§3.1):

1. **Primera observación** (`P` no existe y `E(s) ≠ absent`): evento con `prev_state = NULL`. Es un hecho («apareció»), nunca XP ganado (A6 `new_course`).
2. **Cambio** (`E(s) ≠ P`, comparando `state` y, si ambos son `value`, `xp`): evento. **Sin cambio: ningún evento.**
3. **Descenso**: `state = value` y `last_xp` existe y `xp < last_xp`. Se **conserva tal cual**: sin recorte a 0, sin reinterpretación, sin «recuperación» inferida. La **discontinuidad** (A6 §14.2) es una lectura derivada; el evento guarda el hecho observado (Observado ≠ Interpretado).
4. **Ausencia** (`P = value` o `invalid` y `E(s) = absent`): evento `absent`. La **vuelta** posterior es otro evento, con `prev_state = absent` y `last_xp` = último valor anterior.
5. **Observación sin XP** (`invalid`): evento propio; no rompe la comparación de valores de A6 (que usa solo observaciones con XP numérico), pero queda registrada la incertidumbre.

Función pura: **la serie de eventos es una función determinista de (línea temporal ordenada, payloads, `extractor_version`)** (invariante I1). Eso la hace reconstruible desde `raw_json` en cualquier momento.

### 2.4 Identidad del curso

- La clave es el `course_id` del payload, tal como lo extrae el extractor vigente. **Título, `subject`, `learningLanguage` y `fromLanguage` no forman parte de la serie** y su cambio no genera evento (permanecen en `course_observations` y en `raw_json`).
- **Un cambio de `course_id` es otro curso**: aparece una primera observación nueva y el id antiguo queda ausente. La serie **nunca** vincula ambos ni presenta continuidad entre ellos.
- En los datos medidos no hay ningún cambio de identidad (§1.1); el único cambio de atributo (`subject`: `null` → valor) **no** es cambio de identidad y no genera evento.
- Si algún día hay que seguir cambios de atributos de un mismo id, es una serie distinta y una decisión aparte (D-A7-5).

---

## 3. Cobertura temporal

### 3.1 Línea temporal de snapshots

**[PROPUESTO]** La **línea temporal** `T(user, source)` es la lista de snapshots de ese usuario y fuente ordenados por `(observed_at, id)` (§5 del contrato congelado). Es una **entrada obligatoria** de cualquier lectura que use la serie compacta; los eventos solos no bastan.

**[MEDIDO / hecho de código]** `T` no es un latido: `ingestSnapshot` deduplica por `checksum` y **no registra** un payload idéntico a uno anterior. Un hueco en `T` significa «no hubo un payload distinto registrado», no necesariamente «no hubo sincronización». Esta enmienda no intenta distinguirlo.

### 3.2 Qué puede afirmarse y qué no

Para un curso `c` y los instantes `a < b`:

| Afirmación | Fuente de la afirmación | Permitida |
|---|---|---|
| «`c` valía `x` en el snapshot `s`» | último evento de `c` con posición ≤ `s` | Sí |
| «`c` descendió entre los snapshots consecutivos `s_i`, `s_{i+1}`» | evento con `xp < last_xp`, ubicado en `s_{i+1}` | Sí |
| «`c` no descendió entre `s_i` y `s_{i+1}`» | ausencia de evento **y** `s_i`, `s_{i+1}` consecutivos en `T` | Sí, **solo entre observaciones** |
| «`c` no descendió entre `a` y `b`» | ausencia de eventos | **No**: solo se afirma lo anterior para cada par de `T`. Un descenso con recuperación dentro de un hueco de `T` es invisible |
| «la serie de `c` es continua» | — | **Nunca**. Ningún campo ni texto puede afirmarlo |

### 3.3 Regla de cobertura para A6 **[PROPUESTO]**

1. Los estados de A6 (`gain`, `new_course`, `discontinuity`, `unknown`) se calculan con la definición de §14.2 **sobre `T` completa** (todas las parejas consecutivas de observaciones del curso), no sobre una muestra por frontera. Esto elimina el límite «tres snapshots por frontera» del texto actual de §14.2; **no** elimina el límite de fondo.
2. **El límite de fondo se conserva y se declara con datos:** la continuidad solo está verificada entre observaciones consecutivas de `T`. Cada `gain` lleva, además de su valor, `observationPairs` (número de parejas de `T` entre `o_a` y `o_b`) y **`maxGapHours`** (mayor intervalo entre dos snapshots consecutivos de `T` dentro de la cadena). Un `gain` es la diferencia neta observada, no una prueba de continuidad.
3. **Sin umbral de hueco.** La enmienda **no fija** a partir de cuántas horas un hueco invalida un `gain`; entrega el hueco como dato y deja el criterio a la regla que lo consuma (su contrato propio). Cualquier valor sería arbitrario con 20 días de historia.
4. **Ejemplo medido:** el descenso de RU_ES cae justo en el hueco de 70,8 h. Se detecta porque las **dos observaciones extremas difieren**, no porque se vea el intervalo; si hubiera bajado y vuelto a subir dentro del hueco, no habría evento ni forma de saberlo.
5. **Una ausencia de evento en un hueco no es «sin discontinuidad»:** la lectura debe devolver el hueco en `maxGapHours`, no omitirlo.

### 3.4 Coste de obtener `T` **[ESTIMADO]**

Leer `T` para una ventana cuesta del orden de una fila por snapshot (≈ 42 por día de media en el histórico medido, con picos de 110). Es **mucho menor** que leer `course_observations` (×16) o `raw_json` (≈ 73 KB por snapshot), pero **no es cero ni está medido en D1**. Alternativas (resumen diario de `T`, latido propio) se dejan a D-A7-3; ninguna se adopta aquí.

---

## 4. Orden de ingesta: tardíos, duplicados y fuera de orden **[PROPUESTO]**

### 4.1 Hechos de partida

- **[hecho de código]** `observed_at` es `created_at` del snapshot, asignado con `new Date()` **antes** de las escrituras (`ingestSnapshot`). La ruta HTTP de importación **no** reenvía `createdAt`; ese parámetro solo lo usan llamadores internos, tests y backfills. Dos peticiones concurrentes pueden, por tanto, **confirmarse en orden distinto** al de su `observed_at`, y un retroceso del reloj produciría un `observed_at` anterior al de snapshots ya guardados.
- **[hecho de código]** La escritura del snapshot y de sus observaciones va en un mismo `db.batch` (§4.5 del contrato congelado).
- **[precedente]** A1 ya resuelve un caso análogo para K5: si `observed_at` no es mayor que el del estado, **no se escribe nada** (§13, A1).
- **[MEDIDO]** En el histórico no se observó ningún snapshot fuera de orden; el orden de `created_at` es el de las filas. Esto no demuestra que no ocurra.

### 4.2 Definiciones

- **Frontera** `F(user, source)`: el mayor `(observed_at, id)` de `T` **ya aplicado a la serie**.
- **Tardío**: un snapshot cuyo `(observed_at, id)` es **menor** que `F`.
- **Duplicado**: `checksum` ya existente → no se crea snapshot nuevo (comportamiento vigente) y por tanto **no hay eventos nuevos**. Reintentar el mismo snapshot es idempotente por la clave `(snapshot_id, course_id)` y `ON CONFLICT DO NOTHING` (§5).
- **Empate** de `observed_at`: desempata `id`, como en §5.

### 4.3 Estrategia concreta

| Caso | Comportamiento | Garantía |
|---|---|---|
| **En orden** (`s > F`) | Se calculan los eventos de `s` contra el estado vigente tras `F` y se escriben **en el mismo batch** que el snapshot. | La serie es función de `T` (I1) |
| **Tardío** (`s < F`) | Se escribe **el snapshot** (la evidencia nunca se pierde) y **ningún evento**. Se registra una marca `dirty_from = min(dirty_from, s.observed_at)` para ese (usuario, fuente) en una fila de estado de serie (`observation_series_status`; nombre provisional). | No se inserta nada en medio de la secuencia: **no hay corrupción silenciosa** |
| **Lectura con marca activa** | Para instantes `≥ dirty_from` la lectura **no usa la serie compacta**: durante la coexistencia (§6) cae a la lectura vigente de `raw_json` y devuelve `series_status: "stale"`. Nunca mezcla ambas en un mismo resultado. | La respuesta declara su fuente |
| **Reparación** (explícita, idempotente) | Se borran los eventos con posición posterior al snapshot que precede a `dirty_from` y se **recomputan hacia delante** desde `raw_json`/`course_observations` en el orden de `T`; después se limpia la marca. | Convergencia a I1 Se hace **en trozos**, §4.5.4. |
| **Reloj hacia atrás** | Es un caso de «tardío»: mismo tratamiento. | — |
| **Cambio de `extractor_version`** | Reconstrucción explícita y versionada (§5), no una actualización en sitio. | — |

**Verificación de integridad (I2):** para cada curso, los eventos ordenados por `(observed_at, id)` deben encadenar: `prev_state` y `last_xp` de cada evento coinciden con el estado y el último valor que dejó el anterior. Una violación es **corrupción** y se informa (como la lista de no parseables de §6.3); no se corrige en silencio.

### 4.4 Costes **[ESTIMADOS, no medidos]**

- **Camino normal:** leer el último estado de cada curso (≈ 16 filas por ingesta, a medir) y escribir 0 filas en la mayoría de los snapshots (811 de 850, 95,4 %, en el histórico medido, §1.2; depende de la fuente).
- **Reparación, medición con los 850 payloads reales (proxy de CPU en Node, no CPU de Worker):** analizar un payload (≈ 72 KB) cuesta una mediana de 0,17 ms (p99 0,5 ms). Reprocesar 1 snapshot ≈ 0,2 ms y 0 filas escritas; 42 snapshots (≈ 1 día) ≈ 7 ms, 8 filas escritas, ~3 MB leídos; 294 (≈ 1 semana) ≈ 50 ms, 44 filas, ~21 MB; los 850 ≈ 145 ms, 156 filas, ~61 MB. **Escrituras bajas, lecturas altas:** una reparación grande debe trocearse. Qué límite de CPU o de transferencia aplica en el plan real **no está confirmado**.
- **Reparación de un tardío (estimación):** proporcional a los snapshots posteriores. Con la densidad medida (≈ 42/día), un retraso de un día toca del orden de 40 snapshots; cada uno se lee (≈ 73 KB de `raw_json`) y solo se reescriben los eventos del tramo (unas decenas de filas). Es un coste **de lectura y CPU**, no de escritura.
- **Conservadurez medida (prototipo v2, §1.4):** el protocolo marca sucia toda llegada tardía; en la serie real el 36 % (108 / 300) habría corrompido la serie con un añadido a ciegas y el resto no, así que **parte de las reparaciones serían innecesarias**. Reducirlo (p. ej. comprobar al llegar si el estado del tardío coincide con el de su predecesor y sucesor) es una optimización posible; **no se propone aquí** porque exige leer al sucesor en la ingesta y no está probada.
- **Qué pierde la estrategia:** mientras haya marca activa, la serie compacta no sirve a esa ventana y se paga la lectura vigente. Es la contrapartida de **no** corromper.
- **Alternativa descartada: insertar el tardío y reparar en línea** dentro de la petición de ingesta. Un tardío con muchos sucesores convertiría una escritura en una recomputación sin cota dentro del Worker.
- **Alternativa descartada: ignorar el tardío** (como hace A1 para el estado del árbol). K5 es un **estado** (el último gana); K10 es una **serie** y perdería una transición real.

### 4.5 Protocolo de escritura, reparación y lectura **[PROPUESTO; probado en SQLite local, no en D1]**

#### 4.5.1 Estado de serie, watermark y versiones

Una fila por (usuario, fuente): `head`, `dirty_from`, `repair_cursor`, `repair_watermark` (par `observed_at, id` fijo para una generación de reparación), `version` y `repair_version`.

- **`version`** aumenta en toda escritura del estado de serie: ingesta, marcas y progreso/publicación de reparación. Es la guarda general de ingesta.
- **`repair_version`** es la guarda independiente de la generación de reparación. Aumenta al iniciar una reparación, en cada trozo confirmado y cuando una llegada tardía afecta al prefijo `≤ repair_watermark`. Una llegada posterior al watermark aumenta `version`, pero **no** `repair_version`: no invalida el prefijo que ya se está reparando.
- Ambas versiones son monótonas y no se reutilizan. La separación evita que una ráfaga de snapshots nuevos invalide continuamente un trozo que solo reconstruye un prefijo fijo.


#### 4.5.2 La guarda es parte de la escritura, no de la aplicación

La comprobación **no** puede hacerse en código de aplicación (leer la versión, comparar en JavaScript y escribir después): esa ventana es la carrera que se quiere cerrar. **Cada sentencia** que escribe eventos o cambia el estado de serie lleva su condición en la propia sentencia (`INSERT … SELECT … WHERE version = :leída …`, `UPDATE … WHERE version = :leída …`), y **todas** van en un único `db.batch`.

- **Dependencia declarada:** que `db.batch` ejecute las sentencias en orden y como una transacción (reversión completa si una falla). Es la semántica documentada de D1; el prototipo la asume sobre SQLite y **no se ha verificado en D1** (P7).
- **Alcance:** toda lectura o escritura de eventos lleva `user_id`; toda lectura o conteo de snapshots lleva `user_id` **y** `source` (§3.1). Sin ese filtro la serie de un usuario se contamina con snapshots de otra fuente u otro usuario (§4.5.9).
- Una condición que no se cumple **no es un error**: la sentencia afecta 0 filas y el batch continúa. Por eso el orden de las sentencias y que *cada* efecto esté condicionado son parte del contrato.

#### 4.5.3 Ingesta

Lectura previa + un `db.batch` junto con el snapshot (§4.5 del contrato congelado):

1. Lectura: `head`, `dirty_from`, `version` y el estado por curso (de los eventos). Si `dirty_from` es nulo y `s > head`, se calculan los eventos de `s`; si no, ninguno.
2. Batch, en este orden: insertar el snapshot; insertar cada evento **condicionado a `version = leída` y `dirty_from` nulo**, con `ON CONFLICT DO NOTHING` (§5 del contrato congelado); avanzar `head` y `version` con la misma condición; y, si tras ello `head ≠ s`, fijar `dirty_from = min(dirty_from, s)`, reiniciar `repair_cursor` si `s ≤ repair_cursor` e incrementar `version`.
3. Si la condición no se cumple (otro escribió antes, el snapshot es tardío o la serie ya estaba sucia): **ningún evento**, snapshot guardado y marca en el mismo batch.

#### 4.5.4 Reparación (en trozos, con watermark fijo)

La reparación se divide en trozos de a lo sumo `K` snapshots. Una generación trabaja sobre un prefijo fijo delimitado por `repair_watermark = (observed_at, id)`.

1. **Inicio de generación:** si no hay watermark activo, capturar el mayor par `(observed_at, id)` existente, guardar `repair_watermark`, poner `repair_cursor = NULL` e incrementar `repair_version` y `version`. El watermark no cambia durante esa generación.
2. **Lectura del trozo:** leer `dirty_from`, `repair_cursor`, `repair_watermark`, `repair_version`, los snapshots posteriores al cursor (o desde `dirty_from` si el cursor es nulo) **y no posteriores al watermark**, el estado previo y el número esperado de snapshots del intervalo.
3. **Batch del trozo:** borrar/recrear los eventos del intervalo, avanzar el cursor o publicar el prefijo, todo en un mismo batch y con guarda `repair_version`, `dirty_from`, cursor, watermark y conteo del intervalo. El trozo no lee ni reconstruye snapshots posteriores al watermark.
4. **Llegada dentro del prefijo** (`s ≤ repair_watermark)): guardar el snapshot, ajustar `dirty_from` si procede, reiniciar el cursor si `s ≤ repair_cursor` e incrementar `repair_version`. La guarda del trozo en vuelo falla y se reintenta desde el punto seguro.
5. **Llegada posterior al watermark** (`s > repair_watermark)): guardar el snapshot y aumentar `version`, pero no `repair_version` ni el cursor del prefijo. La reparación en curso puede terminar; el snapshot queda en la cola sucia que se procesará en la siguiente generación.
6. **Guardas:** el conteo cubre solo el intervalo de reparación hasta el watermark. Los snapshots posteriores no lo invalidan; una llegada tardía dentro del prefijo sí lo hace mediante `repair_version`, incluso si el conteo por sí solo no bastara para detectar la carrera.


#### 4.5.5 Criterio de terminación y publicación

La generación termina cuando un batch confirma el último trozo hasta `repair_watermark`, fija `head` a ese watermark, limpia cursor y watermark e incrementa `version` y `repair_version`.

- Si no hay snapshots posteriores al watermark, limpiar `dirty_from`: la serie queda limpia.
- Si hay snapshots posteriores, mover `dirty_from` al primer timestamp del tramo posterior y dejar la serie marcada como sucia. El prefijo hasta el watermark queda publicado y es utilizable; los lectores desde el nuevo `dirty_from` siguen usando `raw_json` hasta la siguiente generación.
- La publicación nunca avanza `head` por delante del watermark ni lo retrocede. Una llegada posterior al watermark durante la reparación no invalida la publicación del prefijo.


#### 4.5.6 Recuperación y reintentos

| Fallo | Estado resultante | Recuperación |
|---|---|---|
| Falla el batch de una ingesta | Nada escrito: ni snapshot, ni eventos, ni marca | El cliente reintenta (como hoy); la deduplicación por `checksum` impide duplicar |
| El Worker muere tras confirmar, antes de responder | Todo confirmado | El reintento es un duplicado: 0 eventos nuevos |
| Falla el batch de un trozo | Nada de ese trozo; trozos anteriores confirmados; sigue sucia | Reintentar desde el cursor |
| Se pierde o reinicia el cursor | Sigue sucia, cursor nulo | Reparación desde `dirty_from`; borrar y reescribir es idempotente |
| La guarda falla repetidamente | Sigue sucia | **Vivacidad sin garantía** (§4.5.8) |

**Política de reintentos:** la ingesta no añade lógica nueva (los reintentos son los del colector). El reintento de la reparación es manual al inicio (D-A7-10). **El contrato no fija un número máximo de reintentos**: sería arbitrario sin medición.

#### 4.5.7 Lectores mientras la serie está sucia

- Un lector lee **el estado de serie y los eventos en el mismo `db.batch`**, para que ambos sean coherentes.
- Solo se fía de los eventos **anteriores a `dirty_from`**. Los posteriores pueden estar a medio reconstruir y **nunca se consumen**, tampoco un trozo ya confirmado: mientras haya marca, la serie es `stale` para esos instantes, sin excepciones.
- Para instantes `≥ dirty_from` usa la lectura vigente de `raw_json` (§6) y devuelve `series_status: "stale"` con `dirty_from`. **No mezcla ambas fuentes en un mismo valor.**
- Tras la publicación (§4.5.5) el mismo lector, sin marca, usa la serie completa.

#### 4.5.8 Límites operativos

- **Tamaño de trozo inicial: `K = 10` [MEDIDO en D1, provisional].** Cinco muestras de lectura + parseo dieron mediana de 15 ms y máximo de 26 ms, con ≈ 720 KB por trozo; `K = 25` alcanzó ≈ 1,8 MB y máximo de 57 ms. Elegimos 10 como punto de partida conservador. Se debe repetir la medición con las sentencias reales de borrado, inserción y publicación antes de fijar el valor final.
- La reparación completa de 850 snapshots leyó ≈ 61 MB y se paginó; el troceado es obligatorio y la reparación se ejecuta fuera de la petición de ingesta.
- **Vivacidad:** el watermark fijo más `repair_version` impide que las ingestas posteriores al watermark invaliden el prefijo en curso. Las llegadas tardías dentro del prefijo sí lo invalidan; no se afirma una garantía absoluta si esas llegadas se repiten sin límite.
- Mientras la serie esté sucia, las ingestas siguen guardando snapshots sin eventos. La cola posterior al watermark se procesa en generaciones sucesivas.


#### 4.5.9 Revisión adversarial de las sentencias concretas **[MEDIDO en SQLite local; no en D1]**

El hecho de partida: un `UPDATE … WHERE version = :v` que afecta a **0 filas no aborta** el batch. La transacción evita commits parciales ante errores SQL, **no** convierte un conflicto de versión en un aborto. Por eso la corrección no está en la transacción sino en que **cada efecto lleve el mismo predicado** y en que ninguna sentencia anterior invalide ese predicado.

**Predicados** (texto del contrato, no código):

- `G_ing(s, V)` = en la fila de serie del (usuario, fuente): `version = :V` **y** `dirty_at IS NULL` **y** (`head_at IS NULL` **o** `(:s_observed_at, :s_id) > (head_at, head_id)`). La comparación es de **tupla**: `observed_at` (texto ISO-8601 UTC, comparable lexicográficamente, §4.1 del contrato congelado) y, en empate, `id` (§5). Un empate exacto de `(observed_at, id)` no existe: el `id` es único.
  - En **I2** va como `INSERT … SELECT … WHERE EXISTS (SELECT 1 FROM series_status WHERE user_id = :u AND source = :src AND version = :V AND dirty_at IS NULL AND (head_at IS NULL OR (:at, :id) > (head_at, head_id)))`.
  - En **I3** va en el `WHERE` del `UPDATE` que fija `head` y `version = version + 1`.
  - **Es parte del SQL, no de la lógica de aplicación (B2):** una aplicación que clasifique mal a `s` como «en orden» no puede avanzar `head` ni publicar eventos, porque la sentencia compara por sí misma `s` con el `head` vigente en ese instante.
- `G_rep` = `repair_version = :R` **y** `dirty_from = :D` **y** `repair_cursor = :C` **y** `repair_watermark = :W` **y** el conteo de snapshots del intervalo pendiente hasta `:W` coincide con `:n`. El watermark se compara como tupla `(observed_at, id)`.

**Sentencias, en orden, y qué lee y modifica cada una:**

| # | Sentencia | Condición | Modifica algo que lean las siguientes |
|---|---|---|---|
| I1 | insertar snapshot | clave primaria | `COUNT` de snapshots (lo lee solo la reparación, otro batch) |
| I2 | insertar evento(s) `ON CONFLICT DO NOTHING` | `G_ing` | no (los eventos no aparecen en `G_ing`) |
| I3 | avanzar `head`, `version + 1` | `G_ing` (incluye `s > head`) | **sí: `version`**, pero ninguna sentencia posterior depende de `version` |
| I3b‑1 | **por cada evento calculado de `s`**: marcar la serie si lo almacenado para `(s, curso)` difiere (`state`, `xp`, `prev_state` o `last_xp`, con comparación nula-segura `IS NOT`) | `head_id = :s` **y** existe esa fila con contenido distinto | solo **añade** marca: `dirty_from = min(dirty_from, s)`, reinicia el cursor si `s ≤ cursor`, `version + 1` |
| I3b‑2 | marcar la serie si el número de eventos almacenados de `s` difiere del calculado (cubre el evento sobrante y el caso de 0 calculados) | `head_id = :s` **y** `COUNT(eventos de s) ≠ n_calculados` | igual que I3b‑1 |
| I4 | marcar `dirty_from = min(…)`, reiniciar cursor si `s ≤ cursor`, `version + 1`; incrementar `repair_version` solo si `s ≤ repair_watermark` | `head_id ≠ :s` (no depende de `version`) | solo **añade** marca (monótona): una llegada dentro del prefijo invalida la reparación; una llegada posterior al watermark no invalida el prefijo |
| R0 | iniciar generación: fijar `repair_watermark` al último snapshot, cursor nulo, `repair_version + 1`, `version + 1` | serie sucia y watermark nulo | estado de serie; es la primera sentencia del batch de inicio |
| R1 | borrar eventos del intervalo del trozo hasta `repair_watermark` | `G_rep` | eventos; `G_rep` no los lee |
| R2 | insertar eventos recomputados del trozo | `G_rep` | no |
| R3 | publicar el prefijo (fijar `head` al watermark y mover `dirty_from` al primer snapshot posterior, o limpiarlo si no hay cola), **o** avanzar cursor; incrementar `version` y `repair_version` | `G_rep`; la publicación exige `(watermark_at, watermark_id) ≥ (head_at, head_id)` | **sí: `version` y `repair_version`**, y es la **última** sentencia |

**Orden y exclusión de I3b e I4.** El orden del batch es I1, I2, I3, I3b‑1 (una por evento), I3b‑2, I4. I3b solo actúa si **este mismo batch** dejó `head = s` (es decir, I3 se aplicó); I4 solo si `head ≠ s`. Son **mutuamente excluyentes** (I3b solo con `head = s`, I4 solo con `head ≠ s`). El incremento de `version` por una ingesta es **exactamente 1** si solo actúa I3 o solo I4, y **1 + el número de sentencias I3b que actúan** si I3b marca tras I3 (cada sentencia incrementa; la marca en sí es idempotente por el `min`). Medido con una sola discrepancia: 2 (§4.5.11).

**Las cuatro condiciones que hay que poder verificar:**

1. **Cada efecto queda condicionado a una guarda válida.** I2 e I3 comparten `G_ing`; R1, R2 y R3 comparten `G_rep`. Como dentro de un batch nada externo cambia entre sentencias y ninguna modifica antes lo que el predicado lee, o todas ven el predicado verdadero (todo se aplica) o todas lo ven falso (nada se aplica). Las únicas sentencias sin guarda de versión son I3b e I4, que **solo añaden una marca** monótona y no pueden publicar ni retroceder nada.
2. **Un conflicto no deja eventos parciales ni limpia `dirty_from`.** Solo R3 limpia `dirty_from`, bajo `G_rep` completo. Medido (A de la tabla): 0 casos de cambios de eventos sin incremento de versión, 0 de eventos de un snapshot sin que su `head` avance, 0 publicaciones con la serie incompleta.
3. **La secuencia no invalida las guardas de las sentencias siguientes.** `version` se usa para la ingesta; `repair_version` se usa para la reparación. I3 va después de I2 (la última sentencia que lee `G_ing`); I3b e I4 no leen `version` para publicar eventos; R3 es la última sentencia del batch de reparación. Una llegada posterior al watermark cambia `version`, no `repair_version`.
4. **El último trozo publica solo el prefijo delimitado por el watermark.** `G_rep` cuenta el intervalo pendiente hasta `repair_watermark`; una llegada dentro de ese prefijo incrementa `repair_version` y hace fallar la guarda. Una llegada posterior no altera el conjunto del prefijo y se conserva como cola sucia para la siguiente generación. **Supuesto declarado:** `snapshots` es de solo añadir; si pudiera borrarse un snapshot, el conteo podría coincidir con un conjunto distinto.

**Defectos de especificación encontrados en esta revisión** (el protocolo ya convergía, pero el SQL no estaba acotado):

| # | Defecto | Efecto medido |
|---|---|---|
| 1 | Las lecturas y conteos de snapshots no filtraban por `user_id` y `source` | Con otros usuarios y una fuente `chess` en la misma tabla, **0 / 60** ensayos convergen con los filtros de #1 y #2 desactivados a la vez (no se aislaron por separado); con ambos, **60 / 60** |
| 2 | La lectura de eventos para reconstruir el estado no filtraba por `user_id` | Un evento de otro usuario contaminaba el estado del propietario (mismo experimento) |
| 3 | `DELETE` de eventos sin `user_id` | **No** observado (el dato de prueba quedó fuera del rango); riesgo a nivel de sentencia |
| 4 | Inserción de eventos sin `ON CONFLICT` | Un evento ya existente abortaría **toda** la ingesta y el snapshot (evidencia) no se guardaría. Con `DO NOTHING` el batch se confirma, el snapshot se guarda y la fila conflictiva se conserva; **`DO NOTHING` por sí solo no la detecta**: la detección es la de §4.5.10 (B1) |

**Sobre el defecto 4:** se elige `DO NOTHING` porque el snapshot es la evidencia y nunca debe rechazarse por una inconsistencia de la serie derivada; `DO NOTHING` no distingue un reintento idéntico de un conflicto inconsistente: esa distinción la hacen las sentencias de verificación de §4.5.10, que en el mismo batch marcan la serie sucia desde `s` si el contenido almacenado difiere del calculado.

**Vivacidad del protocolo anterior, sin watermark independiente (modelo adversarial histórico):**

| Trozo | p = 0,1 | p = 0,3 | p = 0,5 | p = 0,7 | p = 0,9 |
|---|---|---|---|---|---|
| Región sucia entera (un batch) | mediana 1 intento (máx. 1) | 2 (5) | 2 (15) | 3 (15) | 9 (27) |
| Trozos de 10 | 2 (5) | 5 (7) | 6 (22) | 10 (27) | 39 (855) |
| Trozos de 3 | 8 (11) | 11 (30) | 20 (56) | 84 (214) | **0 / 20 terminan en 3 000 intentos** |

20 ensayos por celda, región sucia de 20 snapshots. Es un contraejemplo explícito: **con trozos pequeños y llegadas dominantes la reparación no termina**. El trozo grande tolera más contención pero choca con el límite operativo (§4.5.8).

**Resultado nuevo:** la validación D1 de §4.5.12 demuestra que una generación con watermark fijo y `repair_version` separado puede publicar un prefijo aunque lleguen snapshots posteriores. Las llegadas tardías dentro del prefijo siguen invalidando la guarda. Ejecutar fuera de las ráfagas puede reducir contención, pero ya no es el mecanismo principal de vivacidad ni una garantía absoluta.

#### 4.5.10 Ramas del `head` (B2) y detección de eventos inconsistentes (B1) **[MEDIDO en SQLite local; no en D1]**

**Ramas explícitas de la ingesta (B2).** La condición temporal está en el SQL de I2 e I3 (`G_ing`); no depende de que la aplicación haya clasificado bien al snapshot.

| Caso | I2 / I3 | Marca | `head` |
|---|---|---|---|
| `s` posterior a `head`, serie limpia | se aplican (eventos + avance) | **ninguna**: ser una observación nueva no ensucia la serie | avanza a `s` |
| `s` anterior a `head` (tardío; también el empate de `observed_at` con `id` menor) | **no** se aplican: ni eventos ni avance | `dirty_from = min(dirty_from, s)` | **no cambia, nunca retrocede** |
| `s` posterior a `head`, serie ya sucia | no se aplican | `dirty_from` no cambia (ya es menor) | no cambia |
| publicación de una reparación | solo si `(último, id) ≥ (head_at, head_id)` | limpia | nunca retrocede |

Medido: un tardío **forzado por la rama «en orden»** (la lectura previa miente) **retrocede `head` y publica sus eventos** si la condición no está en el SQL, y **no** lo hace con ella; una publicación con un «último» anterior a `head` retrocede `head` sin el predicado y es rechazada con él (§1.4 y pruebas dirigidas del PR de implementación, P7).

**Eventos inconsistentes (B1).** Se distinguen tres situaciones y cada una tiene su detección:

| Situación | Detección | Efecto |
|---|---|---|
| **Reintento idéntico** (el evento ya existe y coincide) | I3b: el contenido almacenado de cada evento de `s` es igual al calculado y el conteo coincide | **sin marca**, serie limpia |
| **Conflicto inconsistente** (misma clave, contenido distinto) o **evento sobrante** de `s` | I3b: `state`, `xp`, `prev_state` o `last_xp` distintos, o conteo distinto, con `head = s` | **marca `dirty_from = s` en el mismo batch**; la fila conflictiva se conserva hasta que la reparación la reescribe |
| **Corrupción histórica** (cadena rota antes de esta ingesta) | verificador I2 (a continuación) y comprobación del `head` | marca `dirty_from` en la **causa** y reparación |

**Verificador I2 (consistencia interna de la cadena).** Para cada evento, ordenados por `(observed_at, id)` dentro de su curso: (a) `prev_state` es el `state` del evento anterior del curso (nulo si es el primero); (b) `last_xp` es el `xp` del último evento **con valor** anterior; (c) un evento no puede repetir el estado de su anterior (sin cambio). La primera violación **no** señala dónde está el daño: la causa está en el evento anterior del mismo curso **o** en el último evento con valor anterior (los `absent`/`invalid` intermedios los salta `last_xp`). **Regla de marcado:** `dirty_from` = la más temprana de esas dos posiciones. Medido: marcar donde se **detecta** la violación recuperaba 0 y 2 de 60 (evento intermedio borrado; `xp` alterado), y marcar solo el evento anterior del curso tampoco bastaba con `absent`/`invalid` intermedios (2 de 30 en la alteración coordinada); con esta regla, 60 / 60 y 30 / 30 de las detectadas.

**Comprobación del `head` (fidelidad barata).** El estado derivado de los eventos en `head` debe coincidir con el estado del payload del snapshot `head` (una lectura de ≈ 72 KB). Detecta lo que la cadena no ve: el último evento de un curso borrado o alterado y los eventos sobrantes. En el primer curso discrepante se marca desde su **primer** evento (o desde el primer snapshot si no tiene eventos).

**Cuándo se ejecutan.** Bajo demanda y al **inicio de cada reparación** (manual al inicio, D-A7-10); no en cada ingesta, salvo I3b, que sí. El coste es del orden del número de eventos (78 hoy) y un payload.

**Medido (60 series reales perturbadas, 120 snapshots, 0 falsos positivos en series limpias):**

| Alteración | Detectada por la cadena | Por el `head` | Recuperada tras marcar y reparar |
|---|---|---|---|
| `prev_state` alterado | 60 / 60 | — | 60 / 60 |
| evento intermedio borrado | 60 / 60 | — | 60 / 60 |
| `xp` alterado (no último del curso) | 60 / 60 | — | 60 / 60 |
| último evento de un curso borrado | 0 / 60 | 60 / 60 | 60 / 60 |
| `xp` alterado (último del curso) | 0 / 60 | 60 / 60 | 60 / 60 |
| evento sobrante insertado | 0 / 60 | 60 / 60 | 60 / 60 |
| **`xp` y `last_xp` del siguiente alterados a la vez (intermedio)** | 30 / 60 | 0 / 60 | 30 de los 30 detectados; **30 / 60 no detectadas** |

**Límite declarado:** una alteración coordinada que deje la cadena internamente consistente **no la ve ninguna comprobación barata**. La única detección completa es la **comparación con `raw_json`** (P1 de §6.3): reconstruir el estado de cada snapshot y compararlo con los eventos, fuera de la petición, en lotes. Esta enmienda no garantiza detectar corrupción coordinada entre dos verificaciones P1.

#### 4.5.11 Resultado de P9 contra el SQL actualizado **[MEDIDO en SQLite local; no en D1]**

Ejecución dirigida (21 comprobaciones; no es la regresión masiva, que no se repitió porque la lógica no cambió respecto de la última ejecución). Cada fila se evalúa sobre las sentencias de §4.5.9; «Δversion» es el incremento de `version` causado por la ingesta.

| ID | Comprobación | Resultado |
|---|---|---|
| P9‑B2‑1 | Tardío con `head` ya avanzado: `head` intacto, 0 eventos de `s`, marca = `s`, Δversion = 1 | **PASS** |
| P9‑B2‑2 | Posterior al `head` con serie limpia: avanza, sin marca, Δversion = 1 (I3b no actúa) | **PASS** |
| P9‑B2‑3 | Tardío forzado por la rama «en orden»: el SQL lo rechaza (`head` intacto, 0 eventos, marca) | **PASS** |
| P9‑B2‑4 | Empate de `observed_at` con `id` menor = tardío | **PASS** |
| P9‑B2‑5 | Serie sucia y `s` posterior al `head`: sin eventos, `head` y `dirty_from` intactos | **PASS** |
| P9‑B2‑6 | Carrera perdida: 0 eventos de `s`, `head` = ganador, marca = `s`, Δversion = 1 (solo I4) | **PASS** |
| P9‑B2‑7 | Publicación con «último» anterior al `head`: rechazada, sigue sucia | **PASS** |
| P9‑B2‑8 | Reparación normal tras el tardío: publica con `head` correcto y serie = ordenada | **PASS** |
| P9‑B1‑1 | Reintento idéntico: sin marca, serie = ordenada, Δversion = 1 | **PASS** |
| P9‑B1‑2 | Conflicto de contenido distinto: batch confirmado, snapshot guardado, marca = `s`, tras reparar = ordenada, Δversion = 2 | **PASS** |
| P9‑B1‑3 | Evento sobrante con eventos calculados: marca por conteo, tras reparar = ordenada | **PASS** |
| P9‑B1‑4 | Evento sobrante con 0 eventos calculados: I3b‑2 marca | **PASS** |
| P9‑B1‑5 | I3b no actúa con `head ≠ s`: una sola marca, Δversion = 1 | **PASS** |
| P9‑V‑1 | Verificador I2: 0 falsos positivos en 100 series limpias (con ausencias, inválidos y descensos) | **PASS** (0 / 100) |
| P9‑V‑2a/b/c | `prev_state` alterado / evento intermedio borrado / `xp` alterado (no último): detectado por la cadena y recuperado | **PASS** (40 / 40 cada uno) |
| P9‑V‑3a/b/c | Último evento borrado / `xp` del último alterado / evento sobrante: detectado por el `head` y recuperado | **PASS** (40 / 40 cada uno) |
| P9‑V‑4 | `xp` y `last_xp` alterados a la vez (intermedio) | **LÍMITE conocido:** 26 de 39 no detectadas por comprobaciones baratas; solo la comparación completa con `raw_json` (P1) |

**Qué no demuestra:** que el SQL de runtime de A7 funcione, porque aún no existe en la aplicación. Los primitivos D1, la comparación de tuplas, la paridad P1 y un protocolo de referencia sí se han probado en D1 (§4.5.12). P9 debe repetirse contra las sentencias reales después de implementar A7.


#### 4.5.12 Validación D1 y P1 **[MEDIDO; 2026-10-13]**

La ejecución se realizó con una D1 y un Worker desechables. El auditor P1 consultó producción mediante SELECT únicamente; no se escribió ninguna fila de producción y los payloads no se registraron ni se adjuntaron a artefactos.

| Comprobación | Resultado |
|---|---|
| Atomicidad de `db.batch` ante una violación NOT NULL | **PASS**: se revirtió la inserción previa del mismo batch |
| Comparación de tuplas temporales | **4 / 4 PASS** |
| Ingestas concurrentes con 20 lectores de la misma versión | **PASS**: un ganador publica, los perdedores dejan la serie sucia y los 20 snapshots se conservan |
| Llegada posterior al watermark tras la lectura de reparación | **PASS**: cambia `version`, no `repair_version`; el guard general antiguo falla y el guard del prefijo puede completar |
| Reparación del prefijo y de una cola posterior de 5 snapshots | **PASS**: paridad exacta, `head` final correcto y marca limpia |
| P1 en producción | 850 snapshots, 16 cursos, **13 600 / 13 600 celdas reconstruidas**, 0 discrepancias, 78 eventos derivados, 0 discrepancias de transiciones, 1 descenso |
| P1: escrituras de producción | **0** |
| P1: filas leídas por la auditoría completa | 76 496; consulta puntual, no coste de una reparación normal |

**Validación del runtime (commit e3995e1a551ec15f724f0e5efee0d4b068095549 de PR #53, módulo importado directamente en un Worker temporal y ejecutado contra una segunda D1 desechable):**

- **Ingesta ordenada + tardío + cola posterior al watermark:** head no retrocede, la llegada tardía marca la serie, la reparación procesa el prefijo y una llegada posterior se procesa en la siguiente generación; 4 eventos A reconstruidos exactamente (100 → 95 → 90 → 80), head final correcto y dirty limpio. **PASS**.
- **20 ingestas concurrentes:** los 20 snapshots se conservan; la serie queda marcada para reparación; dos llamadas de reparación reconstruyen los 20 eventos en orden, con paridad exacta, head final correcto y dirty limpio. **PASS**.
- **Límite:** B1 (conflicto de contenido/eventos sobrantes) y corrupción coordinada aún no se han ejercitado con el runtime exacto en D1. P9 local y la auditoría P1 siguen siendo evidencia complementaria; no sustituyen esos casos.

**Lectura y tamaño de trozo (D1 desechable, cinco muestras de lectura + parseo):**

| K | Payload | Mediana Worker | Máximo Worker | SQL D1 mediano | Filas leídas |
|---:|---:|---:|---:|---:|---:|
| 1 | 71 993 B | 106 ms | 111 ms | 0,586 ms | 1 |
| 3 | 215 979 B | 171 ms | 174 ms | 1,423 ms | 3 |
| 10 | 719 930 B | 100 ms | 252 ms | 2,944 ms | 10 |
| 25 | 1 799 825 B | 332 ms | 335 ms | 7,678 ms | 25 |

**Decisión provisional: K = 10.** Es el límite inicial conservador (~720 KB, máximo observado 252 ms). La medición no incluye aún el coste del borrado, la inserción de eventos ni la publicación del runtime; debe repetirse una vez implementadas esas sentencias.

La simulación adversarial previa no terminaba con llegadas dominantes (0/100 ensayos en 3 000 intentos); el prototipo de watermark fijo terminó en 100/100 (mediana y máximo: 7 intentos). La prueba D1 anterior valida el caso de llegadas posteriores al watermark. No elimina el caso adversarial de llegadas tardías repetidas dentro del prefijo, que invalidan `repair_version`.


---

## 5. Snapshots auxiliares

**Se conserva el comportamiento de A6 (§14.3): sin filtro `is_auxiliary`.** Un snapshot auxiliar es una observación válida del catálogo de cursos (observation-model §4) y entra en la serie.

Consecuencias de que un auxiliar **omita** un curso, documentadas y no corregidas **[PROPUESTO]**:

1. Se genera un evento `absent` y, al reaparecer el curso, un segundo evento de vuelta (`prev_state = absent`, con `last_xp`). Dos filas por ciclo.
2. **El curso queda «no observado» en ese snapshot**: si una frontera de mitad cae dentro de la ausencia, el estado del curso en esa frontera sigue siendo el de su última observación **con valor** (A6 §14.2), no 0 ni «sin cambio».
3. La **comparación de descenso** usa `last_xp`, de modo que una ausencia **no oculta** un descenso ni lo fabrica.
4. **Si los auxiliares omitieran cursos de forma sistemática**, el número de eventos subiría (coste), aunque la corrección no se vería afectada. **[MEDIDO]** En los 299 auxiliares del histórico: 0 ausencias.
5. **No se introduce ningún filtro.** Si se quisiera uno (p. ej. ignorar `absent` generados por auxiliares), exige una decisión contractual explícita y su propia medición (D-A7-4). El campo `snapshot_id` permite unir con `snapshots.is_auxiliary` sin añadir columna.

---

## 6. Compatibilidad y migración **[PROPUESTO]**

### 6.1 Convivencia

- `raw_json` **sigue siendo la fuente de verdad** (§8.0 del contrato congelado). K10 es derivada y reconstruible (I1); **no autoriza** borrar, compactar ni archivar `raw_json`.
- `course_observations` **no se sustituye**: la serie compacta solo conserva `course_id` y XP; título, idiomas y `subject` (R4, R7) siguen saliendo de `course_observations`/`raw_json`.
- Los lectores no cambian. Ninguna lectura vigente (Trayectoria incluida) pasa a leer K10 mientras no se cumplan los criterios de §6.3.

### 6.2 Fases (cada una exige su aprobación)

| Fase | Contenido | Escribe en producción |
|---|---|---|
| F0 | Esta enmienda aprobada | No |
| F1 | Extractor puro del estado por curso (función sin E/S) + tests, sin tabla | No |
| F2 | Tabla K10 y **escritura en sombra** durante la ingesta; verificador de paridad | Sí (aditivo) |
| F3 | Backfill de K10 desde `raw_json` (en orden de `T`, por lotes) y verificador | Sí (aditivo) |
| F4 | Lectura de A6 desde K10, solo tras §6.3 | No (cambia un lector) |

El backfill de `course_observations` (lotes ya preparados fuera del repo, 15 267 filas **[MEDIDO]**) es **independiente** de K10: K10 se puede construir directamente desde `raw_json` (78 eventos para el histórico medido) y no depende de él. Qué fuente usa el backfill de K10 es D-A7-6.

### 6.3 Comprobación de paridad y criterios de aceptación (antes de F4)

Todos deben cumplirse; **ninguno es un umbral numérico arbitrario**: son igualdades exactas o cotas medidas y aprobadas.

| # | Criterio |
|---|---|
| P1 | **Reconstrucción exacta:** para toda `(snapshot, curso)` de la copia de producción y del dataset demo, el estado decodificado desde K10 + `T` es igual al del payload. **0 diferencias.** |
| P2 | **Transiciones:** el conjunto de (curso, instante, valor anterior, valor nuevo) de K10 es igual al calculado desde `raw_json`. |
| P3 | **A6:** para el conjunto fijo de ventanas de prueba, los estados A6 desde K10 son iguales a los del evaluador de serie completa. Las **únicas** diferencias aceptadas frente a la lectura vigente (tres snapshots por frontera) son las que **añaden** una `discontinuity` o un `unknown` que la muestra vigente no podía ver; cada una se enumera. |
| P4 | **Integridad I2:** 0 cadenas rotas. |
| P5 | **Idempotencia:** una segunda pasada escribe 0 filas; el orden de ingesta incremental produce los mismos eventos que el lote. |
| P6 | **Tardíos:** con la ingesta en orden aleatorio y la reparación aplicada, la serie final es idéntica a la de la ingesta ordenada. |
| P7 | **Casos límite** (cubiertos por el prototipo v2, §1.4, y a repetir sobre el código real): descenso a través de una ausencia, `invalid` entre dos valores, cambio de `course_id`, **0 observado frente a ausencia** y tardíos con reparación, con datos sintéticos **y** una copia de producción. La concurrencia y el fallo de batch están modelados en SQLite local (§1.4, §4.5); **P7 exige repetirlos contra D1** (atomicidad real de `db.batch`, y que la guarda condicionada en la propia sentencia se comporta igual que en SQLite). |
| P8 | **Presupuesto:** la medición real de `rows_written` y `rows_read` por día en D1 atribuibles a K10 debe quedar por debajo de un tope **fijado por el propietario con esa medición** (como A1). Este documento **no inventa** el tope. |
| P9 | **Casos dirigidos de B1 y B2 sobre el SQL real:** conflicto idéntico, de contenido distinto y evento sobrante; tardío con `head` ya avanzado; tardío forzado por la rama «en orden»; carrera perdida; publicación con «último» anterior a `head`; verificadores. **Ejecutada en SQLite local: 20 PASS y 1 LÍMITE conocido (§4.5.11). Pendiente repetirla contra D1.** |

**Compatibilidad con A5:** A7 no toca `xp_summaries` ni las reglas de §13; **ningún** cálculo de A5 cambia.

---

## 7. A5.1 — el día en curso y la ausencia de fila (documental)

**Estado:** documenta un hecho observado y su límite. **No cambia el comportamiento de A5**, no cierra O1 ni O3 y no añade ningún umbral.

### 7.1 Lo que los datos demuestran **[MEDIDO]**

- En los 850 payloads, `xp_summaries` es un bloque contiguo de 90 o 91 días (147 y 703 bloques), **sin huecos**, con 77 203 entradas, **0 con `gainedXp = 0`** y 0 con `gainedXp` ausente o inválido.
- Los 110 días del bloque coinciden con las 110 filas de `xp_summaries`: **110 / 110** iguales al último valor observado, ningún día sobrante ni faltante.
- 14 días muestran valores distintos entre snapshots; **todos son no decrecientes** (un día en curso va acumulando). Ningún día quedó sin observarse después de cerrarse.
- **El día en curso no tiene fila hasta que aparece el primer XP.** Se observó en 10 días: los snapshots tomados antes de la primera actividad del día no traen su fila, y la primera fila que aparece tiene `gainedXp > 0` (p. ej. el 2026-10-05: la fila del día aparece a las 06:38 con 173 XP; el 2026-10-13, hasta las 05:53, no hay fila). **Nunca se vio una fila con 0.**
- Conciliación: en **848 de 849** pares consecutivos de snapshots, la suma de variaciones de XP de los cursos coincide **exactamente** con la variación de XP diario de la cuenta.

### 7.2 Lo que **no** permiten determinar **[NO DEMOSTRADO]**

- **Cómo se representa un día completo sin actividad.** En los 110 días observados no hay ninguno (mínimo 29 XP). Que la fuente no emita fila para el día en curso antes de su primer XP **no** prueba que tampoco la emita para un día cerrado sin actividad (lecturas L0/L1/L2 de §13.5 de A5).
- **Una cobertura mínima (O3).** La cobertura observada es 110 / 110: no hay varianza de la que derivar un umbral. **No se fija ninguno.**

### 7.3 Observaciones sin explicar (hechos, sin atribución de causa)

| Hecho | Detalle |
|---|---|
| Descenso de 14 XP | `DUOLINGO_RU_ES` 35 721 → 35 707 entre 2026-10-02T07:15:42Z y 2026-10-05T06:05:55Z; recuperado antes del 2026-10-08T07:15:53Z |
| Residuo de conciliación | Único par que **no** concilia: el mismo hueco de 70,8 h. Suma de variaciones de curso 3 796 XP frente a 2 735 XP de cuenta (**+1 061**); en ese par `CHESS_CH` sube 1 513 y `RU_ES` baja 14 |

No se corrige ningún dato ni se atribuye el residuo a una causa. Se investigan por separado (**requieren evidencia nueva**, p. ej. snapshots dentro del hueco o la fuente original).

### 7.4 Redacción propuesta para A5 (§13.5)

> *La fuente no emite fila del día en curso hasta su primer XP (observado en 10 días, sin ninguna fila con 0). Para un día completo sin actividad la representación sigue sin caracterizarse: no ha ocurrido en los datos disponibles. A5 ya excluye el día en curso (§13.2); por tanto esta observación no altera ningún cálculo. O1 y O3 permanecen abiertas.*

---

## 8. Costes y límites

### 8.1 Mediciones **[MEDIDO]**

| Magnitud | Valor |
|---|---|
| Filas de K10 para el histórico medido | 78 (0,57 % de 13 600 celdas) |
| Filas de `course_observations` equivalentes | 13 600 (de las cuales 3 792 ya escritas) |
| Cambios de XP en cursos de idiomas | 32 de 11 037 pares (0,29 %) |
| Eventos en la prueba de estrés | 1 588 (≈ 11,7 % de las celdas) |
| Snapshots por día | de 3 a 110; ≈ 42 de media |
| Filas de backfill pendientes de `course_observations` | 15 267 (9 808 curso, 4 838 sección, 604 path, 17 cuenta) |

### 8.2 Estimaciones **[ESTIMADO, no medido en D1]**

| Magnitud | Estimación | Base |
|---|---|---|
| Eventos nuevos por día | ≈ 3 | 62 cambios en 20 días; **depende de la actividad de este usuario** |
| Eventos por año | del orden de 1 000 | extrapolación lineal del anterior |
| Filas de `course_observations` por año | del orden de 250 000 | ≈ 680/día medidos |
| Lectura de `T` | ≈ 1 fila por snapshot de la ventana | densidad medida |
| Reparación de un tardío de un día | ≈ 40 snapshots leídos | densidad medida |

### 8.3 Límites

- **D1 se ha medido en una base desechable** para atomicidad, comparaciones temporales, lectura + parseo por trozo y un protocolo de reparación de referencia (§4.5.12). El coste del SQL de runtime A7 —borrado, inserción de eventos, guardas y publicación— sigue pendiente hasta implementar esas sentencias.
- Las limitaciones del prototipo son las de §1.3.
- **Reparación y vivacidad (§4.5.8):** K=10 es el punto de partida medido para lectura + parseo. Una reparación completa (≈ 61 MB) no cabe garantizadamente en una invocación; el watermark + repair_version ha pasado una prueba D1 de referencia, pero la vivacidad del runtime aún debe validarse.
- El número de eventos es **función de la estabilidad de la fuente**, no una constante del diseño.
- Esta enmienda **no** cambia ninguna regla de emisión: `LANG_FOCUS_SHIFT_LONGITUDINAL` sigue `SIN EVALUAR` y sus puertas temporales (≥ 90 días, ≥ 60 días activos) no se tocan. Con 20 días de historia ninguna de las dos lógicas emite, con o sin las puertas forzadas **[MEDIDO]**.

---

## 9. Decisiones del propietario

> La autorización del propietario permite implementar en una rama y validar en entornos aislados; no convierte A7 en contrato vigente en producción. Las mediciones D1 de §4.5.12 respaldan los primitivos y un protocolo de referencia, pero el SQL de runtime aún debe implementarse y validarse.

| ID | Decisión | Opciones | Recomendación (no vinculante) |
|---|---|---|---|
| **D-A7-1** | ¿Se aprueba K10 como serie derivada de eventos (§2) con los tres estados? | aprobar / aprobar con cambios / rechazar | Aprobar |
| **D-A7-2** | Clave e índices de K10 | PK `(snapshot_id, course_id)` sin índices / añadir índice `(user_id, course_id, observed_at)` | Sin índice hasta medir (la serie es pequeña) |
| **D-A7-3** | Origen de la cobertura en lectura (§3.4) | consultar `T` acotada a la ventana / resumen diario / latido | Consultar `T` acotada; medir antes de otra tabla |
| **D-A7-4** | Auxiliares (§5) | mantener sin filtro / filtrar `absent` de auxiliares | Mantener sin filtro |
| **D-A7-5** | Seguimiento de cambios de atributos de un mismo id | ninguno / serie aparte | Ninguno hasta que ocurra |
| **D-A7-6** | Fuente del backfill de K10 (F3) | `raw_json` / `course_observations` | `raw_json` (distingue `absent` e `invalid`; no depende del backfill de observaciones) |
| **D-A7-7** | Estrategia ante tardíos (§4.3, §4.5) | marca + reparación explícita / ignorar / reparar en línea | Marca + reparación explícita, **conservadora** (sin optimizar hasta que la medición en D1 lo justifique) |
| **D-A7-8** | Tope de presupuesto de D1 (P8) | a fijar con medición real | Fijar tras medir en F2 |
| **D-A7-9** | A5.1 (§7.4): incorporar la redacción a §13.5 | sí / no | Sí, como texto, sin cambio de código |
| **D-A7-10** | Quién dispara la reparación y cuándo (§4.5, §4.5.9) | en la ingesta siguiente / cron / manual | Manual al inicio (F2), fuera de las ráfagas de sincronización; automatizar tras medir la vivacidad en D1 |

### 9.1 Decisiones del propietario (2026-10-13)

Resumen actualizado (2026-10-13): **autorizada la implementación de A7 en una rama y las pruebas aisladas**. A7 no está en vigor en producción; esta autorización no permite migraciones, backfill, escrituras remotas ni despliegue.

| ID | Decisión del propietario | Condición o nota |
|---|---|---|
| D-A7-1 | **Autorizar implementación en rama** | Incorporar watermark fijo y `repair_version`; P9 contra SQL real antes de cualquier despliegue |
| D-A7-2 | Aprobar PK `(snapshot_id, course_id)`; **sin índices secundarios** inicialmente | Medir antes de añadir coste de escritura; consultas acotadas por usuario y fuente (§4.5.2) |
| D-A7-3 | Aprobar consultar `T` acotada a la ventana | Sin otra tabla de resúmenes |
| D-A7-4 | Aprobar mantener los auxiliares sin filtro | — |
| D-A7-5 | Aprobar no crear una serie aparte por cambios de atributos | Sin evidencia que lo justifique |
| D-A7-6 | Aprobar `raw_json` como fuente del backfill de K10 | Fuente de verdad declarada |
| D-A7-7 | Aprobar marca y reparación explícita con watermark fijo | Las llegadas dentro del watermark invalidan por `repair_version`; las posteriores quedan para la siguiente generación |
| D-A7-8 | **K = 10 inicial** | Medido en D1 para lectura + parseo; re-medición obligatoria con las sentencias reales de reparación |
| D-A7-9 | Aprobar incorporar la redacción A5.1 | Registra el hecho sin alterar A5 ni cerrar O1/O3 |
| D-A7-10 | Reparación manual inicialmente | El watermark reduce la contención por llegadas posteriores; automatizar después de validar el runtime y sus métricas |

**Sin decidir y fuera de esta enmienda:** el backfill de `course_observations` (requiere autorización de escritura y el presupuesto de D1), la regla longitudinal y sus umbrales, O1, O3, P1 (cota de frescura) y P4 (artefactos pasados).

---

## 10. Tests exigidos en la implementación (no en este PR)

Nombres con el patrón del proyecto:

- `shouldEmitNoEventWhenTheStateDoesNotChange`
- `shouldEmitFirstObservationWithNullPreviousStateWhenTheCourseAppearsForTheFirstTime`
- `shouldKeepTheDescentUnclippedWhenXpDecreases`
- `shouldDetectTheDescentAcrossAnAbsenceWhenTheCourseReturnsLower`
- `shouldNotTreatAnAbsentOrInvalidObservationAsZero`
- `shouldReconstructEveryObservedStateWhenDecodingTheEventsWithTheTimeline`
- `shouldNeverAffirmContinuityWhenTheTimelineHasGaps`
- `shouldReportTheMaxGapHoursWithEveryGain`
- `shouldWriteNoEventsAndMarkTheSeriesDirtyWhenASnapshotArrivesLate`
- `shouldConvergeToTheOrderedSeriesWhenRepairingAfterALateSnapshot`
- `shouldBeIdempotentWhenTheSameSnapshotIsIngestedTwice`
- `shouldKeepTheSameEventsWhenIngestingIncrementallyOrInBatch`
- `shouldNotCreateAnEventWhenOnlyDescriptiveAttributesChange`
- `shouldTreatAChangedCourseIdAsAnotherCourse`
- `shouldBreakTheChainReportWhenAnEventDoesNotLinkToThePreviousOne` (I2)

---

## 11. Trazabilidad y qué no cambia

- **Contrato congelado de observaciones:** sin cambios en su texto de §2b, §3, §4, §7, §10 (K10 es una adición, no una modificación). Se añade solo un puntero en §13 y en la cabecera (ver abajo).
- **A5 (§13) y A6 (§14):** no se modifican. §14.2 ya define estados y descenso; A7 solo propone **de dónde** salen las observaciones y **cómo se declara la cobertura**. El límite declarado de §14.2 («tres snapshots por frontera») se sustituye por el de §3.3 **únicamente si** esta enmienda se aprueba e implementa.
- **Congelado, no reabierto:** D3 (invariante de oro), D4 (predicado de curso de idiomas), §8.0 (no compactar `raw_json`).
- **Sin implementación:** este documento no contiene DDL ejecutable, migraciones, código de runtime ni scripts de backfill.
