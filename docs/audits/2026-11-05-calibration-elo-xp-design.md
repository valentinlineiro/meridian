# Calibración de los umbrales de ELO y XP — diseño del método

Fecha: 2026-11-05 (rev. 5, tras cuatro revisiones) · Estado: **propuesta para revisión final. No implementa nada, no cambia código ni contratos vigentes, no toca producción.**
Origen: hallazgo P4 de `2026-11-05-product-quality-audit.md`. Secuencia: (1) este documento, (2) revisión final del método, (3) enmienda del contrato, (4) implementación y pruebas en otra PR.

Cifras reproducibles con `calibration-elo-xp/exploration.py` (semilla fija, ≈ 45 s; la entrada son lecturas de solo lectura de D1 y no se versiona). Se recalcularon el 2026-11-05
y difieren algo de las de la auditoría, que usaba pares de 7 días entre anclas consecutivas.

**Cambios de la rev. 2:** niveles unilaterales para XP y bilaterales para ELO; remuestreo de ELO con k exacto; incertidumbre de las bandas con dependencia temporal; suficiencia por estabilidad de cada borde;
se retira «≥ 200 intervalos».

**Cambios de la rev. 3:** el nulo de ELO sin invertir signos retira la deriva observada (−0,33 puntos por partida) y conserva solo la asimetría; se midió la sensibilidad de XP al tamaño de bloque.

**Cambios de la rev. 5 (breve, solo redacción; no se calcula nada nuevo):** (a) XP: se distingue lo **demostrado** (este remuestreo por bloques no conserva la dependencia) de lo **no demostrado** (que ningún método pueda
calibrar XP); el criterio (d) pasa de «reproducir la ACF en todos los lags» a un diagnóstico sobre la distribución del estadístico; (b) ELO: los porcentajes próximos al 20 % no son evidencia fuerte por sí solos;
(c) se explicita el coste de las decisiones (§8) y que no hay umbral de reserva.

**Cambios de la rev. 4:** (a) ELO: se calcula k = 15, la condición de vecindad se define con k − 5, k y k + 5, y su aplicación es un resultado del script, con 400 réplicas de bootstrap; (b) XP: se miden
también bloques de 21 y 28 días y se comprueba si el remuestreo **conserva la dependencia** entre bloques. **No la conserva en ningún tamaño**, así que se retira el procedimiento «máximo entre 7 y 14 días» y
**XP queda sin calibración**, sin sustituirlo por otra convención.

## 1. Qué está mal hoy

| Regla | Umbral actual | Qué afirma | Problema |
|---|---|---|---|
| `CHESS_RATING_JUMP` | \|Δ ELO\| ≥ 25 puntos | «Salto de ELO» | 25 es una constante sin relación con el ruido del ELO de este usuario |
| `LANG_XP_ACCELERATION` | cociente ≥ 1,3, ≥ 3 días, ≥ 200 XP | «Mayor XP diario» | 1,3 tampoco sale de los datos; 200 XP es un tercio de un día medio (627 XP) y nunca limita |

- **ELO.** 64 anclas (el último ELO de cada sincronización, que es el que la regla puede usar) en 36 días distintos, con un hueco de 225 días: los datos densos son 63 anclas en **42 días**,
  62 intervalos, 253 partidas (≈ 6 al día). El cambio entre anclas escala con la raíz del número de partidas k: **Δ/√k tiene desviación típica 11,0 puntos**. Con 10 partidas el rango habitual
  al 95 % es ≈ ±70; 25 puntos son ≈ 0,7 σ√10, un tercio del semiancho de esa banda. En ventanas reales de 7 días el \|Δ\| mediano es 35 y 25 o más ocurre en el 63 %.
- **XP.** 133 días contiguos desde 2026-06-25 (mucho menos que la racha de 1.117 días). Media 627, mediana 576, CV 0,47; autocorrelación 0,51 a un día y 0,18 a siete. Bajo «sin cambio»
  (bloques de 7 días), un cociente ≥ 1,3 aparece en el 20 % de las ventanas de 3 días, 15 % de 7, 12 % de 14 y 7 % de 28. En los datos reales, en el 45–53 %, incluida la deriva real.

Ningún número fijo puede ser correcto: el ruido depende de cuántas partidas o días hay en la ventana.

## 2. Principios

De Games (`NoiseBands`, `linkedin-games-p1-interpretation-design-2026-11-04.md`) se reutiliza el método, no el código: (1) el límite sale de la distribución del estadístico bajo «sin cambio real» en la
propia serie, por cola; (2) se genera fuera del Worker y se versiona como artefacto revisable por PR, con `--check` que regenera y falla si difiere, y con `calibratedThrough`; (3) sin calibración suficiente
no se afirma nada y se dice por qué; (4) lo que es convención se marca como convención.

No se reutiliza el remuestreo diario de series densas (el ELO es irregular y su ruido depende de las partidas), ni los horizontes de 112 días, ni el filtro de confirmación (decidido: fuera; si se
quisiera, se estudia por separado con evidencia de que mejora algo).

**ELO y XP son independientes**: estadístico, ruido, ventanas y criterio de suficiencia propios.

## 3. Estados y niveles

Los niveles tienen el mismo significado nominal en las dos reglas: **la probabilidad, bajo «sin cambio», de que el estadístico supere el límite de «relevante» es 5 %, y el de «excepcional», 1 %.** Para
conseguirlo, los cuantiles dependen de la dirección del contraste:

| | ELO (cambio en cualquier sentido, bilateral) | XP (solo aceleración, unilateral) |
|---|---|---|
| Relevante (5 %) | fuera de la banda central del 95 % (2,5 % por cola) | por encima del cuantil 95 % |
| Excepcional (1 %) | fuera de la banda central del 99 % (0,5 % por cola) | por encima del cuantil 99 % |

| Estado | Definición | Estado epistémico en pantalla |
|---|---|---|
| Variación habitual | dentro del límite de «relevante» | SIN INDICIO |
| Cambio relevante | fuera de ese límite | AFIRMADO |
| Cambio excepcional | fuera del límite de «excepcional» | AFIRMADO + etiqueta «excepcional» |
| Sin calibración | no se puede conocer la variación habitual con estabilidad suficiente | INSUFICIENTE **solo si el efecto observado es distinto de cero**; texto «Sin referencia de variación habitual todavía», con el efecto y la partida/día que corresponda |

Coste esperado: con una evaluación semanal e independiente, el modelo nulo implica ≈ 2,6 alertas «relevantes» al año por métrica y ≈ 0,5 «excepcionales». Es un **número esperado bajo el modelo**,
no una tasa de falsas alarmas observada; las ventanas solapadas agrupan las alertas. La interfaz no dice «p-valor» ni «error», dice «fuera de lo habitual».

## 4. ELO

**Estadístico.** Δ = ELO de la última ancla de la ventana − ELO de la última ancla anterior a `since` (como hoy). Nuevo: **k = partidas jugadas entre esas dos anclas**; la banda depende de k, no de los días.

**Nulo de referencia («C»).** «Sin deriva» se construye así: (1) se retira de cada intervalo la deriva observada por partida (−84 puntos en 253 partidas = −0,33 por partida): `Δᵢ − μ̂·kᵢ`; (2) se conserva la asimetría de esos
residuos (no se invierten signos); (3) se concatenan **bloques de 3 intervalos consecutivos, en orden** (dependencia corta) hasta k exactamente (los intervalos con más partidas de las que faltan se
descartan; los de 1 partida siempre caben). Los límites se toman **por cola**, como en Games.

**Sensibilidad a las hipótesis.** Δ al 95 % y al 99 % con cuatro nulos; solo C es de referencia:

| k | A: signos, iid | B: sin signos, iid | **C: sin signos, bloques de 3** | D: signos, bloques de 3 |
|---|---|---|---|---|
| 5, 95 % | ±44 | [−42; +43] | **[−48; +48]** | ±48 |
| 5, 99 % | ±54 | [−54; +47] | **[−54; +50]** | ±53 |
| 10, 95 % | ±71 | [−71; +71] | **[−62; +74]** | ±65 |
| 10, 99 % | ±99 | [−103; +82] | **[−70; +83]** | ±80 |
| 15, 95 % | ±86 | [−87; +88] | **[−68; +92]** | ±81 |
| 15, 99 % | [−115; +119] | [−121; +107] | **[−91; +111]** | ±103 |
| 20, 95 % | ±99 | [−96; +101] | **[−74; +104]** | ±88 |
| 20, 99 % | ±135 | [−134; +126] | **[−98; +132]** | ±113 |

Retirar la deriva cambió lo que la rev. 2 llamaba «sin invertir signos» (que arrastraba la tendencia observada, −84 puntos). Con el nulo corregido, la cola de bajadas **se acorta** en C (a k = 10: −62 frente
a +74) porque los bloques consecutivos reflejan la reversión del ELO; B (iid) la deja más ancha. Asimetría de Δ/√k = −0,51 (1,6 errores típicos: indicio, no prueba) y autocorrelación −0,06 (−0,15 en Δ sin
normalizar). La inversión de signos (A, D) solo se usa como sensibilidad: impone simetría.

**Dónde deja de valer √k.** Sobre pares de anclas del periodo denso (solapados: el tamaño efectivo es menor que el indicado):

| k (partidas) | pares | sd(Δ) | sd(Δ)/√k |
|---|---|---|---|
| ≤ 5 | 74 | 20,6 | 11,5 |
| 6–10 | 83 | 31,6 | 11,2 |
| 11–20 | 141 | 39,4 | 10,1 |
| 21–40 | 243 | 47,5 | 8,6 |
| 41–80 | 460 | 63,4 | 8,2 |
| > 80 | 843 | 67,2 | 5,9 |

La escala por √k solo se sostiene hasta ≈ 20 partidas (reversión). Más allá no se extrapola: **k > 20 → `calibration_unavailable`**. A 6 partidas al día, las ventanas de 7 días (≈ 42 partidas) y de 30 días
quedan sin calibración; no se fabrica una conclusión para completar la ventana. Es una propiedad del conocimiento disponible, no un defecto de presentación.

**Suficiencia: estabilidad de cada borde, por dirección y nivel.** La rejilla de k es {5, 10, 15, 20}. Un borde (nivel, dirección, k) **cumple** si (1) el semiancho relativo del IC95 de su valor, por bootstrap de bloques
de 3 intervalos consecutivos que **rehace toda la banda, deriva incluida** (400 réplicas), es ≤ 20 %; y (2) su valor no cambia más del 20 % (rango / media) entre los cuatro nulos A–D. **Se admite** si cumple en
k − 5, k y k + 5. Si falta alguno de esos tres puntos no se admite todavía: **k = 5 y k = 20 nunca se admiten** mientras la rejilla validada no se amplíe (no hay k = 0 ni k = 25 validado), y solo son admisibles k = 10 y
k = 15. Se evalúa por separado en cada dirección y nivel. Es una regla conservadora de continuidad entre estimaciones, no una garantía estadística; los números son convenciones iniciales. Una dirección se
afirma solo si su propio borde está admitido. El script imprime esta decisión.

Resultado hoy (incertidumbre / sensibilidad entre nulos; ✓ si cumple):

| | k = 5 | k = 10 | k = 15 | k = 20 | admitido |
|---|---|---|---|---|---|
| 95 % superior | 20,2 % / 11,7 % ✗ | 18,0 % / 13,3 % ✓ | 20,1 % / 12,7 % ✗ | 21,5 % / 16,0 % ✗ | ninguno |
| 99 % superior | 17,2 % / 14,4 % ✓ | 16,2 % / 21,0 % ✗ | 18,2 % / 14,5 % ✓ | 19,6 % / 15,8 % ✓ | ninguno |
| 95 % inferior | 30,5 % / 13,1 % ✗ | 36,2 % / 13,9 % ✗ | 36,0 % / 23,6 % ✗ | 39,3 % / 26,6 % ✗ | ninguno |
| 99 % inferior | 36,5 % / 2,5 % ✗ | 43,0 % / 37,7 % ✗ | 42,4 % / 27,9 % ✗ | 40,6 % / 31,3 % ✗ | ninguno |

**Hoy no se admite ningún borde: ELO queda sin calibración en ambas direcciones**, y las evaluaciones muestran el efecto con las partidas, sin afirmarlo. Los bordes superiores están en el límite (17–22 %: 20,2 % y
20,1 % no cumplen por décimas; el 95 % superior de k = 10 cumple, pero k = 5 y k = 15 no) y los inferiores en 30–43 %: con 62 intervalos y dependencia, la cola de bajadas es la menos conocida. Las décimas
dependen del ruido de Monte Carlo; con 150 réplicas (rev. 3) algunos porcentajes cambiaban hasta 15 puntos entre ejecuciones; con 400 y semilla fija son reproducibles, pero ese error no desaparece, y es la razón
de la condición de vecindad.

**Cómo leer los porcentajes cercanos al corte.** Un 20,1 % o un 20,2 % frente a un límite de 20 % no es evidencia fuerte de insuficiencia, ni lo sería un 19,9 % de suficiencia: están dentro del error de Monte Carlo y de la
incertidumbre del propio bootstrap. Se mantiene el criterio sin rebajarlo para obtener un resultado positivo; la decisión descansa en la condición de vecindad, no en una décima concreta.

Proyección orientativa (la incertidumbre baja como 1/√n; 62 intervalos hoy, ≈ 1,5 más por día): los bordes superiores (≈ 20 %) podrían cumplir en semanas; los inferiores (≈ 35–40 %) piden ≈ 3 veces los intervalos
(≈ 190), es decir, ≈ febrero de 2027. La suficiencia no depende de un contador: si la incertidumbre no baja, el hito se mueve.

## 5. XP

**Estadístico.** Cociente r = media diaria de XP en los días con registro de la ventana / media diaria histórica (días con registro hasta `since`), como hoy; se entiende («×1,4 tu ritmo»). La banda
depende de la longitud de la ventana w y de la del histórico h. Contraste **unilateral** (solo aceleración).

**Sensibilidad al tamaño de bloque (medida).** Cuantiles 95 % / 99 % del nulo con h = 100 días; entre paréntesis, nº de bloques disponibles en la serie:

| w | 3 d (44) | 7 d (19) | 14 d (9) | 21 d (6) | 28 d (4) |
|---|---|---|---|---|---|
| 7 d | 1,41 / 1,61 | 1,51 / 1,74 | 1,69 / 1,91 | 1,64 / 1,85 | 1,87 / 1,93 |
| 14 d | 1,31 / 1,45 | 1,43 / 1,62 | 1,47 / 1,66 | 1,48 / 1,68 | 1,53 / 1,61 |
| 28 d | 1,23 / 1,35 | 1,34 / 1,50 | 1,39 / 1,57 | 1,51 / 1,71 | 1,51 / 1,59 |

Los cuantiles **no convergen**: a 7 días el 95 % va de 1,41 a 1,87 (≈ 25 % de rango entre 7 y 28 días de bloque), y con 6 y 4 bloques ya no son monótonos (7 d: 1,69 con 14 días de bloque, 1,64 con 21). La
incertidumbre de cada cuantil (semiancho del IC95, la serie remuestreada por bloques del mismo tamaño) es 7–20 %, pero con 4 y 6 bloques esa propia estimación no es fiable.

**¿Conserva el remuestreo la dependencia entre bloques?** Autocorrelación media de las series remuestreadas (1.500 por tamaño) frente a la observada:

| | lag 1 | lag 3 | lag 7 | lag 14 | lag 21 | lag 28 |
|---|---|---|---|---|---|---|
| observada | +0,51 | +0,41 | +0,18 | +0,31 | +0,17 | +0,09 |
| bloques de 3 d | +0,27 | −0,01 | −0,02 | −0,02 | −0,01 | −0,01 |
| bloques de 7 d | +0,42 | +0,20 | −0,02 | −0,02 | −0,02 | −0,02 |
| bloques de 14 d | +0,46 | +0,20 | +0,01 | −0,01 | −0,04 | −0,01 |
| bloques de 21 d | +0,45 | +0,29 | +0,09 | +0,06 | +0,03 | −0,07 |
| bloques de 28 d | +0,44 | +0,31 | +0,14 | +0,03 | −0,04 | +0,06 |

(error típico ≈ 0,09). **Ningún tamaño reproduce la dependencia observada a 14 y 21 días**: la pierde al cruzar las fronteras entre bloques, justo donde debía conservarla. Con los datos actuales, el máximo
entre bloques de 7 y 14 días de la rev. 3 **no demuestra** ser conservador, y bloques más largos (6 y 4 bloques) no se pueden estimar con estabilidad.

**Conclusión: XP queda sin calibración.** No se adopta otra convención para salvarlo.

**Qué está demostrado y qué no.** Demostrado: la implementación evaluada (`sim_series()`: bloques no solapados elegidos de forma independiente) rompe parte de la dependencia en las fronteras y no conserva la distribución
del estadístico de forma estable (los cuantiles cambian demasiado con el tamaño de bloque). **No demostrado:** que ningún otro nulo pueda calibrar XP. No se han probado un bootstrap estacionario (bloques de longitud
aleatoria, sin fronteras rígidas) ni un nulo modelado (un modelo temporal ajustado que simule series sin aceleración). Con 133 días tampoco se asume que alguno lo consiga.

Criterio de admisión (d), como **diagnóstico**, no como obligación universal de reproducir la ACF en cada lag: el procedimiento de nulo debe conservar adecuadamente la dependencia relevante, y eso se comprueba sobre lo que
importa, la distribución del estadístico que se calibra (cuantiles estables entre variantes razonables del procedimiento y diagnósticos de dependencia sin discrepancias claras). Los números de la ACF de arriba son el
diagnóstico que hoy falla para este procedimiento, no el criterio de aceptación de otros. La comparación con un error típico aproximado (≈ 0,09) tampoco caracteriza por sí sola la adecuación del nulo al estadístico:
las discrepancias se valoran con su incertidumbre y su efecto sobre los cuantiles. Si la adecuación no puede justificarse, no se admite la calibración. Se mantienen los demás criterios (mínimo de 26 semanas ≈ 2026-12-24 como condición necesaria, no suficiente; semiancho ≤ 20 %; sensibilidad ≤ 20 % entre tamaños de
bloque). Qué podría estudiarse en otra revisión, sin implementarlo ni decidirlo aquí: más histórico, un bootstrap estacionario o un nulo modelado, cada uno sujeto al diagnóstico (d) y a los demás criterios.

Hoy las evaluaciones de XP muestran el efecto sin afirmarlo: 7 días ×1,47; 14 días ×1,27; 28 días ×1,40, con «Sin referencia de variación habitual todavía». La regla actual emite 7 y 28 días. Desaparece el mínimo
de 200 XP (la banda ya penaliza las ventanas con pocos días); el histórico mínimo h sigue siendo ≥ 28 días; las ventanas de 3 a 6 días también quedan sin calibración.

## 6. Contrato (a enmendar tras aprobar el método)

Orientativo; la forma exacta se fija en la enmienda.

- **Razones** (`REASONS`): se añade `calibration_unavailable` (la serie no permite conocer la variación habitual con estabilidad suficiente: k fuera de lo validado, borde inestable, histórico corto). `effect_below_threshold`
  pasa a significar «dentro de la variación habitual». `data_unavailable`, `span_too_short` e `insufficient_sample` no cambian.
- **Saliencia:** `calibration_unavailable` cuenta como INSUFICIENTE solo si el efecto observado es distinto de cero; con efecto cero, SIN INDICIO. Nunca produce una afirmación.
- **Evaluación:** `status: "emitted"` si supera el límite de «relevante»; `metrics` conserva el efecto observado y añade `bandLower`/`bandUpper` (XP, solo `bandUpper`), `level` (`relevant` | `exceptional`) y en ELO
  `games` (k); `criteria` lleva los límites, la incertidumbre de cada borde y `calibratedThrough`. Sin banda admitida no hay afirmación, y se muestra el efecto con el número de partidas o días.
- **Datos ausentes (sin cambios de principio):** sin ancla de partida o sin ancla en la ventana → `data_unavailable` (A2); sin días con registro → `data_unavailable`; nunca 0.
- **Artefacto:** `calibration-elo-xp.json` junto al dominio, generado por un script reproducible (`--check`), copiado tal cual, nunca recalculado en el Worker, con `calibratedThrough`, intervalos/semanas usados,
  `kVal` y, **por borde**, su incertidumbre y si está admitido.

## 7. Cómo evoluciona

Recalibrar es un PR que reemplaza el artefacto, sin tocar el dominio, cada 28 días o cuando un borde cruce un criterio. Hitos (proyecciones al ritmo actual, no certezas):

| Hito | Cuándo |
|---|---|
| ELO: bordes superiores admitidos (≈ 20 % hoy) | semanas, si la incertidumbre baja como 1/√n; con la condición de vecindad |
| ELO: bordes inferiores admitidos (≈ 35–40 % hoy) | ≈ febrero 2027 |
| XP: mínimo de 26 semanas (necesario, no suficiente) | ≈ 2026-12-24 |
| XP: un remuestreo que conserve la dependencia | no se proyecta: depende de más histórico o de otro nulo |
| ELO con ventanas k > 20 (7 días) | requiere un estudio aparte; no se proyecta |

Cada recalibración puede cambiar una etiqueta de ayer: es correcto, la referencia mejora. Se muestra siempre la fecha de calibración; las evaluaciones no se guardan, se calculan al leer.

## 8. Validación propuesta para la implementación

- Serie sintética estacionaria con los σ, asimetría, dependencia (ELO: bloques; XP: autocorrelación hasta 21 días) del estudio: frecuencia de «relevante» ≈ 5 % y de «excepcional» ≈ 1 % por evaluación (ELO bilateral, XP unilateral), con tolerancia fija.
- Tendencia inyectada (p. ej. +40 puntos de ELO con k = 5; ×1,6 de XP en 14 días): se detecta con la potencia declarada.
- El remuestreo de ELO produce exactamente k (prueba).
- El dominio usa **exactamente** los valores del artefacto; sin banda admitida, ninguna afirmación.
- Contra datos reales (lectura): distribución de estados por ventana, sin asignar tasas de falsa alarma.

Fuera de alcance: reglas de «caída» de XP o de ELO, STREAK, color, Games (ya calibrado), el filtro de confirmación.

**Coste de estas decisiones.** Si ELO y XP pasan a `calibration_unavailable`, los resultados actuales dejan de emitir afirmaciones:

| Regla | Efecto observado | Interpretación |
|---|---|---|
| Salto de ELO | Según partidas | Sin referencia de variación habitual |
| Mayor XP diario, 7 días | ×1,47 | Sin referencia de variación habitual |
| Mayor XP diario, 14 días | ×1,27 | Sin referencia de variación habitual |
| Mayor XP diario, 28 días | ×1,40 | Sin referencia de variación habitual |

Es una pérdida temporal de funcionalidad a cambio de honestidad. **No se conservan los umbrales antiguos (25 puntos de ELO, ×1,3 de XP) como reserva**: reintroducirían las afirmaciones arbitrarias que se eliminan.
Una regla no está obligada a producir una conclusión; sí a no producir una que los datos no sostienen.

## 9. Limitaciones

- **Un usuario, 42 días densos de ELO y 133 de XP.** No es una calibración poblacional ni permite estimar **tasas reales de falsas alarmas**: solo las que implica el modelo nulo. Las cifras orientan el método; no son umbrales.
- La incertidumbre de los bordes de ELO se estima con 62 intervalos y bloques de 3; el tamaño de bloque se probó para σ (1, 3, 5, 8) pero no para los bordes. Con 150 réplicas externas el propio porcentaje tiene un error de unos pocos puntos: de ahí la condición de vecindad.
- XP: 133 días son 19 bloques de 7, 9 de 14, 6 de 21 y 4 de 28; con tan pocos bloques largos no se puede estimar la dependencia a 14–21 días con estabilidad.
- El nulo de ELO supone que los intervalos son intercambiables; hay reversión y asimetría. Se usa la forma menos restrictiva disponible, con sensibilidad, no una prueba de la hipótesis.
- σ del ELO depende del nivel de rating y del rival (bots de distinto ELO); si cambian, la banda queda vieja hasta la siguiente calibración.
- Los pares de anclas de §4 se solapan; las diferencias entre escalas de k son orientativas, no contrastes.
- XP: el nulo asume que 133 días representan el ritmo habitual; un cambio de régimen legítimo (p. ej. nuevo curso) se verá como cambio, sin explicarlo.
- Las anclas de ELO son las de la regla actual (último dato de cada sincronización); si una sincronización llega tarde, k puede incluir partidas que no están en la ventana visible.

## 10. Decisiones

| # | Decisión | Estado |
|---|---|---|
| 1 | Niveles 95 % y 99 %; ELO bilateral por cola, XP unilateral (§3) | Aprobado |
| 2 | ELO con k ≤ 20 como rango de escala; k > 20 sin calibración | Aprobado |
| 3 | Admisión por estabilidad de cada borde, semiancho ≤ 20 % con bootstrap dependiente; sin «≥ 200 intervalos» | Aprobado |
| 4 | ELO: nulo sin deriva, asimétrico, bloques de 3 (referencia provisional); suficiencia por dirección | Aprobado |
| 5 | ELO: condición de vecindad k − 5, k, k + 5 (extremos de la rejilla no admitidos), por dirección y nivel Aprobado (rev. 4). Hoy ningún borde se admite; los resultados cercanos al 20 % no son evidencia fuerte por sí solos |
| 6 | XP: contraste unilateral; 26 semanas necesarias, no suficientes | Aprobado |
| 7 | XP: máximo entre bloques de 7 y 14 días | **Retirada**: el remuestreo no conserva la dependencia (rev. 4) |
| 8 | XP: criterio (d) como diagnóstico de dependencia sobre la distribución del estadístico, no como requisito universal; el fallo demostrado es el de este remuestreo, no el de todo método; hoy XP sin calibración | Reformulado en la rev. 5 |
| 9 | `calibration_unavailable` con «Sin referencia de variación habitual todavía»; INSUFICIENTE solo con efecto distinto de cero | Aprobado |
| 10 | Sin filtro de confirmación | Aprobado |
