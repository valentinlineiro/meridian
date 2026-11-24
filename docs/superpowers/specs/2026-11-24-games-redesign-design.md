# Games rediseñado por utilidad (diseño)

Fecha: 2026-11-24 · Estado: borrador para aprobación del dueño · Tamaño: cambio mediano (solo front end)

## Intención y por qué

El dueño registra a mano cada día sus tiempos de LinkedIn Games y quiere dos cosas de `/games`: ver de un vistazo cómo va en cada juego, y registrar sin que el registro ocupe la pantalla. Lo quiere con la misma idea que Ajedrez: un periodo elegido, un resumen, una comparación y el detalle plegado. Dijo que casi nada de la app le da valor; Umami solo lleva horas contando, así que esto se decide por su descripción de uso y no por medición.

Hoy `/games` abre con seis filas de "hoy" (una por juego) y un botón, luego una tarjeta por juego, y tres plegables de análisis: "Por día de la semana", "Trayectoria" y "Dificultad de los últimos días".

## Objetivos

1. Arriba, una frase de cómo vas y el selector de periodo.
2. Una fila por juego con: veredicto, cuánto más rápido o lento que la media de LinkedIn, el cambio frente al periodo anterior, el porcentaje de partidas en que le ganas a la media y las últimas 14 partidas en barras.
3. El registro es una línea de estado ("Hoy · N registrados") y un botón; la hoja de registro ya existente se abre al pulsarlo.
4. El detalle (por día de la semana) queda plegado en un solo bloque.
5. Cada acción nueva se puede contar en Umami.

## No objetivos

- Tocar el informe por juego (`/games/<juego>`), la hoja de registro, el backend o las migraciones.
- Cambiar los periodos: los calcula el servidor (4 semanas, 3 meses, todo). No se añade "1 año".
- Rachas de registro, avisos o presión por registrar (PRODUCT.md, principio 2).

## Antiobjetivos (fracaso aunque funcione)

- Perder la posibilidad de corregir un registro de hoy o continuar un borrador.
- Un veredicto más fuerte que la evidencia: se mantiene el vocabulario y "Pocos datos".
- Quitar algo que el informe por juego no repita.

## Restricciones

- Plan gratuito de Worker y D1; el resumen es una petición que ya existe.
- Español, un tema oscuro, tokens y vocabulario de veredicto de `web/DESIGN.md`.
- Pruebas `shouldXWhenY`; antes de subir: `typecheck`, `web:lint`, `web:test`, e2e, axe.

## Enfoques considerados

**A. Marcador por periodos (elegido).** Un solo marcador con una fila por juego y detalle plegado. Es lo más parecido a Ajedrez y se hace con datos que el servidor ya devuelve.
**B. Un juego cada vez.** Detalle completo pero comparar seis juegos cuesta seis toques. Descartado.
**C. Solo marcador, sin detalle.** Más corto, pero pierde el día de la semana. Descartado.

## Diseño

### Pantalla de `/games`

1. Título accesible (solo lector), selector de periodo (el existente, en la URL con `?r=`).
2. Línea de registro: "Hoy · N registrados" (o "Hoy" si el día no se pudo leer; desconocido nunca se dice como cero) con el botón "Registrar hoy" o "Editar lo de hoy" y, si hay borrador, "Continuar lo que escribías". Se quitan las seis filas de hoy. El estado de guardado (`#gamesNote`) se mantiene.
3. La frase de resumen (`overview()`), antes de las tarjetas.
4. Las tarjetas, una por juego, en el orden fijo del registro. Cada una enlaza a su informe y añade dos líneas a lo que ya tiene: el cambio frente al periodo anterior (`figures().delta`) y "Le ganas a la media en X % de las partidas" (`windows[range].beat.rate`, con su n; con pocos datos no se muestra el porcentaje).
5. Un bloque plegado "Ver detalle: por día de la semana" con el mapa de derrotas que ya existe y su ayuda.
6. Pie: rango del registro y CSV, sin cambios.

### Qué se quita del hub

- Las seis filas de "hoy" (la hoja se abre con un botón; el informe de cada juego sigue abriendo la hoja en ese juego).
- "Trayectoria": repite la gráfica de evolución del informe por juego.
- "Dificultad de los últimos días": solo contexto, no cambia ninguna cifra.
- El contenedor "Más detalle". Se borra el código que solo ellos usaban en `games.ts`/`games.model.ts` (`trajectory`, `defaultTrajGame`, `difficultyGrid`); `games-chart.ts` se queda porque lo usa el informe.

### Medición

`data-umami-event`: `games-period` en el selector, `games-open` en cada tarjeta, y los eventos de registro que ya existen. Sirve para la revisión del 2026-12-15.

## Qué se deja al constructor

- Maquetación de la tarjeta con las dos líneas nuevas en 390 px, sin que crezca más que hoy ni pierda objetivos táctiles de 44 px.
- Copia exacta de "Le ganas a la media…" y del estado de registro.
- Pruebas: las que apuntaban a las filas de hoy, a Trayectoria o a Dificultad se reescriben o se eliminan; las nuevas cubren la línea de registro (sin leer, 0, parcial y todo), el porcentaje con pocos datos y el plegado de detalle.

## Abierto

- Verificar en el móvil con datos reales (el servidor devuelve `beat` y `delta`; no se ha mirado cómo queda).
- Qué juegos no abre nunca: lo dirá Umami el 2026-12-15.
