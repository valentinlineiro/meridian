# Informe individual de LinkedIn Games — diseño

**Fecha:** 2026-11-10 · **Estado:** borrador para aprobación (no se ha programado nada)
**Origen:** propuesta del propietario (un informe por juego con estructura idéntica), maqueta de Queens con datos reales de producción y su revisión.

## 1. Intención

Que al abrir el informe de un juego (p. ej. Queens) se pueda responder, con evidencia y sin atribuir causas que los datos no permiten demostrar:

1. ¿Qué nivel tengo?
2. ¿Estoy mejorando o empeorando?
3. **¿Soy regular o dependo de días excepcionales?** *(prioridad del propietario)*
4. ¿Dónde está la oportunidad de mejora?

Hoy esa información existe pero está repartida (tarjeta del juego, tabla comparativa, trayectoria con selector, mapa de derrotas, perfil por día). El informe la reúne en una sola lectura por juego y añade lo que falta para la regularidad.

**Por qué ahora.** Con 177 días de histórico hay material para decir cosas que ningún número actual dice. Ejemplo real (Queens, 10 nov 2026): le ganas a la media el 86 % de los días y lo haces con regularidad semanal (entre el 71 % y el 100 % en 12 semanas completas), pero **las 31 derrotas están todas entre lunes y jueves, 14 de ellas en lunes**.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos**
- Un informe por juego con estructura idéntica para los seis, que degrade con honestidad cuando haya pocos datos (Tango y Wend: 64 resultados, aún sin límites calibrados).
- La regularidad como parte alta del informe.
- Separar **evidencia** (lo que muestran los datos) de **interpretación** (hipótesis), y distinguir **tendencia estimada** de **cambio detectable**.
- Cada cifra con su periodo y su `n`.

**No objetivos**
- Explicar *por qué* se tarda más: solo se guarda el tiempo total, sin errores ni pasos intermedios.
- Cambiar la metodología de veredictos, las bandas de ruido o la calibración existentes.
- Rediseñar la navegación general.

**Antiobjetivos** (fracaso aunque «funcione»)
- Una métrica nueva o un umbral sin base en los datos.
- Una frase de diagnóstico que parezca una conclusión y sea una hipótesis.
- Dar a todas las métricas el mismo aspecto de madurez.
- Información solo en tooltips (no existe en táctil ni en la PWA instalada).

## 3. Restricciones

- **Vocabulario común** (`core/words.ts`): veredictos `Confirmado / Posible señal / Sin señales de cambio / Aún pocos datos`, `PERIODS`, `typicalTime`, etc.
- **Veredicto existente, no uno nuevo.** El veredicto de Games está respaldado: bandas de ruido calibradas offline con datos reales (`noise-bands.json`, calibradas hasta el 2026-11-03), ρ de Spearman y pendiente de Theil-Sen que deben coincidir, caída reciente frente al límite inferior, y publicación solo si el mismo candidato se mantiene hoy y una semana antes (`GameInterpretation.ts`). La Fase 1 **lo muestra tal cual, con su fuente, y no añade ningún veredicto**. Lo que aún no tiene calibración es el diagnóstico nuevo (Fase 3).
- **Una ruta canónica por dominio** (decisión del 2026-11-04, `docs/ux/MERIDIAN_UX_VISUAL_VALIDATION.md` §5.1): no se multiplican sub-URLs rígidas dentro de un dominio.
- **El cálculo vive en el servidor**; la interfaz solo formatea (`games.model.ts`). Las funciones nuevas de presentación son puras y con test.
- **Arquitectura Angular**: una feature no importa de otra (lint); lo compartido sube a `core/` o `shared/`.
- **La referencia de LinkedIn no es neutra**: varía por día de la semana (la media entre semana es más rápida) y puede cambiar con la población que juega. Hay que decirlo donde se compare con ella.
- **Resolución de 1 s**: en juegos cortos (Zip 13 s, Patches 16 s) el tiempo relativo (IQR/mediana) no es comparable entre juegos; la **eficiencia** (media de LinkedIn / tu tiempo) sí.
- Accesibilidad: mínimo 44 px de objetivo táctil en móvil, contraste de elementos no textuales ≥ 3:1, ningún dato solo en `title`.
- Texto en español, `tests` con nombres `shouldXWhenY`, tests primero.

## 4. Estructura del informe

Cabecera: juego, veredicto (la pill calibrada existente, con «Cómo se calcula» al lado), selector de periodo (7 días / 4 semanas / 3 meses / todo) y una frase de hechos.

1. **Regularidad**
   - Rango normal (P25–P75) con mediana y mejor tiempo, y `n`.
   - Semana a semana: % de días que le ganas a la media por semana, con las semanas incompletas marcadas.
   - Por día de la semana: partidas, derrotas **y victorias** por día, con intervalo, mínimo de 8 partidas por casilla (`MIN_LOSS_CELL`), y la advertencia de la referencia.
   - Rachas: actual y máxima (la fecha de la máxima, en la fase 2).
2. **Nivel**: tabla 7 / 28 / 90 / todo (tiempo normal, rango normal, velocidad ×, «le ganas a la media» k de n).
3. **Evolución**: eficiencia mediana por semana frente a la línea ×1; forma descontando la dificultad; últimos 28 días frente a los 56 anteriores con su banda de ruido; tendencia a 112 días. Cada uno dice si es **estimada** o **detectable**.
4. **Qué sabemos y qué no**: evidencia (frases construidas por reglas a partir de los datos) y el límite de lo medible; las hipótesis solo llegan en la fase 3.

**Peso visual**: el diagnóstico, la evidencia y la evolución van destacados; el resto explica y profundiza. La frase principal se apoya en la serie semanal y en la comparación con periodos anteriores, **no** en el porcentaje de 28 días por sí solo.

### Comportamiento y casos límite (fase 1)

- **La frase de la cabecera es solo de hechos**, hasta tres cláusulas, cada una con su condición:
  1. «Le ganas a la media el X % de los días (k de n, periodo)». Siempre que haya `n`.
  2. «En las N semanas completas, entre el A % y el B % de los días». Solo con al menos 4 semanas completas.
  3. «Se pierde más los {días}»: un día destaca **solo si el límite inferior de su intervalo de derrotas supera la tasa de derrotas global del juego** (`losses.losses / n`), usando el intervalo que ya devuelve el servidor (sin umbral inventado). Si ningún día destaca, la cláusula no aparece.
  No usa la palabra «estable» ni «mejora»: describe, no concluye.
- **Qué gobierna el selector de periodo:** el rango normal, el nivel resaltado, la forma ajustada y las cifras de evolución. La serie semanal (90 días) y el mapa por día de la semana (todo el histórico) tienen su ventana fija y lo dicen en su texto.
- **Pocos datos** (sin límites calibrados o `datos_insuficientes`): se muestra lo que sí es medible (nivel, rango normal, mejor tiempo) y, en lugar del veredicto y de la evolución, cuánto falta para poder valorarlo (`n` actual frente al mínimo que ya dice `interpretation.reason`).
- **Sin resultados de ese juego, juego desconocido o error:** «No disponible» para un fallo de petición; un juego inexistente en la URL redirige a `/games`; un juego sin resultados dice «Aún sin partidas registradas». Nunca un cero por un dato desconocido.
- **Título de la ruta:** «Queens · LinkedIn Games · Meridian». Enlace de vuelta a Games.
- **Cada cifra** lleva periodo y `n` visibles (no en tooltip).

## 5. Fases

### Fase 1 — con los datos que el servidor devuelve hoy (sin cambios de backend)
**Modo informe de la ruta canónica `/games`, con parámetro** (`/games/queens`): el mismo route y el mismo componente que `/games`, como `/languages/:courseId` es la misma ruta que `/languages` y reutiliza la vista (un `UrlMatcher`, sin carga nueva de datos). No es una página independiente ni una sub-URL de análisis: es la misma vista en modo informe, con botón atrás y enlazable desde «Tus juegos» y desde Hoy. Los parámetros no llevan puntos (el Worker trata un punto en el último segmento como un fichero); las claves de juego (`mini_sudoku`, …) valen. Una clave desconocida redirige a `/games`. Fuentes, todas en el resumen actual:

| Elemento | Campo |
|---|---|
| Veredicto | `interpretation` → `verdictFor` |
| Rango normal, mediana, `n` | `windows[periodo].time {median, p25, p75, nTime}` |
| Mejor tiempo | `best {seconds, date}` |
| Semana a semana | `trajectory['90']` (`start`, `n`, `beat`, `eff`); semana completa = `n ≥ 5` |
| Por día de la semana | `losses.cells {dow, n, losses, rate, lo, hi}` (`dow 0` = lunes); victorias = `n − losses` |
| Rachas | `beatStreak {current, max}` |
| Nivel | `windows[7\|28\|90\|all]` |
| Forma ajustada | `adjusted.windows[periodo].pct`, `adjusted.trend {pctPer28d, noise}` |
| 28 frente a 56 | `recent28vBase56`, `interpretation.bands['28v56']` |
| Tendencia 112 días | `trend112 {slopePctPer28d, n}` |

Las frases de «evidencia» se construyen con funciones puras en `games.model.ts` (o un módulo hermano), cada una con su test y con las salvaguardas: sin `n` suficiente → «aún pocos datos», nunca un número sin periodo.

### Fase 2 — nuevas agregaciones (necesita ampliar el contrato; aprobación explícita)
Hoy `series` solo trae `eff` y `roll`; el dominio sí guarda tiempo y media de referencia en segundos por día. Añadir, calculado en el dominio del slice:
- serie semanal en segundos con la referencia, y su evolución;
- ahorro en segundos (mediano y acumulado, este último como dato secundario con su `n`);
- amplitud de la eficiencia (P75 / P25) y su comparación entre juegos;
- días especialmente buenos y malos definidos **por eficiencia**, no por segundos; atípicos en escala logarítmica, con un mínimo de muestra;
- fecha de la racha máxima.

### Fase 3 — reglas de diagnóstico (decisión metodológica; aprobación explícita)
Fortaleza, debilidad y «próximo aspecto a observar» salen de reglas con umbrales calibrados con los datos reales (como `noise-bands.json`), no de prosa libre ni de un foco preasignado por juego: que los datos elijan la mayor desviación (día de la semana, regularidad, tendencia). Las hipótesis (capa de interpretación) llegan aquí, marcadas como tales.

Las etiquetas de fase de la maqueta son solo de desarrollo: **no existen en la interfaz de producción**.

## 6. Criterios de éxito (fase 1)

- En el informe de Queens se contestan las cuatro preguntas con los datos de hoy, y la frase principal se sostiene en la serie semanal.
- Tango y Wend muestran qué falta para tener veredicto en lugar de un informe vacío.
- 390 px sin desplazamiento horizontal; axe sin violaciones en la ruta nueva; ningún dato solo en tooltip.
- Funciones nuevas con tests escritos primero (vistos en rojo); `typecheck`, tests raíz y web, lint y límites de arquitectura en verde.
- Revisión con datos reales de producción (capturas a 390 y 1200 px) antes de dar la fase por cerrada.

## 7. Decisiones del constructor (revisables)

- **Decididas por el propietario el 2026-11-10:** (a) el informe es el **modo informe de `/games` con parámetro**, no una página independiente ni solo un desplegable, por coherencia con la decisión del 4 nov y con el precedente de `/languages/:courseId`; (b) la cabecera **muestra el veredicto calibrado existente con su fuente**, sin añadir veredictos nuevos.
- **Se mantiene «Sin señales de cambio» como etiqueta** (vocabulario compartido en seis ficheros); «sin cambio detectable» solo en los textos explicativos. Cambiar la etiqueta en todas partes sería una PR aparte.
- **Fase 1 sin hipótesis ni veredictos nuevos**: solo evidencia, el veredicto calibrado existente y el límite de lo medible.
- **Semana completa (≥ 5 partidas) es una convención de presentación**, no un umbral estadístico: sirve para no confundir una semana parcial con una semana mala.
- **Mejoras de la revisión incorporadas**: `n` junto a cada percentil; victorias además de derrotas por día; estimada frente a detectable en la tendencia; racha actual y máxima (la fecha, en la fase 2).

## 8. Lo que queda abierto

- Aprobación de este documento.
- Para la fase 2: confirmar el contrato nuevo (campos y nombres) antes de tocar el servidor.
- Para la fase 3: aprobar la metodología y los umbrales.
