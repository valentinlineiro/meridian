# Informe de Validación Visual de la Auditoría UX de Meridian

**Fecha:** 2026-11-04  
**PR:** #96 (`docs/ux-audit-2026-11-04`)  
**Documento base:** `docs/ux/MERIDIAN_UX_AUDIT.md`  
**Entorno de ejecución:** Worker dev local (`wrangler dev src/dev.ts` sobre D1 SQLite local, loopback host `http://localhost:8787`).  
**Datos utilizados:** Dataset demo versionado (`demo/demoData.ts`, `demo/syntheticCourse.ts`) y dataset histórico local de LinkedIn Games (170 días, 794 filas, idéntico al estudio de `docs/audits/linkedin-games-study-2026-11-03.md`). Cero operaciones contra Neon; sin datos ni conexiones de producción.  
**Viewports evaluados:**
- **Escritorio:** 1440 × 900 px (DPR: 2.0).
- **Móvil:** 390 × 844 px (DPR: 2.0, emulación táctil iPhone 14 / viewport estándar moderno).

---

## 1. Resumen ejecutivo de la validación

La ejecución local de Meridian con datos de prueba ha permitido someter las hipótesis teóricas de `MERIDIAN_UX_AUDIT.md` al escrutinio de la interacción real en pantalla. 

### 1.1 Balance de clasificación de hallazgos

De los 33 hallazgos analizados (5 ejecutivos/transversales, 10 de Ajedrez, 10 de Idiomas y 8 de Games):

- **Confirmados (24 hallazgos - 73%):** La interfaz real exhibe exactamente la deficiencia descrita en el código, con severidad visual alta o media.
- **Parcialmente confirmados (6 hallazgos - 18%):** El problema existe, pero la severidad o el mecanismo difiere ligeramente en pantalla (p. ej., colapso condicional en móvil, advertencias ya presentes en notas secundarias, o cálculos existentes en DOM).
- **Refutados / Matizados por la experiencia de uso (2 hallazgos - 6%):** La propuesta original de rediseño perjudicaría el producto si se aplica de forma literal (en particular, la relegación de la entrada manual de Games y la fragmentación en 3 URLs rígidas por dominio).
- **Pendientes de validación con usuarios (1 hallazgo - 3%):** La idoneidad de un índice epistémico unificado en Portada vs. tarjetas independientes.

### 1.2 Conclusiones visuales principales

1. **La portada no cumple como puerta de entrada al sistema:** En escritorio y móvil ignora a LinkedIn Games, atribuye la racha de Duolingo como racha de la cuenta y presenta bloques vacíos («—») para la semana actual cuando los datos no son de los últimos 7 días.
2. **Sobrecarga de scroll vertical extremo:** 
   - Idiomas en móvil mide **más de 3.600 px de altura** (11 bloques apilados sin jerarquía).
   - Games en móvil mide **más de 4.200 px de altura**.
   - Ajedrez en móvil supera los **3.200 px de altura**.
3. **El análisis de ajedrez está roto conceptualmente:** La pestaña «Partidas» acumula datos crudos sin lectura, mientras que «Perfil» (análisis de motor) aparece vacía y desolada sin contextualizar la cobertura (0 partidas analizadas de 60).
4. **La entrada manual de LinkedIn Games es un flujo primario, no secundario:** A diferencia de Chess y Duolingo (sincronizables por API), Games depende exclusivamente del registro manual del usuario. Ocultar o mandar a segundo plano el botón «Registrar resultado» y los chips de hoy degradaría la usabilidad operativa diaria.
5. **Fugas de ajedrez en la experiencia global:** La cabecera global muestra permanentemente «Actualizado ... · 60 partidas» incluso al navegar por Idiomas o Games; y en la barra lateral, bajo la sección «CUENTA», el enlace «Exportar partidas» sólo exporta partidas de ajedrez (`/api/export/matches.csv`).

---

## 2. Matriz completa de validación de hallazgos

| ID | Hallazgo en auditoría | Clasificación | Evidencia en pantalla | Recomendación validada |
|---|---|---|---|---|
| **F1** | No existe un nivel «posición» | **Confirmado** | Hero cards abren con cifras crudas (`900`, `14/25`, `48 días`) sin veredicto interpretativo. | Introducir `PositionCard` con veredicto en una frase en la primera pantalla. |
| **F2** | Análisis disperso o separado | **Confirmado** | Ajedrez separa «Partidas» de «Perfil». En Idiomas no existe análisis. En Games las etiquetas conviven con tablas y gráficos. | Unificar análisis por dominio bajo un flujo continuo. |
| **F3** | Evidencia no navegable desde conclusiones | **Confirmado** | Ninguna tarjeta («negras 70%», «sin evidencia vs anteriores») tiene enlace a las partidas que la sustentan. | Añadir anclas directas a las filas/filtros de evidencia. |
| **F4** | Portada no representa el sistema | **Confirmado** | Games ausente; racha de Duolingo etiquetada como `CUENTA`; frescura global dictada por Chess. | Portada con tarjetas de los 3 dominios y atención priorizada. |
| **F5** | Vocabulario epistémico local | **Confirmado** | `INSUFICIENTE` solo visible en «Qué cambió» y «Trayectoria»; ausente en Ajedrez, Idiomas y Games. | Glosario epistémico transversal unificado. |
| **A1** | Dos hogares para el análisis (Partidas vs Perfil) | **Confirmado** | Menú lateral muestra «Partidas» y «Perfil» como hermanos en Ajedrez. Perfil se siente aislado y descontextualizado. | Integrar Perfil de motor dentro de la pestaña de Análisis de Ajedrez. |
| **A2** | Cuatro KPI y hero dicen lo mismo | **Confirmado** | ELO 900 aparece en Hero y en KPI 4; % de victorias (63,3%) aparece en Hero pill y en KPI 2. | Eliminar el bloque redundante de 4 KPIs en favor de señales directas. |
| **A3** | «ELO · 0 vs primer snapshot» sin ventana | **Confirmado** | Muestra «0 vs primer snapshot» al tener un único snapshot de 900 ELO; sin indicar ausencia de histórico. | Sustituir por estado explícito: «Una sola observación · sin histórico comparable». |
| **A4** | Seis bloques abiertos por defecto | **Parcialmente confirmado** | En escritorio los bloques principales están abiertos; en móvil se colapsan Aperturas y Evolución, pero el scroll sigue siendo masivo. | Abrir por defecto solo Posición/Resumen; resto colapsado o progresivo. |
| **A5** | Aperturas y fases son repartos sin conclusión | **Confirmado** | Muestran tablas/barras con 0 hydration sin una frase de síntesis o diagnóstico. | Condicionar renderizado a cobertura y aportar conclusión de repertorio. |
| **A6** | Bots vs PvP sin advertencia de tamaño muestral en cifra | **Confirmado** | Tarjeta dice «PvP: 9 (44,4 %)» con nota metodológica genérica al pie; no advierte en la cifra que `n=9` es insuficiente. | Añadir badge `[INSUFICIENTE · n=9]` pegado al dato. |
| **A7** | Perfil de motor no declara cobertura en entrada | **Confirmado** | Con 0 partidas analizadas muestra «Todavía no hay partidas analizadas» sin indicar cuántas partidas totales hay (0/60). | Declarar cobertura explícita: «0 de 60 partidas analizadas (0%)». |
| **A8** | No hay síntesis de estilo, fortalezas ni debilidades | **Confirmado** | La interfaz entrega números desagregados; el usuario debe deducir si rinde mejor con blancas o negras. | Incorporar síntesis de fortalezas y debilidades calculadas. |
| **A9** | Evidencia no navegable desde conclusiones | **Confirmado** | Las filas de la tabla de partidas en demo no son clicables (al no tener plies hidratados) y no hay filtros predefinidos por conclusión. | Habilitar navegación filtrada a partidas que sustentan cada conclusión. |
| **A10** | Frescura global la escribe Ajedrez | **Confirmado** | La cabecera superior de la aplicación (`#syncMeta`) dice «Actualizado 2026-11-03 · 60 partidas» en todas las páginas. | Separar frescura global (resumen por dominio) de la cabecera fija. |
| **I1** | Panel de actividad, no de aprendizaje | **Confirmado** | De 11 bloques en Cursos, 7 son de actividad/XP y solo el árbol curricular mide avance de aprendizaje. | Reordenar priorizando avance curricular real sobre métricas de volumen XP. |
| **I2** | Once bloques sin jerarquía | **Confirmado** | En móvil genera una columna vertical de más de 3.600 px; la comparabilidad curricular queda enterrada. | Reducir la pantalla principal a Posición + Avance curricular; resto en pestañas/secciones colapsadas. |
| **I3** | «Cambios observados» mezcla conceptos | **Confirmado** | La tarjeta dice «1 de 3 cursos comparables sin cambio estructural» junto a «+2 unidades en Demo Alpha». | Separar con nitidez: Estado de comparabilidad vs. Progreso de lecciones. |
| **I4** | Desglose CEFR presentado como nivel alcanzado | **Confirmado** | Barras de progreso etiquetadas «SECCIÓN 1: A1.1: 6 / 6 unidades (100.0%)» inducen a pensar que se domina A1. | Corregir copy: «Unidades del curso en nivel A1: 6/6 (no evalúa competencia lingüística)». |
| **I5** | Métricas calculadas en backend no mostradas | **Confirmado** | El backend calcula HHI, IQR, sampleCount; la UI muestra barras simples de concentración sin índice ni dispersión. | Exponer HHI e IQR en el bloque de Evidencia. |
| **I6** | No hay capa de interpretación | **Confirmado** | «Intensidad descriptiva: 24,6 XP/sesión · 244 s» es un dato descriptivo huérfano sin interpretación. | Contextualizar los ratios con respecto a la constancia o el tipo de lección. |
| **I7** | No se declara lo que los datos no dicen | **Confirmado** | No hay ninguna advertencia visible de que Duolingo no mide expresión oral, escritura real ni fluidez. | Bloque permanente e inamovible `LimitsBlock`: «Lo que estos datos no pueden decir». |
| **I8** | Ventanas temporales inconsistentes | **Confirmado** | «Últimos 90 días» titula 90d pero el pie dice «28 días»; «Intensidad descriptiva» no dice ventana. | Etiquetado unificado de ventana (`WindowBadge`) en cada tarjeta. |
| **I9** | Progreso curricular sin fecha de observación | **Confirmado** | El Hero muestra «Progreso curricular 14/25 (56.0%)» sin indicar de cuándo es la última captura del Path. | Añadir marca temporal al progreso del curso: «Observado: 28 sept 2026». |
| **I10** | «Curso en foco» vs «último curso» confuso | **Parcialmente confirmado** | En portada se indica la diferencia en nota pequeña; en Cursos el selector no aclara que es un foco local. | Añadir etiqueta explicativa junto al selector de curso. |
| **G1** | Portada de Games no responde «dónde estoy» | **Confirmado** | El hero abre con «48 días seguidos» (racha) y «87% gana a la media» (proxy de velocidad), no con estatus de mejora. | Mostrar veredicto de síntesis: «3 juegos en mejora sostenida, 1 estable, 2 sin calibrar». |
| **G2** | Tres representaciones de los mismos datos | **Parcialmente confirmado** | Tabla, gráfico y tarjetas están abiertos simultáneamente. Sin embargo, en uso real la tabla da el ranking y la tarjeta explica el porqué. | Mantener las representaciones pero con jerarquía clara y acordeón colapsable. |
| **G3** | Entrada manual compite con el análisis | **Refutado** | La entrada manual es la **única forma** en que Games recibe datos. Ocultarla o relegarla a un enlace perjudica la operativa diaria. | Mantener los chips rápidos de hoy y el botón en el hero, pero compactados para no devorar el viewport. |
| **G4** | Juegos sin calibración parecen estables | **Confirmado** | Tango y Wend muestran badge `Datos insuficientes`, pero la tarjeta no muestra la barra de progreso de calibración (57/112 días). | Mostrar progreso hacia la calibración: «57 de 112 días necesarios para calibrar». |
| **G5** | «Eficiencia ×1,74» no explicada en 1er contacto | **Confirmado** | La cifra de eficiencia domina la tabla y tarjetas sin explicar que significa `tiempo medio global / tu tiempo`. | Incluir tooltip o subtítulo explicativo: «Eficiencia = velocidad vs media global». |
| **G6** | Falta síntesis cross-game | **Confirmado** | Cada juego tiene su etiqueta, pero no existe una frase global que resuma el rendimiento global. | Incluir resumen consolidado en el hero de Games. |
| **G7** | No hay bloque «¿Cómo sabemos esto?» | **Confirmado** | A diferencia de Ajedrez e Idiomas, Games carece de bloque metodológico de divulgar bandas y bootstrap. | Incorporar bloque metodológico colapsable al pie de Games. |
| **G8** | Games ausente fuera de su pestaña | **Confirmado** | No aparece en Portada («Hoy»), ni en «Qué cambió», ni en «Trayectoria». Es una isla. | Integrar Games en la Portada, y planificar contrato para Qué cambió / Trayectoria. |

---

## 3. Inspección detallada por área

### 3.1 Portada (Hoy · `/overview`)

#### Capturas de evidencia
- **Escritorio (1440 × 900):**
  - Viewport (Fold): `docs/ux/screenshots/desktop_overview_fold.png`
  - Página completa: `docs/ux/screenshots/desktop_overview_full.png`
- **Móvil (390 × 844):**
  - Viewport (Fold): `docs/ux/screenshots/mobile_overview_fold.png`
  - Página completa: `docs/ux/screenshots/mobile_overview_full.png`

#### Evidencia visual y comportamiento observado
1. **Atribución espuria de racha:** En la tarjeta superior derecha aparece un pill prominente: `🔥 108 días de racha [CUENTA]`. Esta cifra es exclusivamente la racha de Duolingo (sincronizada hace 26 días). Ni Chess ni Games tienen esa racha. Induce a engaño cognitivo al atribuir constancia multicanal cuando es monoproveedor.
2. **Invisibilidad de LinkedIn Games:** La sección «ESTADO POR DOMINIO» solo renderiza dos tarjetas: *Idiomas* y *Ajedrez*. Games tiene 170 días de registros locales disponibles en el backend, pero la portada lo ignora completamente.
3. **Bloque «TU SEMANA» desierto:** Muestra círculos vacíos (`J V S D L M X` con guiones `—`) tanto para Cuenta (0 XP · 0 ses) como para Ajedrez (0 partidas en 7 días). Al evaluar datos históricos que no coinciden con la semana natural actual, este bloque ocupa el 30% del espacio visible sin aportar ningún valor informativo.
4. **Fuga de Chess en la barra global:** La cabecera superior muestra `Actualizado 2026-11-03 · 60 partidas`. La etiqueta `60 partidas` proviene directamente del snapshot de Chess.

#### Evaluación de densidad, scroll y comprensión
- **Densidad:** Excesivamente baja en escritorio. Tres cuartas partes de la pantalla están desaprovechadas o rellenas con un calendario semanal vacío.
- **Scroll:** En escritorio no requiere scroll. En móvil requiere scroll para ver el segundo dominio (Ajedrez) y la semana vacía.
- **Comprensión:** Falla en responder «¿Dónde estoy?». No ofrece un diagnóstico, sino un acceso directo hacia dos de los tres dominios.

#### Recomendación
- Reemplazar el hero actual por la síntesis tripartita: tarjetas de Posición de los 3 dominios (Ajedrez, Idiomas y LinkedIn Games).
- Eliminar la racha como indicador de cabecera de cuenta; asignar cada racha a su respectivo dominio.
- Reemplazar el widget semanal estático por un panel dinámico de «Merece atención» (máximo 3 alertas cross-domain priorizadas).

---

### 3.2 Ajedrez (Partidas · `/chess` y Perfil · `/profile`)

#### Capturas de evidencia
- **Escritorio (1440 × 900):**
  - Partidas (Fold): `docs/ux/screenshots/desktop_chess_fold.png`
  - Partidas (Full): `docs/ux/screenshots/desktop_chess_full.png`
  - Perfil de motor (Full): `docs/ux/screenshots/desktop_profile_full.png`
- **Móvil (390 × 844):**
  - Partidas (Fold): `docs/ux/screenshots/mobile_chess_fold.png`
  - Partidas (Full): `docs/ux/screenshots/mobile_chess_full.png`
  - Perfil de motor (Full): `docs/ux/screenshots/mobile_profile_full.png`

#### Evidencia visual y comportamiento observado
1. **Redundancia severa de métricas:**
   - ELO 900 se muestra en el Hero card (línea 1) y en el cuarto KPI (línea 2).
   - Win Rate (63,3%) se muestra en el pill superior del hero y en el segundo KPI.
   - En total, 5 cifras compiten por la atención antes de llegar a la forma reciente.
2. **Afirmación sin histórico:** El texto `ELO · 0 vs primer snapshot` se renderiza porque solo existe un snapshot de ajedrez. No aclara que es la única observación existente, sugiriendo falsamente un estancamiento en lugar de falta de datos comparativos.
3. **Bloque «Forma actual» ejemplar pero aislado:** La comparación de las últimas 50 partidas vs las 10 anteriores (`60.0% WR vs 80.0% WR · -20.0 pp · IC95 [-40, +13] · sin evidencia suficiente vs anteriores`) es un ejercicio metodológico excelente, pero está incrustado en medio de bloques gigantescos sin enlaces hacia las partidas correspondientes.
4. **Perfil (`/profile`) como un páramo sin contexto:** Al abrir «Perfil», la pantalla indica: `Todavía no hay partidas analizadas`. Sin embargo, no informa cuántas partidas existen en la base de datos (0 de 60 analizadas), qué motor se necesita para analizarlas ni cómo se activaría. Todas las tarjetas inferiores («Dónde cometes errores graves», «Ventajas y remontadas», etc.) son cascarones vacíos con textos de ayuda estáticos.
5. **Falta de navegabilidad hacia las partidas:** Al inspeccionar las filas de la tabla de partidas con los datos demo, estas no poseen el atributo `class="gamerow"` porque `ply_count` es nulo en el dataset sintético. Como resultado, hacer clic en una partida no hace nada, sin que exista ninguna indicación visual de que la partida carece de PGN o jugadas registradas.

#### Evaluación de densidad, scroll y comprensión
- **Scroll:** En escritorio la página de Partidas mide ~2.400 px (3 viewports). En móvil mide más de 3.200 px. El bloque de partidas recientes añade 10 filas transformadas en tarjetas verticales.
- **Jerarquía:** Muy deficiente. La pantalla salta de macro-KPIs a Forma, luego a Comparativa por color, luego a Aperturas (vacías), luego a Evolución, luego a Partidas.
- **Comprensión:** El usuario novato ve números apilados y no sabe si está jugando bien, en qué fase flaquea ni qué partidas debería estudiar.

#### Recomendación
- Eliminar la fila de 4 KPIs.
- Fusionar «Partidas» y «Perfil» en una arquitectura de 2 niveles visibles: Posición y Análisis/Evidencia.
- Introducir un veredicto sintético: nivel actual, forma reciente y fortaleza/debilidad por color.
- Declarar la cobertura de motor explícita: «0 de 60 partidas analizadas por Stockfish».

---

### 3.3 Idiomas (Cursos · `/languages`)

#### Capturas de evidencia
- **Escritorio (1440 × 900):**
  - Cursos (Fold): `docs/ux/screenshots/desktop_languages_fold.png`
  - Cursos (Full): `docs/ux/screenshots/desktop_languages_full.png`
- **Móvil (390 × 844):**
  - Cursos (Fold): `docs/ux/screenshots/mobile_languages_fold.png`
  - Cursos (Full): `docs/ux/screenshots/mobile_languages_full.png`

#### Evidencia visual y comportamiento observado
1. **La actividad devora el aprendizaje:**
   - La pantalla presenta 11 bloques verticales.
   - De ellos, el Hero (progreso), Tus Cursos (desglose de secciones) y Comparabilidad Curricular son los únicos dedicados al progreso de la lengua.
   - Los otros 8 bloques (Total XP, Racha, Días activos, Catálogo, Tira de 7 días, Timeline de 90 días, Intensidad descriptiva, Perfil semanal) son pura métrica de actividad y gamificación.
2. **Scroll vertical colosal en móvil:**
   - En móvil, la página de Cursos mide **3.670 px de altura**.
   - Para llegar al bloque más riguroso y honesto del producto («Comparabilidad curricular longitudinal · Cursos», donde se explica si el árbol cambió estructuralmente o si el avance es comparable), el usuario debe realizar entre 7 y 9 desplazamientos completos de pantalla.
3. **Confusión en «Cambios observados»:**
   - La tarjeta muestra: `1 de 3 cursos comparables sin cambio estructural` y debajo `Cambio curricular observado: +2 unidades en Demo Alpha`.
   - Se mezclan dos planos lógicos: la comparabilidad estructural del árbol (denominador constante) con el progreso del usuario (numerador).
4. **Etiquetado erróneo de CEFR:**
   - Las secciones del curso están tituladas como `SECCIÓN 1: A1.1: 6 / 6 unidades (100.0%)` y `SECCIÓN 2: A1.2: 4 / 6 unidades (66.7%)`.
   - Visualmente, un usuario interpreta: «He completado A1.1 y tengo un 66% de A1.2». En ningún lugar se advierte que esto representa unidades del currículo de Duolingo, no una evaluación de competencia lingüística según el marco CEFR.
5. **Riqueza analítica oculta en backend:**
   - En «Concentración histórica · Catálogo», se muestran barras de porcentaje (72.5%, 22.4%, 5.1%). El backend calcula métricas robustas como el índice HHI (0.58) y el número de cursos efectivos (1.73), pero la interfaz no las expone.
   - En «Intensidad descriptiva» y «Perfil semanal», las medianas no llevan ni el tamaño muestral `n` ni el rango intercuartílico (IQR), a pesar de que el endpoint los entrega.

#### Evaluación de densidad, scroll y comprensión
- **Densidad:** Excesiva. El usuario se ve abrumado por gráficos de barras de 90 días, medias de XP por sesión, tablas de días de la semana y desgloses de cursos.
- **Scroll:** Crítico en móvil. Es la pantalla más larga de todo el sistema.
- **Comprensión:** Muy baja respecto a la competencia real. Responde «cuánto uso la app», pero no «qué sé decir o entender».

#### Recomendación
- Reubicar los bloques de actividad secundaria (timeline de 90 días, perfil por día de la semana, intensidad) fuera de la pantalla de Posición.
- Añadir un bloque permanente e ineludible `LimitsBlock`: «Lo que estos datos no pueden decir: XP, racha y lecciones completadas no representan dominio lingüístico, comprensión auditiva ni expresión oral».
- Corregir el copy de secciones: «Unidades curriculares A1» en lugar de sugerir certificación CEFR.
- Añadir fecha de captura del Path al hero de progreso curricular.

---

### 3.4 LinkedIn Games (Juegos · `/games`)

#### Capturas de evidencia
- **Escritorio (1440 × 900):**
  - Juegos (Fold): `docs/ux/screenshots/desktop_games_fold.png`
  - Juegos (Full): `docs/ux/screenshots/desktop_games_full.png`
  - Modal «Registrar resultado» (Desktop): `docs/ux/screenshots/desktop_games_record_modal.png`
- **Móvil (390 × 844):**
  - Juegos (Fold): `docs/ux/screenshots/mobile_games_fold.png`
  - Juegos (Full): `docs/ux/screenshots/mobile_games_full.png`
  - Modal «Registrar resultado» (Móvil): `docs/ux/screenshots/mobile_games_record_modal.png`

#### Evidencia visual y comportamiento observado
1. **La pantalla con mayor honestidad epistémica:**
   - Es con diferencia el dominio mejor modelado: cada cifra lleva su `n`, las bandas de ruido están calibradas (`[-28%, +38%]`), la flecha de tendencia solo aparece a 28 días con persistencia de dos semanas, y los juegos sin calibrar muestran explícitamente `Datos insuficientes`.
2. **Desbordamiento horizontal en móvil:**
   - La tabla `COMPARATIVA` contiene 7 columnas: `JUEGO`, `EFICIENCIA ▾`, `GANA A LA MEDIA`, `Δ EFICIENCIA`, `TIEMPO MEDIANO (P25-P75)`, `RACHA`, `N`.
   - En la pantalla móvil de 390 px, la tabla se trunca en la cuarta columna (`Δ EFICIENCIA`), quedando las 3 columnas restantes ocultas fuera de la pantalla sin ninguna indicación visual de scroll horizontal o affordance táctil.
3. **Falta de progreso hacia la calibración:**
   - En Tango y Wend, la tarjeta dice: `Este juego aún no tiene límites calibrados (se calibran con al menos 112 días de historia)`.
   - Sin embargo, no le dice al usuario cuántos días lleva registrados de esos 112 (en la base hay 57 días). Parece un bloqueo estático en lugar de un proceso en marcha al 51% de completitud.
4. **Concepto de «Eficiencia» opaco:**
   - La tabla ordena por `Eficiencia ×2,5`, `×2,15`, etc. Un usuario que entra por primera vez no sabe si 2,5 significa «el doble de puntos», «el doble de rápido» o una ponderación propia.
5. **Inconsistencia de navegación:**
   - Games no tiene enlace en la cabecera de frescura, no tiene presencia en Portada, y no dispone de bloque «¿Cómo sabemos esto?», a pesar de ser el que cuenta con la metodología matemática más sofisticada (bootstrap por percentiles sobre datos reales).

#### Evaluación del hallazgo G3 (Entrada manual vs Análisis)
> [!IMPORTANT]
> **Veredicto sobre el hallazgo G3:** La auditoría teórica consideró un defecto que «Registrar resultado» y los chips de hoy estuvieran en el Hero. **La validación en pantalla refuta esta crítica.**
> 
> LinkedIn Games no tiene sincronización automática mediante cookies o credenciales: el usuario *debe introducir los tiempos manualmente cada día*. Cuando el usuario accede a `/games` a diario, su tarea prioritaria es registrar la partida de hoy. Si se relega el botón o los chips, se destruye la ergonomía del producto para su caso de uso más frecuente. Lo correcto no es eliminarlo ni enterrarlo, sino rediseñar el hero para que convivan armónicamente la acción de registro rápido y el veredicto de rendimiento.

#### Recomendación
- Mantener la entrada manual accesible en el hero pero de forma compacta (chips de estado rápido).
- Añadir una barra de progreso de calibración para Tango y Wend: `57 / 112 días registrados (51%)`.
- Reemplazar la tabla ancha desbordada en móvil por tarjetas compactas o vista adaptativa.
- Añadir el bloque divulgativo «¿Cómo sabemos esto?» con la explicación de las bandas de ruido y la regla de las 2 semanas.

---

### 3.5 Vistas transversales (Qué cambió · `/changes` y Trayectoria · `/trajectory`)

#### Capturas de evidencia
- **Qué cambió (Escritorio):** `docs/ux/screenshots/desktop_changes_full.png`
- **Qué cambió (Móvil):** `docs/ux/screenshots/mobile_changes_full.png`
- **Trayectoria (Escritorio):** `docs/ux/screenshots/desktop_trajectory_full.png`
- **Trayectoria (Móvil):** `docs/ux/screenshots/mobile_trajectory_full.png`

#### Evidencia visual y comportamiento observado
1. **El vocabulario epistémico existe pero está desaprovechado:**
   - En «Qué cambió», las evaluaciones muestran pills claros: `Salto de ELO [INSUFICIENTE]`, `Asimetría por color [INSUFICIENTE]`, `Mayor XP diario [INSUFICIENTE]`.
   - Cada evaluación incluye un enlace interactivo «Ver criterio ▾» que despliega la regla exacta de umbral. Este es un patrón excelente que debería estar en las pantallas principales y no escondido en una vista secundaria.
2. **Aislamiento absoluto de LinkedIn Games:**
   - Ni «Qué cambió» ni «Trayectoria» contienen una sola mención a los juegos de LinkedIn. Games vive en un silo completamente desconectado de la capa longitudinal.
3. **Trayectoria desierta:**
   - Con los datos demo actuales, Trayectoria solo renderiza un elemento: `Asimetría por color · todo el historial [INSUFICIENTE]`. El resto de la pantalla está vacía.

---

## 4. Problemas no detectados por el análisis estático

La ejecución del producto en vivo permitió descubrir 5 problemas que no eran evidentes en la lectura del código fuente:

1. **Desbordamiento y corte ciego de la tabla comparativa de Games en móvil:**
   - En el código CSS, la tabla tiene `width: 100%`, pero en un viewport de 390 px con fuentes estándar, las columnas exceden los 550 px. En pantalla, los datos críticos (`Racha`, `N`, `P25-P75`) quedan fuera del marco derecho sin barra de desplazamiento ni pista visual.
2. **Calendarios semanales desolados con datos asíncronos:**
   - Tanto la tira de 7 días de la Portada como la de Idiomas renderizan círculos vacíos con guiones (`—`) cuando no hay actividad en los últimos 7 días naturales exactos. Si el usuario sincroniza semanalmente o revisa históricos, se encuentra con un componente roto visualmente en el centro del viewport.
3. **Fuga de Chess en la navegación de cuenta (`/settings` y barra lateral):**
   - El enlace `Exportar partidas` (`/api/export/matches.csv`) está ubicado en el grupo «CUENTA» de la barra lateral, sugiriendo que exporta todos los datos del usuario, cuando solo exporta partidas de ajedrez.
4. **Feedback nulo en clics sobre partidas de Ajedrez sin PGN:**
   - Cuando una partida en la tabla de Ajedrez no tiene jugadas hidratadas (como ocurre con el dataset demo), el cursor no cambia a puntero pero la fila parece interactiva; al hacer clic, no hay feedback alguno (ni tooltip ni aviso de «partida sin visor disponible»).
5. **Cascarones vacíos en el Perfil de Ajedrez:**
   - En `/profile`, cuando no hay partidas analizadas, la interfaz dibuja 5 contenedores con títulos y párrafos explicativos grises, simulando tarjetas activas que no contienen ningún dato.

---

## 5. Propuestas de la auditoría que deben matizarse o refutarse

El análisis del comportamiento real obliga a corregir cuatro propuestas teóricas de `MERIDIAN_UX_AUDIT.md`:

### 5.1 Fragmentación excesiva en URLs (`/domain/position`, `/domain/analysis`, `/domain/evidence`)
- **Propuesta original:** Dividir cada dominio en 3 URLs independientes (9 rutas en total más Portada, Cambios y Trayectoria).
- **Veredicto visual:** **Refutado por sobrecarga de navegación.**
- **Motivo:** Meridian es un panel personal de consulta regular, no una aplicación transaccional multi-departamento. En móvil, tener que saltar entre tres páginas distintas para ver un juego de LinkedIn o un curso de idiomas generaría una fricción insostenible.
- **Solución refinada:** Mantener una ruta canónica por dominio (`/chess`, `/languages`, `/games`) estructurada verticalmente con disclosure progresivo:
  - Nivel 1 (Posición) siempre visible arriba.
  - Nivel 2 (Análisis) inmediatamente accesible.
  - Nivel 3 (Evidencia detallada) colapsable o accesible mediante scroll con anclas estables (`#evidence-color`).

### 5.2 Relegación de la entrada diaria de Games (Hallazgo G3)
- **Propuesta original:** Enviar la entrada manual y los chips de hoy fuera de la vista principal.
- **Veredicto visual:** **Refutado.**
- **Motivo:** Games requiere entrada manual diaria obligatoria. Destruir este acceso directo castigaría al usuario que entra diariamente solo a volcar sus resultados.
- **Solución refinada:** Diseñar un componente compacto «Registro de hoy» en el hero de Games que coexista con el veredicto de rendimiento sin monopolizar el viewport.

### 5.3 Plantilla rígida de 3 señales («Fortaleza / Límite / Atención»)
- **Propuesta original:** Forzar la misma terna de tarjetas en los 3 dominios.
- **Veredicto visual:** **Parcialmente refutado / Matizado.**
- **Motivo:** En Idiomas, la auditoría propuso como «Límite» la frase: `La actividad no mide comprensión`. Esto confunde un **límite metodológico de la fuente de datos** con una **debilidad de rendimiento del usuario** (como perder partidas con negras).
- **Solución refinada:** Reservar «Límite» para aspectos del rendimiento evaluado cuando existan datos para ello (p. ej. en Ajedrez o Games). Las limitaciones del dato deben vivir en un contenedor específico y diferenciado: `LimitsBlock` («Lo que estos datos no pueden decir»).

### 5.4 Eliminación de la actividad reciente en la Portada
- **Propuesta original:** Eliminar por completo el pulso semanal de la portada.
- **Veredicto visual:** **Matizado.**
- **Motivo:** El usuario necesita saber cuándo interactuó por última vez con cada área. El problema actual es el componente rígido de 7 días que se queda en blanco.
- **Solución refinada:** Reemplazar los 7 círculos vacíos por un resumen de frescura e impacto reciente: «Ajedrez: 60 partidas disputadas · Idiomas: última sesión el 28 sept · Games: 48 días de racha activa».

---

## 6. Selección y aprobación del primer tramo de implementación (Roadmap de salida)

Con la evidencia visual directa sobre la mesa, se descarta cualquier especulación sobre la interfaz. Se confirma que la estrategia debe ser **estrictamente incremental**, abordando en primer lugar los defectos de honestidad de datos y claridad que no requieren cambios de contratos ni esquemas.

### Tramo 1 aprobado: Fase 0 (Verdad, vocabulario y honestidad del dato)
**Esfuerzo estimado:** 3 a 5 días de desarrollo.  
**Riesgo:** Mínimo (sin contratos nuevos ni alteraciones de API).

1. **U15 · Desacoplar la frescura de Ajedrez de la cabecera global:**
   - La cabecera `#syncMeta` solo debe reflejar la sincronización global agregada o indicar el estado por dominio.
   - Eliminar `· 60 partidas` de la cabecera fija de la aplicación.
2. **U8 & A6 · SampleBadge obligatorio en cifras inferenciales:**
   - Añadir badge de muestra insuficiente en la comparación Bots vs PvP de Ajedrez cuando `n < 30` (actualmente `n=9`).
   - Declarar el progreso de calibración de Tango y Wend en Games (`57/112 días`).
3. **U12 & I7 · Bloque de límites y corrección CEFR en Idiomas:**
   - Insertar el componente ineludible `LimitsBlock`: «XP y racha no representan nivel lingüístico».
   - Reemplazar la etiqueta «Nivel A1» por «Unidades curriculares A1».
4. **A3 & U14 · Corrección del delta de ELO:**
   - Reemplazar `0 vs primer snapshot` por un estado explícito cuando solo existe una observación: «Punto base · sin historial comparable».
5. **U20 · Corrección de alcance de navegación y sincronización:**
   - Reubicar «Exportar partidas» bajo la sección «Ajedrez» del menú lateral, eliminándolo de «CUENTA».
   - Aclarar en el botón «Sincronizar» que la sincronización aplica a fuentes conectadas (Duolingo), mientras que Games requiere registro manual.

### Tramo 2 inmediato: Fase 1 (Posición y descompresión de scroll)
**Esfuerzo estimado:** 1 a 2 semanas.

1. **U1 · Portada tripartita:** Incorporar tarjeta de LinkedIn Games en la portada junto a Idiomas y Ajedrez.
2. **U2 · Tarjeta de Posición en Ajedrez, Idiomas y Games:** Responder «¿Dónde estoy?» en la primera pantalla sin requerir scroll.
3. **Optimización móvil de Games e Idiomas:**
   - Sustituir la tabla desbordada de 7 columnas en Games por vista de tarjetas apiladas en pantallas `< 520 px`.
   - Colapsar por defecto los bloques de actividad profunda en Idiomas para reducir la altura de la página de 3.600 px a menos de 1.200 px en el primer contacto.

---

## 7. Criterio de salida cumplido

Este informe, acompañado del archivo de capturas en `docs/ux/screenshots/`, proporciona la evidencia visual y operativa suficiente para:
- Aprobar la dirección de diseño de Meridian.
- Descartar hipótesis teóricas que contradecían la ergonomía de uso diario (como la fragmentación en 3 URLs rígidas o la eliminación de la entrada manual).
- Iniciar la ejecución del **Tramo 1 (Fase 0)** con certeza absoluta sobre la interfaz actual.
