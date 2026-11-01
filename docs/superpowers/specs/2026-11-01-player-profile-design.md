# Perfil de jugador — diseño

## Intención

El estudio con motor del 2026-10-30 (1.643 partidas, ver `~/code/experiments/meridian-engine-study/README.md`) encontró lo que ninguna estadística actual de Meridian ve: el problema no es el repertorio ni el ELO, sino perder de golpe posiciones jugables (9,7 errores graves por 100 jugadas; 423 de 492 derrotas tienen un momento decisivo, mediana en la jugada 10). Meridian debe medir eso de forma continua y llevar a las partidas donde ocurrió, para que el jugador pueda trabajar sobre sus propios errores y comprobar si mejora.

## Qué se mide

Cada partida con historial legible se evalúa con Stockfish a profundidad 12, posición a posición. Desde el punto de vista del propietario, con la evaluación recortada a ±1000 cp:

- **Pérdida de una jugada** = evaluación antes − evaluación después (≥ 0). **Error grave** = pérdida ≥ 300 cp.
- **Fases** por ply de mi jugada: apertura ≤ 20, medio juego ≤ 60, final > 60 (las mismas que las amenazas de mate).
- **Momento decisivo** = primera jugada propia con evaluación antes > −150 y después ≤ −300 que además es un error grave (pérdida ≥ 300) y tiene una respuesta del rival en el registro. (La prueba de aceptación contra el estudio mostró que la línea base ya incluía esas dos condiciones.)
- **Ventaja sostenida** = 3 posiciones consecutivas con evaluación propia ≥ +300; **desventaja sostenida** = 3 consecutivas ≤ −300.
- **ACPL** = pérdida media por jugada propia, en centipeones.

Estas definiciones son la versión 1 del contrato y coinciden con la línea base. Referencia medida: 9,7 errores graves por 100 jugadas; 1.287 partidas con ventaja sostenida, 78 % ganadas; 49 % de victorias partiendo de desventaja sostenida; 179 ventajas sostenidas perdidas.

## Metas

- Un **perfil** (pestaña nueva) con: calidad de juego (errores graves por 100 jugadas global, por fase y por color; ACPL; tendencia por bloques de 50 partidas), momentos decisivos, ventaja y remontada, y las amenazas de mate ya existentes.
- Una **revisión**: lista de partidas ordenada por ACPL (peores y mejores) y, en el visor, los errores graves de la partida con la jugada que prefería el motor.
- Un **marcador de experimento**: poder fijar una partida de corte y ver las cifras anteriores y posteriores a ella.
- Las partidas nuevas se analizan solas.

## No metas

- Ninguna nota global, "nivel", radar ni título derivado del motor.
- Rescates y "mejores jugadas": no están en esta versión (los rescates miden errores del bot; las jugadas únicas necesitan MultiPV 2 y se decidirán después).
- Clasificación de patrones de error (captura perdida, pieza atacada ignorada): fase posterior.
- No toca el guardado de partidas ni su ruta de ingesta.

## Antimetas

- Cifras sin su denominador (partidas o jugadas), o presentadas como medida definitiva de nivel. Casi todas las partidas son contra bots (98 %): el perfil lo dice y no extrapola a humanos.
- Mezclar versiones de la definición en la misma cifra.
- Romper la ingesta por un cálculo que excede el límite de CPU del Worker.

## Diseño

**Dónde se calcula.** En Node, no en el Worker (Stockfish no cabe en 10 ms de CPU). Una función pura de dominio `summarizeEngineGame(evals, bests, sans, userColor)` convierte las evaluaciones en el resumen de la partida y se prueba sin motor. El motor (Stockfish.js 19.0.1, WASM, un hilo, `Hash 16`) lo invoca solo el script `scripts/analyzeEngine.ts`.

**Dónde se ejecuta.** Igual que `threats.yml`, en el repositorio del colector: workflow propio, `workflow_dispatch` y `workflow_run` tras el sync, interruptor por variable de repositorio, checkout de Meridian en una referencia fijada, solo el secreto del token de importación. Instala la dependencia del motor con `npm ci --omit=dev --ignore-scripts`. Reanudación, atomicidad y reintentos son los del indicador de amenazas: cola `engine_eval IS NULL`, orden `played_at` descendente, un `UPDATE` por partida, tandas con presupuesto de tiempo, reintentos acotados solo para errores transitorios.

**Datos.** Columna `engine_eval TEXT` nullable en `match_details` (migración 0019). Estados: `NULL` pendiente; ok:

`{"v":1,"status":"ok","moves":N,"loss":N,"byPhase":{"opening":[moves,serious],"middlegame":[…],"endgame":[…]},"decisivePly":N|null,"sustainedAdv":bool,"sustainedDis":bool,"minEval":N,"maxEval":N,"worst":[{"ply":N,"loss":N,"best":"e2e4"}]}`

o inválido `{"v":1,"status":"invalid","reason":"illegal_game"|"corrupt_game"|"engine_error"}`. `loss` es la pérdida total en centipeones (entero) y el ACPL se calcula al leer (`loss / moves`). `worst` contiene solo errores graves (pérdida ≥ 300), como máximo 5, ordenados por pérdida descendente; puede estar vacío. Invariantes (el servidor las valida y rechaza con 422 sin escribir): `moves` = suma de movimientos por fase; `serious` por fase ≤ movimientos de la fase; `worst` son plies enteros de la paridad del color del propietario, dentro del historial guardado, sin repetir, con pérdidas enteras entre 300 y 2000, y `serious` total ≥ `worst.length` (el servidor no puede recalcular el motor: valida forma y coherencia, no la evaluación). El servidor asigna `v`; el colector no la envía. Reeditar el historial de una partida con otro `move_history` pone `engine_eval` a `NULL` (misma cláusula que `mate_threats`).

**API.** Rutas de máquina como las de amenazas: `GET /api/chess/matches/pending-engine?limit=N` (máx. 100) y `POST /api/chess/matches/:id/engine`, cuerpo unión estricta de zod, campos desconocidos rechazados. Lectura para el panel: `GET /api/stats/profile` con totales, por fase, por color, tendencia por bloques de 50 partidas consecutivas por `played_at`, momentos decisivos y ventaja/remontada, siempre con denominadores. El lector trata versión desconocida, JSON malformado o contadores contradictorios como "desconocido" y lo cuenta aparte.

**Interfaz.** Pestaña «Perfil» con tarjetas: calidad de juego, momentos decisivos, ventaja y remontada, amenazas de mate (reutiliza la tarjeta existente) y revisión (lista de partidas por ACPL con enlace al visor). El visor muestra los errores graves de la partida y salta a la jugada anterior al error, como ya hace con las amenazas. La partida de corte del experimento se pasa como parámetro `?since=<match_id>` (se resuelve a su `played_at`) y el navegador la recuerda en `localStorage`; no hay migración ni ajuste en servidor. Las cifras de calidad de juego, momentos decisivos y ventaja/remontada se muestran antes y después del corte; el resto del perfil no se divide.

## Convenciones fijadas

- **Entrada y plies:** igual que las amenazas de mate. La cola devuelve `match_id`, `user_color` (de `matches`) y `move_history`; el ply es 1-based y la paridad del propietario es la de su color.
- **Referencia autoritativa:** los scripts del estudio (`analyze.mjs`, `profile.mjs`). Se recorta la evaluación a ±1000 *antes* de calcular la pérdida (`max(0, antes − después)`); un mate se mapea a ±(10000 − distancia) y luego se recorta; la posición final con mate suma ±10000; las partidas con jugadas ilegales o historial corrupto son `invalid` y quedan fuera de todos los denominadores. La prueba de aceptación compara la salida de `summarizeEngineGame` partida a partida con las evaluaciones guardadas del estudio (`audit/all.jsonl`), no solo el 9,7 global.
- **Agregados de ventaja y remontada:** el resultado sale de `matches.result`; las tablas cuentan victoria, tablas y derrota por separado y las tablas no cuentan como victoria.
- **Contexto de oponente:** el porcentaje de bots se calcula en vivo con `matches.opponent_type`; no es texto fijo.

## Fases

1. Contrato, dominio y columna (migración 0019, aplicada y confirmada antes de fusionar), rutas de máquina y script con motor.
2. Workflow del colector (apagado) y relleno manual de las ~1.650 partidas. La cifra de referencia debe reproducirse: 9,7 ± 0,1 errores graves por 100 jugadas.
3. `/api/stats/profile` y pestaña «Perfil».
4. Revisión en lista y visor, y marcador de experimento.
5. (Futuro) patrones de error y jugadas únicas, si el uso lo justifica.

## Decisiones del autor del diseño (a revisar)

- Pestaña nueva en vez de tarjetas en el dashboard actual: son demasiadas cifras.
- Profundidad 12 y las constantes de la línea base, para que los números sean comparables. Cambiarlas exige `v: 2` y reanalizar todo.
- Un hilo y `Hash 16` fijos para que dos ejecuciones den la misma evaluación.
- La revisión por ACPL exige un mínimo de 20 jugadas propias y excluye partidas pendientes o inválidas, como el ranking del estudio. La tendencia usa bloques completos de 50 partidas; el último bloque incompleto se rotula como tal.
- La implementación puede empezar antes de las 50 partidas del experimento: no cambia cómo se juega. Ver el panel mientras se juega sí puede cambiarlo; es decisión del jugador.

## Queda para quien construya

- Nombres de funciones, de la ruta de lectura y estructura de tarjetas, siguiendo el patrón de amenazas.
- Estimar y fijar el presupuesto de tiempo por tanda según lo que tarde el motor en Actions (referencia local: ≈ 17 min para 1.643 partidas con 4 procesos).
