# Informe individual de juego — Fase 3: metodología del diagnóstico (borrador para aprobar)

Fecha: 2026-11-11 · **Revisión 3** (rev. 2: nula por dimensión; rev. 3: nula conjunta única, simulación sobre datos sintéticos y una dimensión menos)
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
2. **B:** permutar las semanas completas como bloques. Semanas incompletas (inicio, fin, huecos): solo se intercambian con semanas del mismo tamaño; A solo reparte entre los días presentes.

A y B **conmutan** (A actúa dentro de cada fila, B reordena filas), así que el orden de aplicación no importa. `J` conserva el multiconjunto de resultados de cada semana y destruye tanto la asociación día–resultado como el orden temporal: es la hipótesis nula «sin estructura» completa.

### 3.3 Cálculo en cada réplica (reproducible)

Por juego, con `R = 1000` réplicas de `J` y una semilla registrada:

1. De **cada** réplica se calculan a la vez los estadísticos de las dos dimensiones. La dependencia entre dimensiones queda dentro de la propia réplica, no se supone.
2. Para cada dimensión se calcula el p-valor empírico de cada réplica contra las demás: `p_k(b) = #{b' : s_k(b') ≥ s_k(b)} / R`. Los datos reales reciben `p_k(obs) = (#{b : s_k(b) ≥ s_k(obs)} + 1) / (R + 1)`.
3. `U(b) = min_k p_k(b)` (el p más pequeño de cada réplica). **Umbral del juego** = percentil 5 de `U` (equivale al P95 de `max u`).
4. **Hay hallazgo** si `min_k p_k(obs) ≤` umbral. La dimensión del hallazgo es la de menor `p` y, para el día de la semana, se anota el día y el signo.

Es el procedimiento max-T de un solo paso (Westfall–Young) con permutaciones compartidas. Da control del error de tipo I **bajo la nula global** (ninguna estructura). Con una estructura real en una dimensión, el control sobre la *otra* se mide por simulación (§4), no se da por supuesto.

### 3.4 Estabilidad con identidad concreta

Un hallazgo se publica solo si **el mismo aspecto y el mismo signo** estaban también una semana antes; para el día de la semana, **el mismo día concreto** (martes → viernes no es estable aunque ambos sean «desfavorables»). En otro caso queda como «próximo aspecto a observar», estimado.

### 3.5 Artefacto

`diagnosis-thresholds.json`: umbral por juego, `calibratedThrough`, `R`, semillas y versión del script. Lo genera un script offline (`docs/audits/…`) y se copia tal cual: nunca se edita a mano ni se recalcula en el servidor.

### 3.6 Por qué la tendencia no compite (cambio de la rev. 3)

La simulación (§4) mostró que la tendencia no se puede contrastar de forma controlada con ~24 semanas:

- Permutando semanas sueltas, con semanas autocorrelacionadas (ρ = 0,6) el falso hallazgo en tendencia es **8,7 %** y **7,3 %** (W2/W3): por encima del 5 %.
- Permutando bloques de 4 semanas el falso hallazgo baja a ≈ 4 %, pero la potencia para detectar una tendencia real cae de 12 % a 2–4 %: un bloque largo conserva la tendencia local como si fuera ruido.

La tendencia **ya la juzga el veredicto calibrado existente** (`trend112` y `recent28vBase56` con sus bandas de ruido de `noise-bands.json`). No se duplica. El «próximo aspecto a observar» puede apoyarse en `interpretation.pending` (candidato aún sin confirmar), que ya existe y está calibrado.

## 4. Validación del procedimiento completo

**Qué se mide.** El error del procedimiento entero, no el de cada generador: para cada conjunto de datos sintético se ejecuta **todo** (sus propias réplicas de `J`, su propio umbral, su decisión) y se anota si hubo hallazgo y en qué dimensión. Un hallazgo es **falso** si va a una dimensión cuya verdad es nula en ese escenario.

**Independencia.** Los conjuntos sintéticos salen de un flujo de semillas y las réplicas de permutación de **otro** (`sim.py`), de modo que lo validado nunca se calibró con los mismos números.

**Resultados** (1.000 conjuntos por escenario, `R = 1000`, 24 semanas, semanas como bloques; `docs/audits/linkedin-games-phase3-simulation/results_2dim.json`):

| Escenario | Verdad | Resultado |
|---|---|---|
| W0 ruido puro (nula global) | nada | hallazgo **4,4 %** (día 1,7 · regularidad 2,7) ✔ |
| W1 solo asociación día–resultado | día sí, regularidad no | falso en regularidad **2,2 %** ✔; detecta el día 32 % |
| W2 semanas autocorrelacionadas (ρ 0,6) | nada | hallazgo **4,8 %** ✔ |
| W3 día + autocorrelación | día sí, regularidad no | falso en regularidad **2,4 %** ✔ |
| W4 día concreto sembrado (martes −0,5) | día | detecta **73 %** |
| W6 ruido 0,5 → 0,8 en las últimas 8 semanas | regularidad | detecta **55 %** |

Con la tendencia incluida (`results_3dim.json`): ruido puro 5,3 % ✔, pero W2 11,4 % y W3 (tendencia) 7,3 % ✘, que es lo que motivó §3.6.

**Qué significa «detecta».** Efectos grandes (martes −0,5 en log-eficiencia; el ruido pasa de 0,5 a 0,8). **Un efecto pequeño no se detecta con ~170 días**: con una asociación semanal de rango 0,6 (casi el doble de la observada en Queens, ≈ 0,33 en log-eficiencia mediana) solo se detecta un 32 %; con la real sería menos. El bloque dirá «ninguna desviación destacable» la mayoría de las veces, y es correcto.

**Qué pasa si el 5 % no se cumple.** Una sola corrección, fijada de antemano: bajar `α` de 0,05 a 0,025 **una vez** y volver a validar con un flujo de semillas **nuevo**. Si sigue por encima del 5 %, esa dimensión **no se incluye** en la primera entrega. No se itera sobre los mismos datos ni se afina hasta que salga.

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
2. **Nula conjunta única `J = A∘B` con p-valores por réplica y umbral P5 de `min p`** (§3.2–§3.3), con los supuestos H_A y H_B declarados. (sí)
3. **Identidad concreta (día y signo) en la estabilidad** (§3.4). (ya aprobado)
4. **Validación de §4:** procedimiento completo por conjunto sintético, flujos de semillas independientes, una sola corrección `α = 0,025` y, si falla, la dimensión no entra. (sí)
5. **Lenguaje de «asociación»**, no de «efecto» (§1). (sí)

## 8. Riesgos conocidos

- **Potencia baja:** con 177 días lo normal es que casi nada supere el umbral. Es correcto y se dice; no se baja el umbral para fabricar hallazgos.
- **Autocorrelación entre semanas:** con ρ = 0,6 simulado el 5 % se mantiene (4,8 %); con una dependencia mayor o estacionalidad más larga (p. ej. mensual) no está comprobado y podría inflar «regularidad». Límite declarado, no resuelto.
- **Día registrado ≠ día jugado:** el registro es manual; un hábito de anotar ciertos días puede parecer una asociación con el día de la semana. Los huecos se tratan como ausencia, no como cero.
- **Los datos sintéticos no son los reales:** la simulación valida el procedimiento, no que los datos reales cumplan H_A y H_B. Eso solo se puede mirar con los datos reales y con prudencia.
- **Control débil:** el max-T de un solo paso controla el error bajo la nula global; con una estructura real en una dimensión, el error en la otra se mide por simulación (W1/W3: ≈ 2 %), no se demuestra en general.
- **Umbrales caducan:** igual que `noise-bands.json`, hay que recalibrar cuando cambie la población o pase tiempo (`calibratedThrough`).
