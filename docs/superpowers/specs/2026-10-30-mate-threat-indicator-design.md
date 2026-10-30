# Indicador de amenazas de mate — diseño

## Intención

Una auditoría con motor sobre las 1.643 partidas mostró que 155 de las 273 derrotas por mate vienen de no neutralizar un mate en 1 que estaba sobre el tablero, y que ese fallo no es específico de ninguna casilla (f7/f2 igual que el resto). Meridian debe medir esa comprobación de amenazas en el tiempo y llevar a las partidas donde falló, para poder trabajarla.

## Qué se mide

Una **posición amenazada** es una posición en la que me toca mover, no estoy en jaque, y si pasara turno el rival tendría un mate en 1. Por cada una, con la jugada que jugué:

- **fallada:** la respuesta del rival es mate.
- **sin castigo:** no me mata, pero el mate en 1 sigue en el tablero y el rival no lo jugó.
- **neutralizada:** ya no queda mate en 1 tras mi jugada.

Solo cuentan las posiciones en las que el rival llegó a mover después (si mi jugada cierra la partida no hay veredicto). El indicador es `neutralizadas / amenazadas`, con su denominador siempre visible.

Referencia medida el 2026-10-30 sobre las 1.643 partidas (1.070 posiciones en 581 partidas): 69 % neutralizadas, 17 % sin castigo, 14 % falladas; por fase 81 % apertura, 67 % medio, 69 % final.

## Metas

- Contadores por partida, un indicador agregado, su tendencia reciente y la lista de partidas con fallos, abribles en el visor existente.
- Las partidas nuevas se calculan solas.

## No metas

- No usa motor. Solo detecta mate en 1; las amenazas más profundas no entran.
- No afirma causas ("falta de atención"): describe cuántas amenazas había y qué pasó.
- No toca el guardado de partidas ni su ruta de ingesta.

## Antimetas

- Presentar el porcentaje sin su denominador, o como medida definitiva de nivel.
- Romper la ingesta por un cálculo que excede el límite de CPU del Worker.

## Diseño

**Dónde se calcula.** En Node, no en el Worker: ~73 ms de CPU por partida de mediana (máximo medido 243 ms), por encima del límite de CPU del plan gratuito. El cálculo es una función pura de dominio (`analyzeMateThreats`) en este repositorio.

**Dónde se ejecuta.** En el repositorio del colector (todo lo que necesita GitHub va allí): un job programado diario tras el sync, mismo interruptor por variable del repositorio que el cron actual, que hace checkout del repositorio público `meridian` en una referencia fijada, instala `chess.js` desde su lockfile y ejecuta `scripts/analyzeThreats.ts` de Meridian. El script pide pendientes, calcula y escribe. El colector no copia lógica de ajedrez.

**Reanudación, idempotencia y atomicidad.**
- Cada partida es independiente y se escribe con **un solo `UPDATE`** sobre su fila (atómico en D1). No hay estado intermedio: o está pendiente o está calculada/inválida.
- La cola de pendientes es `mate_threats IS NULL`: no hay cursor que perder. Un fallo a mitad de ejecución deja las ya escritas intactas, y el siguiente run continúa con las que siguen en `NULL`.
- Reescribir una partida ya calculada con el mismo resultado no cambia nada; con otro (por cambiar `v`) la sustituye entera. El `POST` es un reemplazo, no una suma, así que repetirlo nunca duplica contadores.
- **Una tanda son 100 partidas por petición** (`limit` máx. 100). Una ejecución del workflow encadena tandas consecutivas hasta que no queden pendientes o se agote el presupuesto de tiempo (12 min de reloj dentro del límite de 15 del job); al agotarlo termina limpiamente entre dos partidas, sin escrituras a medias. El relleno de las 1.643 partidas son ≈17 tandas en una sola ejecución.
- Cada partida inválida se marca como tal para no reintentarla en cada run.

**API (rutas de máquina, `IMPORT_TOKEN`, mismo patrón que `pending-details`).**
- `GET /api/chess/matches/pending-threats?limit=N` → `{items:[{match_id, user_color, move_history}], totalPending}` para las partidas con `mate_threats` nulo, en un orden determinista: `played_at` descendente (las recientes primero, que son las que mueven la tendencia) y `match_id` ascendente como desempate.
- `POST /api/chess/matches/:id/threats` con una **unión de dos cuerpos**, validada con zod en el borde:
  - resultado válido: `{status:"ok", faced, neutralized, missed, unpunished, byPhase:{opening,middlegame,endgame}, missedPlies}`, donde cada fase es `[neutralized, missed, unpunished]`;
  - resultado inválido: `{status:"invalid", reason:"illegal_game"|"corrupt_game"}`.
  - **El servidor asigna `v`** (la versión vigente del contrato); un cuerpo que traiga `v` o campos desconocidos se rechaza con 422. El colector no decide la versión.
  - 404 si la partida no tiene detalle; es un reemplazo idempotente.
  - **Invariantes (todas validadas en el servidor; si alguna falla, 422 y no se escribe nada):** `faced = neutralized + missed + unpunished`; la suma de las tres fases coincide con cada total; `missedPlies.length = missed`; `missedPlies` son enteros estrictamente crecientes, entre 1 y el número de plies del historial guardado (el servidor lo lee de la propia fila), y de la paridad que corresponde al color del usuario (solo jugadas mías).

**Datos.** Una columna `mate_threats TEXT` nullable en `match_details` (migración 0018). Contrato versionado, con tres estados que no se confunden:

- `NULL` → **pendiente** (sin analizar).
- `{"v":1,"status":"ok","faced":N,"neutralized":N,"missed":N,"unpunished":N,"byPhase":{"opening":[n,m,u],"middlegame":[…],"endgame":[…]},"missedPlies":[…]}` → **calculada**. Las mismas invariantes del `POST` valen aquí y el JSON no puede representar resultados contradictorios. `faced: 0` es "analizada, sin amenazas", no pendiente.
- `{"v":1,"status":"invalid","reason":"illegal_game"|"corrupt_game"}` → **inválida**: el historial no se puede reproducir. No vuelve a la cola de pendientes, y el dashboard la cuenta aparte.

El lector ignora los contenidos con `v` desconocida (los trata como no calculados para los totales, y los cuenta en un aviso). Subir `v` implica una migración de datos y un nuevo relleno explícitos. Las fases por jugada (≤20, ≤60, resto) son las de la auditoría; no usan `phase_key`.

**Lectura.**
- `GET /api/stats/threats` → totales, por fase, últimas 100 partidas analizadas frente al resto, y cuántas partidas faltan por analizar. Cada tasa con su numerador y denominador, **sin intervalo de confianza**: las posiciones de una misma partida no son independientes y un intervalo de Wilson convencional sería engañosamente estrecho. Un bootstrap agrupado por partida queda fuera de esta iteración; si se añade, es una decisión aparte. La tarjeta dice explícitamente que son tasas descriptivas de posiciones observadas.
- Filtro `?missedThreat=1` en `/api/matches` (partidas con `missed > 0`).

**Dashboard.** Tarjeta "Amenazas de mate": tasa, denominador, desglose fallada/sin castigo, por fase, reciente frente al resto, un aviso cuando faltan partidas por analizar, y un acceso a "partidas donde no viste el mate" que aplica el filtro. En el visor de una partida analizada, los plies fallados se listan para saltar a ellos.

**Relleno.** El primer run del job procesa los pendientes por tandas (las 1.643 partidas, ≈ 7 min en Node); no hay escritura manual en producción, salvo la migración 0018, que se aplica a mano antes de fusionar (el deploy falla con migraciones pendientes).

## Permisos de `IMPORT_TOKEN`

`IMPORT_TOKEN` es una credencial de máquina única: da acceso de escritura a todas las rutas de máquina, y el diseño no la divide en alcances. Las dos rutas nuevas la usan sin ampliar lo que ya puede hacer, y se limitan así:

- `GET pending-threats` es de solo lectura y devuelve únicamente `match_id`, `user_color` y `move_history`.
- `POST …/threats` solo puede modificar la columna `mate_threats` de una fila existente de `match_details`; no crea filas ni toca otras columnas. El cuerpo se valida con zod en el borde (tipos, rangos, tamaño máximo de `missedPlies`, `v` y `status` conocidos).
- El job del colector usa el secreto existente (`MERIDIAN_IMPORT_TOKEN`) y no imprime jugadas ni identificadores en los logs.
- Queda como riesgo aceptado, no resuelto: quien tenga el token puede escribir `mate_threats` de cualquier partida. Separar alcances sería un cambio de plataforma aparte.

## Restricciones

- `chess.js` ya es dependencia; el dominio sigue sin hono/zod.
- Wording descriptivo, bajo las pruebas de redacción epistémica existentes.
- Dos PRs: Meridian (migración, dominio, script, API, dashboard) y colector (workflow + prueba del workflow). El orden: migración, PR de Meridian, PR del colector.

## Decisiones mías (a revisar)

- La referencia fijada del checkout es un SHA o tag de Meridian, subido a mano; no `main`, porque el job corre con `IMPORT_TOKEN`.
- Una sola columna JSON, no varias, para no multiplicar migraciones al ajustar el desglose.
- Presupuesto de tiempo del job: 12 min de reloj para encadenar tandas (de 100 partidas) dentro del límite de 15 min del job.
- Orden de recuperación de pendientes: recientes primero (`played_at` descendente), `match_id` ascendente como desempate.
- El orden de los pesos de la métrica y la forma `[neutralized, missed, unpunished]` por fase son míos; se pueden cambiar mientras `v` siga en 1.
