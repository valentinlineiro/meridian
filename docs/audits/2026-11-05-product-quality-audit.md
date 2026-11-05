# Meridian: Product Quality Audit

**Fecha:** 2026-11-05 · **Base:** `main` 74172a4 (Fase 4 cerrada: #100, #101, #102)
**Método:** producción con sesión del propietario, **solo lecturas** (páginas y `SELECT` agregados a D1; ningún `INSERT/UPDATE`,
ninguna sincronización, nada contra Neon). Los volcados de datos quedaron fuera del repo.
**Criterio de salida:** cada dato fiable, cada interpretación defendible, cada pantalla útil.

## 1. Qué se comprobó

| Área | Comprobación | Resultado |
|---|---|---|
| Ajedrez | Totales 1683 = 1046 + 505 + 132; derrotas 505 = 279 mates + 220 desconexiones + 6 rendiciones | Coinciden con D1 |
| Ajedrez | Mates dados 1036 = victorias por mate (567 + 419 + 50); mates recibidos 279; amenazas 291 + 107 + 114 = 512 | Coinciden |
| Ajedrez | Fases 169 + 716 + 798 = 1683; errores graves 6670/68888 = suma por fase = suma por color | Coinciden |
| Ajedrez | Cobertura de motor 1683/1683 (`status: ok` en todas); partida sugerida existe y se abre | Correcto |
| Idiomas | Racha 1117, XP total 700.087, 13 cursos y 439.480 XP en cursos; XP de los últimos 7 días 5119 | Coinciden |
| Games | 170 días, 794 resultados, 87,3 % por encima de la media (recalculado desde los registros) | Coincide |
| Qué cambió | Salto de ELO 975 → 908 y racha +6 | Coinciden con las series |
| Móvil (emulación 390 px, producción) | Altura y desbordamiento de las seis vistas | Ver P1 y P9 |

No se comprobó: Safari/Chrome móvil reales, la página de configuración, el flujo «Registrar resultado» y «Sincronizar» (escriben),
accesibilidad con lector de pantalla.

## 2. Hallazgos, por impacto y coste

Impacto: A = engaña o rompe; B = confunde o resta confianza; C = ruido. Coste: XS < 1 h, S < 1 día, M > 1 día o requiere contrato.

| # | Hallazgo | Evidencia | Imp. | Coste |
|---|---|---|---|---|
| P1 | **El selector de curso de Idiomas desborda en móvil con datos reales** (regresión de #101: las etiquetas largas ensanchan el `<select>`; con los 13 cursos, +9 px de scroll horizontal y el selector sale de su tarjeta). Con los datos demo (3 cursos) no se veía; mi comprobación de #101 fue solo con demo. | Medido en producción a 390 px; captura del selector fuera de la tarjeta | A | XS |
| P2 | **`CHESS_CH` sigue apareciendo en «Qué cambió»**: «Curso activo: CHESS_CH» en el contexto de Idiomas. La Fase 4 lo quitó en dos sitios y este es el tercero. | Texto de `/changes` en producción | B | XS |
| P3 | **Games sigue mostrando «0 días» en 12 sitios**: columna «Racha» de la tabla (6 filas) y «Racha ganando a la media: 0 días» en cada tarjeta (6). La Fase 4 corrigió solo el hero. Es la misma ausencia de registro (último dato 03-nov, y los 170 días son una importación), no una racha rota. | Texto de `/games` | B | XS |
| P4 | **«AFIRMADO» sin calibrar contra el ruido de la propia serie** (contratos de umbral fijo): *Salto de ELO* se afirma a partir de 25 puntos, pero el cambio absoluto mediano a 7 días de este ELO es 38,5 (62 pares; ≥ 50 pts en el 34 %, ≥ 67 en el 16 %). *Mayor XP diario* se afirma a partir de ×1,3 sobre el histórico; las ventanas de 6 días lo superan con ×1,4 en el 43 % de los casos (mediana ×1,26; 98 ventanas). Son alertas casi permanentes: no distinguen nada. Games ya calibra bandas de ruido; es el precedente. | SQL sobre `elo_observations` y `xp_summaries` | A | M (enmienda de contrato) |
| P5 | **Las métricas por fase y «momento decisivo» mezclan 220 desconexiones** (44 % de las derrotas). «Apertura: 30,2 % de victorias» (n=169): 54 de sus derrotas son desconexiones; sin ellas ≈45 %. De 381 derrotas con momento decisivo en las primeras 40 jugadas, 177 (46 %) son desconexiones. La fase es «en cuál terminó la partida», no «cómo juegas la apertura»; y «Sin contar desconexiones» solo existe en la tarjeta de resultados. | SQL `match_details` × `matches` | A | S |
| P6 | **«87 % ganas a la media global» agrega juegos incomparables**: Wend 100 % (n=57), Mini Sudoku 98 %, Zip 84 %, Queens 82 %, Tango 65 % (n=57); Tango y Wend solo existen desde septiembre, así que la mezcla cambia con el tiempo. La cifra es la cabecera de la página y no admite una lectura útil. | Recálculo desde los 170 registros | B | XS |
| P7 | **Indicadores saturados que no informan**: «90/90 días activos» (89/89 filas de XP con actividad, mínimo 125 XP/día; la historia de XP solo empieza el 2026-06-25 aunque la racha es 1117); «Gana a la media 100 %». | SQL `xp_summaries` | C | XS |
| P8 | **Formatos y precisión inconsistentes en la misma pantalla**: «64.6 %» y «62,2 %»; intervalo de color «[+1, +10]» en Comparativa y «[+0,9; +10,2]» en Patrones; el gráfico de ELO dice «900–1072» (último valor del día) frente a 877 de mínimo real. | Texto de `/chess` | C | S |
| P9 | **Ajedrez en móvil mide 15.607 px con datos reales** (3.200 px con demo): repertorio de aperturas (2 listas de ~20 filas), familias, mates, fases y perfil. Idiomas 1.627, Games 4.135, portada 1.717, Qué cambió 1.711. | Altura a 390 px en producción | B | M |
| P10 | Redundancias que quedan en Ajedrez: color y oponente en «Patrones» y «Comparativa»; tres tasas de victoria visibles (62,2 % histórico, 64,0 % de las últimas 50, 70,8 %/57,7 % por color de las últimas 50 con n=24 y 26). | Texto de `/chess` | C | S |
| P11 | «Qué partidas revisar» lista «Rival sin nombre» en todas las filas; solo se distinguen por fecha y color. | Texto de `/chess` | C | XS |

## 3. Qué merece confianza

Totales, desgloses y sumas del ajedrez y de Idiomas cuadran con la base de datos; la cobertura de motor es total; las muestras
pequeñas se declaran (`n=33` en PvP, `Datos insuficientes` en Tango y Wend, «sin evidencia suficiente» en ventanas de 50
partidas); el color distingue «diferencia detectable» de «patrón persistente»; la nota del XP total no atribuye la diferencia
(260.607 XP) a ninguna causa.

## 4. Plan de intervención (pequeño, sin nuevas pantallas)

1. **PR de defectos demostrados** (XS, sin contratos): P1, P2, P3, P6 (retirar o sustituir la cifra agregada), P11, y los formatos
   de P8 que sean literales. Una rama, tests y comprobación en producción con la sesión, incluida la medida móvil.
2. **Diseño de calibración para P4** (documento, sin código): bandas de ruido para ELO y XP a partir de la propia serie, siguiendo
   `NoiseBands` de Games, y su enmienda de contrato. Hasta aprobarlo, no tocar umbrales.
3. **P5**: separar desconexiones en fases y momento decisivo (o mostrarlas aparte), sin tocar el contrato de las métricas del motor.
4. **P9**: acortar Ajedrez en móvil mostrando las N primeras filas con «ver todas»; verificar en Safari/Chrome móvil reales.
5. P7 y P10 solo si siguen molestando tras 1–4.

## 5. Límites de esta auditoría

Es una lectura de un único día de datos de un único usuario. P4 se apoya en 62 pares de ELO y 98 ventanas de XP: las cifras
orientan, no demuestran una tasa de falsa alarma. El análisis de P5 no atribuye la causa de las desconexiones.
