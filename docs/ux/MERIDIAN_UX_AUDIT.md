# Auditoría UX de Meridian

**Fecha:** 2026-11-04
**Autor:** Principal Product Designer / Product Architect
**Alcance:** experiencia de lectura de las tres áreas (ajedrez, LinkedIn Games, idiomas) y de la portada común.
**Naturaleza:** auditoría y documentación. No modifica código, API, contratos, datos ni metodología. No se ha ejecutado ninguna operación contra Neon. La PR es documental y no implementa el rediseño.

> **Nota de alcance y estado de validación.** La versión inicial de esta auditoría se basó en código, contratos y datasets documentados. Las hipótesis de diseño visual, jerarquía, densidad y navegación fueron **validadas en pantalla con datos de prueba y capturas en escritorio y móvil** el 2026-11-04 (véase el informe complementario [MERIDIAN_UX_VISUAL_VALIDATION.md](./MERIDIAN_UX_VISUAL_VALIDATION.md) y las capturas en `docs/ux/screenshots/`). Las propuestas que recibieron matices o refutaciones en la experiencia real (como la preservación de la entrada manual rápida de Games o evitar la fragmentación en URLs rígidas) se encuentran reflejadas en las secciones correspondientes. Las propuestas de las secciones 5–10 proporcionan el marco conceptual aprobado para el roadmap incremental.

---

## 0. Resumen para decidir en dos minutos

1. **Meridian hoy es un panel de seguimiento, no una herramienta de análisis.** La evidencia existe y es de buena calidad; lo que falta es la gramática que la convierte en comprensión: posición → análisis → evidencia.
2. **Los tres dominios tienen madurez epistémica muy distinta.** LinkedIn Games ya piensa en ruido, muestra y persistencia; ajedrez tiene la evidencia más rica pero repartida en dos pantallas; idiomas es, sobre todo, un panel de actividad con un módulo curricular.
3. **La portada no es una portada.** «Hoy» muestra dos dominios de tres, no emite ningún veredicto y presenta la racha de Duolingo como si fuera de la cuenta.
4. **Hay conclusiones sin evidencia navegable y métricas sin interpretación.** El caso más claro: «ELO · 0 vs primer snapshot» es una afirmación de evolución sin ventana, sin `n` y sin incertidumbre.
5. **No hace falta reinventar los datos.** La mayor parte del rediseño se construye reordenando, etiquetando y enlazando lo que ya se calcula. Las únicas dependencias nuevas son de contrato (Games en Cambios/Trayectoria, percentiles) y deben aprobarse aparte.

**Regla que ordena toda la propuesta:** nada se elimina; la profundidad se reubica. Primero se comprende la posición, después se analiza, finalmente se consulta la evidencia.

---

## 1. Diagnóstico ejecutivo

### 1.1 La tesis

Meridian ya tiene lo más difícil: observaciones inmutables, comparabilidad explícita, intervalos de confianza, bandas de ruido calibradas, estados «desconocido ≠ cero» y una divulgación metodológica escrita. Lo que no tiene es una **experiencia** que use ese rigor para responder seis preguntas humanas:

- ¿Dónde estoy?
- ¿Cómo estoy evolucionando?
- ¿En qué destaco?
- ¿Qué limita mi progreso?
- ¿Qué merece atención?
- ¿Cómo compruebo cada conclusión?

Hoy el usuario recibe cifras correctas y tiene que hacer él el trabajo de síntesis. La herramienta demuestra rigor; no lo transmite.

### 1.2 Los cinco hallazgos que explican la experiencia actual

| # | Hallazgo | Consecuencia para el usuario |
|---|---|---|
| 1 | **No existe un nivel «posición».** Cada dominio abre con un hero de métricas, no con un veredicto. | El usuario ve números y no sabe qué significan juntos. |
| 2 | **El análisis está escondido o separado.** En ajedrez vive en «Perfil», fuera del flujo de «Partidas». En idiomas no existe. En Games está bien, pero enterrado. | Descubrir la mejor parte del producto exige explorar. |
| 3 | **La evidencia no se navega desde las conclusiones.** Hay tablas y un `/raw`, pero ninguna afirmación lleva a su prueba. | Comprobar una conclusión es un trabajo manual. |
| 4 | **La portada no representa el sistema.** Dos dominios de tres, sin Games, sin atención priorizada, con la frescura global escrita por ajedrez. | La primera pantalla no responde «dónde estoy». |
| 5 | **El vocabulario epistémico existe pero es local.** `AFIRMADO / INDICIO / INSUFICIENTE / SIN INDICIO` solo aparece en «Qué cambió» y «Trayectoria». | Cada dominio inventa su propio tono y su propio nivel de honestidad. |

### 1.3 Madurez por dominio

| Dimensión | Ajedrez | Idiomas | LinkedIn Games |
|---|---|---|---|
| Evidencia disponible | Muy alta | Media | Alta |
| Interpretación en pantalla | Baja (salvo Perfil) | Muy baja | Alta |
| Navegación conclusión → prueba | Baja | Baja | Media |
| Honestidad sobre límites | Alta | Alta | Alta |
| Coherencia con el modelo común | Parcial | Baja | Parcial |
| Presencia en la portada | Sí | Sí | **No** |

### 1.4 Qué conservar sin tocar

- La **disciplina de datos**: inmutabilidad, deduplicación, `null` que no se convierte en cero, comparabilidad curricular estricta.
- El **rigor de Games**: bandas calibradas, regla de dos semanas, `n` en cada cifra, huecos visibles, flecha solo a 28 días.
- El **perfil de ajedrez**: errores graves por 100 jugadas, ACPL, fases, color, momento decisivo, conversión, cobertura declarada.
- Los **estados de sistema explícitos**: «Sin observación aún · Path no sincronizado», «Periodo anterior incompleto», «No disponible».
- La **accesibilidad ya implementada**: `aria-current`, `aria-pressed`, `aria-sort`, tablas de datos para gráficos, trampas de foco en modales, `sr-only`.
- La **divulgación metodológica** de ajedrez e idiomas.

---

## 2. Método y alcance

### 2.1 Qué se ha inspeccionado

- Shell y estructura: `src/frontend.ts` (navegación, portada, pestañas, modales).
- Comportamiento y renderizado: `src/dashboard.client.js` (2.127 líneas), `src/dashboard.client.css`.
- Rutas y contratos de lectura: `src/api/router.ts`, `src/api/stats.ts`, `src/api/languages.ts`, `src/api/languagesAnalytics.ts`, `src/slices/linkedin-games/delivery/routes.ts`.
- Modelo de cada dominio: `src/analytics/languages/*`, `src/slices/linkedin-games/domain/*`, `src/domain/whatChanged.ts`, `src/domain/trajectory.ts`.
- Documentación existente: `docs/audits/*`, `docs/contracts/*`, `README.md`, `docs/ARCHITECTURE.md`.
- Datos disponibles: dataset demo versionado (`demo/demoData.ts`, `demo/syntheticCourse.ts`) y estudio real de LinkedIn Games (`docs/audits/linkedin-games-study-2026-11-03.md`) con su artefacto de calibración (`noise-bands.json`).

### 2.2 Qué no se ha inspeccionado

- Producción en vivo ni Neon. No se han ejecutado consultas ni capturas contra la base de datos.
- No hay capturas de pantalla ni grabaciones de uso real. La auditoría es de código, contratos y datos documentados.
- No se ha medido rendimiento percibido ni realizado tests con usuarios.
- No se ha verificado el contenido exacto de la base de producción del propietario; los ejemplos de Games provienen del estudio ya documentado en el repositorio.

### 2.3 Rúbrica de éxito

Cada dominio y la portada se puntúan contra las seis preguntas del criterio de éxito.

| Pregunta | Ajedrez | Idiomas | Games | Portada |
|---|---|---|---|---|
| ¿Dónde estoy? | Parcial: ELO y WR, sin veredicto | Parcial: actividad y unidades, sin veredicto | **No**: la racha no es posición | **No** |
| ¿Cómo evoluciono? | Parcial: sparkline de ELO y ventana de 50 | **No**: no hay comparación temporal de aprendizaje | Sí: etiquetas y ventana 28 d | **No** |
| ¿En qué destaco? | **No**: hay métricas, no fortalezas | **No** | Parcial: mejor marca y % sobre la media | **No** |
| ¿Qué limita mi progreso? | Parcial: perfil de motor, fuera del flujo | **No** | Parcial: Tango, pero sin síntesis | **No** |
| ¿Qué merece atención? | Parcial: tarjetas condicionales | Parcial: cambio estructural | Sí: etiqueta de deterioro | **No** |
| ¿Cómo compruebo? | Parcial: tablas y metodología, sin enlaces | Parcial: metodología, sin enlaces | Sí: `n`, tabla de datos, bandas | **No** |

**Lectura:** ninguna columna supera «parcial». La mejor evidencia del producto no se convierte en la mejor experiencia.

### 2.4 Validación realizada en pantalla (2026-11-04)

Las hipótesis visuales planteadas en esta auditoría fueron validadas contra la aplicación ejecutándose localmente con datos de prueba (`http://localhost:8787`). El informe exhaustivo de resultados y capturas está documentado en [MERIDIAN_UX_VISUAL_VALIDATION.md](./MERIDIAN_UX_VISUAL_VALIDATION.md).

| Experiencia | Qué se validó | Resultado de la validación en pantalla |
|---|---|---|
| Ajedrez | Lectura sin scroll, redundancia de KPIs, separación de Perfil | **Confirmado:** 4 KPIs redundantes, ELO repetido, Perfil aislado con 0/60 partidas analizadas y sin contexto de cobertura. |
| Idiomas | Confusión entre actividad y aprendizaje real; CEFR | **Confirmado:** 11 bloques apilados (3.670 px de scroll en móvil); la actividad eclipsa al aprendizaje; secciones A1 inducen a falsa competencia. |
| Games | Síntesis cross-game, cobertura y rol de la entrada manual | **Matizado:** Confirmada la falta de síntesis cross-game y de progreso hacia calibración; **refutada** la relegación de la entrada manual (operativamente crítica). |
| Común | Arquitectura Posición → Análisis → Evidencia | **Confirmado en esencia; ajustado en navegación:** Se descarta la división en 3 URLs rígidas por dominio en favor de disclosure progresivo en la ruta canónica. |

El criterio de salida se da por cumplido: se dispone de evidencia directa para acometer el primer tramo de implementación (Fase 0) sin especulación visual.

---

## 3. Auditoría por dominio

### 3.1 Ajedrez

#### 3.1.1 Mapa actual

La entrada se llama **«Partidas»**, no «Ajedrez». Orden real de la pantalla:

1. Hero: ELO actual, «ELO · ±N vs primer snapshot», partidas disputadas, racha, % de victorias histórico.
2. Barra de distribución de las últimas 50 partidas.
3. Índice de bloques: Comparativa · Aperturas · Evolución · Partidas.
4. Cuatro KPI: Partidas · % de victorias · Score · ELO actual.
5. «Forma actual»: ventana 20/50/100, comparación contra las anteriores, desglose por color.
6. Bloque abierto «Comparativa por color y oponente».
7. Bloque abierto «Repertorio de aperturas & fases» (mates, amenazas, aperturas, fases).
8. Bloque abierto «Evolución & detalle» (sparkline de ELO, donut de resultados, ELO del rival plegado).
9. Tabla de partidas con filtros, paginación y visor.
10. Divulgación «¿Cómo sabemos esto?».
11. Enlace «Datos técnicos» (`/raw`).

Evidencia: `src/frontend.ts:122-217`, `src/dashboard.client.js:884-971`, `1257-1412`.

#### 3.1.2 Qué funciona

- La **evidencia es profunda y variada**: resultados por causa, color, familia de oponente, ELO del rival, aperturas, fases, mates, amenazas de mate, perfil de motor, visor de partidas y PGN.
- La **incertidumbre está presente** donde importa: intervalos de confianza en win rate, `n` en comparaciones, aviso de muestra pequeña, «hidratadas X/Y».
- El **perfil de motor** es la capa más cercana a «qué limita mi progreso»: errores graves por 100 jugadas, ACPL, fase, color, momento decisivo, conversión, partidas a revisar.
- La **ventana «Forma actual»** compara contra las anteriores y no incluye la ventana en su propia base. Es un detalle excelente.
- El **visor** permite ir de una partida a sus jugadas, errores y amenazas.

#### 3.1.3 Hallazgos

**A1 · Dos hogares para el análisis. Severidad: alta.**
«Partidas» contiene la posición y la evidencia; «Perfil» contiene el análisis. Son hermanos en el menú, no niveles de una misma historia. El usuario que quiere saber «qué me limita» tiene que adivinar que la respuesta está en otra entrada.
Evidencia: `src/frontend.ts:21-23`; `src/frontend.ts:385-401`.

**A2 · Cuatro KPI y un hero dicen lo mismo. Severidad: media.**
ELO aparece en el hero y en los KPI; % de victorias aparece en el hero, en los KPI y en «Forma actual». La repetición no añade contexto, añade ruido y empuja la evidencia fuera de la primera pantalla.
Evidencia: `src/frontend.ts:123-151`; `src/dashboard.client.js:1276-1279`.

**A3 · «ELO · 0 vs primer snapshot» es una conclusión sin ventana ni incertidumbre. Severidad: alta.**
La diferencia se calcula contra el primer snapshot, sin decir cuántos snapshots hay, en cuánto tiempo, ni si el cambio supera el ruido. Con el dataset demo (ELO 900 constante) la interfaz afirma «0 vs primer snapshot» y dibuja un sparkline de un solo punto sin nota. Es una afirmación de evolución que no se puede comprobar.
Evidencia: `src/dashboard.client.js:903-907`, `1288-1303`.

**A4 · Seis bloques abiertos por defecto en escritorio. Severidad: media.**
El orden no cuenta una historia: color, oponentes, mates, amenazas, aperturas, fases, evolución, resultados, ELO rival, tabla. El índice ayuda a saltar, pero no a decidir qué mirar. En móvil se cierran dos bloques; el problema de jerarquía persiste.
Evidencia: `src/frontend.ts:159-184`; `src/dashboard.client.js:1250-1251`.

**A5 · Aperturas y fases son repartos sin conclusión. Severidad: media.**
Se muestran barras de victorias/derrotas/tablas por apertura y por fase, con `n`, pero sin una frase que diga qué patrón importa. «1.e4: 12 partidas, 58%» no es una conclusión; es un dato. El usuario tiene que comparar mentalmente seis u ocho filas.
Evidencia: `src/dashboard.client.js:1353-1396`; `renderCompare` en `1149-1158`.

**A6 · La comparación bots vs PvP no advierte del tamaño muestral en la cifra. Severidad: alta.**
La tarjeta muestra «Bots: 51 (73,9%) · PvP: 9 (57,1%)» y una nota estática: «Las diferencias por familia de oponente no aíslan la dificultad del rival». No dice que 9 partidas no permiten concluir. El dato invita a una conclusión que la metodología del producto no respalda.
Evidencia: `src/dashboard.client.js:1343-1350`; `src/frontend.ts:162`.

**A7 · El perfil de motor depende de cobertura y no lo dice en la entrada. Severidad: media.**
«Perfil» calcula sobre partidas analizadas por Stockfish. Si la cobertura es parcial, el veredicto puede describir una minoría de partidas. La pantalla declara «Calculado con Stockfish sobre N partidas» y el porcentaje de bots, pero no la cobertura sobre el total ni la fecha del análisis.
Evidencia: `src/dashboard.client.js:1516-1520`; `1548-1552`.

**A8 · No hay síntesis de estilo, fortalezas ni debilidades. Severidad: alta.**
El brief pide «calidad de juego, estilo, fortalezas, debilidades, patrones recurrentes». Hoy hay métricas de calidad y de error, pero no una síntesis: «tu ventaja está en el final», «tu fuga está en el medio juego», «rindes mejor con negras», «tu repertorio es estrecho». El `profVerdict` es lo más cerca que está, y solo cubre dos frases descriptivas.
Evidencia: `src/dashboard.client.js:1488-1495`.

**A9 · La evidencia no es navegable desde las conclusiones. Severidad: alta.**
Solo la lista «Qué partidas revisar» abre el visor. Una afirmación como «asimetría por color» no lleva a las partidas de cada color; «errores en medio juego» no filtra la tabla por fase y resultado. El enlace «Datos técnicos» lleva a snapshots crudos, no a la prueba de una afirmación.
Evidencia: `src/dashboard.client.js:1218-1225`; `src/frontend.ts:441`.

**A10 · La frescura global la escribe ajedrez. Severidad: media.**
`#syncMeta`, en la cabecera de todas las páginas, se actualiza desde `loadChessDashboard` con la fecha del último snapshot de ajedrez y el número de partidas. En Idiomas o Games, la cabecera sigue hablando de ajedrez. Si ajedrez falla, la frescura global queda en «—».
Evidencia: `src/dashboard.client.js:1271-1273`; `src/frontend.ts:11`.

#### 3.1.4 Ejemplo con datos disponibles (dataset demo)

Datos versionados en `demo/demoData.ts`: 60 partidas, ELO 900, 38 victorias, 15 derrotas y 7 tablas, 9 PvP y 51 bots, racha máxima de 6 victorias. El win rate del producto se calcula sobre partidas decididas (53), no sobre el total.

Lo que la interfaz actual produce:

| Pantalla | Texto actual | Problema |
|---|---|---|
| Hero | `900` · `ELO · 0 vs primer snapshot` | Afirmación de evolución sin ventana ni `n`. |
| KPI | `60 partidas` · `71,7%` · `78,3% score` · `900` | Cuatro cifras sin jerarquía. |
| Oponentes | `Bots: 51 (73,9%) · PvP: 9 (57,1%)` | La diferencia parece una conclusión; `n=9` no lo permite. |
| Color | Blancas 68,0% · Negras 75,0% | No se dice si la diferencia supera el intervalo. |
| Forma (50) | 68,2% WR · 30 victorias, 14 derrotas, 6 tablas | Correcto, pero sin frase interpretativa. |

Lo que debería decir la posición:

> **Base registrada, con una señal de color.** Hay una sola observación de ELO (900); no hay tendencia que afirmar. Ganas más con negras (75,0%, 28 decididas de 30) que con blancas (68,0%, 25 de 30); la diferencia es de +7,0 pp con IC 95% [−16,6, +30,1], así que es un **indicio**, no una conclusión. Tu mejor racha es de 6 victorias.
>
> **Merece atención:** el rendimiento contra PvP (57,1%, n=9; 7 decididas) no es interpretable con esta muestra; se necesitan más partidas contra personas.

#### 3.1.5 Rediseño propuesto

**Posición (primera pantalla)**
- Veredicto en una frase: nivel + forma + una señal.
- Tres señales: **fortaleza** (color/apertura/final), **límite** (fase/errores/tiempo), **atención** (racha, muestra pequeña, caída reciente).
- Ventana visible y `n` en cada señal.
- «¿Cómo sabemos esto?» a un clic.
- Fuera de la primera pantalla: los cuatro KPI, el sparkline, el donut, la tabla completa.

**Análisis (segunda pestaña)**
- Máximo 5 afirmaciones, cada una con estado epistémico y enlace a evidencia:
  1. «Tu ventaja está en el final» → conversión, errores por fase, partidas.
  2. «Tu fuga está en el medio juego» → errores graves/100, ACPL, momento decisivo.
  3. «Rindes distinto por color» → win rate con IC, partidas filtradas.
  4. «Tu repertorio se concentra en X» → aperturas, `n`, resultados.
  5. «Contra PvP no hay evidencia suficiente» → `n=9`, IC, estado `INSUFICIENTE`.
- «Perfil de juego» (motor) como subsección, con cobertura y fecha.
- Cada afirmación tiene un ancla estable: `/chess/analysis#color`.

**Evidencia (tercera pestaña)**
- Snapshots de ELO (tabla + rango), resultados por causa, color, oponentes, ELO rival, aperturas, fases, mates, amenazas, perfil completo, tabla de partidas, PGN, metodología.
- `/raw` solo desde aquí.

---

### 3.2 Idiomas

#### 3.2.1 Mapa actual

La entrada se llama **«Cursos»**. Orden real:

1. Hero: curso seleccionado, progreso curricular.
2. Estado de la cuenta: Total XP · Racha · Días con actividad · Catálogo.
3. Actividad de cuenta · últimos 7 días + objetivo diario.
4. Tus cursos (lista expandible con secciones).
5. Cambios observados.
6. Actividad de cuenta · últimos 90 días (barras de XP).
7. Intensidad descriptiva · cuenta.
8. Perfil por día de la semana · cuenta.
9. Concentración histórica · catálogo.
10. Comparabilidad curricular longitudinal · cursos.
11. Divulgación «¿Cómo sabemos esto?».

Evidencia: `src/frontend.ts:219-370`; `src/dashboard.client.js:422-717`.

#### 3.2.2 Qué funciona

- La **separación de alcance** (`CUENTA` / `CURSO`) es el mejor patrón de claridad del producto y debería generalizarse.
- La **regla de comparabilidad** (`ΔtotalUnits = 0`) y sus tres estados (`comparable`, `structural_change`, `insufficient_observation`) son ejemplares.
- Los **estados de sistema explícitos**: «Sin observación aún · Path no sincronizado para este curso» evita leer un cero donde hay ausencia.
- La **divulgación metodológica** explica la regla y el aislamiento de XP.
- El **objetivo diario** es la única pieza realmente accionable y está bien situada.

#### 3.2.3 Hallazgos

**I1 · Es un panel de actividad, no de aprendizaje. Severidad: alta.**
Once bloques; seis son actividad de cuenta (XP, racha, días, sesiones, tiempo, concentración). El único bloque de aprendizaje real es el progreso curricular. El brief pide «competencia y evolución, separando actividad de aprendizaje real»; hoy la actividad domina la pantalla y el aprendizaje aparece como un porcentaje.
Evidencia: `src/frontend.ts:247-333`.

**I2 · Once bloques sin jerarquía. Severidad: alta.**
El avance curricular compite visualmente con la tira semanal, el timeline de 90 días, la intensidad, el perfil semanal, la concentración y la comparabilidad. No hay una respuesta corta a «¿estoy aprendiendo?».
Evidencia: `src/frontend.ts:222-343`.

**I3 · «Cambios observados» mezcla estructura, avance y actividad. Severidad: alta.**
La síntesis habla de comparabilidad estructural («1 de 3 cursos comparables sin cambio estructural»), el detalle puede mostrar avance curricular («+2 unidades en Demo Alpha») y, si no hay delta, cae a «Actividad reciente (cuenta): +X XP · Curso en foco: …». Tres conceptos distintos bajo un mismo título; el usuario puede leer la actividad o la estructura como un cambio de aprendizaje.
Evidencia: `src/dashboard.client.js:605-642`.

**I4 · El desglose CEFR se presenta como nivel alcanzado. Severidad: alta.**
«Nivel A1 (2 sec) 10 / 12 unidades» con barra de progreso se lee como «estoy en A1». Lo que mide es el porcentaje de unidades del árbol etiquetadas A1, no competencia A1. La metodología no lo aclara porque habla de comparabilidad, no de CEFR.
Evidencia: `src/dashboard.client.js:307-326`; `src/frontend.ts:360-363`.

**I5 · Se calculan métricas que no se muestran. Severidad: media.**
El contrato devuelve `activityDensity`, `totalSessions`, `totalReportedSeconds`, medianas e IQR diarios, `xpPerMinute`, `sampleCount` por día de la semana, `hhi`, `effectiveCourseCount`, `top3SharePercentage`. La UI muestra medianas sin `n`, sin IQR y sin HHI. Hay evidencia lista que no llega a pantalla.
Evidencia: `src/analytics/languages/types.ts:1-80`; `src/dashboard.client.js:645-717`.

**I6 · No hay capa de interpretación. Severidad: alta.**
No hay una sola hipótesis, comparación temporal de aprendizaje ni frase de patrón. «XP / sesión 24,6» y «Tiempo / sesión 244 s» son descriptivos con una advertencia correcta, pero no dicen nada sobre el proceso. El brief pide «explicación de los patrones observados, comparaciones temporales, contexto, causas posibles».
Evidencia: `src/dashboard.client.js:645-669`.

**I7 · No se declara lo que los datos no pueden decir. Severidad: alta.**
No hay un bloque que diga: «con estos datos no se puede afirmar comprensión, lectura, escritura ni expresión oral; XP, racha y lecciones no son dominio lingüístico». La ausencia de esas dimensiones es correcta; la ausencia de la explicación deja que el usuario las infiera.
Evidencia: `src/frontend.ts:335-343` (la metodología no las menciona).

**I8 · Las ventanas temporales no son explícitas en todas las tarjetas. Severidad: media.**
«Actividad de cuenta · últimos 90 días» sí; «Intensidad descriptiva · cuenta» no dice la ventana; «Perfil por día de la semana» la dice solo al pie («ventana de N días»); «Concentración histórica» dice «total vitalicio». El usuario no puede comparar bloques sin buscarla.
Evidencia: `src/dashboard.client.js:667`, `681`, `653-656`.

**I9 · El progreso curricular no muestra la fecha de observación por curso. Severidad: media.**
El hero muestra el progreso, pero no cuándo se observó ese Path. La frescura está en una línea secundaria (`langSyncMeta`), separada del dato. Un 56% de hace tres semanas y uno de hoy se ven igual.
Evidencia: `src/dashboard.client.js:461-487`, `501-502`.

**I10 · «Curso en foco» vs «último curso en Duolingo» está bien resuelto, pero solo en la portada. Severidad: baja.**
La tarjeta de portada explica la diferencia cuando existen ambos. En la página de Idiomas, el selector no aclara que es una elección del dashboard, no el curso activo en la fuente.
Evidencia: `src/dashboard.client.js:730-736`; `src/frontend.ts:228-235`.

#### 3.2.4 Ejemplo con datos disponibles (dataset demo)

Datos versionados en `demo/demoData.ts` y `demo/syntheticCourse.ts`: 3 cursos; Demo Alpha pasa de 12.000 a 14.000 XP; la cuenta pasa de 50.000 a 52.500 XP y de racha 90 a 108; el curso activo pasa de 2 a 4 unidades completadas en A1.2; 25 unidades totales (Intro 4, A1.1 6, A1.2 6, A2.1 8, daily refresh 1). XP diario entre 20 y 80; 1–3 sesiones; 300–660 s.

Lo que la interfaz actual produce:

| Tarjeta | Texto actual | Problema |
|---|---|---|
| Hero | `Demo Alpha` · `14 / 25 unidades (56,0%)` | Sin fecha de observación ni comparación. |
| Cuenta | `52.500 XP` · `🔥 108 días` · `28 / 28 días activos` · `3 cursos` | Cuatro cifras; ninguna es aprendizaje. |
| Cambios observados | «1 de 3 cursos comparables sin cambio estructural» + «Cambio curricular observado: +2 unidades en Demo Alpha» | La síntesis describe estructura y omite por qué los otros 2 no son comparables; el detalle no declara el denominador. |
| CEFR | `Nivel A1 (2 sec) 10 / 12 unidades` | Se lee como competencia A1. |
| Intensidad | `XP / sesión 24,6` · `Tiempo / sesión 244 s` | Sin ventana, sin `n`, sin lectura. |
| Día de la semana | `Lun 43 XP · 1,5 ses · 8 m` | Sin `n` ni IQR, aunque el contrato los trae. |

Lo que debería decir la posición:

> **Activo, con avance curricular verificable en un curso.** 14 de 25 unidades del curso en foco; el avance observado es de +2 unidades en A1.2 con el mismo denominador total, así que es comparable. Tu actividad es estable en la ventana (mediana 50 XP/día, IQR 35–65; n=28 días).
>
> **Lo que estos datos no dicen:** no miden comprensión, lectura, escritura ni expresión oral. XP, racha y lecciones completadas no son dominio lingüístico. El desglose A1 indica unidades del árbol etiquetadas A1, no que hayas alcanzado A1.
>
> **Merece atención:** Demo Gamma solo tiene XP, nunca se observó su Path. Sin una segunda captura no se puede afirmar avance.

#### 3.2.5 Rediseño propuesto

**Posición**
- Veredicto: actividad + avance + foco.
- Tres señales: **consistencia** (días activos/ventana, mediana e IQR), **avance curricular** (unidades comparables, con fecha), **foco** (curso y peso).
- Bloque permanente y visible: **«Lo que estos datos no pueden decir»**.
- Objetivo diario se mantiene aquí (es la única acción).
- Fuera: timeline de 90 días, concentración, perfil semanal, intensidad, comparabilidad.

**Análisis**
- 3–4 afirmaciones:
  1. «Tu actividad es estable / variable» → mediana, IQR, densidad, n.
  2. «Tu avance es real en A1.2 (+2 unidades, mismo denominador)» → deltas, fechas.
  3. «El árbol cambió en X: no se puede calcular avance» → estado estructural.
  4. «Tu foco se concentra en N cursos» → HHI, top-3, series.
- Cada una con estado epistémico y enlace a evidencia.
- «Actividad ≠ aprendizaje» como regla de la capa, no como nota al pie.

**Evidencia**
- Días de XP (tabla), distribuciones con IQR, perfil semanal con `n`, concentración con HHI y número efectivo de cursos, comparabilidad por curso, secciones y CEFR con definición, metodología.

---

### 3.3 LinkedIn Games

#### 3.3.1 Mapa actual

1. Hero: racha actual, racha máxima, días registrados y rango, botón «Registrar resultado», barra «Ganas a la media global», chips de hoy.
2. Selector de periodo 7 / 28 / 90 / todo.
3. Comparativa: tabla de 7 columnas (juego, eficiencia, gana a la media, Δ eficiencia, tiempo mediano P25–P75, racha, `n`).
4. Trayectoria: gráfico de eficiencia + % sobre la media + `n` por bucket, con tabla de datos.
5. Por juego: tarjetas con etiqueta (`Mejora sostenida`, `Estable`, `Deterioro`, `Datos insuficientes`), explicación, eficiencia, % sobre la media, tiempo típico, mejor marca, racha, sparkline.

Evidencia: `src/frontend.ts:403-440`; `src/dashboard.client.js:1563-1747`.

#### 3.3.2 Qué funciona

- Es el único dominio que **distingue mejora observada de mejora detectable**: bandas de ruido calibradas con el historial del propio juego, regla de dos semanas, flecha solo a 28 días y solo con cobertura mínima.
- **`n` en cada cifra**, huecos visibles, «periodo anterior incompleto» explicado, tabla de datos equivalente al gráfico.
- La **etiqueta va acompañada de la razón**: «Ninguna señal supera el ruido de este juego», «faltan observaciones», «sin calibración».
- El **rango temporal** es explícito y el gráfico no suaviza los huecos.

#### 3.3.3 Hallazgos

**G1 · La portada del dominio no responde «dónde estoy». Severidad: alta.**
El hero abre con «Racha actual» y «Ganas a la media global». La racha mide constancia de juego, no rendimiento; el % sobre la media es un proxy de velocidad relativa, no de habilidad. No hay veredicto sobre qué juegos mejoran, cuáles empeoran y cuáles no se pueden juzgar.
Evidencia: `src/frontend.ts:404-424`; `src/dashboard.client.js:1730-1737`.

**G2 · Tres representaciones de los mismos datos. Severidad: media.**
La misma información aparece en la tabla, en el gráfico y en las tarjetas. Cada una añade algo (ordenar, ver evolución, leer la etiqueta), pero no hay jerarquía: las tres están abiertas por defecto.
Evidencia: `src/frontend.ts:427-439`.

**G3 · La entrada manual compite con el análisis. Severidad: media (matizada en validación visual).**
«Registrar resultado» y los chips de hoy ocupan el hero. Es la acción diaria y debe seguir accesible, pero no es la posición. En escritorio desplaza la lectura; en móvil es lo primero que se ve.  
*(Nota de validación 2026-11-04: La validación en pantalla confirmó que, al no existir sincronización automática para LinkedIn Games, la entrada manual es la acción primaria diaria más crítica del usuario; por tanto, no debe relegarse a enlaces secundarios, sino rediseñarse de forma compacta en el hero junto al veredicto).*
Evidencia: `src/frontend.ts:412`, `423`.

**G4 · Dos juegos sin calibración se ven casi como «estable». Severidad: alta.**
`noise-bands.json` solo calibra `patches`, `queens`, `mini_sudoku` y `zip`; `tango` y `wend` están en `uncalibrated`. La etiqueta correcta es «Datos insuficientes · sin calibración», pero el texto no muestra el progreso de cobertura (57 de 112 días). El usuario no sabe si es un límite temporal o permanente.
Evidencia: `src/slices/linkedin-games/domain/noise-bands.json`; `src/dashboard.client.js:1596-1599`.

**G5 · «Eficiencia ×1,74» no se explica en el primer contacto. Severidad: media.**
La eficiencia es `media global / tu tiempo`. Sin esa frase, el número no significa nada y la comparación entre juegos no es intuitiva. La explicación existe en la documentación, no en la pantalla.
Evidencia: `src/dashboard.client.js:1620`, `1707`.

**G6 · No hay síntesis cross-game. Severidad: alta.**
Cada juego tiene su etiqueta, pero nadie dice «mejoras en 3, sin señal en 1, 2 no se pueden juzgar». Esa frase es la posición del dominio y hoy no existe.
Evidencia: `src/dashboard.client.js:1697-1716`.

**G7 · No hay bloque «¿Cómo sabemos esto?». Severidad: media.**
Ajedrez e idiomas tienen divulgación metodológica; Games explica las reglas en notas dispersas. Las bandas, el bootstrap, la regla de dos semanas y la cobertura mínima merecen el mismo tratamiento.
Evidencia: `src/frontend.ts:209-216`, `336-343`; ausente en `403-440`.

**G8 · Games no existe fuera de su pestaña. Severidad: alta.**
No aparece en la portada, ni en «Qué cambió», ni en «Trayectoria». El dominio con el modelo epistémico más maduro es el más aislado del sistema.
Evidencia: `src/frontend.ts:48-120`; `src/dashboard.client.js:2066`, `2109-2122`; `1461-1475`.

#### 3.3.4 Ejemplo con datos reales documentados

Fuente: `docs/audits/linkedin-games-study-2026-11-03.md` (Excel v48, 794 filas, 170 días, 2026-05-17 → 2026-11-03). Es el historial real del propietario, ya documentado en el repositorio; no se ha consultado producción para esta auditoría.

| Juego | n | Gana a la media | Eficiencia 1ª mitad | 2ª mitad | Últimos 14 d | Mejor | Racha |
|---|---:|---:|---:|---:|---:|---:|---:|
| Patches | 170 | 88% | 1,76 | 2,11 | 1,73 | 5 s | 14 |
| Queens | 170 | 82% | 1,56 | 2,08 | 1,74 | 19 s | 1 |
| Sudoku | 170 | 98% | 1,60 | 2,04 | 2,17 | 33 s | 129 |
| Tango | 57 | 65% | 1,30 | 1,13 | 1,13 | 32 s | 1 |
| Wend | 57 | 100% | 2,23 | 2,50 | 2,54 | 9 s | 57 |
| Zip | 170 | 84% | 1,50 | 1,83 | 2,03 | 4 s | 5 |

Lectura honesta: el estudio describe **mejora descriptiva en 5 de 6** (segunda mitad vs primera). El producto, correctamente, exige más: banda de ruido y persistencia de dos semanas. Por eso no puede afirmar lo mismo que el estudio. Esa diferencia es una fortaleza, no un defecto; la auditoría propone hacerla visible.

Lo que debería decir la posición:

> **Mejora sostenida en 3 juegos; Patches sin señal; Tango y Wend sin calibrar.** Mini Sudoku, Queens y Zip han mostrado señal de mejora en parte de las últimas 9 semanas bajo la regla calibrada. Patches no ha mostrado señal en ningún horizonte. Tango desciende de forma descriptiva (1,30 → 1,13; n=57) y es el único por debajo del 70% de veces que ganas a la media, pero sin bandas no se puede afirmar deterioro. Wend y Tango están a 57 de 112 días de calibración.
>
> **Merece atención:** Tango, descenso descriptivo que aún no se puede juzgar. Queens rinde peor entre semana (1,50) que en fin de semana (2,40): parte de la variación es dificultad del puzzle, no tuya.

---

## 4. Inconsistencias entre dominios

| Dimensión | Ajedrez | Idiomas | Games | Decisión propuesta |
|---|---|---|---|---|
| Nombre de entrada | «Partidas» | «Cursos» | «Juegos» | «Ajedrez», «Idiomas», «LinkedIn Games» |
| Métrica del hero | ELO | Curso + XP | Racha | Veredicto en frase; la métrica va debajo |
| Capa de análisis | En «Perfil», separada | No existe | En la misma página | Pestaña «Análisis» en los tres |
| Vocabulario epistémico | Solo en Cambios/Trayectoria | Solo en Cambios/Trayectoria | Etiquetas propias | Un glosario común, etiquetas de dominio intactas |
| Muestra (`n`) | Parcial | Casi ausente | En cada cifra | `n` obligatorio junto a toda cifra inferencial |
| Ventana | Últimas 20/50/100 partidas | 7 / 90 días | 7 / 28 / 90 / todo | Control común que respeta la unidad de cada dominio |
| Alcance | Implícito | `CUENTA` / `CURSO` | Implícito | `ScopePill` en toda cifra agregada |
| Frescura | La escribe la cabecera global | Línea propia | Fecha del registro | Frescura por dominio + global agregada |
| Metodología | Sí | Sí | No | Sí, en los tres |
| Presencia en portada | Sí | Sí | No | Sí, en los tres |
| Presencia en «Cambios» | Sí | Sí | No | Sí, en los tres |
| Presencia en «Trayectoria» | Sí | Sí | No | Sí, o declarar por qué no |

---

## 5. Arquitectura de información común

### 5.1 Los tres niveles como contrato de pantalla

| Nivel | Pregunta | Contenido máximo | No contiene |
|---|---|---|---|
| **Posición** | ¿Dónde estoy y qué merece atención? | 1 veredicto + 3 señales + 1 lista de atención + frescura + `n` | Tablas, distribuciones, filtros, series largas |
| **Análisis** | ¿Por qué? ¿Qué patrón explica esto? | ≤5 afirmaciones con estado epistémico y evidencia resumida | La tabla completa, el crudo, la metodología extensa |
| **Evidencia** | ¿Cómo lo compruebo? | Métricas, distribuciones, muestras, ventanas, filas, metodología, limitaciones | Nuevas conclusiones |

**Regla de navegación:** toda afirmación del nivel 2 enlaza a su ancla del nivel 3. Toda señal del nivel 1 enlaza a su afirmación del nivel 2. Ninguna cifra inferencial aparece sin `n` y ventana.

### 5.2 Reglas transversales

1. **Una cifra, una interpretación.** Si un número aparece en Posición, lleva una frase que diga qué significa o no aparece.
2. **`n` y ventana junto al número**, no en una nota al pie.
3. **Alcance explícito** (`CUENTA`, `CURSO`, `JUEGO`, `PARTIDAS`) en toda agregación.
4. **Frescura por dominio.** La cabecera global resume; cada dominio declara su última observación.
5. **Incertidumbre visible** cuando exista (IC, bandas, IQR, rango). Si no existe, se dice: «tasa descriptiva, sin intervalo».
6. **Vocabulario epistémico común:** `AFIRMADO`, `INDICIO`, `INSUFICIENTE`, `SIN INDICIO`. Las etiquetas de Games (`Mejora sostenida`, `Estable`, `Deterioro`, `Datos insuficientes`) se mantienen y se mapean al glosario.
7. **Hipótesis ≠ conclusión.** Una causa posible se etiqueta como hipótesis y no se presenta como hallazgo.
8. **Nada se elimina.** Lo que no va en Posición se reubica en Análisis o Evidencia.

### 5.3 Navegación y URLs

```text
Hoy                         /                  Portada global
Ajedrez                     /chess             Posición
  Análisis                  /chess/analysis
  Evidencia                 /chess/evidence
Idiomas                     /languages         Posición
  Análisis                  /languages/analysis
  Evidencia                 /languages/evidence
LinkedIn Games              /games             Posición
  Análisis                  /games/analysis
  Evidencia                 /games/evidence
Cambios                     /changes           Cross-domain
Trayectoria                 /trajectory        Cross-domain
Datos y método              /method            Metodología + /raw
Configuración               /settings
```

- El curso seleccionado sigue siendo una subruta: `/languages/DUOLINGO_XA_EN`.
- Cada afirmación tiene ancla: `/chess#color`, `/games#tango`.
- *(Nota de validación 2026-11-04: La validación en pantalla desaconseja multiplicar sub-URLs rígidas como `/chess/evidence` o `/games/analysis`, ya que en móvil y en paneles de seguimiento personal añaden fatiga de navegación. La estructura recomendada mantiene la URL canónica por dominio con anclas o disclosure progresivo vertical: Posición visible arriba, Evidencia accesible mediante enlaces directos a anclas).*
- El menú lateral deja de mezclar niveles: tres dominios, luego dos vistas globales, luego cuenta.

### 5.4 Qué aparece primero y qué queda bajo demanda

| Pantalla | Siempre visible | Bajo demanda |
|---|---|---|
| **Portada** | 3 veredictos, 3 señales, atención (≤3), frescura, «desde tu última visita» | Detalle por dominio, historial, metodología |
| **Posición** | Veredicto, 3 señales, atención, ventana, `n`, frescura, «cómo sabemos» | Distribuciones, series, tablas |
| **Análisis** | ≤5 afirmaciones + estado + evidencia resumida + enlace | Criterios completos, ventanas alternativas, todas las afirmaciones |
| **Evidencia** | Definición, muestra, ventana, limitaciones, filas | Filtros avanzados, crudo, exportación |
| **Cambios** | Ventana, evaluaciones con estado, actividad de contexto | Historial de ventanas, criterios |
| **Trayectoria** | Patrones con estado y evidencia | Criterios, mitades, muestras |

**Nunca en primera pantalla:** timeline de 90 días, concentración histórica, perfil semanal, histograma de ELO rival, tabla completa de partidas, comparabilidad por curso, todas las aperturas.

### 5.5 Componentes comunes

| Componente | Función | Reglas |
|---|---|---|
| `PositionCard` | Veredicto + 3 señales + atención | Máximo una por dominio |
| `SignalRow` | Una señal con valor, `n`, ventana y estado | Sin `n` no se renderiza como señal |
| `ClaimCard` | Afirmación + estado + evidencia resumida + enlace | Una afirmación, un ancla |
| `EvidenceLink` | «Ver evidencia» → ancla del nivel 3 | Nunca a `/raw` directamente |
| `ScopePill` | `CUENTA` / `CURSO` / `JUEGO` / `PARTIDAS` | Obligatorio en agregados |
| `WindowPicker` | Opciones propias del dominio, con unidad visible | No fuerza días donde la unidad es partidas |
| `SampleBadge` | `n=…` con advertencia si es pequeño | El umbral lo define el dominio |
| `FreshnessNote` | Última observación del dominio | Nunca la de otro dominio |
| `LimitsBlock` | «Lo que estos datos no pueden decir» | Obligatorio en Idiomas; recomendado en los otros |
| `MethodDisclosure` | Metodología y limitaciones | En Evidencia, no en Posición |

---

## 6. Propuesta de portada global

### 6.1 Principio

La portada no es un resumen de métricas. Es una **lectura de la posición global** que permite decidir en qué dominio entrar. No existe una métrica única de «progreso Meridian»: los dominios no son conmensurables (ELO, unidades curriculares y eficiencia no se suman). Inventar un índice compuesto sería una métrica sin significado y homogeneizaría lo que debe seguir siendo distinto.

### 6.2 Contenido

1. **Cabecera de situación:** última sincronización por dominio, en una línea.
2. **Tres tarjetas de dominio**, cada una con:
   - veredicto en una frase;
   - evolución con ventana;
   - una fortaleza;
   - un límite;
   - una cosa que merece atención;
   - «Ver análisis →».
3. **«Merece atención» global:** máximo 3 elementos, priorizados entre dominios, cada uno con su enlace.
4. **«Desde tu última visita»:** reutiliza el ancla de `changes-anchor`; no repite las tarjetas.
5. **Nada más.** La actividad de la semana se elimina de la portada o se mueve a Evidencia.

### 6.3 Wireframe

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Meridian              Actualizado: Ajedrez hace 2 h · Idiomas ayer ·       │
│                       Games hoy                             [Sincronizar]  │
├──────────────────┬─────────────────────────────────────────────────────────┤
│ HOY              │  TU POSICIÓN                                            │
│                  │  ┌───────────────────────────────────────────────────┐  │
│ Ajedrez          │  │  Base registrada, con una señal de color          │  │
│ Idiomas          │  │  Una sola observación de ELO · 71,7% WR           │  │
│ LinkedIn Games   │  │  Fortaleza: negras 75,0% (28 decididas)           │  │
│                  │  │  Límite: perfil de motor sin analizar (0/60)      │  │
│ ─────────────    │  │  Atención: PvP 57,1% (n=9, no concluyente)        │  │
│ Cambios          │  │                                    Ver análisis → │  │
│ Trayectoria      │  └───────────────────────────────────────────────────┘  │
│                  │  ┌───────────────────────────────────────────────────┐  │
│ ─────────────    │  │  Activo, con avance verificable en un curso       │  │
│ Datos y método   │  │  14/25 unidades · +2 en A1.2 (mismo denominador)  │  │
│ Configuración    │  │  Fortaleza: 28/28 días activos                    │  │
│                  │  │  Límite: la actividad no mide comprensión         │  │
│                  │  │  Atención: Demo Gamma sin Path observado          │  │
│                  │  │                                    Ver análisis → │  │
│                  │  └───────────────────────────────────────────────────┘  │
│                  │  ┌───────────────────────────────────────────────────┐  │
│                  │  │  Mejora sostenida en 3; Patches sin señal         │  │
│                  │  │  Racha 48 días · 794 resultados históricos        │  │
│                  │  │  Fortaleza: Sudoku 98% (n=170)                    │  │
│                  │  │  Límite: Tango 1,13 · 65% (n=57)                  │  │
│                  │  │  Atención: Tango, descenso sin calibrar           │  │
│                  │  │                                    Ver análisis → │  │
│                  │  └───────────────────────────────────────────────────┘  │
│                  │                                                         │
│                  │  MERECE ATENCIÓN                                        │
│                  │  1. Tango: descenso descriptivo, sin calibrar  →        │
│                  │  2. PvP: 9 partidas, muestra insuficiente      →        │
│                  │  3. Demo Gamma: sin segunda observación        →        │
│                  │                                                         │
│                  │  DESDE TU ÚLTIMA VISITA · 3 cambios →                   │
└──────────────────┴─────────────────────────────────────────────────────────┘
```

### 6.4 Reglas de degradación

- Si un dominio falla, su tarjeta muestra «No disponible» con el motivo y un enlace a Evidencia; la portada no desaparece.
- Si un dominio no tiene datos, la tarjeta dice «Sin observaciones» y explica qué falta para poder hablar.
- Si no hay evidencia suficiente para un veredicto, el veredicto es «No hay evidencia suficiente para afirmar una mejora», no «estable».
- La portada no dispara peticiones nuevas por tarjeta: reutiliza el bundle y añade, como máximo, una lectura del resumen de Games.

---

## 7. Wireframes conceptuales

> Los wireframes muestran estructura, jerarquía y copy. Las cifras son marcadores de posición salvo las que se marcan como demo o estudio; los ejemplos verificables están en la sección 8.

### 7.1 Ajedrez · Posición

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Ajedrez          [Posición]  Análisis   Evidencia                        │
├──────────────────────────────────────────────────────────────────────────┤
│  Base registrada, con una señal de color                                 │
│  ELO 900 · una sola observación; sin tendencia comparable                │
│                                                                          │
│  FORTALEZA            Con negras ganas 75,0% (28 decididas)              │
│                       IC 95% [57–87]                                     │
│  LÍMITE               Perfil de motor sin analizar (0/60 partidas)       │
│  ATENCIÓN             PvP 57,1% (n=9; 7 decididas) · insuficiente        │
│                                                                          │
│  Ventana: últimas 50 partidas ▾        ¿Cómo sabemos esto? →             │
│                                                                          │
│  Última observación: hace 2 h · 60 partidas · 9 PvP / 51 bots            │
└──────────────────────────────────────────────────────────────────────────┘
```

Anotaciones:
- El veredicto es una frase, no un número.
- Cada señal declara `n` y ventana.
- «Muestra insuficiente» es un estado visible, no una nota.
- El selector de ventana conserva la unidad del dominio (partidas).

### 7.2 Ajedrez · Análisis

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Ajedrez          Posición  [Análisis]   Evidencia                        │
├──────────────────────────────────────────────────────────────────────────┤
│  PATRONES OBSERVADOS                                    Ventana: 50 ▾    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Tu ventaja está en el final                    [AFIRMADO]          │  │
│  │ Ganas 71% de las partidas que llegan al final (n=28), frente a     │  │
│  │ 55% en apertura (n=60).                                            │  │
│  │ Evidencia: conversión, errores/100 por fase, 28 partidas     →     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Tu fuga está en el medio juego                 [AFIRMADO]          │  │
│  │ 4,2 errores graves/100 jugadas; 58% de tus derrotas se decidieron  │  │
│  │ antes de tu jugada 24.                                             │  │
│  │ Evidencia: ACPL, momento decisivo, partidas filtradas        →     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Rindes distinto por color                      [INDICIO]           │  │
│  │ Negras 75,0% vs blancas 68,0% (28/25 decididas). El IC incluye 0.  │  │
│  │ Evidencia: win rate por color, partidas                      →     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Contra PvP no hay evidencia suficiente         [INSUFICIENTE]      │  │
│  │ 9 partidas; el criterio exige 30 por segmento.                     │  │
│  │ Evidencia: muestra, criterio                                 →     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  PERFIL DE JUEGO (motor) · cobertura 42/60 partidas · 2026-10-30 →       │
└──────────────────────────────────────────────────────────────────────────┘
```

Anotaciones:
- Máximo cinco tarjetas; el resto, en Evidencia.
- `AFIRMADO / INDICIO / INSUFICIENTE` es el mismo vocabulario que ya usa «Qué cambió».
- Cada tarjeta enlaza a las filas que la sostienen.
- El perfil de motor se integra, no compite.

### 7.3 Idiomas · Posición

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Idiomas          [Posición]  Análisis   Evidencia                        │
├──────────────────────────────────────────────────────────────────────────┤
│  Activo, con avance verificable en un curso                              │
│  Demo Alpha · 14/25 unidades · observado 2026-09-28                      │
│                                                                          │
│  CONSISTENCIA         28/28 días activos · mediana 50 XP/día             │
│                       (IQR 35–65)                                        │
│  AVANCE               +2 unidades en A1.2 · mismo denominador (25)       │
│  FOCO                 3 cursos · 72,5% del XP del catálogo en Demo Alpha │
│                                                                          │
│  Objetivo diario: 50 XP · hoy 50/50 · 4 de 7 días cumplidos              │
│                                                                          │
│  LO QUE ESTOS DATOS NO PUEDEN DECIR                                      │
│  No miden comprensión, lectura, escritura ni expresión oral.             │
│  XP, racha y lecciones no son dominio lingüístico.                       │
│  «Nivel A1» = unidades del árbol etiquetadas A1, no competencia A1.      │
│                                                                          │
│  Última observación: ayer · curso en foco elegido en el dashboard        │
└──────────────────────────────────────────────────────────────────────────┘
```

Anotaciones:
- El bloque de límites es permanente y no plegable.
- El avance curricular lleva fecha y denominador.
- El objetivo diario se queda: es la única acción.
- Fuera: timeline, concentración, perfil semanal.

### 7.4 Idiomas · Análisis

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Idiomas          Posición  [Análisis]   Evidencia                        │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Tu actividad es estable                        [AFIRMADO]          │  │
│  │ Mediana 50 XP/día (IQR 35–65) en 28 días; densidad 100%.           │  │
│  │ Evidencia: días, distribución, n                             →     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Tu avance es real en A1.2                      [AFIRMADO]          │  │
│  │ +2 unidades con ΔtotalUnits = 0 (25 → 25).                         │  │
│  │ Evidencia: dos observaciones, secciones                      →     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ El árbol cambió en A2.1                        [INSUFICIENTE]      │  │
│  │ 8 → 9 unidades totales: no se calcula avance.                      │  │
│  │ Evidencia: delta estructural, fechas                         →     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Hipótesis: el fin de semana concentra la práctica  [HIPÓTESIS]     │  │
│  │ El demo no muestra esa diferencia (42,5 vs 50,0 XP; n=4 por día).  │  │
│  │ No es una conclusión: muestra pequeña.                        →    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ACTIVIDAD ≠ APRENDIZAJE · ver límites →                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

Anotaciones:
- Se separa lo observado de lo hipotetizado.
- La comparabilidad se explica en la propia tarjeta.
- La actividad no se presenta como competencia.

### 7.5 LinkedIn Games · Posición

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ LinkedIn Games   [Posición]  Análisis   Evidencia                        │
├──────────────────────────────────────────────────────────────────────────┤
│  Mejora sostenida en 3; Patches sin señal; 2 sin calibrar                │
│  Periodo: 28 días ▾ · 794 resultados históricos · 170/57 d por juego     │
│                                                                          │
│  FORTALEZA      Sudoku: 98% gana a la media (n=170) · ×2,17 en 14 d      │
│  LÍMITE         Tango: ×1,13 · 65% (n=57) · único por debajo del 70%     │
│  ATENCIÓN       Tango: descenso descriptivo, sin calibración             │
│                 Wend y Tango: 57/112 días para calibrar                  │
│                                                                          │
│  Hoy: [Zip ✓] [Tango] [Queens ✓] [Mini Sudoku] [Patches ✓] [Wend]        │
│                                                       + Registrar        │
│                                                                          │
│  ¿Cómo sabemos esto? →                                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

Anotaciones:
- La racha pasa a ser un dato secundario, no el veredicto.
- La cobertura de calibración se muestra como progreso, no como nota.
- La entrada diaria sigue a mano, pero no domina.
- «Eficiencia ×1,74» se explica al primer contacto con una línea.

### 7.6 Evidencia (panel común)

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Volver al análisis        EVIDENCIA · Asimetría por color              │
├──────────────────────────────────────────────────────────────────────────┤
│  QUÉ SE MIDIÓ                                                            │
│  Win rate por color en partidas decididas.                               │
│  Ventana: 2026-09-01 → 2026-09-30 · n=60 (30 blancas / 30 negras)        │
│                                                                          │
│  RESULTADO                                                               │
│  Blancas 68,0% [48,4–82,8] · Negras 75,0% [56,6–87,3]                    │
│  Diferencia +7,0 pp · IC 95% [−16,6, +30,1] · incluye 0                  │
│                                                                          │
│  DISTRIBUCIÓN                                                            │
│  Blancas  ███████░░░░  17V 8D 5T                                         │
│  Negras   █████████░░  21V 7D 2T                                         │
│                                                                          │
│  FILAS QUE LO SOSTIENEN                          [Ver 60 partidas →]     │
│  …                                                                       │
│                                                                          │
│  METODOLOGÍA Y LÍMITES                                                   │
│  Partidas decididas; tablas excluidas del win rate.                      │
│  Sin ajuste por dificultad del rival.                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

Anotaciones:
- Toda evidencia declara qué se midió, ventana, `n`, resultado, distribución, filas y límites.
- «Ver partidas» aplica el filtro exacto, no la tabla genérica.
- `/raw` queda al final, como último recurso.

---

## 8. Ejemplos con datos disponibles

### 8.1 Antes / después · Ajedrez (demo)

| Elemento | Antes | Después |
|---|---|---|
| Entrada | «Partidas» | «Ajedrez» |
| Primera frase | `900` · `ELO · 0 vs primer snapshot` | «Base registrada, con una señal de color» |
| Ventana | «primer snapshot» | «Una observación · 2026-09-01 → 2026-09-30» |
| Color | Barras 68,0% / 75,0% | «Negras 75,0% (28 decididas) · IC [57–87]; diferencia +7,0 pp, IC incluye 0 → indicio» |
| PvP | «Bots: 51 (73,9%) · PvP: 9 (57,1%)» | «PvP 57,1% (n=9; 7 decididas): muestra insuficiente para concluir» |
| Análisis | Pestaña «Perfil» aparte | Pestaña «Análisis» con 4–5 afirmaciones y enlaces |
| Evidencia | Tabla + `/raw` | Pestaña «Evidencia» con anclas desde cada afirmación |

### 8.2 Antes / después · Idiomas (demo)

| Elemento | Antes | Después |
|---|---|---|
| Entrada | «Cursos» | «Idiomas» |
| Primera frase | `14 / 25 unidades (56,0%)` | «Activo, con avance verificable en un curso» |
| Fecha | En una línea aparte | Junto al dato: «observado 2026-09-28» |
| CEFR | «Nivel A1 (2 sec) 10 / 12 unidades» | «Unidades del árbol etiquetadas A1: 10/12 (no es competencia A1)» |
| Cambios | «+50 XP hoy · Curso en foco» | «Cambio curricular: +2 unidades en A1.2 (mismo denominador); actividad: +50 XP hoy» |
| Límites | No aparecen | Bloque permanente «Lo que estos datos no pueden decir» |
| Métricas ocultas | HHI, IQR, `n` no se muestran | En Evidencia: HHI 0,58, 1,73 cursos efectivos, IQR, `n` por día |

### 8.3 Antes / después · Games (datos reales documentados)

| Elemento | Antes | Después |
|---|---|---|
| Primera frase | «Racha actual 48» | «Mejora sostenida en 3; Patches sin señal; 2 sin calibrar» |
| Cobertura | «Sin calibración» sin progreso | «57/112 días para calibrar» |
| Tango | Tarjeta con etiqueta | Afirmación descriptiva (sin calibración) con enlace a evidencia |
| Cross-game | No existe | Una frase de síntesis + lista de atención |
| Metodología | Notas dispersas | «¿Cómo sabemos esto?» con bandas y regla de dos semanas |
| Portada / Cambios | Ausente | Presente en ambos |

### 8.4 Lo que no se debe decir

- «Tu nivel de inglés es B1» a partir de XP o unidades.
- «Has mejorado» sin banda, ventana o persistencia.
- «Eres mejor con negras» sin `n` ni intervalo.
- «Juegas peor los fines de semana» sin separar dificultad del puzzle.
- «Progreso Meridian: 72%» combinando ELO, unidades y eficiencia.
- «Sin cambios» cuando el estado real es «no hay evidencia suficiente».

---

## 9. Matriz de impacto y esfuerzo

Escala: impacto alto/medio/bajo; esfuerzo S ≤ 1 día, M 2–5 días, L 1–2 semanas. Riesgo se refiere al riesgo de empeorar la experiencia o de requerir contrato nuevo.

| ID | Cambio | Dominio | Impacto | Esfuerzo | Riesgo | Dependencia |
|---|---|---|---|---|---|---|
| U1 | Portada con los tres dominios y veredictos | Global | Alto | M | Medio | Resumen de Games en la carga inicial |
| U2 | Encabezado de Posición por dominio | Global | Alto | M | Bajo | — |
| U3 | Pestañas Posición/Análisis/Evidencia + URLs | Global | Alto | M | Medio | Router de cliente |
| U4 | Glosario epistémico común | Global | Alto | S | Bajo | Vocabulario ya existente |
| U5 | «Ver evidencia» en cada afirmación | Global | Alto | M | Bajo | Anclas estables |
| U6 | Mover tablas y distribuciones a Evidencia | Global | Alto | S/M | Bajo | — |
| U7 | Selector de ventana común con unidad visible | Global | Medio | S | Bajo | — |
| U8 | `SampleBadge` con `n` en toda cifra inferencial | Global | Alto | S | Bajo | — |
| U9 | Corregir «Cambios observados» (curricular ≠ actividad) | Idiomas | Alto | S | Bajo | — |
| U10 | Incluir Games en Cambios y Trayectoria | Global | Medio | L | Alto | Contrato de lectura nuevo |
| U11 | Síntesis cross-game + cobertura de calibración | Games | Alto | S | Bajo | `noise-bands.json` |
| U12 | Bloque «Lo que estos datos no pueden decir» + copy CEFR | Idiomas | Alto | S | Bajo | — |
| U13 | Fusionar Partidas + Perfil en Análisis | Ajedrez | Alto | M | Medio | — |
| U14 | Delta de ELO con ventana, `n` y estado | Ajedrez | Medio | S | Bajo | — |
| U15 | Frescura por dominio + cabecera agregada | Global | Alto | S | Bajo | — |
| U16 | Panel de Evidencia con definición, muestra y límites | Global | Alto | M | Medio | — |
| U17 | Distribuciones/percentiles bajo demanda | Global | Medio | M | Alto | Games no tiene percentiles de comunidad |
| U18 | Accesibilidad: no depender solo del color | Global | Medio | S/M | Bajo | — |
| U19 | Mobile: portada y pestañas | Global | Medio | S | Bajo | — |
| U20 | Declarar alcance de «Sincronizar» (Games es manual) | Global | Medio | S | Bajo | — |

**Lectura de la matriz:** ocho cambios de alto retorno cuestan S o M y no requieren contrato nuevo (U4, U8, U9, U11, U12, U14, U15, U20). Son el mejor retorno y deberían ir primero. Los cambios L (U10) y los que prometen percentiles (U17) necesitan decisión de producto y contrato aparte.

---

## 10. Roadmap incremental

Cada fase es enviable por separado y no requiere cambios de esquema. Ninguna fase elimina profundidad.

### Fase 0 · Verdad y vocabulario (3–5 días)

- U4 glosario epistémico.
- U8 `n` obligatorio.
- U9 corregir «Cambios observados».
- U12 límites de Idiomas + copy CEFR.
- U14 delta de ELO con ventana y estado.
- U15 frescura por dominio.
- U20 alcance de «Sincronizar».

**Criterio de salida:** ninguna cifra inferencial aparece sin `n` y ventana; ninguna tarjeta mezcla conceptos; cada dominio declara su frescura; el usuario sabe que Games es manual.

**No hacer todavía:** reordenar pantallas, añadir pestañas, tocar contratos.

### Fase 1 · Posición (1–2 semanas)

- U2 encabezado de Posición en los tres dominios.
- U1 portada con tres tarjetas y «merece atención».
- U6 mover el detalle a Evidencia (pestaña o sección).
- U7 selector de ventana.
- U11 síntesis cross-game.
- U13 primera mitad: «Perfil» pasa a ser una subsección de Análisis de ajedrez.

**Criterio de salida:** cada dominio responde «dónde estoy» y «qué merece atención» sin scroll; la portada responde lo mismo para los tres.

**No hacer todavía:** afirmaciones nuevas, enlaces de evidencia, cambios de contrato.

### Fase 2 · Análisis (2–3 semanas)

- U5 «Ver evidencia» en cada afirmación.
- U3 pestañas completas y URLs.
- U13 afirmaciones de ajedrez (color, fase, apertura, PvP).
- Afirmaciones de idiomas (consistencia, avance, estructura, foco).
- Estados epistémicos en ambos.

**Criterio de salida:** el usuario puede leer 3–5 patrones por dominio, distinguir conclusión de hipótesis y llegar a la prueba en un clic.

**No hacer todavía:** percentiles, índice compuesto, conclusiones causales.

### Fase 3 · Evidencia y confianza (1–2 semanas)

- U16 panel de Evidencia completo.
- Distribuciones, IQR, HHI, `n` por día, histogramas.
- Metodología por dominio (incluido Games).
- Anclas estables y filtros exactos desde cada afirmación.

**Criterio de salida:** toda afirmación tiene una prueba navegable; toda evidencia declara definición, muestra, ventana y límites.

**No hacer todavía:** `/raw` como destino principal; exportaciones nuevas.

### Fase 4 · Global (1 semana + contrato)

- U10 Games en Cambios y Trayectoria.
- «Desde tu última visita» con los tres dominios.
- Trayectoria con estado epistémico y enlaces.
- Revisión de accesibilidad y móvil (U18, U19).

**Criterio de salida:** el sistema se lee como uno solo sin fusionar métricas; ningún dominio queda fuera de las vistas globales.

---

## 11. Riesgos y dependencias

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| **Homogeneización** | Forzar una métrica común (índice, percentil, «nivel») distorsiona los tres dominios. | Compartir gramática y componentes, no unidades ni umbrales. |
| **Falsa precisión** | Convertir descriptivos en conclusiones al añadir veredictos. | Veredictos generados por reglas con evidencia; si no hay evidencia, `INSUFICIENTE`. |
| **XP como competencia** | Es la inferencia más fácil y la más dañina en Idiomas. | Bloque de límites permanente + copy CEFR explícito. |
| **Muestras pequeñas** | PvP `n=9`; Tango/Wend `n=57`; cursos con una sola observación. | `SampleBadge`, estados `INSUFICIENTE`, cobertura visible. |
| **Datos ausentes** | Path solo del curso abierto al sincronizar; Games manual sin backfill. | Declarar qué falta y desde cuándo; no convertir ausencia en cero. |
| **Cobertura de motor** | El perfil de ajedrez puede describir una minoría de partidas. | Mostrar cobertura y fecha junto al veredicto. |
| **Contrato nuevo** | U10 y U17 requieren API/contrato; el brief prohíbe modificarlos en esta auditoría. | Fase 4, aprobación separada, diseño de contrato antes de implementar. |
| **Rendimiento** | Añadir lecturas por tarjeta degrada la primera pantalla. | Reutilizar bundle; como máximo una lectura nueva para Games. |
| **Accesibilidad** | Barras y pills dependen del color; los gráficos ya tienen tabla alternativa. | No usar color como único canal; mantener `sr-only`, foco y teclado. |
| **Regresión de profundidad** | Mover tablas a Evidencia puede ocultar evidencia valiosa. | Enlaces desde cada afirmación; nada se elimina; `/raw` sigue existiendo. |
| **Deriva de copy** | Cada dominio puede volver a su tono anterior. | Glosario y componentes comunes; revisión de copy en cada fase. |

### Dependencias técnicas

- Lecturas existentes: `/api/stats/*`, `/api/languages`, `/api/languages/analytics`, `/api/languages/courses/:id`, `/api/me/linkedin-games/summary`, `/api/what-changed`, `/api/trajectory`.
- Vocabulario epistémico existente en `src/domain/whatChanged.ts` y `src/dashboard.client.js:1944-1959`.
- Artefacto de calibración `src/slices/linkedin-games/domain/noise-bands.json`.
- Cobertura de análisis de motor y de amenazas (procesos offline).
- Ancla de visitas (`changes-anchor`) ya implementada.
- Sin cambios de autenticación, sesión ni política de rutas.

### Dependencias de decisión

1. ¿Se acepta que la portada no tenga un índice global? (Recomendación: sí.)
2. ¿Se prioriza Fase 0–1 antes de tocar contratos? (Recomendación: sí.)
3. ¿Se amplía el contrato de Games para Cambios/Trayectoria? (Fase 4.)
4. ¿Se muestran percentiles solo donde existan datos? (Recomendación: sí; nunca simulados.)

---

## 12. Apéndice A · Inventario de evidencia disponible

| Dominio | Evidencia | Estado en la UI |
|---|---|---|
| Ajedrez | Resumen (partidas, WR, score, ELO, rachas) | Visible, duplicada |
| Ajedrez | Resultados por causa de fin | Visible en donut + contexto |
| Ajedrez | Color con IC y diferencia | Visible, sin conclusión |
| Ajedrez | Oponentes macro/segmentos | Visible, sin advertencia de `n` |
| Ajedrez | ELO del rival (conocidos/total, buckets) | Plegado |
| Ajedrez | Snapshots de ELO | Sparkline, sin tabla |
| Ajedrez | Aperturas blancas/negras | Visible, sin conclusión |
| Ajedrez | Fases + población hidratada | Visible, sin conclusión |
| Ajedrez | Mates dados/recibidos | Condicional |
| Ajedrez | Amenazas de mate (fases, reciente vs resto) | Condicional |
| Ajedrez | Perfil de motor (errores, ACPL, decisivo, conversión) | En otra entrada |
| Ajedrez | Partidas, filtros, visor, PGN | Visible al final |
| Idiomas | Totales de cuenta (XP, racha, días) | Visible |
| Idiomas | Cursos y XP | Visible |
| Idiomas | Secciones y CEFR | Visible, mal etiquetado |
| Idiomas | Días de XP (7/90) | Visible |
| Idiomas | Densidad, sesiones, tiempo, medianas/IQR | Parcial; IQR no visible |
| Idiomas | Intensidad (XP/sesión, tiempo/sesión, XP/min) | Parcial |
| Idiomas | Perfil semanal con `n` e IQR | Parcial; `n`/IQR no visibles |
| Idiomas | Concentración (HHI, cursos efectivos, top-3) | Parcial; HHI no visible |
| Idiomas | Deltas curriculares (3 estados) | Visible |
| Games | Resumen (racha, días, rango) | Visible |
| Games | Por juego: eficiencia, % media, tiempo, P25–P75, `n` | Visible |
| Games | Ventanas 7/28/90/todo | Visible |
| Games | Trayectoria por bucket + `n` | Visible |
| Games | Etiqueta + razón + bandas + calibración | Visible |
| Games | Tendencia 112 d (rho, pendiente, `n`) | En el texto de la etiqueta |
| Games | Cobertura de calibración (57/112) | **No visible** |
| Games | Registro diario manual | En modal |
| Games | Metodología | **No visible** |

---

## 13. Apéndice B · Auditoría de afirmaciones

| Afirmación mostrada | ¿Tiene evidencia? | ¿Se puede comprobar? | Veredicto |
|---|---|---|---|
| «ELO · 0 vs primer snapshot» | Parcial (una observación) | No hay enlace ni `n` | **Reformular** |
| «Racha actual: 3 victorias» | Sí (partidas) | Sí, tabla | Correcta |
| «Forma actual 68,2% [IC] vs anteriores» | Sí | Parcial, sin filtro | Correcta, enlazar |
| «Bots 73,9% · PvP 57,1%» | Sí | Sí, tabla | **Añadir muestra insuficiente** |
| «Asimetría por color» (Trayectoria) | Sí (ambas mitades) | Parcial | Correcta, enlazar |
| «Progreso curricular 56%» | Sí | Sí, secciones | **Añadir fecha y definición** |
| «Cambios observados: +50 XP hoy» | No es un cambio curricular | No | **Corregir** |
| «Nivel A1 10/12 unidades» | Sí | Sí | **Reformular** |
| «Mejora sostenida» (Games) | Sí (bandas 112 d + persistencia semanal) | Sí, tabla y `n` | Ejemplar |
| «Estable» (Games) | Sí (sin señal sobre ruido) | Sí | Correcta; aclarar «sin cambio detectable» |
| «Datos insuficientes» (Games) | Sí (cobertura) | Parcial | **Añadir progreso de cobertura** |
| «Ganas a la media 84%» | Sí | Sí, `n` | Correcta; explicar proxy |
| «Racha 48 días» | Sí | Sí | Correcta |
| «🔥 Racha» en portada | Sí, pero es de Duolingo | No se declara la fuente | **Reformular** |
| «Tu semana» (XP vs partidas) | Sí | Sí | **Separar o eliminar de portada** |

---

## 14. Apéndice C · Archivos inspeccionados

| Archivo | Qué se usó |
|---|---|
| `src/frontend.ts` | Navegación, portada, pestañas, textos, orden de bloques |
| `src/dashboard.client.js` | Renderizado, estados, ventanas, cálculo de copy |
| `src/dashboard.client.css` | Jerarquía visual, grids, breakpoints, accesibilidad |
| `src/api/router.ts` | Rutas y superficies de lectura |
| `src/api/stats.ts` | Evidencia de ajedrez |
| `src/api/languages.ts`, `languagesAnalytics.ts` | Evidencia de idiomas |
| `src/analytics/languages/types.ts` | Métricas calculadas y no mostradas |
| `src/slices/linkedin-games/domain/*` | Etiquetas, ruido, interpretación |
| `src/slices/linkedin-games/domain/noise-bands.json` | Juegos calibrados y no calibrados |
| `src/domain/whatChanged.ts` | Vocabulario epistémico |
| `src/domain/trajectory.ts` | Patrones longitudinales |
| `demo/demoData.ts`, `demo/syntheticCourse.ts` | Ejemplos de ajedrez e idiomas |
| `docs/audits/linkedin-games-study-2026-11-03.md` | Ejemplos reales de Games |
| `docs/audits/linkedin-games-p1-calibration/README.md` | Método de calibración |
| `docs/audits/2026-10-01-read-surface-audit.md` | Superficie de lectura y sensibilidad |
| `README.md`, `docs/ARCHITECTURE.md` | Principios y modelo |

---

## 15. Conclusión

Meridian no necesita más datos para convertirse en la herramienta que describe el brief. Necesita **contar lo que ya sabe** en el orden en que un humano decide: posición, análisis, evidencia.

La propuesta conserva la profundidad y la disciplina actuales, y añade tres cosas:

1. **Una portada que es una lectura, no un panel.**
2. **Una posición por dominio que responde las seis preguntas sin scroll.**
3. **Una cadena de comprobación:** cada afirmación lleva a su evidencia, y cada evidencia declara su muestra, su ventana y sus límites.

El criterio de éxito es verificable: si al entrar el usuario puede decir dónde está, cómo evoluciona, en qué destaca, qué le limita, qué merece atención y cómo comprobarlo, la experiencia funciona. Si necesita interpretar diez cifras para llegar ahí, no.

> **Primero comprender la posición. Después analizarla. Finalmente consultar la evidencia y decidir.**
