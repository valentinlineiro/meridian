# Diseño P1: interpretación de la evolución en LinkedIn Games (2026-11-04, rev. 2)

Estado: borrador para revisión. **Sin código.** Parte del P0 (medición, `294008d`). Los umbrales **salen de la distribución histórica real**; lo que es convención está marcado. Scripts reproducibles en `linkedin-games-p1-calibration/` (cómo reconstruir la entrada, en su README).

## 0. Cambios respecto a la rev. 1 (por la revisión)
1. **Flechas solo a 7 y 28 días.** 90 días y «Todo» muestran el cambio numérico, sin dirección, hasta tener una comparación calibrada (§2.4).
2. **Límites por cola, no una banda simétrica.** Se calculan los puntos 2,5 % y 97,5 % de cada estadístico firmado. La asimetría es real (§1.2).
3. **Remuestreo: B = 5000 y 20000, cinco semillas, falsos avisos por trayectoria completa** (§1.6, §1.7). Al hacerlo salieron dos hallazgos que corrigen la rev. 1: un defecto de alineación en mi calibración (los avisos por evaluación pasan a ser los nominales) y un coste anual de falsos avisos que mirar solo cada evaluación no mostraba (§1.7).
4. Días naturales frente a observaciones, y reconstrucción de la entrada (§1.0).
5. Cifras que cambian: Queens pasa de «mejora» en 7 de 9 evaluaciones a **4 de 9**; Mini Sudoku, 7 de 9; Zip, 4 de 9; Patches, ninguna.

## 1. Qué dicen los datos

**1.0 Datos.** Del 2026-05-17 al 2026-11-03: **171 días naturales y 170 observaciones** por juego (falta 2026-09-16) en Mini Sudoku, Patches, Queens y Zip; **58 días naturales y 57 observaciones** en Tango y Wend (desde 2026-09-07). La eficiencia es `avg/score` por observación. La entrada se reconstruye desde los snapshots con `p1_export_days.py` (consulta documentada en su cabecera).

**1.1 El ruido es grande y distinto en cada juego.**
| Juego | cv de la eficiencia | autocorr. lag 7 | finde / entre semana | Spearman eficiencia~tiempo (p) |
|---|---|---|---|---|
| Mini Sudoku | 0,29 | 0,38 | ×1,32 | +0,47 (1e-10) |
| Patches | 0,59 | 0,03 | ×1,19 | +0,09 (0,24) |
| Queens | 0,44 | 0,43 | ×1,60 | +0,19 (0,013) |
| Zip | 0,65 | -0,01 | ×1,33 | +0,21 (0,006) |
| Tango (57 obs.) | 0,34 | -0,03 | ×1,30 | +0,06 (0,65) |
| Wend (57 obs.) | 0,33 | 0,11 | ×0,84 | +0,23 (0,087) |
Un umbral único no vale. El ciclo semanal obliga a ventanas múltiplo de 7 y a remuestrear **semanas completas**.

**1.2 Límites de ruido por cola** (cambio relativo de la mediana de eficiencia entre dos ventanas sin cambio real; puntos 2,5 % y 97,5 %; B = 20000, media de cinco semillas):
| Juego | 7 d frente a 7 d | 28 d frente a 28 d | 28 d frente a 56 d previos | ρ de Spearman a 112 d |
|---|---|---|---|---|
| Mini Sudoku | −35 % / +54 % | −23 % / +29 % | −20 % / +25 % | −0,27 / +0,28 |
| Patches | −48 % / +92 % | −33 % / +50 % | −29 % / +44 % | −0,20 / +0,20 |
| Queens | −36 % / +55 % | −28 % / +38 % | −24 % / +35 % | −0,15 / +0,17 |
| Zip | −47 % / +89 % | −26 % / +34 % | −23 % / +30 % | −0,19 / +0,18 |
- **La asimetría es real:** el límite superior de un cambio relativo es 1,2–2 veces el inferior (porque `Δ ≥ −100 %` y no tiene techo). Una banda simétrica habría dado demasiadas subidas o demasiadas bajadas falsas. ρ sí es prácticamente simétrica.
- Tango y Wend (58 días) **no tienen calibración** (menos de 112 días de historia, §2.2).
- El ruido baja como 1/√n. Con B = 5000, a 14 d y 56 d (exploratorio): Mini Sudoku [−29 %, +42 %] y [−18 %, +21 %]; Patches [−41 %, +71 %] y [−26 %, +35 %]; Queens [−31 %, +47 %] y [−23 %, +31 %]; Zip [−36 %, +54 %] y [−19 %, +24 %].

**1.3 La regla actual (aviso `regression`) es sobre todo ruido.** Caída ≥ 10 %, 28 d frente a 28 d: bajo «sin cambio real» marcaría el **46 %** (Mini Sudoku), **63 %** (Patches), **53 %** (Queens) y **52 %** (Zip) de las evaluaciones. Hoy Queens (−7 %; ayer −10,2 %) está dentro de su banda (−28 % / +38 %). Mann-Whitney tampoco sirve: p < 0,05 da 17 % de falsos positivos en Mini Sudoku, 7,6 % en Patches, 1,6 % en Queens y 4,7 % en Zip (la dependencia entre datos lo desajusta).

**1.4 Dos ventanas de 28 días no ven el progreso real.** Primeros 56 d frente a últimos 56 d: Mini Sudoku +36 %, Queens +31 %, Zip +31 %, Patches +17 %, frente a límites superiores de +29 % a +50 % a 28 d. El progreso se ve con una **tendencia a horizonte largo**.

**1.5 Horizonte de la tendencia.** Evaluaciones semanales marcadas como mejora (↓ = deterioro), con límites de B = 5000, contando hacia atrás desde hoy:
| Juego | 56 d | 84 d | 112 d |
|---|---|---|---|
| Mini Sudoku | 0 de 17 | 5 de 13 | **7 de 9** |
| Queens | ↑3 ↓1 de 17 | 4 de 13 | **4 de 9** |
| Zip | 3 de 17 | 2 de 13 | **4 de 9** |
| Patches | 0 | 0 | 0 |
112 d es el horizonte con más detección en los tres juegos con progreso (78 %, 44 %, 44 %); es el más largo probado, no se probaron 140 o 168. Las evaluaciones se solapan: no son independientes.

**1.6 Estabilidad del remuestreo** (desviación típica entre 5 semillas del límite más inestable de cada juego, en % de la anchura de su banda):
| B | Mini Sudoku | Patches | Queens | Zip |
|---|---|---|---|---|
| 300 | 4,9 % | 3,9 % | 6,2 % | 9,9 % |
| 1000 | 3,8 % | 2,3 % | 3,1 % | 6,5 % |
| 5000 | 1,1 % | 2,5 % | 2,3 % | 5,9 % |
| 20000 | 0,1 % | 0,8 % | 2,4 % | 4,3 % |
- Los límites de **28 d y de 112 d** son estables: ≤ 2,5 % de la banda con B = 5000 y ≤ 0,7 % con B = 20000.
- El de **7 d** es el inestable (Zip 5,9 % y 4,3 %; Queens 2,3 % y 2,4 %): con ≈ 6 datos por ventana la cola es pesada y converge despacio. Cualquier flecha a 7 d hereda esa imprecisión.
- **B = 5000 por petición no cabe en un Worker** (del orden de un segundo de CPU entre los juegos). De ahí §3.

**1.7 Falsos avisos por trayectoria completa.** 400 trayectorias nulas de 52 evaluaciones semanales (media de 4 fases de la semana), límites de B = 20000 al 2,5 % por cola:
- Por evaluación coinciden con lo nominal: «mejora» 1,6–2,6 %; «deterioro» 4,4–6,1 % (tiene dos caminos, tendencia y caída reciente, así que ≈ el doble); flechas a 28 d 2,0–2,6 % por lado; flechas a 7 d 0,7–3,7 %.
- **Pero con una evaluación cada semana, el coste anual es alto:** P(al menos un falso aviso en 52 semanas) = **80–83 %** y **1,8–2,1 episodios de falso aviso por juego y año** (un episodio = semanas seguidas con aviso).
- Es el efecto de mirar 52 veces; las evaluaciones se solapan, así que no son 52 pruebas independientes.

## 2. Decisiones

### 2.1 Etiquetas
Una por juego, prioridad **Datos insuficientes > Deterioro > Mejora sostenida > Estable**:
- **Datos insuficientes:** falta algún requisito del §2.2.
- **Deterioro:** (a) *reciente*: la mediana de los últimos 28 d frente a los 56 d anteriores cae por debajo del límite inferior de ese juego; o (b) *sostenido*: ρ de la tendencia a 112 d por debajo de su límite inferior.
- **Mejora sostenida:** ρ a 112 d por encima de su límite superior (con pendiente de Theil-Sen > 0). No hay «mejora reciente»: un mes de subida no se distingue del ruido.
- **Estable (sin cambio detectable):** hay datos suficientes y ninguna señal supera su límite. Se muestra con el ruido típico del juego («±30 % a 28 d»): no detectar cambio no es probar que no lo haya. La potencia es asimétrica y se dice (una caída reciente solo se detecta si supera el 20–29 %).

### 2.2 Umbrales
**Derivados de los datos:** límites por cola, juego y estadístico (§1.2); horizonte de 112 d (§1.5); bloques de 7 d (lag 7 de 0,38–0,43); remuestreo suficiente para estabilizar los límites de 28 d y 112 d (§1.6).
**Convención (no sale de los datos):** nivel por cola (ver §2.5); cobertura mínima del 60 % de los días de cada ventana (≥ 5 de 7, ≥ 17 de 28, ≥ 34 de 56, ≥ 68 de 112; la calibración usó esa regla y solo vale con ella); historia mínima de 112 días naturales (≥ 16 bloques) para calibrar.

### 2.3 Regresión
**Sustituir** `regression` por la etiqueta «deterioro»: el aviso actual tiene un 46–63 % de falsos positivos (§1.3) y no puede convivir con una señal calibrada que lo contradiga. El campo se mantiene en el JSON como obsoleto (igual a `label === "deterioro"`); la interfaz deja de usarlo.

### 2.4 Flechas
Solo a **7 y 28 días**, con la comparación P0 de esa ventana frente a la anterior equivalente (`windows[W].delta.effRel`) y los límites por cola de §1.2:
- **↑ / ↓** si el cambio supera el límite superior / inferior de ese juego y ventana, y ambas ventanas cubren ≥ 60 % de sus días.
- **→ (dentro del ruido)** si hay datos suficientes y no lo supera; se muestra con sus límites.
- **—** sin comparación posible (periodo anterior incompleto) o sin cobertura.
- **90 días y «Todo»: sin flecha.** Se muestra el cambio numérico del P0 (y «Todo» no compara nada: no tiene periodo anterior). Se añadirá interpretación cuando haya una comparación calibrada y definida.
- A 7 d la banda es muy ancha (−35 a +92 %) e imprecisa (§1.6): en 9 semanas × 4 juegos la flecha a 7 d disparó 1 vez y la de 28 d, 1 vez. Casi nunca habrá flecha; es lo honesto.

### 2.5 Nivel y filtro (decisión que los datos hacen necesaria)
Coste anual de falsos avisos (400 trayectorias nulas) y detección sobre los datos reales (evaluaciones de 9 semanas con «mejora»; con filtro: las semanas en que la etiqueta se repite):
| Opción | Falsos episodios / juego y año | Años con ≥ 1 falso aviso | Mini Sudoku | Queens | Zip |
|---|---|---|---|---|---|
| A. 2,5 % por cola, sin filtro | 1,8–2,1 | 80–83 % | 7 | 4 | 4 |
| B. 2,5 % por cola + etiqueta repetida 2 semanas | 0,8–0,9 | 49–55 % | 6 | 3 | 3 |
| C. 0,5 % por cola, sin filtro | 0,47–0,51 | 32–35 % | 5 | 3 | 1 |
| D. 0,5 % por cola + 2 semanas | 0,14–0,20 | 12–16 % | 4 | 2 | 0 |
Patches: 0 en todas. **Recomiendo B**: conserva el 95 % ya aprobado y la potencia (pierde solo la primera semana de cada episodio), y reduce los falsos episodios a menos de uno por juego y año. A cambio, la etiqueta aparece una semana después. Es una decisión del propietario: A es la más transparente y la más ruidosa; C evita el filtro a costa de detectar mucho menos.

## 3. Arquitectura y regla completa
- **Dos capas, ninguna altera a la otra.** *P1a, medición* (aditiva, en `GameAnalysis`): `trend112 { rho, slopePctPer28d, n, days }` y `recent28vBase56 { delta, nCur, nBase }`. *P1b, interpretación* (`GameInterpretation`, pura y determinista): recibe esas medidas, los `windows[W].delta` del P0 y los límites, y devuelve etiqueta y flechas. No modifica ninguna métrica del P0.
- **Los límites son un artefacto versionado, no un cálculo por petición.** Se generan fuera de línea con el script (B = 20000, semilla fija) y se guardan en el repositorio (`noiseBands`, con `calibratedThrough`, número de días y de observaciones). Razones: B = 5000 por petición no cabe en el Worker (§1.6) y los límites de 28 d y 112 d solo son estables con B alto; el resultado queda determinista y revisable en un PR. Coste: recalibrar a mano (una vez por trimestre y cuando Tango y Wend lleguen a 112 días, ≈ finales de diciembre); sin límites, el juego es «datos insuficientes».
- **Regla:** (1) sin límites o sin cobertura (≥ 68 de 112 d, ≥ 17 de 28 d y ≥ 34 de 56 d con `avg`) → datos insuficientes; (2) ρ de Spearman y pendiente de Theil-Sen (log-eficiencia, % por 28 d) de los últimos 112 d, y Δ de medianas 28 d frente a 56 d previos; (3) etiqueta por §2.1; (4) si se elige la opción B, la etiqueta se publica cuando se repite dos semanas seguidas.

## 4. Contrato (aditivo, sin migraciones)
Por juego, `trend112` y `recent28vBase56` (P1a) e `interpretation { label: "mejora_sostenida"|"estable"|"deterioro"|"datos_insuficientes", reason, bands { "7", "28", "28v56", "rho112" } o null }` (P1b). `windows["7"|"28"].delta.effRel` gana `arrow: "up"|"down"|"flat"|null`; en 90 y `all`, `arrow` no existe. `regression` se mantiene (obsoleto). Sin tocar L10 ni el modelo de datos.

## 5. Pruebas previstas (`shouldXWhenY`)
Determinismo; que la interpretación no cambie ninguna métrica del P0; etiqueta por señal (tendencia, caída reciente), prioridad y «datos insuficientes» (historia < 112 d, cobertura < 60 %, sin límites); flechas solo sobre el límite de su cola, → dentro y — sin comparación; sin flecha a 90 d ni en «Todo»; `regression` ≡ «deterioro»; contrato aditivo. **Calibración en CI:** una trayectoria sintética estacionaria con los límites del artefacto da una tasa de avisos dentro de una tolerancia fija, y una tendencia inyectada de +30 % se detecta. Verificación de las cifras de §1 con los scripts sobre los 170 días.

## 6. Límites y riesgos
- **Calibrado en la misma muestra** (sin conjunto de validación). Remuestrear semanas deshace la tendencia, pero la varianza entre semanas incluye parte de ella: los límites son, si acaso, algo conservadores.
- Solo se modela dependencia a 7 días; no hay modelo de cambios de método ni de la dificultad del puzle.
- Los límites de 7 d son imprecisos aun con B = 20000 (§1.6).
- Las evaluaciones semanales se solapan: las tasas por trayectoria son simulaciones, no garantías.
- Tango y Wend sin historia para validar nada; Patches sin señal en ningún horizonte.
- Un artefacto versionado envejece si no se recalibra.

## 7. Fuera de este diseño
Anotaciones de método y bloqueos (cambian L10), indicador global agregado, análisis por día de la semana, recomendaciones de qué observar después, interpretación a 90 d y «Todo».

## 8. Decisiones que necesito
1. **Nivel y filtro (§2.5):** A, B (recomendada), C o D.
2. **Límites como artefacto versionado y fuera de línea (§3)** frente a calcularlos en cada petición (descartado por CPU) o con un cálculo diario cacheado (requeriría persistencia y migración).
3. **Flechas a 7 d:** mantenerlas (aprobadas, pero casi nunca dispararán y su límite es impreciso) o dejar solo las de 28 d.
4. **Cadencia de recalibración:** trimestral y al llegar Tango y Wend a 112 días, o antes si lo pides.
