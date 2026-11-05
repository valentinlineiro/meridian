# Calibración de los umbrales de ELO y XP — diseño del método

Fecha: 2026-11-05 (rev. 3, tras dos revisiones) · Estado: **propuesta para revisión final. No implementa nada, no cambia código ni contratos vigentes, no toca producción.**
Origen: hallazgo P4 de `2026-11-05-product-quality-audit.md`. Secuencia: (1) este documento, (2) revisión final del método, (3) enmienda del contrato, (4) implementación y pruebas en otra PR.

Cifras reproducibles con `calibration-elo-xp/exploration.py` (semilla fija, ≈ 45 s; la entrada son lecturas de solo lectura de D1 y no se versiona). Se recalcularon el 2026-11-05
y difieren algo de las de la auditoría, que usaba pares de 7 días entre anclas consecutivas.

**Cambios de la rev. 2:** niveles unilaterales para XP y bilaterales para ELO; remuestreo de ELO con k exacto; incertidumbre de las bandas con dependencia temporal; suficiencia por estabilidad de cada borde;
se retira «≥ 200 intervalos».

**Cambios de la rev. 3:** (a) el nulo de ELO sin invertir signos ahora **retira la deriva observada** (−0,33 puntos por partida) y conserva solo la asimetría; (b) la sensibilidad de XP al tamaño de bloque
(3, 7 y 14 días) está medida, **diverge** y se adopta un procedimiento más conservador; (c) con el nulo corregido, **ELO queda sin calibración en ambas direcciones hoy** (la rev. 2 admitía k ≤ 5: era un
efecto del nulo con signos invertidos, que oculta la incertidumbre de la cola inferior).

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

**Sensibilidad a las hipótesis.** Δ al 95 % (arriba) y al 99 % (abajo) con cuatro nulos; solo C es de referencia:

| k | A: signos, iid | B: sin signos, iid | **C: sin signos, bloques de 3** | D: signos, bloques de 3 |
|---|---|---|---|---|
| 5, 95 % | ±44 | [−42; +43] | **[−48; +48]** | ±48 |
| 5, 99 % | ±54 | [−54; +47] | **[−54; +50]** | ±53 |
| 10, 95 % | ±71 | [−71; +71] | **[−62; +74]** | ±65 |
| 10, 99 % | ±99 | [−103; +82] | **[−70; +83]** | ±80 |
| 20, 95 % | ±99 | [−99; +103] | **[−76; +104]** | ±89 |
| 20, 99 % | ±131 | [−135; +130] | **[−98; +131]** | ±115 |

Retirar la deriva cambió lo que la rev. 2 llamaba «sin invertir signos» (que arrastraba la tendencia observada, −84 puntos). Con el nulo corregido, la cola de bajadas **se acorta** en C (a k = 10: −62 frente a +74)
porque los bloques consecutivos reflejan la reversión del ELO; B (iid) la deja más ancha. Asimetría de Δ/√k = −0,51 (1,6 errores típicos: indicio, no prueba) y autocorrelación −0,06 (−0,15 en Δ sin normalizar).
La inversión de signos (A, D) solo se usa como sensibilidad, no para fijar límites: impone simetría.

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

**Suficiencia: estabilidad de cada borde, por dirección.** Un borde (de un nivel, para un k y una dirección) se admite si (1) el semiancho relativo del IC95 de su valor, por bootstrap de bloques de 3 intervalos
consecutivos que **rehace toda la banda, deriva incluida**, es ≤ 20 %; (2) no cambia más del 20 % entre los cuatro nulos A–D; (3) lo cumplen también los k vecinos del mismo borde (k ± 5), para no admitir un k
aislado que cruza el umbral por ruido de estimación. Los números son convenciones iniciales. Una dirección se afirma solo si su propio borde está admitido.

Resultado hoy (semiancho relativo del IC95 del borde):

| k | 95 % superior | 95 % inferior | 99 % superior | 99 % inferior |
|---|---|---|---|---|
| 5 | +49 ± 21 % | −48 ± 35 % | +50 ± 15 % | −54 ± 33 % |
| 10 | +74 ± 18 % | −62 ± 32 % | +83 ± 16 % | −71 ± 35 % |
| 20 | +104 ± 22 % | −76 ± 37 % | +131 ± 19 % | −99 ± 43 % |

Los bordes superiores están en 15–22 % (en el límite) y los inferiores en 32–43 %: con 62 intervalos y dependencia, la cola de bajadas es la menos conocida. Sensibilidad entre nulos: bordes superiores 11–21 %,
inferiores hasta 37 %. Con la condición (3), **hoy ningún borde se admite**: el superior de k = 10 al 95 % (18 %) pasaría solo, pero sus vecinos k = 5 (21 %) y k = 20 (22 %) no. **ELO queda sin
calibración en ambas direcciones** y las evaluaciones muestran el efecto con las partidas, sin afirmarlo. Es peor que lo que decía la rev. 2, y es lo que los datos permiten.

Proyección (la incertidumbre baja como 1/√n; 62 intervalos hoy, ≈ 1,5 más por día): los bordes superiores (≈ 20 %) se admitirían en ≈ 2–3 semanas; los inferiores (≈ 35 %) piden ≈ 3 veces los intervalos
(≈ 190), es decir, ≈ febrero de 2027. La suficiencia no depende de un contador: si la incertidumbre no baja, el hito se mueve.

## 5. XP

**Estadístico.** Cociente r = media diaria de XP en los días con registro de la ventana / media diaria histórica (días con registro hasta `since`), como hoy; se entiende («×1,4 tu ritmo»). La banda
depende de la longitud de la ventana w y de la del histórico h. Contraste **unilateral** (solo aceleración).

**Sensibilidad al tamaño de bloque (medida).** Cuantiles 95 % / 99 % del nulo con h = 100 días y bloques de 3, 7 y 14 días (la serie tiene 44, 19 y 9 bloques):

| w | 3 d | 7 d | 14 d |
|---|---|---|---|
| 7 d | 1,41 / 1,61 | 1,51 / 1,75 | 1,68 / 1,91 |
| 14 d | 1,31 / 1,46 | 1,43 / 1,62 | 1,47 / 1,65 |
| 28 d | 1,23 / 1,34 | 1,34 / 1,49 | 1,40 / 1,56 |

**Divergen**, y siempre en el mismo sentido: cuanto más largo el bloque, más ancha la banda. La autocorrelación del XP diario no se agota a los 7 días (lag 1: +0,51; 7: +0,18; 14: +0,31; 21: +0,17; 28: +0,09; error
típico ≈ 0,09), así que los bloques de 7 días subestiman la dependencia. **Procedimiento adoptado (más conservador):** cada borde es el **máximo entre los bloques de 7 y de 14 días**; los bloques de 3 días se
descartan porque rompen una dependencia observada. Condición (c): el borde de 14 días no debe superar al de 7 en más del 20 % (hoy: 11 % a w = 7, 3 % a 14, 4 % a 28 con el 95 %; se cumple).

| w | relevante (95 %) | excepcional (99 %) | incertidumbre del borde (bloques de 14 d), 95 % / 99 % |
|---|---|---|---|
| 7 d | 1,68 | 1,91 | ±17 % / ±19 % |
| 14 d | 1,47 | 1,65 | ±12 % / ±16 % |
| 28 d | 1,40 | 1,56 | ±11 % / ±13 % |

(Con bloques de 7 días: ±10/15, ±10/11, ±7/10 %.) Ventanas de menos de 7 días: sin calibración (no medidas con bloques de 14). La regla actual exige ≥ 3 días: las ventanas de 3 a 6 días pasan a
`calibration_unavailable`.

Hoy: 7 días ×1,47 → habitual (< 1,68); 14 días ×1,27 → habitual (< 1,47); 28 días ×1,40 → **en el límite del borde (1,40), dentro de su incertidumbre**: no se afirma. La regla actual emite 7 y 28 días.

**Suficiencia.** (a) **Mínimo de 26 semanas** de histórico (≈ 2026-12-24) para *evaluar* la suficiencia; no la garantiza (con bloques de 14 días, 13 bloques); (b) estabilidad de cada borde: semiancho relativo
del IC95 ≤ 20 % con bootstrap por bloques del mismo tamaño que el nulo, para los dos tamaños; (c) la condición de sensibilidad anterior. Con los datos actuales (b) y (c) se cumplen, pero (a) no: **hoy XP está
sin calibración**. El 99 % se evalúa con los mismos criterios, por separado. Desaparece el mínimo de 200 XP (la banda ya penaliza las ventanas con pocos días); el histórico mínimo h es ≥ 28 días.

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
| ELO: bordes superiores admitidos (≈ 20 % hoy) | ≈ 2–3 semanas, si la incertidumbre baja como 1/√n |
| ELO: bordes inferiores admitidos (≈ 35 % hoy) | ≈ febrero 2027 |
| XP supera el mínimo de 26 semanas y empieza a evaluarse | ≈ 2026-12-24 |
| ELO con ventanas k > 20 (7 días) | requiere un estudio aparte; no se proyecta |

Cada recalibración puede cambiar una etiqueta de ayer: es correcto, la referencia mejora. Se muestra siempre la fecha de calibración; las evaluaciones no se guardan, se calculan al leer.

## 8. Validación propuesta para la implementación

- Serie sintética estacionaria con los σ, asimetría, dependencia (ELO: bloques; XP: autocorrelación a 14 días) del estudio: frecuencia de «relevante» ≈ 5 % y de «excepcional» ≈ 1 % por evaluación (ELO bilateral, XP unilateral), con tolerancia fija.
- Tendencia inyectada (p. ej. +40 puntos de ELO con k = 5; ×1,6 de XP en 14 días): se detecta con la potencia declarada.
- El remuestreo de ELO produce exactamente k (prueba).
- El dominio usa **exactamente** los valores del artefacto; sin banda admitida, ninguna afirmación.
- Contra datos reales (lectura): distribución de estados por ventana, sin asignar tasas de falsa alarma.

Fuera de alcance: reglas de «caída» de XP o de ELO, STREAK, color, Games (ya calibrado), el filtro de confirmación.

## 9. Limitaciones

- **Un usuario, 42 días densos de ELO y 133 de XP.** No es una calibración poblacional ni permite estimar **tasas reales de falsas alarmas**: solo las que implica el modelo nulo. Las cifras orientan el método; no son umbrales.
- La incertidumbre de los bordes de ELO se estima con 62 intervalos y bloques de 3; el tamaño de bloque se probó para σ (1, 3, 5, 8) pero no para los bordes. Con 150 réplicas externas el propio porcentaje tiene un error de unos pocos puntos: de ahí la condición de vecindad.
- XP: con bloques de 14 días la serie tiene 9 bloques; la banda de 14 días es la más incierta y la que decide.
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
| 3 | Admisión por estabilidad de cada borde, semiancho ≤ 20 % con bootstrap dependiente; sin «≥ 200 intervalos» | Aprobado (con la condición de vecindad de §4, nueva) |
| 4 | XP: 26 semanas para evaluar la suficiencia | Aprobado |
| 5 | `calibration_unavailable` con «Sin referencia de variación habitual todavía»; INSUFICIENTE solo con efecto distinto de cero | Aprobado |
| 6 | Sin filtro de confirmación | Aprobado |
| 7 | Nulo de ELO sin deriva y asimétrico (§4) | Hecho en la rev. 3; pendiente de revisión |
| 8 | Sensibilidad de XP a bloques de 7 y 14 días (§5) | Medida, diverge; procedimiento conservador adoptado; pendiente de revisión |
| 9 | Condición de vecindad (k ± 5) para admitir un borde de ELO | Propuesta nueva |
