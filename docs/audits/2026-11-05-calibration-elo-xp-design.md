# Calibración de los umbrales de ELO y XP — diseño del método

Fecha: 2026-11-05 · Estado: **propuesta para revisión. No implementa nada, no cambia código ni contratos vigentes, no toca producción.**
Origen: hallazgo P4 de `2026-11-05-product-quality-audit.md`. Secuencia acordada: (1) este documento, (2) revisión y aprobación del método,
(3) enmienda del contrato, (4) implementación y pruebas en otra PR.

Cifras reproducibles con `calibration-elo-xp/exploration.py` (semilla fija; la entrada son lecturas de solo lectura de D1 y no se versiona).
Se recalcularon el 2026-11-05 y difieren algo de las de la auditoría, que usaba pares de 7 días entre anclas consecutivas.

## 1. Qué está mal hoy

| Regla | Umbral actual | Qué afirma | Problema |
|---|---|---|---|
| `CHESS_RATING_JUMP` | \|Δ ELO\| ≥ 25 puntos | «Salto de ELO» | 25 es una constante sin relación con el ruido del ELO de este usuario |
| `LANG_XP_ACCELERATION` | cociente ≥ 1,3, ≥ 3 días, ≥ 200 XP | «Mayor XP diario» | 1,3 tampoco sale de los datos; 200 XP es un tercio de un día medio (627 XP) y nunca limita |

Lo que dicen los datos:

- **ELO.** 64 anclas (el ELO que la regla puede usar: último dato de cada sincronización) en 36 días distintos, pero con un hueco de 225 días:
  los datos densos son 63 anclas en **42 días**, 62 intervalos, 253 partidas (≈ 6 al día). El cambio entre anclas consecutivas escala con la raíz del
  número de partidas: **Δ/√k tiene desviación típica 11,0 puntos** (IC95 bootstrap [9,1; 12,8]). Con 10 partidas el rango habitual al 95 % es ≈ ±70 puntos;
  25 puntos son ≈ 0,7 σ√10, un tercio del semiancho de esa banda. En ventanas reales de 7 días, el \|Δ\| mediano es 35 y 25 o más ocurre en el 63 % de ellas.
- **XP.** 133 días contiguos (desde 2026-06-25; el histórico de XP es mucho más corto que la racha de 1.117 días). Media 627, mediana 576, CV 0,47;
  autocorrelación 0,51 a un día y 0,18 a siete. Bajo «sin cambio» (remuestreo de bloques de 7 días), un cociente ≥ 1,3 aparece en el 21 % de las ventanas de
  3 días, 15 % de 7, 12 % de 14 y 7 % de 28. En los datos reales ocurre en el 45–53 %, incluida la deriva real.

Consecuencia: las dos reglas emiten alertas que no distinguen un cambio de la variación habitual. El problema no es el valor 25 ni el 1,3: es que
**ningún número fijo puede ser correcto** porque el ruido depende de cuántas partidas o días hay en la ventana.

## 2. Principios

De Games (`NoiseBands`, `linkedin-games-p1-interpretation-design-2026-11-04.md`), se reutiliza el método, no el código:

1. El límite sale de la distribución del estadístico bajo «sin cambio real» **en la propia serie**, por cola.
2. Se genera fuera del Worker y se versiona como artefacto revisable por PR; con `--check` que regenera y falla si el fichero difiere; lleva `calibratedThrough`.
3. Sin calibración suficiente no se afirma nada y se dice por qué.
4. Lo que es convención se marca como convención.

No se reutiliza: el remuestreo diario de series densas (el ELO es irregular y su ruido depende de las partidas, no de los días), los horizontes de 112 días ni el
filtro de confirmación a `t − 7` (las ventanas de «Qué cambió» son arbitrarias; ver pregunta 6).

**ELO y XP son independientes**: estadístico, ruido, ventanas y criterio de suficiencia propios; ni se comparten ni se agregan.

## 3. Estados

Para cada regla, el efecto observado se compara con dos bandas bajo «sin cambio»:

| Estado | Definición | Estado epistémico en pantalla |
|---|---|---|
| Variación habitual | dentro de la banda del 95 % | SIN INDICIO |
| Cambio relevante | fuera de la banda del 95 % | AFIRMADO |
| Cambio excepcional | fuera de la banda del 99 % | AFIRMADO + etiqueta «excepcional» |
| Sin calibración | no hay datos suficientes para conocer la variación habitual | INSUFICIENTE: se muestra el efecto observado sin afirmarlo |

95 % y 99 % son convenciones. Interpretación: con una evaluación semanal, un 5 % por cola doble son ≈ 2,6 falsos «relevantes» al año por métrica y un 1 %, ≈ 0,5
«excepcionales». Es el coste que se asume, y se dice así en pantalla, no «p-valor».

## 4. ELO

**Estadístico.** Δ = ELO de la última ancla de la ventana − ELO de la última ancla anterior a `since` (como hoy). Nuevo: **k = partidas jugadas entre esas dos anclas**.
La banda depende de k, no de los días.

**Banda.** Para los k validados, `Δ ∈ [q_lo·σ√k, q_hi·σ√k]`, con σ estimada de los intervalos entre anclas consecutivas (Δᵢ/√kᵢ) y los cuantiles `q`
de un nulo «sin deriva»: concatenar intervalos con signo aleatorio hasta alcanzar k. Con los datos de hoy: k = 5 → ±46; k = 10 → ±70; k = 20 → ±97 (95 %);
al 99 %, ≈ 1,4 veces más.

**Dónde deja de valer √k (hallazgo de este estudio).** Sobre pares de anclas del periodo denso (solapados, así que el tamaño real es menor que el indicado):

| k (partidas) | pares | sd(Δ) | sd(Δ)/√k |
|---|---|---|---|
| ≤ 5 | 74 | 20,6 | 11,5 |
| 6–10 | 83 | 31,6 | 11,2 |
| 11–20 | 141 | 39,4 | 10,1 |
| 21–40 | 243 | 47,5 | 8,6 |
| 41–80 | 460 | 63,4 | 8,2 |
| > 80 | 843 | 67,2 | 5,9 |

El ELO no es un paseo aleatorio puro: hay reversión (autocorrelación de los incrementos −0,15) y la escala por √k solo se sostiene hasta ≈ 20 partidas. Extrapolarla
a ventanas largas daría bandas demasiado anchas y no se emitiría nunca; no extrapolarla exige datos de ventanas largas, que hoy son ≈ 6 ventanas independientes de 40
partidas (253 / 40). Por tanto:

- **k ≤ k_val** (hoy 20): se calibra. A 6 partidas al día, son ≈ 3 días.
- **k > k_val**: `calibration_unavailable`. Las ventanas de 7 y 30 días de «Qué cambió» quedan **sin calibración** para el ELO hoy. No se sustituye por el 25.

**Suficiencia (criterio derivado, no un número):** se admite una banda cuando la incertidumbre de la propia banda es pequeña, medida con bootstrap de los intervalos.
Hoy σ tiene anchura relativa del IC95 del 33 % (semiancho 16,5 %) con 62 intervalos. Convención propuesta: semiancho ≤ 20 % (se cumple desde ≈ 48 intervalos). La banda del 99 %
exige además que cada cola tenga al menos una observación esperada: ≥ 200 intervalos (hoy 62). Para ventanas largas: ≥ 40 ventanas independientes del mismo k para el 95 %
(≈ 1.600 partidas para k = 40).

## 5. XP

**Estadístico.** Cociente r = media diaria de XP en los días con registro de la ventana / media diaria histórica (días con registro hasta `since`), como hoy. Se
conserva porque se entiende («×1,4 tu ritmo»). La banda depende de la longitud de la ventana w (días con registro) y de la del histórico h.

**Banda.** Nulo por remuestreo de bloques de 7 días de la propia serie (conserva la dependencia corta; la autocorrelación a 7 días es 0,18 y el día de la semana apenas
pesa: medias por día entre 595 y 663). Con h = 100 días, al 95 % / 99 %:

| w | 95 % | 99 % |
|---|---|---|
| 3 d | [0,42; 1,83] | [0,37; 2,04] |
| 7 d | [0,52; 1,63] | [0,41; 1,84] |
| 14 d | [0,60; 1,53] | [0,52; 1,71] |
| 28 d | [0,68; 1,41] | [0,61; 1,56] |

Hoy: 7 días → ×1,47 (dentro de la banda), 14 → ×1,27, 28 → ×1,40 (justo dentro). La regla actual emitiría 7 y 28 días como «Mayor XP diario». Con este método, ninguno se afirma.
El umbral solo se aplica al lado alto en la regla de «aceleración»; el bajo queda para una futura regla de «caída» (fuera de alcance, ver 8).

**Suficiencia.** Un bootstrap de bloques necesita bloques suficientes: la serie tiene 19 semanas completas. Convención propuesta: ≥ 26 semanas (≈ 2026-12-24 al ritmo actual) para
admitir la calibración; antes, `calibration_unavailable`. El histórico mínimo h también se acota (≥ 28 días, como en la exploración). Los 200 XP mínimos actuales desaparecen:
no limitan, y la banda ya penaliza las ventanas con pocos días.

## 6. Contrato (a enmendar después de aprobar el método)

Orientativo; la forma exacta se fija en la enmienda.

- **Razones** (`REASONS`): se añade `calibration_unavailable` (la serie no permite conocer la variación habitual: pocas partidas, k fuera de lo validado, histórico corto). `effect_below_threshold`
  pasa a significar «dentro de la variación habitual». `data_unavailable`, `span_too_short` e `insufficient_sample` no cambian.
- **Saliencia:** `calibration_unavailable` cuenta como INSUFICIENTE (el efecto está observado, no se puede afirmar); es pregunta abierta si solo cuando el efecto no es cero (pregunta 5).
- **Evaluación:** `kind: "statistical"`; `status: "emitted"` si está fuera de la banda del 95 %; `metrics` conserva el efecto observado y añade `bandLower`, `bandUpper`, `level`
  (`relevant` | `exceptional`) y, en ELO, `games` (k); `criteria` lleva la banda y su `calibratedThrough` (la fecha viaja en el artefacto y se muestra). Sin la banda no hay afirmación.
- **Datos ausentes (sin cambios de principio):** sin ancla de partida o sin ancla en la ventana → `data_unavailable` (A2); sin días con registro → `data_unavailable`; nunca 0.
- **Artefacto:** `calibration-elo-xp.json` junto al dominio, generado por un script reproducible (`--check`), copiado tal cual, nunca recalculado en el Worker, con
  `calibratedThrough`, nº de intervalos/semanas, `kVal` y las condiciones de suficiencia que se cumplen.

## 7. Cómo evoluciona

Recalibrar es un PR que reemplaza el artefacto, sin tocar el dominio. Disparadores propuestos: cada 28 días o cuando se supere un hito de datos. Hitos proyectados **al ritmo actual (proyección, no certeza):**

| Hito | Cuándo |
|---|---|
| XP admite calibración (≥ 26 semanas) | ≈ 2026-12-24 |
| ELO banda del 99 % (≥ 200 intervalos) | ≈ febrero 2027 |
| ELO ventanas de 7 días (≈ 40 ventanas independientes de 40 partidas) | ≈ mediados de 2027 |

Cada recalibración puede cambiar una etiqueta de ayer. Eso es correcto: más datos significan una referencia mejor. Se muestra siempre la fecha de calibración, y las evaluaciones no se
guardan: se calculan al leer.

## 8. Validación propuesta para la implementación

- Serie estacionaria sintética con los σ y la dependencia del estudio: tasa de «relevante» ≈ 5 % y de «excepcional» ≈ 1 % por evaluación, con tolerancia fija.
- Tendencia inyectada (p. ej. +40 puntos de ELO en k = 10; ×1,6 de XP en 14 días): se detecta con la potencia declarada.
- El dominio usa **exactamente** los valores del artefacto (prueba que los compara); sin calibración, ninguna afirmación.
- Contra datos reales (lectura): distribución de estados por ventana, sin asignar tasas de falsa alarma.

Fuera de alcance: reglas de «caída» de XP o de ELO, STREAK, color, Games (ya calibrado), y el filtro de confirmación.

## 9. Limitaciones (importantes)

- **Un usuario, 42 días densos de ELO y 133 de XP.** No es una calibración poblacional ni permite estimar **tasas de falsas alarmas reales**: solo las que implica el modelo nulo
  (estacionariedad, incrementos simétricos, bloques independientes). Las cifras de este documento orientan el método; no son umbrales.
- σ de ELO depende del nivel de rating y del rival (bots de distinto ELO); si cambian, la banda queda vieja hasta la siguiente calibración.
- Los pares de anclas de §4 se solapan: el tamaño efectivo es menor que el indicado. Las diferencias entre escalas de k son orientativas, no contrastes.
- XP: el nulo asume que el pasado de 133 días representa el ritmo habitual; un cambio de régimen legítimo (p. ej. nuevo curso) se verá como cambio, que es lo que queremos mostrar, pero
  no se explica.
- Las anclas de ELO son las de la regla actual (último dato de cada sincronización). Si una sincronización llega tarde, k incluye partidas que no están en la ventana visible.

## 10. Decisiones que pido en la revisión

1. ¿Niveles 95 % / 99 % (y su lectura como coste anual) o prefieres otros?
2. ¿Admitir k ≤ 20 para ELO ahora, aun sabiendo que las ventanas de 7 y 30 días quedan «sin calibración» durante meses, o esperar a tener cobertura completa?
3. ¿Criterios de suficiencia: semiancho ≤ 20 %, ≥ 200 intervalos para el 99 %, ≥ 26 semanas de XP?
4. ¿`calibration_unavailable` muestra el efecto observado con el texto «sin referencia de variación habitual todavía»?
5. ¿INSUFICIENTE siempre o solo con efecto distinto de cero?
6. ¿Se mantiene fuera el filtro de confirmación de Games (publicar solo si coincide la semana anterior)?
