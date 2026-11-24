# Ajedrez por periodos: ELO, puntos fuertes y débiles (diseño)

Fecha: 2026-11-24 · Estado: borrador para aprobación del dueño · Tamaño: proyecto

## Intención y por qué

El dueño abre Meridian sobre todo por Ajedrez y dice que la mayor parte de la app no le da valor. Lo que quiere de Ajedrez, en sus palabras: su ELO actual, su tendencia de ELO, sus puntos fuertes y débiles, estadísticas por color, qué aperturas le funcionan mejor, qué finales también, y su perfil de jugador. Las partidas pasan a un submenú, solo para revisarlas. Lo quiere visual y por periodos de tiempo.

Hoy la pantalla abre con una racha, una barra de victorias, un aviso de revisión y una lista de 10 partidas. Las estadísticas están colapsadas y ninguna admite un periodo: el resumen, las aperturas y las fases leen todas las partidas (`handleStatsBundle`, `handleStatsOpenings`, `handleStatsPhases` en `src/api/stats.ts`), y solo `/api/stats/profile` acepta `since`.

## Objetivos

1. Arriba: ELO actual y su tendencia en el periodo elegido, con una gráfica de línea.
2. Puntos fuertes y débiles: una comparación directa con el porcentaje de cada punto y el número de partidas que lo respalda.
3. Rendimiento por color, aperturas (de mejor a peor) y partidas largas, todo filtrado por periodo.
4. Selector de periodo: 30 días, 90 días, 1 año, todo. El cambio de periodo es instantáneo, sin nueva petición.
5. "Tu perfil de jugador" accesible desde la pantalla, siguiendo el mismo periodo.
6. Las partidas salen de la pantalla principal a un submenú.

## No objetivos

- Tipo de final (torres, peones, alfil contra caballo): no está en los datos. Ver "Finales" abajo.
- Comparar con otros jugadores, objetivos de ELO, notificaciones o racha como presión (PRODUCT.md, principio 2).
- Tocar Games, Idiomas o Qué cambió en este proyecto.
- Borrar código en la primera entrega (ver "Declutter").

## Antiobjetivos (fracaso aunque funcione)

- Un veredicto más fuerte que la evidencia: un punto fuerte con 3 partidas.
- Mezclar periodos sin decirlo: cada cifra muestra su ventana y su n.
- Aumentar las lecturas de D1 respecto a hoy.

## Restricciones

- Plan gratuito de Worker (CPU) y de D1: nada de leer filas crudas para agregarlas en el Worker.
- Las migraciones son manuales: este diseño no necesita ninguna.
- Los registros diarios son append-only; los datos de partidas no se reescriben.
- Datos reales solo con una concesión nueva del dueño: las pruebas usan los datos de demo.
- Copy en español, un solo tema oscuro, tokens y vocabulario de veredicto existentes (`web/DESIGN.md`).
- Arquitectura limpia validada en CI (`scripts/check_architecture_boundaries.py`); pruebas con nombre `shouldXWhenY`.
- Antes de subir: `npm run typecheck`, `web:lint`, `npm test`, `web:test`, e2e.

## Enfoques considerados

**A. Parámetro `since` en cada endpoint.** Cambio mínimo, similar al perfil. Cada cambio de periodo lanza varias consultas a D1 y no permite comparar periodos entre sí.

**B. Un endpoint con agregados semanales (elegido por el dueño).** Una petición, agregados por semana, el cliente suma las semanas del periodo. Cambio de periodo instantáneo, menos lecturas en D1 (hoy `handleStatsBundle` lee todas las filas con un `JOIN`), y permite "este periodo contra el anterior".

**C. Calcular en el cliente con la lista de partidas.** Descartado: obliga a lecturas amplias, justo lo que la nota de sobrecarga de D1 deja abierto.

## Diseño

### Datos: `GET /api/stats/chess-weekly`

Una agregación SQL (`GROUP BY`) sobre `matches LEFT JOIN match_details`, sin devolver filas crudas. Cada semana empieza en lunes UTC (`played_at` son segundos Unix, ver `extractPlayedAt`). Por semana:

- `week` (fecha ISO del lunes) y `games`.
- `w`, `d`, `l` en total y por `user_color` (`white`/`black`).
- Por `opening_family` (y por `opening_key` si cabe): `w`, `d`, `l`.
- Por `phase_key`: `w`, `d`, `l`, más `disconnections`, siguiendo la regla P3 ya existente en `handleStatsPhases` (una derrota por desconexión no cuenta como evidencia de cómo juega esa fase; se resta de la cifra "competitiva" y se cuenta aparte).
- `eloEnd`: el último `elo_after` de la semana; si falta, el ELO de la instantánea más cercana (la serie `timeline` que ya calcula `snapshotElos`).

Las partidas sin `played_at` no pertenecen a ninguna semana: solo cuentan en el periodo "todo" y la respuesta incluye `undated` con su número, para que la cifra de "todo" sea honesta.

El endpoint usa el mismo control de acceso y el mismo `userId` que los demás `/api/stats/*`. Cabeceras de caché como las del bundle actual.

### Cliente

- Un único recurso carga las semanas; un selector segmentado (`web/src/app/shared/segmented.ts`) elige 30 d / 90 d / 1 a / todo. Las funciones de suma por periodo son puras y se prueban sin red.
- "Periodo anterior" = las semanas de la misma longitud justo antes; se usa para la flecha de tendencia y para saber si un punto mejora o empeora.
- Muestra mínima (decisión mía, ajustable): con menos de 8 partidas un punto aparece atenuado con la etiqueta "pocas partidas" y no entra en la lista de fuertes y débiles.

### Pantalla (de arriba abajo)

1. ELO actual, variación en el periodo y gráfica de línea (`eloEnd` por semana). Una línea de texto con la forma reciente sustituye al héroe actual.
2. Puntos fuertes y débiles: barras divergentes respecto a tu porcentaje medio del periodo, con `n` en cada una; los mejores arriba y los peores debajo.
3. Por color: barras apareadas blancas/negras.
4. Aperturas: ordenadas de mejor a peor, con `n` y el porcentaje.
5. Partidas largas: resultados según la fase (ver "Finales").
6. "Tu perfil de jugador": enlace al perfil existente (`/profile`), que ya acepta `since`, con el mismo periodo.
7. "Partidas": entrada al submenú.

### Finales: qué dicen realmente los datos

`phase_key` se calcula por la longitud de la partida (`classifyPhase` en `src/analytics/phases.ts`: menos de 40 plies es apertura, 40–80 medio juego, más de 80 "final"). No dice si jugaste un final. Por tanto:

- El bloque se llama "Partidas largas (más de 80 jugadas)" y muestra tus resultados en ellas, sin llamarlo "finales".
- Los errores graves por fase del motor salen de `engine_eval` y del perfil existente, y no de `phase_key`.
- El tipo de final real exigiría clasificar la posición final; queda fuera de este proyecto y se anota como pendiente.

### Submenú de partidas

La lista actual (filtros, tabla, visor de partida, exportar CSV) se mueve a `/chess/partidas`, resuelta con un matcher como el de `/games/:game`. Las URL antiguas de `/chess` siguen funcionando y abren la pantalla nueva. El aviso de partidas sugeridas para revisión se muestra dentro del submenú, no en la pantalla principal.

### Declutter (entrega gentil)

En la primera entrega se oculta, no se borra: racha y barra del héroe, banner de revisión (movido), la lista de 10 partidas, y el bloque "Estadísticas" colapsado, cuyo contenido se redistribuye en la pantalla nueva. Cuando los números de Umami confirmen el desuso (revisión prevista el 2026-12-15), se elimina el código muerto en una PR aparte.

## Qué se deja al constructor

- La consulta SQL exacta y su forma de bucketizar por semana UTC; el nombre de los campos.
- El componente de gráfica de línea (hay `sparkline` y `games-chart`; la gráfica con ejes es nueva) y las reglas de color y accesibilidad (tabla de datos equivalente, contraste ≥ 4,5:1, objetivos táctiles de 44 px en móvil).
- Los textos finales en español, siguiendo el vocabulario de veredicto del diseño.
- Pruebas: la agregación (semanas vacías, partidas sin `played_at`, desconexiones, semana de 1 partida), las sumas por periodo, el acceso al endpoint, el matcher de `/chess/partidas` y el e2e del flujo.

## Abierto

- Verificar con datos reales (requiere una concesión de lectura del dueño) cuántas partidas tienen `elo_after` y `played_at`, y si la serie semanal de ELO tiene huecos.
- Tipo de final: pospuesto, no hay datos.
- Si el rendimiento por apertura por semana pesa demasiado, agregar por mes en el periodo "todo".
