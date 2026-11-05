# Calibración de los umbrales de ELO y XP — diseño del método

Fecha: 2026-11-05 (rev. 2, tras la revisión) · Estado: **propuesta para revisión final. No implementa nada, no cambia código ni contratos vigentes, no toca producción.**
Origen: hallazgo P4 de `2026-11-05-product-quality-audit.md`. Secuencia: (1) este documento, (2) revisión final del método, (3) enmienda del contrato, (4) implementación y pruebas en otra PR.

Cifras reproducibles con `calibration-elo-xp/exploration.py` (semilla fija, ≈ 45 s; la entrada son lecturas de solo lectura de D1 y no se versiona). Se recalcularon el 2026-11-05
y difieren algo de las de la auditoría, que usaba pares de 7 días entre anclas consecutivas.

**Cambios de la rev. 2** (revisión de la rev. 1): niveles unilaterales para XP y bilaterales para ELO; el remuestreo de ELO ahora respeta k exacto (la rev. 1 podía pasarse de k y normalizaba
mal); la incertidumbre de las bandas se estima con dependencia temporal; la suficiencia depende de la estabilidad de cada borde, no de un contador, y esto **reduce** lo que ELO admite hoy
(§4); se retira el criterio de «≥ 200 intervalos».

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

**Modelo.** `Δ/√k` con escala σ estimada de los intervalos entre anclas consecutivas, y cuantiles de un nulo «sin deriva» construido remuestreando intervalos **hasta k exactamente** (los de más partidas
de las que faltan se descartan; los de 1 partida siempre caben; la rev. 1 podía sumar más de k y normalizaba con k, lo que estrechaba la banda).

**Hipótesis y su sensibilidad.** El nulo supone intercambiabilidad de los intervalos y, si se invierten signos, simetría. Los datos las matizan:

| | k = 5 | k = 10 | k = 20 |
|---|---|---|---|
| Banda 95 %, signos invertidos | ±44 | ±70 | ±98 |
| Banda 95 %, bloques de 3 intervalos consecutivos (dependencia) | ±48 | ±66 | ±88 |
| Banda 95 %, sin invertir signos (asimétrica) | [−44; +41] | [−77; +67] | [−103; +95] |
| Banda 99 %, signos invertidos | ±54 | ±100 | ±129…134 |
| Banda 99 %, bloques de 3 | ±53 | ±80 | ±114 |
| Banda 99 %, sin invertir signos | [−55; +45] | [−109; +78] | [−139; +121] |

Asimetría de Δ/√k = −0,51 (cola de bajadas más larga; con 62 datos es 1,6 errores típicos, indicio, no prueba). Autocorrelación entre intervalos: −0,06 en Δ/√k (−0,15 en Δ sin normalizar). **Consecuencia:**
la inversión de signos no se usa para fijar los límites (impone una simetría que los datos no tienen); se usa como sensibilidad. Los límites se calculan sin invertir signos, **por cola**, como en Games, y
la dependencia se evalúa con bloques.

**Dónde deja de valer √k.** Sobre pares de anclas del periodo denso (solapados: el tamaño efectivo es menor que el indicado):

| k (partidas) | pares | sd(Δ) | sd(Δ)/√k |
|---|---|---|---|
| ≤ 5 | 74 | 20,6 | 11,5 |
| 6–10 | 83 | 31,6 | 11,2 |
| 11–20 | 141 | 39,4 | 10,1 |
| 21–40 | 243 | 47,5 | 8,6 |
| 41–80 | 460 | 63,4 | 8,2 |
| > 80 | 843 | 67,2 | 5,9 |

La escala por √k solo se sostiene hasta ≈ 20 partidas (reversión). Más allá no se extrapola: **k > 20 → `calibration_unavailable`**. A 6 partidas al día, las ventanas de 7 días (≈ 42 partidas) y de
30 días quedan sin calibración, no se fabrica una conclusión para completar la ventana. Es una propiedad del conocimiento disponible, no un defecto de presentación.

**Suficiencia: estabilidad de cada borde, con dependencia.** Una banda (un borde de un nivel, para un k) se admite cuando se cumplen las dos condiciones siguientes. Los números son convenciones
iniciales:

1. **Incertidumbre del borde:** semiancho relativo del IC95 ≤ 20 %, por bootstrap de **bloques móviles de intervalos consecutivos** sobre el origen, rehaciendo toda la banda cada vez. Los 62 intervalos no
   se tratan como 62 observaciones independientes.
2. **Sensibilidad al nulo:** el borde no cambia más del 20 % entre los tres nulos de la tabla (signos, bloques, sin invertir).

Resultado hoy (semiancho relativo del IC95 del borde superior):

| k | borde 95 % | borde 99 % | admite 95 % | admite 99 % |
|---|---|---|---|---|
| 5 | +43 ± 17 % | +54 ± 15 % | sí | sí (sensibilidad 18 %) |
| 10 | +70 ± 24 % | +99 ± 23 % | no | no (además, sensibilidad 24 %) |
| 20 | +96 ± 21 % | +132 ± 26 % | no (por poco) | no |

σ sola sale mejor (semiancho 15–18 % con bloques de 1 a 8), pero el borde de la banda es lo que se compara y tiene más incertidumbre. **Esto corrige mi propuesta anterior:** aunque √k vale hasta
k = 20, con 62 intervalos solo se admite hoy **k ≤ 5 (≈ 1 día de partidas)**. Las bandas de k = 6–20 se irán admitiendo solas: la incertidumbre baja como 1/√n; pasar de 24 % a 20 % pide ≈ 1,4 veces los
intervalos (≈ 90, a 1,5 intervalos al día, ≈ finales de noviembre), y de 26 % a 20 %, ≈ 1,7 veces (≈ diciembre). Es una proyección, y la sensibilidad al nulo del 99 % tardará más.

La suficiencia **no depende de un contador** de intervalos. La regla de «≥ 200 intervalos para el 99 %» se retira. Para ventanas de k > 20 sí hará falta, además de la estabilidad, comprobar que el
ruido sigue una ley conocida con ventanas independientes del mismo k, y hoy hay ≈ 6 de 40 partidas; ese análisis queda fuera hasta tener cientos de partidas más.

## 5. XP

**Estadístico.** Cociente r = media diaria de XP en los días con registro de la ventana / media diaria histórica (días con registro hasta `since`), como hoy; se entiende («×1,4 tu ritmo»). La banda
depende de la longitud de la ventana w y de la del histórico h.

**Banda.** Nulo por remuestreo de bloques de 7 días de la propia serie (la autocorrelación a 7 días es 0,18; el día de la semana apenas pesa, medias por día entre 595 y 663). **Contraste unilateral**
(solo aceleración), con h = 100 días:

| w | cuantil 95 % (relevante) | cuantil 99 % (excepcional) | incertidumbre 95 % / 99 % |
|---|---|---|---|
| 3 d | 1,66 | 1,94 | — |
| 7 d | 1,51 | 1,75 | ±10 % / ±15 % |
| 14 d | 1,43 | 1,63 | ±8 % / ±11 % |
| 28 d | 1,34 | 1,49 | ±7 % / ±10 % |

La incertidumbre es el semiancho relativo del IC95 del cuantil cuando la serie de origen se remuestrea por semanas (19 bloques). La rev. 1 usaba la banda central 95 % (límite superior 1,41 a 28 días), que
correspondía a una cola del 2,5 %; el contraste unilateral del 5 % da 1,34.

Hoy: 7 días ×1,47 → habitual (< 1,51); 14 días ×1,27 → habitual; **28 días ×1,40 → relevante (> 1,34), pero dentro de la incertidumbre del propio borde (1,34 ± 0,09)**: es un caso límite, no un hallazgo
firme. La regla actual emite 7 y 28 días.

**Suficiencia.** Dos condiciones: (a) **mínimo de 26 semanas** de histórico (≈ 2026-12-24) para *evaluar* la suficiencia; no es una garantía de calibración; (b) estabilidad de cada borde: semiancho relativo del IC95 ≤ 20 % por
bootstrap de bloques semanales y, antes de implementar, sensibilidad al tamaño de bloque (7 frente a 14 días; no medida todavía). Con las 19 semanas actuales (b) ya se cumpliría (7–15 %), pero (a) no, así que
**hoy XP está sin calibración**. El 99 % se evalúa con los mismos criterios, por separado. El histórico mínimo h (≥ 28 días) y el mínimo de 200 XP: este último desaparece (la banda ya penaliza las
ventanas con pocos días).

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
| ELO admite k = 6–20 al 95 % | ≈ finales de noviembre – diciembre 2026 |
| XP supera el mínimo de 26 semanas y empieza a evaluarse | ≈ 2026-12-24 |
| ELO admite el 99 % para k > 5 | depende de la sensibilidad al nulo; no se proyecta |
| ELO con ventanas k > 20 (7 días) | requiere un estudio aparte; no se proyecta |

Cada recalibración puede cambiar una etiqueta de ayer: es correcto, la referencia mejora. Se muestra siempre la fecha de calibración; las evaluaciones no se guardan, se calculan al leer.

## 8. Validación propuesta para la implementación

- Serie sintética estacionaria con los σ, asimetría y dependencia del estudio: frecuencia de «relevante» ≈ 5 % y de «excepcional» ≈ 1 % por evaluación (ELO bilateral, XP unilateral), con tolerancia fija.
- Tendencia inyectada (p. ej. +40 puntos de ELO con k = 5; ×1,6 de XP en 14 días): se detecta con la potencia declarada.
- El remuestreo de ELO produce exactamente k (prueba).
- El dominio usa **exactamente** los valores del artefacto; sin banda admitida, ninguna afirmación.
- Contra datos reales (lectura): distribución de estados por ventana, sin asignar tasas de falsa alarma.

Fuera de alcance: reglas de «caída» de XP o de ELO, STREAK, color, Games (ya calibrado), el filtro de confirmación.

## 9. Limitaciones

- **Un usuario, 42 días densos de ELO y 133 de XP.** No es una calibración poblacional ni permite estimar **tasas reales de falsas alarmas**: solo las que implica el modelo nulo. Las cifras orientan el método; no son umbrales.
- La incertidumbre de los bordes se estima con 62 intervalos y bloques de 3: es una estimación, y los bloques elegidos no se prueban frente a otros tamaños salvo en σ (1, 3, 5, 8).
- El nulo de ELO supone que los intervalos son intercambiables; hay reversión y asimetría. Se usa la forma menos restrictiva disponible, con sensibilidad, no una prueba de la hipótesis.
- σ del ELO depende del nivel de rating y del rival (bots de distinto ELO); si cambian, la banda queda vieja hasta la siguiente calibración.
- Los pares de anclas de §4 se solapan; las diferencias entre escalas de k son orientativas, no contrastes.
- XP: el nulo asume que 133 días representan el ritmo habitual; un cambio de régimen legítimo (p. ej. nuevo curso) se verá como cambio, sin explicarlo.
- Las anclas de ELO son las de la regla actual (último dato de cada sincronización); si una sincronización llega tarde, k puede incluir partidas que no están en la ventana visible.

## 10. Decisiones tomadas en la revisión de la rev. 1

| # | Decisión |
|---|---|
| 1 | Niveles 95 % y 99 %, como convenciones interpretables; ELO bilateral, XP unilateral con cuantiles 95 y 99 (§3). El coste anual es un número esperado bajo el modelo. |
| 2 | ELO con k ≤ 20 como rango de escala; las ventanas con k > 20 son «sin calibración». Admisión real por estabilidad (hoy k ≤ 5, §4). |
| 3 | Semiancho ≤ 20 % con bootstrap dependiente; sin «≥ 200 intervalos»; XP: 26 semanas habilitan evaluar la suficiencia, no la garantizan. |
| 4 | Texto «Sin referencia de variación habitual todavía», con el efecto medido y las partidas/días. Nunca una afirmación estadística. |
| 5 | INSUFICIENTE solo con efecto distinto de cero. |
| 6 | Sin filtro de confirmación. |
