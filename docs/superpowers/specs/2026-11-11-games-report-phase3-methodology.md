# Informe individual de juego — Fase 3: metodología del diagnóstico (borrador para aprobar)

Fecha: 2026-11-11 · **Revisión 4** (rev. 2: nula por dimensión; rev. 3: nula conjunta única y una dimensión menos; rev. 4: p-valor exacto de permutación y validación con intervalos de confianza)
Estado: **borrador, sin implementar. Necesita aprobación explícita antes de leer producción o escribir código.**
Contexto: la fase 1 (informe) y la fase 2 (agregaciones y su pantalla) están en producción. Ver
`2026-11-10-games-individual-report-design.md` §5 (fase 3) y §7. Evidencia de esta revisión:
`docs/audits/linkedin-games-phase3-simulation/` (solo datos sintéticos, reproducible).

## 1. Qué se promete y qué no

Se añade al informe un bloque **«Qué destaca»** con, como mucho, tres frases, cada una con su `n` y su estado:

- **Fortaleza**: la mayor desviación *favorable* que supera el ruido.
- **Debilidad**: la mayor desviación *desfavorable* que supera el ruido.
- **Próximo aspecto a observar**: el aspecto de mayor `u` que no llega al umbral, dicho como «estimado», nunca «detectado». El corte mínimo de `u` para mencionarlo (p. ej. 0,8) se fija tras la validación de §4, no antes.

**No se promete** que siempre haya una fortaleza, una debilidad o algo que observar. Si ningún aspecto supera el ruido, el bloque dice «ninguna desviación destacable con estos datos (n = …)». Con pocos datos, dice qué falta.

**No se promete** explicar *por qué*: solo se guarda el tiempo total de cada partida. Las hipótesis quedan **fuera de la primera entrega**; si se añaden, van en una PR aparte y marcadas como hipótesis.

**Lenguaje.** Lo que se mide es una **asociación entre el día de la semana en que se registró la partida y su resultado**, no un «efecto del día»: el registro es manual y puede seguir un hábito (§8). Los textos del informe dirán «los martes se pierde más», nunca «los martes juegas peor por…».

## 2. Aspectos que compiten

**Dos** dimensiones (rev. 3: la tendencia sale, ver §3.6):

| Aspecto | Estadístico (valor absoluto) | Dato base |
|---|---|---|
| **Día de la semana** | máximo, sobre los días con al menos `MIN_CELL` (8) partidas, de |tasa de derrotas del día − tasa global|. Se guardan **el día concreto** y **el signo** | `losses.cells` |
| **Regularidad** | log(P75/P25) de los últimos 56 días menos el de los 56 anteriores. Signo: más amplia / más estrecha | `series` / `weekly` (fase 2) |

Las ventanas de regularidad son múltiplos de 7 días (8 semanas cada una): una asociación con el día de la semana afecta por igual a las dos y se cancela en la diferencia. Por eso destruir la asociación semanal en la nula conjunta no infravalora el ruido de la regularidad (comprobado en la simulación, §4).

## 3. Cómo se decide «supera el ruido»

### 3.1 Supuestos declarados (intercambiabilidad)

- **H_A (día de la semana).** Sin asociación día–resultado, los resultados de los días **registrados de una misma semana natural** son intercambiables entre esos días.
- **H_B (orden temporal).** Sin cambio en el tiempo, las **semanas completas** son bloques intercambiables entre sí.

Son **supuestos**, no hechos. H_A falla si el hábito de registro depende del día (§8). H_B falla con autocorrelación semanal fuerte o estacionalidad larga; la simulación mide cuánto (§4) y el límite queda escrito en §8. **Nada de esto garantiza el 5 %**: lo garantiza, con esos supuestos, la nula conjunta de §3.2 y lo comprueba la validación de §4.

### 3.2 Una única nula conjunta (sin emparejar réplicas)

Se elimina el emparejamiento de réplicas de A y B de la rev. 2, que suponía independencia entre ambas fuentes. En su lugar, **cada réplica aplica las dos permutaciones a la vez** (la transformación conjunta `J`):

1. **A:** dentro de cada semana natural, permutar los valores entre los días registrados de esa semana.
2. **B:** permutar las semanas como bloques, **solo entre semanas con la misma máscara de días registrados** (rev. 4). Una semana con una máscara única no se mueve. Intercambiar semanas «del mismo tamaño» pero con ausencias distintas añadía un supuesto sobre el patrón de ausencias que no estaba validado; con la máscara idéntica, lo que se intercambia es comparable. A solo reparte entre los días registrados de cada semana y **la máscara no se mueve**.

A y B **conmutan** (A actúa dentro de cada fila, B reordena filas), así que el orden de aplicación no importa. `J` conserva el multiconjunto de resultados de cada semana y destruye tanto la asociación día–resultado como el orden temporal: es la hipótesis nula «sin estructura» completa.

### 3.3 Cálculo (reproducible, exacto)

Por juego, con `R = 1000` réplicas de `J` y una semilla registrada. Se forma el **conjunto de R + 1 elementos**: los datos reales más las R réplicas (intercambiables bajo la nula):

1. Para cada dimensión `k` y cada elemento `i` del conjunto: `p_k(i) = #{j : s_k(j) ≥ s_k(i)} / (R + 1)`. La dependencia entre dimensiones queda dentro de cada elemento, no se supone.
2. `U(i) = min_k p_k(i)`.
3. **p ajustado** = `#{i : U(i) ≤ U(datos)} / (R + 1)`.
4. **Hay hallazgo** si `p ajustado ≤ α`, es decir, si los datos están entre los `⌊α (R + 1)⌋` menores `U` del conjunto (con R = 1000 y α = 0,05: **50**). Es un **estadístico de orden finito** sobre el conjunto, sin interpolar entre valores. La dimensión del hallazgo es la de menor `p` y, para el día de la semana, se anota el día y el signo.

Este es el p-valor de permutación exacto con el «+1» de los datos incluidos (max-T de un solo paso, Westfall–Young, con permutaciones compartidas): **si H_A y H_B se cumplen, la probabilidad de hallazgo bajo la nula global es ≤ α exactamente**, no aproximadamente. Con una estructura real en una dimensión, el control sobre la *otra* no está garantizado y se mide por simulación (§4).

### 3.4 Estabilidad con identidad concreta

Un hallazgo se publica solo si **el mismo aspecto y el mismo signo** estaban también una semana antes; para el día de la semana, **el mismo día concreto** (martes → viernes no es estable aunque ambos sean «desfavorables»). En otro caso queda como «próximo aspecto a observar», estimado.

### 3.5 Artefacto

`diagnosis-thresholds.json`: por juego y dimensión, los `R` estadísticos de las réplicas ordenados (de los que salen `p` y el orden exacto de §3.3), más `calibratedThrough`, `R`, semillas y versión del script. Lo genera un script offline (`docs/audits/…`) y se copia tal cual: nunca se edita a mano ni se recalcula en el servidor.

### 3.6 Por qué la tendencia no compite (cambio de la rev. 3)

Una exploración previa con una versión de la simulación que incluía la tendencia (1.000 conjuntos por escenario; **no se conserva en el repositorio**, `sim.py` ya solo contiene la propuesta de dos dimensiones) mostró que no se puede contrastar de forma controlada con ~24 semanas. Son cifras orientativas, no una validación reproducible:

- Permutando semanas sueltas, con semanas autocorrelacionadas (ρ = 0,6) el falso hallazgo en tendencia es **8,7 %** y **7,3 %** (W2/W3): por encima del 5 %.
- Permutando bloques de 4 semanas el falso hallazgo baja a ≈ 4 %, pero la potencia para detectar una tendencia real cae de 12 % a 2–4 %: un bloque largo conserva la tendencia local como si fuera ruido.

La tendencia **ya la juzga el veredicto calibrado existente** (`trend112` y `recent28vBase56` con sus bandas de ruido de `noise-bands.json`). No se duplica. El «próximo aspecto a observar» puede apoyarse en `interpretation.pending` (candidato aún sin confirmar), que ya existe y está calibrado.

## 4. Validación del procedimiento completo

**Qué se mide.** El error del procedimiento entero: para cada conjunto sintético se ejecuta **todo** (sus propias réplicas de `J`, su p ajustado, su decisión) y se anota si hubo hallazgo y en qué dimensión. Un hallazgo es **falso** si va a una dimensión cuya verdad es nula en ese escenario.

**Independencia.** Los conjuntos salen de un flujo de semillas y las réplicas de permutación de **otro** (`sim.py`); la corrida con α = 0,025 usa además una **semilla de entropía distinta**, de modo que no se valida nada con los números con los que se calibró.

**Criterio de aceptación, fijado de antemano.** Con 5.000 conjuntos por escenario, el intervalo de Wilson al 95 % de una tasa del 5 % mide ± 0,6 puntos. Un escenario con verdad nula **falla** si el **límite inferior** de su intervalo supera el 5 % (hay evidencia de que lo excede). Como el test es exacto por construcción, la simulación busca *violaciones de los supuestos*, no «demuestra» el 5 %: un punto estimado de 4,6 % con intervalo [4,05; 5,22] es compatible con el nivel y no se interpreta como «por debajo».

**Resultados con α = 0,05** (`results_a0.05.json`; 5.000 conjuntos por escenario, `R = 1000`, 24 semanas; entre corchetes, el intervalo al 95 %):

| Escenario | Verdad | Falso hallazgo (dimensión nula) | Potencia (dimensión real) |
|---|---|---|---|
| W0 ruido puro | nada | **4,6 %** [4,05; 5,22] | — |
| W2 semanas autocorrelacionadas (ρ 0,6) | nada | **4,3 %** [3,8; 4,9] | — |
| W7 estrés: ρ 0,9, sd 0,4 | nada | **4,3 %** [3,7; 4,9] | — |
| W1 asociación día–resultado (rango 0,6) | día | 2,7 % [2,3; 3,2] en regularidad | 31,7 % [30,4; 33,0] |
| W3 asociación + autocorrelación | día | 2,7 % [2,3; 3,2] en regularidad | 31,7 % [30,5; 33,0] |
| W4 martes sembrado (−0,5) | día | 1,2 % [1,0; 1,6] en regularidad | 72,8 % [71,6; 74,0] |
| W6 ruido 0,5 → 0,8 en las últimas 8 semanas | regularidad | 0,9 % [0,7; 1,2] en día | 51,7 % [50,3; 53,1] |

Ninguna celda con verdad nula tiene el límite inferior por encima del 5 %: **la validación pasa**. Incluso con semanas muy autocorrelacionadas (ρ 0,9) no se observa inflación en estas dos dimensiones.

**Qué ocurre cuando se activa la corrección α = 0,025** (`results_a0.025.json`, semillas nuevas):

| Escenario | Falso hallazgo | Potencia |
|---|---|---|
| W0 / W2 / W7 (verdad nula) | 2,2 % [1,9; 2,7] / 2,2 % / 2,2 % | — |
| W1 / W3 día | 1,5 % / 1,4 % en regularidad | 21,5 % [20,4; 22,7] / 19,9 % |
| W4 martes sembrado | 0,7 % en regularidad | 65,0 % [63,7; 66,3] |
| W6 dispersión | 0,3 % en día | 42,7 % [41,3; 44,1] |

La corrección **reduce a la mitad el falso hallazgo y cuesta unos 10 puntos de potencia** (un martes sembrado pasa de 73 % a 65 %). **Ningún escenario sintético superó el 5 % con α = 0,05: la corrección no está validada como solución a un fallo observado, ni se presenta como necesaria.** Es una medida de contingencia cuya consecuencia está caracterizada. **Regla de activación (solo sobre escenarios sintéticos):** si en una nueva validación sintética una celda con verdad nula tiene el límite inferior por encima del 5 %, se aplica α = 0,025 **una sola vez** y se vuelve a validar con una semilla nueva; si sigue fallando, esa dimensión no entra en la primera entrega. No se afina sobre los mismos datos.

**Con datos reales no se activa nada de esto.** No se conoce la verdad de cada dimensión, así que no se pueden clasificar falsos positivos ni aplicar este criterio: la comprobación con datos reales se limita a lo de abajo (estabilidad temporal, coherencia con el veredicto, datos escasos y la plausibilidad de los supuestos).

**Qué significa «detecta».** Efectos grandes (martes −0,5 en log-eficiencia; el ruido pasa de 0,5 a 0,8). Una asociación semanal de rango 0,6, casi el doble de la observada en Queens (≈ 0,33), solo se detecta el 32 %; con la real sería menos. El bloque dirá «ninguna desviación destacable» la mayoría de las veces, y es correcto.

### 4.1 Patrones de ausencia (semanas incompletas y huecos)

La simulación principal solo tiene semanas completas; los datos reales tienen huecos. `sim_absence.py` repite el procedimiento con días sin registrar y con la regla de §3.2 (A reparte entre los días registrados con la máscara fija; B intercambia solo semanas con **la misma máscara**). Los estadísticos ignoran los días sin registrar: en el día de la semana solo compiten los días con ≥ 8 resultados, y cada ventana de regularidad necesita ≥ 20 resultados (si no, la dimensión no se evalúa). 2.000 conjuntos por escenario, `R = 1000`, α = 0,05, mismos flujos de semillas independientes (`results_absence_a0.05.json`):

| Escenario | Máscaras distintas (de 24 semanas) | Falso hallazgo [IC 95 %] | Potencia [IC 95 %] |
|---|---|---|---|
| C0 semanas completas, ruido (control) | 1 | 5,0 % [4,1; 6,0] | — |
| M1 faltan días al azar (15 %), ruido | 12,5 | 4,3 % [3,5; 5,3] | — |
| M2 fines de semana a menudo sin registrar, ruido | 8,8 | 4,7 % [3,8; 5,7] | — |
| **M3 las derrotas a menudo no se registran (ausencia informativa), ruido** | 10,4 | **5,5 % [4,5; 6,5]** | — |
| M4 el registro decae en las últimas 8 semanas, ruido | 11,9 | 4,0 % [3,2; 5,0] | — |
| M1 + asociación día–resultado (rango 0,6) | 12,5 | 1,7 % [1,2; 2,3] en regularidad | 31,3 % [29,3; 33,4] |
| M1 + dispersión 0,5 → 0,8 | 12,5 | 1,5 % [1,1; 2,1] en día | 25,8 % [23,9; 27,8] |
| M2 + asociación día–resultado (rango 0,6) | 8,8 | 3,3 % [2,6; 4,2] en regularidad | **13,2 % [11,7; 14,7]** |

Lectura, sin adornos:

- **El criterio de §4 se cumple:** ninguna celda con verdad nula tiene el límite inferior por encima del 5 %. Las ausencias aleatorias o por hábito (M1, M2, M4) no inflan el error.
- **El punto débil es la ausencia informativa (M3):** el punto estimado es 5,5 % [4,5; 6,5]. No incumple el criterio (el límite inferior es 4,5 %), pero tampoco permite descartar un exceso pequeño. Es el caso esperado: si el resultado decide si se registra, los días ya no son intercambiables y ninguna permutación lo arregla. **Queda declarado como límite**, no como resuelto: el bloque habla de lo registrado, no de lo jugado.
- **La potencia cae con las ausencias:** con la regla de la misma máscara, una semana con máscara única no se mueve, así que la nula tiene menos resolución. La regularidad baja de ≈ 52 % a ≈ 26 %; la asociación con el día cae a 13 % cuando faltan los fines de semana (justo los días más extremos). Con huecos, «ninguna desviación destacable» será aún más frecuente.
- **El control completo (C0) sigue en 5,0 %** [4,1; 6,0], coherente con el 4,6 % de las 5.000 simulaciones principales.
- Este escenario de ausencias **no se repite a 5.000 conjuntos** ni con α = 0,025: no hace falta para el criterio, y la corrección sigue siendo una contingencia no necesaria (§4).

**Con datos reales** (cuando haya permiso) se añade:

- **Estabilidad temporal:** aplicar las reglas cada domingo del histórico y medir cuántas veces cambia el hallazgo publicado. Si cambia casi cada semana, **no se publica**.
- **Coherencia con el veredicto:** el bloque no contradice la etiqueta calibrada; si hay conflicto, manda la etiqueta.
- **Datos escasos:** menos de 60 observaciones con media (`MIN_FIT`) → el bloque no aparece. Regularidad necesita 16 semanas (112 días): Tango y Wend (64 días) **no la evalúan**; el día de la semana sí si cada día tiene 8 partidas. Es un resultado válido y se dice.

## 5. Qué se necesita de producción (lectura, aparte)

**No se pide ahora.** Cuando este documento esté aprobado, un permiso **solo de lectura y puntual**:

- Los resultados diarios de los 6 juegos (≈ 600 filas: fecha, segundos propios y media publicada), por la ruta de solo lectura de la sesión, guardados **fuera del repositorio**.
- Sin escrituras, sin tocar D1 directamente, sin migraciones. Los números salen en un informe offline en `docs/audits/`, con el script que los produce.

## 6. Entrega por PRs (cada una con su «go»)

1. Script offline de calibración + informe + `diagnosis-thresholds.json` (sin tocar el servidor).
2. Dominio: reglas puras con tests primero, que leen el artefacto, y el campo nuevo `diagnosis` en `GameSummary` (aditivo).
3. Interfaz: el bloque «Qué destaca» con sus textos, `n` y estado.

## 7. Qué hay que decidir (mi recomendación entre paréntesis)

1. **Dos dimensiones, día y regularidad, y la tendencia fuera** (§2, §3.6). Es un cambio respecto a lo aprobado en principio; lo motiva la simulación. (sí)
2. **Nula conjunta única `J = A∘B` con p-valor de permutación exacto (estadístico de orden sobre `R + 1`)** (§3.2–§3.3), con los supuestos H_A y H_B declarados. (aprobada en la revisión 3 con la precisión del orden finito, ya incorporada)
3. **Identidad concreta (día y signo) en la estabilidad** (§3.4). (ya aprobado)
4. **Validación de §4:** procedimiento completo por conjunto sintético, 5.000 conjuntos por escenario, intervalos de Wilson, criterio de aceptación fijado de antemano, flujos de semillas independientes y una sola corrección `α = 0,025` caracterizada por simulación, **activable solo sobre escenarios sintéticos** (no se aplica ni se decide con datos reales), y escenarios con patrones de ausencia con la regla de la misma máscara (§4.1, el punto débil es la ausencia informativa, declarado). (sí)
5. **Lenguaje de «asociación»**, no de «efecto» (§1). (sí)

## 8. Riesgos conocidos

- **Potencia baja:** con 177 días lo normal es que casi nada supere el umbral. Es correcto y se dice; no se baja el umbral para fabricar hallazgos.
- **Autocorrelación entre semanas:** con ρ = 0,6 y 0,9 simulados no hay inflación (4,3 %); una estacionalidad más larga (p. ej. mensual) o dependencias de otra forma no están probadas. Límite declarado.
- **Día registrado ≠ día jugado:** el registro es manual; un hábito de anotar ciertos días puede parecer una asociación con el día de la semana. Los huecos se tratan como ausencia, no como cero. Si el *resultado* decide si se registra (p. ej. no anotar las derrotas), los días dejan de ser intercambiables y el error puede superar algo el 5 % (5,5 % [4,5; 6,5] en la simulación M3): límite declarado.
- **Los datos sintéticos no son los reales:** la simulación valida el procedimiento, no que los datos reales cumplan H_A y H_B. Eso solo se puede mirar con los datos reales y con prudencia.
- **Control débil:** el max-T de un solo paso controla el error bajo la nula global; con una estructura real en una dimensión, el error en la otra se mide por simulación (W1/W3: 2,7 %), no se demuestra en general.
- **Umbrales caducan:** igual que `noise-bands.json`, hay que recalibrar cuando cambie la población o pase tiempo (`calibratedThrough`).
