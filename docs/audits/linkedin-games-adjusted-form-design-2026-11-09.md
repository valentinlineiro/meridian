# Diseño: forma ajustada por dificultad, dificultad del día y mapa de derrotas (LinkedIn Games, 2026-11-09, rev. 2)

Estado: **aprobado e implementado** (decisión §5.1: intervalo por bootstrap; §5.2 se mantiene). **Todas las cifras salen del Excel v54; no se han contrastado con producción (D1), que no se ha leído.** Sigue pendiente (§5.3). Parte de la vista de lectura P0 y la interpretación P1 (`f77fc30`). Análisis exploratorio reproducible en `linkedin-games-adjusted-form/explore_1.py` y `explore_2.py` (leen `linkedin_games_historico_actualizado_v54.xlsx`, hoja `Historico_494`; 830 resultados, 176 días, 2026-05-17..2026-11-09; **no es una lectura de producción**).

## 1. Problema
El dashboard resume el rendimiento con «gana a la media» y eficiencia (`media/tiempo`). Ambas dependen de la dificultad del día, y la dificultad cambia de forma sistemática con el día de la semana. El comentario de `GameStats.ts` afirma que la eficiencia «ya normaliza la dificultad del día»; **los datos lo contradicen** (§2.2).

## 2. Qué dicen los datos
**2.1 La dificultad domina.** Tiempo medio de la gente (media geométrica, todos los juegos): 29 s el lunes, 109 s el domingo (×3,7). El tiempo propio: 20 s → 48 s (×2,4). «Gana a la media»: 76 % el lunes, 97 % sábado y domingo. Queens: 46 % el lunes, 100 % de viernes a domingo. Tango: 25–44 % de lunes a miércoles, 78–100 % de jueves a domingo. La sección «Por día de la semana» (#139) mide por tanto sobre todo dificultad.

**2.2 La eficiencia no neutraliza la dificultad.** Elasticidad del tiempo propio respecto al tiempo de la gente (pendiente en log-log): Mini Sudoku 0,48; Patches 0,66; Queens 0,35; Tango 0,22 (r = 0,30); Wend 0,99; Zip 0,58. Con elasticidad < 1 los días duros inflan la eficiencia y los fáciles la hunden.

**2.3 Mejora real que el win rate no ve.** Residuo = log(tiempo propio) − ajuste sobre log(media del día), por juego. Pendiente del residuo por 30 días (IC 95 % ingenuo): Mini Sudoku −8,3 % ±1,8; Zip −7,5 % ±3,7; Queens −3,3 % ±2,0; Patches, Tango y Wend dentro del ruido. Mini Sudoku gana el 98 %: saturado.

**2.4 No hay «día bueno» global.** Correlación del residuo entre juegos el mismo día: −0,19..+0,22; el factor día explica el 28 % de la varianza; autocorrelación del residuo diario lag 1 = 0,25, lag 7 = 0,30. Se trata cada juego por separado.

**2.5 Derrotas.** 104 de 830; el 35 % por menos de un 15 % de diferencia con la media. Por juego: Queens 31, Zip 27, Tango 22 (35 % de sus partidas), Patches 21, Mini Sudoku 3.

**2.6 Anómalos.** 20 resultados con z > 2 (lentos); el peor, Mini Sudoku 336 s (gente 120 s) el 2026-06-26, z = 6,6, probablemente una interrupción. Distorsionan medias y ajustes por mínimos cuadrados.

**Limitaciones.** La «media» es la que publica LinkedIn; su composición (más ocasionales en fin de semana) es desconocida. Tango y Wend tienen 63 observaciones (≈ 9 por día de la semana). El IC ingenuo ignora la autocorrelación semanal y es optimista.

## 3. Alcance
Tres bloques, un PR por bloque y en este orden. **Fuera de alcance** (posible rev. 2): regularidad por juego, lista de anómalos, reescribir «Por día de la semana».

### A. Forma ajustada por dificultad (cifra principal de cada juego)
- **Modelo por juego:** `log(tiempo) = a + b·log(media)` ajustado con **Theil-Sen** (ya existe `theilSenSlope`; robusto a anómalos, sin umbral de exclusión). Solo con `n ≥ 60` observaciones con media; si no, «Aún pocos datos».
- **Residuo** `r = log(tiempo) − (a + b·log(media))`. **Forma de una ventana** = `1 − exp(mediana(r))`: «un X % más rápido (o más lento) de lo que pedía la dificultad de esos días». Ventanas existentes: Semana / 4 semanas / 3 meses / Todo. Se muestra siempre con n.
- **Tendencia (rev. 2):** pendiente de Theil-Sen de las medianas semanales del residuo en 112 días (16 semanas), por 28 días. El ruido se obtiene **barajando bloques de 4 semanas consecutivas** de las medianas centradas (*moving block*, 1000 remuestreos, semilla fija): `noise` es el rango 2,5–97,5 % de las pendientes que produce una serie sin tendencia. Los bloques conservan que una semana se parece a la anterior (autocorrelación semanal observada: 0,3–0,5 en Queens y Zip; 0,78 en Mini Sudoku, que además tiene tendencia). Las semanas sin resultados se omiten.
- **Elección del bloque (simulación, 16 semanas, 300 series por celda):** muestreo semanal independiente (bloque 1) etiquetaba una tendencia inexistente en el **25–46 %** de las series con dependencia 0,5–0,8; un bootstrap de residuos alrededor de la recta quedaba demasiado estrecho incluso sin dependencia (falsos avisos 17 %). Con bloques de 4: falsos avisos **8 %** con dependencia 0 y 0,5 y **16 %** con 0,8; potencia para una tendencia de 5 % cada 28 días ≈ 20–27 %. 4 divide a 16 y equivale a un mes; 5, 6 y 8 fueron peores o erráticos. Es una convención, no una verdad universal; el nivel nominal (5 %) no se alcanza con tan pocas semanas. Pruebas: `adjustedForm.test.ts` (ruido AR(1) 0,5 sin tendencia: < 15 % de etiquetas; tendencia clara: «mejora»).
- **Veredicto** (vocabulario aprobado): «Al alza» / «A la baja» si la pendiente queda fuera del rango de ruido y la cobertura ≥ 60 %; «Sin señales de cambio» si queda dentro; «Aún pocos datos» si no hay `n` o cobertura. **Sin dos semanas de confirmación ni bandas calibradas**: es una decisión abierta (§5.1).
- Reemplaza a la eficiencia como cifra principal; la eficiencia y P1 se mantienen, no se tocan, y el comentario de `GameStats.ts` se corrige.

### B. Dificultad del día
- Dificultad del juego ese día = `log(media)` frente a la mediana de `log(media)` del mismo juego y día de la semana. Terciles **por juego y día de la semana** con todo el historial → «fácil / normal / duro». Con menos de 8 observaciones en la celda: sin clasificar.
- Dificultad del día = moda de los juegos clasificados (empate → «normal»). Se muestra como tira en la trayectoria y como etiqueta en la tabla («ganaste un día fácil»). No entra en ningún cálculo; es contexto.

### C. Mapa de derrotas
- Cuadrícula juego × día de la semana: tasa de derrota, n, e intervalo de Wilson; celdas con n < 8 en gris (misma regla que «Por día de la semana»). Fila adicional por juego: porcentaje de derrotas por menos de un 15 %.
- Se nombra siempre la combinación con la tasa más alta entre las celdas con ≥ 8 partidas (sin umbral mínimo de tasa; rev. 2). Texto llano: «Donde más pierdes: Queens los lunes (64 %, 24 partidas)». Sin fórmulas en pantalla; criterio detrás de «Cómo se calcula».

## 4. Arquitectura (Engineering Constitution)
- Dominio puro nuevo `AdjustedForm.ts` (ajuste, residuo, bootstrap, dificultad, mapa), con `theilSenSlope`, `median` y `percentile` reutilizados. `GameStats.summarize` añade `adjusted`, `difficulty` y `lossMap` a `GameSummary`/`Summary`; ninguna ruta ni caso de uso nuevos (la lectura ya existe).
- Frontend: reutiliza `app-section`, `app-segmented`, `app-verdict`, `app-help`, `core/words`; palabras nuevas solo en `words.ts`.
- Pruebas `shouldXWhenY`: datos sintéticos con elasticidad y mejora conocidas (el ajuste las recupera); anómalo de 336 s no mueve el ajuste; semilla fija da IC idéntico; celdas con n < 8; golden con un recorte del Excel.

## 5. Decisiones abiertas
1. **Veredicto de A:** IC por bootstrap al leer (propuesto) frente a bandas calibradas fuera de línea como P1. El bootstrap es más simple pero no controla falsos avisos como P1 (§2.4 lo hace con 52 evaluaciones/año). Alternativa: reutilizar `p1_calibrate.py` sobre el residuo.
2. **Juegos con n < 60 (Tango y Wend hasta ≈ 2026-11-20):** «Aún pocos datos» (propuesto).
3. **Validar con producción**: este diseño usa el Excel v54; una lectura de solo lectura de D1 confirmaría que coinciden (requiere permiso expreso). **No realizada.**
4. **CPU en Workers (plan Free, 10 ms; `OPERATIONS.md`):** en Node el resumen pasa de ≈ 106 a ≈ 126 ms (+20 ms, tras ordenar con `Float64Array`); no equivale a CPU de Workers. Medir el tiempo real tras el despliegue (panel de Workers o `wrangler tail`) y, si el resumen no cabe, calcular `adjusted` fuera del Worker como el resto de cálculos pesados.

## 6. Plan de PR
1. Dominio `AdjustedForm` + pruebas + corrección del comentario de eficiencia. 2. UI de A. 3. B. 4. C. Cada fusión espera un «mergea» explícito.
