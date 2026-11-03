# Estudio: LinkedIn Games en Meridian (2026-11-03)

## 1. Estado actual
- Slice `src/slices/linkedin-games` (PR #55): entrada manual de 6 juegos (zip, tango, queens, mini_sudoku, patches, wend), merge diario en servidor, versiones en `snapshots.raw_json`. Sin lectura: solo `GetDay`.
- Contrato 2026-10-13: `game_results`, vistas y colector fuera de alcance "hasta que haya una lectura concreta". Pinpoint y CrossClimb excluidos.
- Fuente sin backfill: cada dia no capturado se pierde.

## 2. Datos (Excel v48, 2026-05-17..2026-11-03)
- 794 filas, 170 dias, solo falta 2026-09-16. Fechas mezcladas (644 texto ISO, 150 datetime) pero parseables al 100%; sin duplicados dia-juego una vez parseadas. Calidad suficiente para backfill tras normalizar.
- `Win` = tu tiempo < media global (inferido de Eficiencia_x = media/tu tiempo). No es victoria/derrota.

| Juego | n | Gana a la media | Eficiencia 1a mitad | 2a mitad | Ult. 14 | Mejor (s) | Racha actual |
|---|---|---|---|---|---|---|---|
| Patches | 170 | 88% | 1.76 | 2.11 | 1.73 | 5 | 14 |
| Queens | 170 | 82% | 1.56 | 2.08 | 1.74 | 19 | 1 |
| Sudoku | 170 | 98% | 1.60 | 2.04 | 2.17 | 33 | 129 |
| Tango | 57 | 65% | 1.30 | 1.13 | 1.13 | 32 | 1 |
| Wend | 57 | 100% | 2.23 | 2.50 | 2.54 | 9 | 57 |
| Zip | 170 | 84% | 1.50 | 1.83 | 2.03 | 4 | 5 |

Hallazgos:
1. Mejora real en 5 de 6 juegos (eficiencia 2a mitad > 1a). **Tango es el unico que empeora** (1.30 -> 1.13) y el unico por debajo del 70%.
2. Efecto fin de semana fuerte (Queens 1.50 entre semana vs 2.40 en finde; Tango 1.08 vs 1.41): la media global sube/baja con la dificultad y el publico; comparar solo contra la media enmascara esto.
3. Correlacion tu tiempo vs media global entre 0.32 (Sudoku) y 0.81 (Wend): parte de tu variacion es dificultad del puzzle, no tuya. Una lectura util es el residuo (tu tiempo ajustado por la media del dia).
4. Racha de dias jugados: actual 48, maxima 122 (con el hueco del 09-16 sin confirmar si fue dia sin jugar).
5. Columnas Ahorro/Eficiencia/Win son derivadas: en Meridian se calculan, no se almacenan.

## 3. Lecturas candidatas (ordenadas por valor/coste)
1. **Tendencia de eficiencia por juego** (mediana movil 14 dias) y alerta de regresion (Tango). Coste bajo, solo lectura sobre historial.
2. **Rachas** (dias jugados, ganar a la media) y mejores marcas (PB y fecha).
3. **Ajuste por dificultad**: tu tiempo vs media del dia, separando finde.
4. Resumen semanal ("que cambio"), encajaria con el patron de `whatChanged` ya existente en chess.
Descartable por ahora: percentiles de comunidad (la fuente solo da la media).

## 4. Modelo
- Opcion A (recomendada para empezar): vista de solo lectura que expande `raw_json` (ultima version por fecha, regla L2). Sin migracion ni enmienda de observaciones. Limite: recorrer snapshots por usuario; con ~170 dias x 1 fila/dia es trivial en D1.
- Opcion B: tabla `game_results(user_id, date, game, seconds, avg_seconds, number, guesses, lost)` poblada al ingerir. Solo si A resulta lenta o si se quiere cruzar con otras observaciones. Requiere migracion manual y enmienda del contrato (L-bis).
- Pinpoint/CrossClimb: ya caben en el envelope (guesses/lost); decision de producto, no tecnica. Anadir solo si los juegas.

## 5. Captura automatica: viabilidad
- No hay API publica ni export de historial de juegos (busqueda: solo extensiones de terceros que leen mensajes de chat). El export de datos de LinkedIn no documenta juegos.
- Las condiciones de uso de LinkedIn (User Agreement 8.2, segun fuentes secundarias; el texto primario no se pudo verificar) prohiben scripts/bots/crawlers para acceder o copiar los Servicios, y LinkedIn indica riesgo de restriccion de cuenta. Un colector Playwright con tu sesion cae en esa categoria, aunque sea tu propia cuenta y tus datos.
- Ademas: congelado legal vigente sobre colector y extraccion; egress de Cloudflare ya recibio 403 en Duolingo, previsible tambien aqui; la regla L6 (no abrir juegos sin jugar) complica el parseo del DOM.
- Alternativas sin automatizar la plataforma: (a) mejorar la UX manual (mobile ya existe, el coste es ~30 s/dia); (b) importar tu Excel periodicamente (script gated); (c) pegar el texto de "compartir resultado" que genera cada juego, parseado en cliente. (c) es la mejor relacion valor/riesgo: sin scraping y sin tocar el colector.
- Recomendacion: **no construir colector**. Decision que seguiria siendo tuya tras revisar las condiciones y el congelado legal.

## 6. Plan propuesto
0. (Gate) decir "load" para el backfill; mientras, nada toca produccion.
1. Script de backfill desde el Excel (dry run, merge con lo manual, un payload acumulado por dia via `/api/import`).
2. Vista de lectura (Opcion A): tendencia + rachas + PB, una pagina mobile como las de chess.
3. Entrada por "pegar resultado compartido" (opcional).
4. Reevaluar tabla `game_results` solo si A se queda corta.
Riesgos: congelado legal sobre cambios en Meridian; fechas mezcladas (normalizar antes); la media global no es comparable entre dias.
