# Auditoría de rendimiento y usabilidad — Meridian (2026-11-13)

Commit auditado: `564d838` (main). Sin cambios de código; solo este informe y las capturas.

## Método y límites (leer primero)

- Capturas reales de la app **construida desde main y servida en local** (`wrangler dev` + `web:build`), a **390×844** (`m-*`) y **1200×800** (`d-*`). Carpeta: `shots/`.
- **Los datos son demo/sintéticos** (semilla `demo/` + 45 días de Games que generé; la BD local ya traía restos). No he tenido acceso a producción ni lo he pedido. Por tanto:
  - Los hallazgos de **estructura, texto y diseño** son válidos tal cual.
  - Los de **cifras** (p. ej. "Idiomas sin datos hace 36 días", "Mejor marca 0:05") pueden ser artefactos del demo y van marcados **[verificar con datos reales]**.
- Medido por script a 390 px: sin scroll horizontal en ninguna vista; solo 2 controles <44 px (el enlace "Saltar al contenido" y el logo). **El tamaño táctil está bien.**
- No he probado flujos de escritura (hoja "Registrar hoy") ni estados de carga/error.

## Lo que ya funciona (no tocar)

- Honestidad estadística: "sin evidencia suficiente", intervalos, "Pocos datos" como veredicto propio.
- "Cómo leerlo" / "Cómo sabemos esto" y la tabla alternativa del gráfico (`d-games-expanded.png`).
- Sin desbordes a 390 px; navegación móvil de 4 pestañas + "Más".
- Games por juego (`m-zip-full.png`): una cifra grande, un gráfico por pregunta, subtítulos "menos es mejor" / "le ganas a la media".

---

## P1 — Cambian lo que el usuario entiende

### H1. Games mezcla dos marcos de comparación sin avisar
- **Evidencia:** `m-games-full.png`, `d-games-full.png`, `m-zip-full.png`. Cabecera: **"0 de 6 juegos mejoran"** con 4 barras rojas. Debajo, los seis juegos dicen **"+25 % … más rápido que la media"**. En Zip: **+42 % más rápido que la media**, insignia ámbar **"▼ Bajando"** y frase **"Vas más lento que antes"**.
- **Problema:** "mejoran/bajando" compara contigo mismo en el pasado; "+X %" compara con la media de LinkedIn. La pantalla no dice cuál es cuál. Verde grande + rojo grande en el mismo bloque.
- **Impacto:** la lectura inmediata es contradictoria ("voy bien" y "voy mal"). Es la pregunta central de rendimiento y se responde de forma ambigua.
- **Prioridad:** P1.
- **Mejora:** nombrar el eje en cada sitio: cabecera "0 de 6 mejoran **respecto a ti**"; cifra grande "+42 % vs la media"; insignia "Tendencia: bajando". Mismo vocabulario en tarjeta, informe y Hoy. Revisar que el rojo de la barra de cabecera no se use para "no mejora" cuando el juego va por encima de la media.

### H2. "Qué cambió" ignora Games y dice "No hay actividad registrada"
- **Evidencia:** `m-changes-full.png`: *"No hay actividad registrada entre 2026-10-08 … y 2026-11-13"* mientras Games tiene registros en ese rango (`m-games-full.png`: 179 días registrados, hasta 12 nov). Código: `changes.ts:123` define "vacío" solo con ajedrez e idiomas; las 3 evaluaciones son Salto de ELO, Asimetría por color y Mayor XP diario.
- **Problema:** el resumen transversal omite uno de los tres dominios y afirma ausencia de actividad.
- **Impacto:** afirmación falsa en la vista pensada para "qué ha pasado desde la última vez"; el usuario (que usa mucho Games) aprende que esa vista no sirve.
- **Prioridad:** P1.
- **Mejora:** mínimo, cambiar el texto vacío a "No hay actividad de **ajedrez ni idiomas**…" y mostrar una línea de Games (días registrados, veredictos que cambiaron) o decir explícitamente que Games no está incluido. Decidir si Games entra aquí es decisión de producto; no lo propongo como función nueva.

### H3. Ajedrez: el rendimiento no tiene tendencia a la vista y hay cuatro cifras de acierto
- **Evidencia:** `m-chess-full.png`, `d-chess-full.png`, `d-chess-expanded.png`.
  - Cabecera: "900 ELO · **0 vs primera lectura**".
  - Misma pantalla: **63,3 %** victorias (historial), **60,0 %** (últimas 50), **69,2 %** "SCORE" (tarjeta), **66,0 %** score (últimas 50). Comparación "últimas 50" contra "anteriores · **10**" (80 %).
  - La tarjeta Evolución · ELO dentro del acordeón dice "La evolución aparecerá cuando haya más días de datos".
  - Jerga: "WR", "Score", "victoria 1 · tablas 0,5".
- **Problema:** victorias % y score % se alternan sin explicación; denominadores distintos (60 / 50 / 10); "0 vs primera lectura" no informa. La única gráfica de ELO está plegada y vacía.
- **Impacto:** el usuario no sabe cuál es "su" porcentaje; no ve si va a mejor o a peor sin abrir acordeones.
- **Prioridad:** P1 (es el dominio que más usa, según tu memoria de uso móvil).
- **Mejora:** una cifra de acierto principal con su ventana en el rótulo; "score" solo con una línea de definición (o fuera). Quitar "0 vs primera lectura" cuando es 0 y mostrar "sin cambio desde 8 oct". Sustituir "WR" por "victorias". Ver H6 para el comparativo 50 vs 10.

---

## P2 — Fricción real, no bloqueante

### H4. Hoy no responde "¿qué me falta hoy?" y ocupa espacio con datos vacíos
- **Evidencia:** `m-overview-full.png`, `d-overview-full.png`. La tarjeta de Games muestra "+25 %", barras y "Racha: 57 días", pero **no** si hoy está registrado (eso vive solo en /games: "Hoy · 0 de 6 registrados") ni enlace para registrar. Idiomas ocupa una tarjeta con "—  XP en 7 días" y texto de ausencia. A 1200 px las tres tarjetas ocupan ~35 % de la altura y el resto está vacío.
- **Problema:** la vista "Hoy" no contiene el dato de hoy para Games, que es el dominio de hábito diario.
- **Impacto:** un salto extra para saber si falta registrar; tarjetas con poco contenido útil.
- **Prioridad:** P2.
- **Mejora:** añadir "Hoy: 0 de 6" a la tarjeta de Games (dato que ya existe); si Idiomas está desactualizado, colapsarla a una línea ("Sin datos desde hace 36 días"). El hueco en escritorio es preferencia (ver abajo).

### H5. Gráficas con leyenda incompleta o sin escala
- **Evidencia:** `m-zip-full.png`:
  - La tira de 14 barras verdes/rojas de la cifra grande no tiene eje ni fechas (`Cómo leerlo` explica "cada barra es una de tus últimas 14 partidas con media", pero solo en la página de lista).
  - "Por día de la semana": el pie dice "**En rojo, el día en que más se pierde**" y no hay ninguna barra roja.
  - Línea de tiempos: eje Y "0:07 / 0:44 / 1:21", eje X con solo dos fechas (24/08, 09/11).
  - Tendencia: la línea azul **sube** (más lento) mientras el veredicto es positivo frente a la media, y la leyenda dice "menos es mejor" solo arriba a la derecha en gris.
- **Problema:** hay que leer texto auxiliar para interpretar cada forma; una leyenda describe un elemento que puede no aparecer.
- **Impacto:** carga cognitiva; riesgo de leer "sube = mejora".
- **Prioridad:** P2.
- **Mejora:** poner la leyenda condicional (mostrar la frase del rojo solo si existe); repetir "14 últimas partidas" como pie bajo la tira; marcar en el gráfico de tiempos "↓ más rápido" cerca del eje.

### H6. Estados "datos insuficientes" no dicen cuánto falta ni cuándo
- **Evidencia:** `m-changes-full.png`: tres tarjetas idénticas "Pocos datos · Faltan datos para responder en este periodo". `d-chess-full.png`: "Partidas sugeridas para revisión: disponibles tras el análisis de motor" (sin acción ni estimación); Perfil: "Todavía no hay partidas analizadas"; Evolución: "aparecerá cuando haya más días de datos". Games: "Pocos datos" sin umbral (el umbral "8 partidas" solo aparece en la leyenda del mapa).
- **Problema:** el vacío se declara, pero no se explica qué lo desbloquea.
- **Impacto:** el usuario no sabe si esperar, registrar más o configurar algo.
- **Prioridad:** P2.
- **Mejora:** en cada vacío una frase "necesita N más / se calcula tras X". Para las evaluaciones de "Qué cambió", mostrar en una línea qué dato falta y la ventana, no tres tarjetas iguales. Para "análisis de motor", indicar si es automático o hay que lanzarlo.

### H7. "Racha" significa cuatro cosas distintas
- **Evidencia:** Hoy/Games: "57 días seguidos" y "Tu récord: 122 días"; informe Zip: "Racha **1 día**" (`game-report.html:14`, es otra métrica); Idiomas: "Racha: 108 días"; Ajedrez: "Racha actual: 1 derrota · Mejor racha: 6W".
- **Problema:** mismo rótulo, tipos y unidades distintas, a veces en la misma pantalla (57 días vs 1 día).
- **Impacto:** confusión sobre qué cuenta; contradice la consistencia entre áreas.
- **Prioridad:** P2.
- **Mejora:** reservar "Racha" para días consecutivos jugados; renombrar la de Zip según lo que mida y la de ajedrez a "Resultados seguidos". Verificar qué mide exactamente la de Zip antes de renombrar.

### H8. Idiomas: poca información de rendimiento en pantalla y estados contradictorios [verificar con datos reales]
- **Evidencia:** `m-languages-full.png`, `d-languages-full.png`, `d-languages-expanded.png`.
  - Sin gráfica visible; "— XP en 7 días" con un guion como valor.
  - "Racha: 108 días" a la vez que "Sin datos nuevos desde hace 36 días".
  - El bloque superior **"⚠ Lo que estos datos no pueden decir"** es un `<details>` cerrado (`languages.html:22`) con aspecto de aviso vacío en la parte más prominente (en móvil ocupa un recuadro sin contenido aparente).
  - Escritorio: el selector de curso repite el 🌐 (icono + opción).
  - Todo lo analítico (90 días, XP/sesión, perfil por día) queda tras 3 acordeones.
- **Problema:** la cabecera avisa de limitaciones antes de dar un solo dato; la racha larga y la ausencia de datos no se reconcilian.
- **Impacto:** primera impresión de "error/aviso", y el dato clave (actividad) no está arriba.
- **Prioridad:** P2 (parte puede ser artefacto del demo: la última sincronización es de hace 35 días).
- **Mejora:** mover el aviso de limitaciones al pie o a "¿Cómo sabemos esto?"; si no hay datos recientes, la racha debe decir "hasta el 28 sep". Mostrar la tira de 7 días ya existente arriba en lugar de un guion.

### H9. "Qué cambió" escondido en "Más" en móvil
- **Evidencia:** `m-drawer.png`: la pestaña "Más" abre una hoja con "Qué cambió", Sincronizar, Configuración y Salir. En escritorio "Qué cambió" está bajo "Resumen" junto a Hoy.
- **Problema:** la vista de comparación temporal está a dos toques en móvil, y su nombre no se anticipa.
- **Impacto:** baja descubribilidad de la vista de tendencias; combinada con H2 es poco rentable abrirla.
- **Prioridad:** P2 (menor si H2 se resuelve y la vista aporta valor). No propongo cambiar la barra inferior: hay un acuerdo previo de dejarla aparcada.
- **Mejora:** decidir tras H2; alternativa mínima: enlace "Qué cambió →" desde Hoy.

---

## P3 — Pulido

| # | Evidencia | Problema | Mejora |
|---|-----------|----------|--------|
| H10 | `m-chess-full.png` | Texto pegado "PARTIDASPartidas recientes (10 mostradas)" en móvil; tres filas de chips (Rival/Resultado/Color) ≈ 170 px antes de la primera partida; "ELO —" repetido 8 veces; columnas FIN/REV. casi vacías en escritorio. | Separar con espacio/salto; plegar filtros en móvil; ocultar ELO cuando no hay dato. |
| H11 | medición a 390 px | 117 elementos a 11 px (y 1 a 9 px) en Games; 75 en un informe. Legibles pero justos para tablas/leyendas. | Subir a 12 px el texto que lleva información, no decoración. |
| H12 | `m-games-full.png` | Selector de periodo se parte en dos líneas ("Todo" huérfano); insignia "Pocos datos" casi pegada a "más rápido que la media" en Tango/Wend (no se solapa, ~0 px de aire). | Reducir a 3 opciones visibles o scroll horizontal; dar margen a la insignia. |
| H13 | `m-zip-full.png` | "Mejor marca 0:05" junto a "Tiempo normal 0:51": probable dato atípico **[verificar con datos reales]**. | Si es real, filtrar/etiquetar atípicos. |

## Preferencias estéticas (no son problemas)

- Hoy a 1200 px deja ~65 % de la altura vacía y tres tarjetas del mismo peso. Funciona; es una preferencia de composición.
- Encabezados en mayúsculas con tracking amplio, acordeones con "▸" pequeño.
- Colores de veredicto (ámbar/verde/rojo): coherentes. El único problema es el semántico de H1.
- Tarjetas a un solo ancho en escritorio frente a rejilla de dos columnas en Games: ambas válidas.

## Orden recomendado

1. **H1** y **H2** (textos y una condición; riesgo bajo, efecto alto en la comprensión).
2. **H3** (cifra principal y vocabulario en Ajedrez).
3. **H6/H7** (una pasada de vocabulario y estados vacíos, transversal).
4. **H4, H5, H8** después de comprobar con datos reales qué parte es artefacto.
5. H9–H13 solo si sobran.

**Pendiente:** repetir H3, H7, H8 y H13 con datos de producción (requiere acceso de lectura que no se me ha concedido) antes de dar prioridad definitiva.

## Actualización (2026-11-13): contraste con datos de producción

Export de solo lectura (matches, elo_observations, account_observations, xp_summaries, snapshots).

- **H8** era sobre todo artefacto del demo: datos al día (última observación 2026-11-13, racha 1126, 142 días de XP seguidos). Baja a P3; queda solo mover el aviso de limitaciones.
- **H3** se confirma en lo estructural (cuatro cifras de acierto distintas: 62,2 / 64,0 / 66,1 / 67,0 %). "Anteriores · 10" y "0 vs primera lectura" eran demo (real: 50 vs 50 partidas, ELO 992 → 900). Resuelto en #201 y #202.
- **H6, H7:** resueltos en #200.
- **Siguen abiertos:** H13 (requiere las tablas de Games, no exportadas); umbral en la frase "Pocos datos" de Games; confirmar si el análisis del motor es automático antes de decirlo en la interfaz.
