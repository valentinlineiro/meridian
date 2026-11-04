# Diseño P1: interpretación de la evolución en LinkedIn Games (2026-11-04, rev. 4)

Estado: **implementado en #94** (`f77fc30`, fusionado y desplegado el 2026-11-04) conforme a este documento (rev. 4); validado en producción con sesión autenticada. Parte del P0 (medición, `294008d`). Los umbrales salen de la distribución histórica real; lo que es convención está marcado. Scripts y artefacto en `linkedin-games-p1-calibration/`. **Pendiente:** recalibración de Tango y Wend cuando alcancen 112 días naturales (≈ 2026-12-28), en un PR independiente que reemplace `noise-bands.json` solo con la nueva calibración reproducible (`p1_artifact.py`).

## 0. Cambios respecto a la rev. 3 (revisión de #93)
- **La simulación y los datos reales evalúan ya exactamente la regla del diseño.** `label_arrays()` no aplicaba la condición de la pendiente de Theil-Sen. Ahora una tendencia sostenida exige **ρ de Spearman fuera de su límite y pendiente de Theil-Sen del mismo signo**, y la condición es **simétrica**: «deterioro sostenido» también exige pendiente negativa (en la rev. 3 solo la pedía la mejora; era una asimetría sin justificación, y se aclara aquí).
- **Resultado: ninguna cifra cambia** (trayectorias nulas al 2,5 % y al 0,5 %, datos reales y horizontes, idénticos a todos los dígitos). Comprobado: de **61.083** casos nulos con ρ fuera de sus límites (4 juegos, 6000 trayectorias de 52 semanas), **0** tenían pendiente de signo contrario o nula, y tampoco en ningún día de los datos reales. La condición es inerte con estos datos, pero queda en la regla y en las pruebas porque ρ y la pendiente miden cosas distintas y podrían discrepar con otros datos.

## 0.bis Cambios respecto a la rev. 2
1. **Decisiones del propietario incorporadas (§2.5, §8):** opción B (2,5 % por cola + etiqueta repetida dos semanas), límites como artefacto versionado fuera de línea, **flechas solo a 28 días**, recalibración trimestral y extraordinaria cuando Tango y Wend lleguen a 112 días.
2. **La simulación de falsos avisos genera exactamente 52 evaluaciones por trayectoria** (antes 53–54 según el desfase por `Lt = H + 7*52 + 7`; ahora `Lt = H + 7*52 − 1 = 475`) y se promedia sobre **los siete desfases** posibles, no cuatro elegidos.
3. **Una única regla de generación de límites:** agrupación de 5 semillas × 20000 remuestreos (§3). La simulación, los datos reales y la tabla §1.2 leen `noise-bands.json`; ya no se mezclan semillas distintas. `p1_artifact.py --check` verifica que el fichero se reproduce exactamente.
4. Cifras que cambian por lo anterior: Queens, «mejora» en 5 de 9 evaluaciones (rev. 2: 4; rev. 1: 7); falsos episodios con la opción B, 0,76–0,96 por juego y año (rev. 2: 0,79–0,89).

## 1. Qué dicen los datos

**1.0 Datos.** Del 2026-05-17 al 2026-11-03: **171 días naturales y 170 observaciones** por juego (falta 2026-09-16) en Mini Sudoku, Patches, Queens y Zip; **58 días naturales y 57 observaciones** en Tango y Wend (desde 2026-09-07). Eficiencia = `avg/score` por observación. La entrada se reconstruye con `p1_export_days.py`.

**1.1 El ruido es grande y distinto en cada juego.**
| Juego | cv de la eficiencia | autocorr. lag 7 | finde / entre semana | Spearman eficiencia~tiempo (p) |
|---|---|---|---|---|
| Mini Sudoku | 0,29 | 0,38 | ×1,32 | +0,47 (1e-10) |
| Patches | 0,59 | 0,03 | ×1,19 | +0,09 (0,24) |
| Queens | 0,44 | 0,43 | ×1,60 | +0,19 (0,013) |
| Zip | 0,65 | -0,01 | ×1,33 | +0,21 (0,006) |
| Tango (57 obs.) | 0,34 | -0,03 | ×1,30 | +0,06 (0,65) |
| Wend (57 obs.) | 0,33 | 0,11 | ×0,84 | +0,23 (0,087) |
Un umbral único no vale. El ciclo semanal obliga a ventanas múltiplo de 7 y a remuestrear semanas completas.

**1.2 Límites por cola** (cambio relativo de la mediana de eficiencia, o ρ, bajo «sin cambio real»; puntos 2,5 % y 97,5 %; **exactamente los de `noise-bands.json`**, salvo la columna de 7 d, exploratoria):
| Juego | 28 d frente a 28 d | 28 d frente a 56 d previos | ρ de Spearman a 112 d | 7 d frente a 7 d (exploratorio, descartado) |
|---|---|---|---|---|
| Mini Sudoku | −22,6 % / +29,4 % | −20,4 % / +24,9 % | −0,275 / +0,280 | −35 % / +54 % |
| Patches | −33,2 % / +49,8 % | −29,3 % / +43,7 % | −0,198 / +0,204 | −48 % / +92 % |
| Queens | −27,8 % / +38,3 % | −24,2 % / +35,0 % | −0,151 / +0,165 | −36 % / +56 % |
| Zip | −25,5 % / +34,3 % | −22,6 % / +29,7 % | −0,189 / +0,183 | −47 % / +88 % |
- **La asimetría es real:** el límite superior de un cambio relativo es 1,2–2 veces el inferior (`Δ ≥ −100 %`, sin techo). ρ es casi simétrica.
- Tango y Wend (58 d < 112 d) **no tienen calibración**.
- El ruido baja como 1/√n (exploratorio): 14 d [−28 %, +40 %] Mini Sudoku, [−42 %, +72 %] Patches, [−31 %, +46 %] Queens, [−35 %, +53 %] Zip; 56 d [−17 %, +21 %], [−26 %, +34 %], [−23 %, +30 %], [−19 %, +24 %].

**1.3 La regla actual (aviso `regression`: caída ≥ 10 %, 28 d frente a 28 d) es sobre todo ruido.** Bajo «sin cambio real» marcaría el **46 %** (Mini Sudoku), **63 %** (Patches), **53 %** (Queens) y **52 %** (Zip) de las evaluaciones. Hoy Queens (−7 % a 28 d frente a 28 d anterior; −10,2 % con la ventana de ayer) está dentro de su banda. Mann-Whitney tampoco sirve: p < 0,05 da 17 %, 7,6 %, 1,6 % y 4,7 % de falsos positivos (la dependencia entre datos lo desajusta).

**1.4 Dos ventanas de 28 días no ven el progreso real.** Primeros 56 d frente a últimos 56 d: Mini Sudoku +36 %, Queens +31 %, Zip +31 %, Patches +17 %, frente a límites superiores de +29 a +50 % a 28 d. El progreso se ve con una **tendencia a horizonte largo**.

**1.5 Horizonte de la tendencia** (evaluaciones semanales marcadas como mejora con la regla completa, ρ y pendiente de Theil-Sen, contadas hacia atrás desde hoy; límites agrupados de 5 semillas × 10000):
| Juego | 56 d | 84 d | 112 d |
|---|---|---|---|
| Mini Sudoku | 0 de 17 | 5 de 13 | **7 de 9** |
| Queens | ↑3 ↓1 de 17 | 4 de 13 | **5 de 9** |
| Zip | 3 de 17 | 2 de 13 | **4 de 9** |
| Patches | 0 | 0 | 0 |
112 d es el horizonte con más detección en los tres juegos con progreso (78 %, 56 %, 44 %); es el más largo probado (no se probaron 140 o 168). Las evaluaciones se solapan: no son independientes.

**1.6 Estabilidad del remuestreo** (desviación típica entre 5 semillas del límite más inestable, en % de la anchura de su banda):
| B | Mini Sudoku | Patches | Queens | Zip |
|---|---|---|---|---|
| **Límites del artefacto (28 d y 112 d)** | | | | |
| 300 | 4,9 % | 3,9 % | 3,6 % | 4,4 % |
| 1000 | 2,4 % | 2,3 % | 2,4 % | 4,1 % |
| 5000 | 1,0 % | 2,5 % | 1,0 % | 1,0 % |
| 20000 | 0,5 % | 0,6 % | 0,6 % | 0,7 % |
| **Límite de 7 d (exploratorio, descartado)** | | | | |
| 5000 | 1,1 % | 1,0 % | 2,3 % | 5,9 % |
| 20000 | 0,1 % | 0,8 % | 2,4 % | 4,3 % |
Los límites de 28 d y 112 d son estables con B alto (≤ 0,7 % con 20000 por semilla; el artefacto agrupa cinco, así que es más preciso aún). El de 7 d no converge ni con 20000 en Zip y Queens: con ≈ 6 datos por ventana la cola es pesada. **B = 5000 por petición no cabe en un Worker** (del orden de un segundo de CPU entre los juegos): de ahí el artefacto (§3).

**1.7 Falsos avisos por trayectoria completa.** 500 trayectorias nulas de **52 evaluaciones semanales**, promedio de los **7 desfases**, límites de `noise-bands.json` (2,5 % por cola). Por evaluación coinciden con lo nominal: «mejora» 2,0–2,6 %; «deterioro» 4,2–5,7 % (tiene dos caminos, tendencia y caída reciente: ≈ el doble); flechas a 28 d 2,0–2,4 % por lado. Pero con una evaluación a la semana el coste anual es otro (§2.5).

## 2. Decisiones

### 2.1 Etiquetas
Una por juego, prioridad **Datos insuficientes > Deterioro > Mejora sostenida > Estable**:
- **Datos insuficientes:** falta algún requisito del §2.2.
- **Deterioro:** (a) *reciente*: la mediana de los últimos 28 d frente a la de los 56 d anteriores cae por debajo del límite inferior de ese juego; o (b) *sostenido*: ρ a 112 d por debajo de su límite inferior **y** pendiente de Theil-Sen < 0.
- **Mejora sostenida:** ρ a 112 d por encima de su límite superior **y** pendiente de Theil-Sen > 0. No hay «mejora reciente»: un mes de subida no se distingue del ruido.
- **Estable (sin cambio detectable):** hay datos suficientes y ninguna señal supera su límite. Se muestra con el ruido típico del juego («±30 % a 28 d»): no detectar cambio no prueba que no lo haya. La potencia es asimétrica y se dice (una caída reciente solo se detecta si supera el 20–29 %).

### 2.2 Umbrales
**Derivados de los datos:** límites por cola, juego y estadístico (§1.2); horizonte de 112 d (§1.5); bloques de 7 d (lag 7 de 0,38–0,43); remuestreo suficiente para estabilizar los límites (§1.6).
**Convención (no sale de los datos):** nivel del 2,5 % por cola; cobertura mínima del 60 % de los días de cada ventana (≥ 17 de 28, ≥ 34 de 56, ≥ 68 de 112; la calibración usó esa regla y solo vale con ella); historia mínima de 112 días naturales (≥ 16 bloques) para calibrar. Son convenciones iniciales, no verdades estadísticas universales.

### 2.3 Regresión
**Se sustituye** `regression` por la etiqueta «deterioro»: el aviso actual tiene un 46–63 % de falsos positivos (§1.3). El campo se mantiene en el JSON como obsoleto (igual a `label === "deterioro"`); la interfaz deja de usarlo.

### 2.4 Flechas
**Solo a 28 días.** Se usa la comparación del P0 (`windows["28"].delta.effRel`) y los límites por cola de «28 d frente a 28 d» (§1.2):
- **↑ / ↓** si el cambio supera el límite superior / inferior de ese juego y ambas ventanas tienen ≥ 17 observaciones con `avg`.
- **→ (dentro del ruido)** si hay datos suficientes y no lo supera, con sus límites.
- **—** sin comparación posible (periodo anterior incompleto), sin cobertura o sin calibración del juego.
- **Sin flecha a 7 d, 90 d ni en «Todo».** Se muestra el cambio numérico del P0, sin dirección. Las flechas a 7 d se eliminan: su límite no es preciso ni con 20000 remuestreos (§1.6) y una flecha transmite una certeza visual que esa calibración no sostiene. «Todo» no compara nada (no tiene periodo anterior). 90 d se añadirá cuando haya una comparación calibrada.
- En 9 semanas × 4 juegos la flecha a 28 d disparó 1 vez (Queens): casi nunca habrá flecha; es lo honesto.

### 2.5 Nivel y filtro (decidido: **B**)
Coste anual de falsos avisos (500 trayectorias nulas de 52 semanas, 7 desfases) y detección sobre los datos reales (evaluaciones de 9 semanas con «mejora»; con filtro, las semanas en que la etiqueta se repite):
| Opción | Falsos episodios / juego y año | Años con ≥ 1 falso aviso | Mini Sudoku | Queens | Zip |
|---|---|---|---|---|---|
| A. 2,5 % por cola, sin filtro | 1,77–2,12 | 80–84 % | 7 | 5 | 4 |
| **B. 2,5 % por cola + etiqueta repetida 2 semanas** | **0,76–0,96** | **49–58 %** | **6** | **4** | **3** |
| C. 0,5 % por cola, sin filtro | 0,45–0,60 | 32–39 % | 5 | 3 | 1 |
| D. 0,5 % por cola + 2 semanas | 0,14–0,22 | 12–18 % | 4 | 2 | 0 |
Patches: 0 en todas. **Se elige B** (decisión del propietario): conserva el 95 % y casi toda la potencia, y reduce los falsos episodios a menos de uno por juego y año; a cambio, la etiqueta aparece una semana después. Si aparecen falsos avisos molestos en producción, la tabla permite pasar a C o D sin rediseñar. Rango por desfase de la opción B (episodios/año): 0,75–1,17.

## 3. Arquitectura, artefacto y regla completa
- **Dos capas, ninguna altera a la otra.** *P1a, medición* (aditiva, en `GameAnalysis`): `trend112` y `recent28vBase56`. *P1b, interpretación* (`GameInterpretation`, pura y determinista): recibe esas medidas, `windows["28"].delta` del P0 y los límites, y devuelve etiqueta y flecha. No modifica ninguna métrica del P0.
- **Límites = artefacto versionado `noise-bands.json`**, generado fuera del Worker y revisable en un PR. **Regla única de generación:** puntos 2,5 % y 97,5 % de la agrupación de 5 semillas (11, 22, 33, 44, 55) × 20000 remuestreos por juego y estadístico, evaluados al final del último bloque completo de cada historial remuestreado, redondeados a 4 decimales; trae `calibratedThrough`, días naturales y observaciones por juego. El fichero contiene **exactamente** los límites que usan la simulación, las pruebas y producción; `p1_artifact.py --check` regenera y falla si difiere. La implementación copia el fichero tal cual al dominio (`src/slices/linkedin-games/domain/`), sin recalcular nada en el Worker.
- **Recalibración:** trimestral y extraordinaria cuando Tango y Wend alcancen 112 días naturales (≈ finales de diciembre de 2026). Sin límites, un juego es «datos insuficientes»; no hay persistencia ni cálculo diario.
- **Regla (en cada petición, con `today` del cliente):**
  1. Candidata en `t`: sin calibración o sin cobertura (≥ 68 de 112 d, ≥ 17 de 28 d y ≥ 34 de 56 d con `avg`) → *datos insuficientes*; si no, ρ de Spearman y pendiente de Theil-Sen de los últimos 112 d (una tendencia exige ambas, con el mismo signo), y Δ de medianas de 28 d frente a 56 d previos, contra los límites → *deterioro* / *mejora sostenida* / *estable* (§2.1).
  2. Se calcula igual la candidata en `t − 7 días` (misma data, hasta esa fecha). Es una segunda evaluación pura, sin persistir nada.
  3. **Etiqueta publicada (opción B):** *datos insuficientes* tal cual; *mejora sostenida* o *deterioro* solo si la candidata de `t` **y** la de `t − 7` coinciden; en otro caso, *estable*, con `pending` indicando la candidata sin confirmar. Si `t − 7` no tiene datos suficientes, no hay confirmación.

## 4. Contrato definitivo (aditivo, sin migraciones, sin tocar L10 ni el modelo de datos)
Por juego:
```json
"trend112": { "rho": 0.13, "slopePctPer28d": 3.3, "n": 110, "days": 112 },
"recent28vBase56": { "delta": 0.029, "nCur": 27, "nBase": 54 },
"interpretation": {
  "label": "mejora_sostenida" | "estable" | "deterioro" | "datos_insuficientes",
  "reason": null | "reciente" | "sostenido" | "<motivo de insuficiencia>",
  "candidate": "...", "previousCandidate": "...", "pending": null | "mejora_sostenida" | "deterioro",
  "bands": { "28": [-0.2259, 0.294], "28v56": [-0.2041, 0.2489], "rho112": [-0.2747, 0.28] } | null,
  "calibratedThrough": "2026-11-03" }
```
`windows["28"].delta.effRel` gana `arrow: "up"|"down"|"flat"|null` y `band: [lo, hi] | null`. En `windows["7"|"90"|"all"]` **no hay `arrow` ni `band`**. `regression` se mantiene (obsoleto) como `label === "deterioro"`. `trend112` y `recent28vBase56` son `null` sin cobertura. Los campos del P0 no cambian.

## 5. Pruebas previstas (`shouldXWhenY`)
Determinismo; la interpretación no modifica ninguna métrica del P0; etiqueta por señal (tendencia con ρ **y** pendiente de Theil-Sen del mismo signo, en ambos sentidos; ρ fuera de límites con pendiente contraria o nula no cuenta; caída reciente), prioridad y «datos insuficientes» (historia < 112 d, cobertura < 60 %, sin calibración); **filtro B:** publicada solo con la misma candidata en `t` y `t − 7`, `pending` en otro caso, y sin confirmación si `t − 7` carece de datos; flecha solo sobre el límite de su cola, → dentro y — sin comparación; sin flecha en 7 d, 90 d ni «Todo»; `regression` ≡ «deterioro»; el contrato añade campos sin cambiar los existentes. **El dominio usa exactamente `noise-bands.json`** (una prueba compara los límites embebidos con el fichero). **Calibración:** una trayectoria sintética estacionaria con esos límites da una tasa de avisos dentro de una tolerancia fija, y una tendencia inyectada de +30 % se detecta. Las cifras de §1 se contrastan con los scripts sobre los 170 días (los datos no se versionan).

## 6. Límites y riesgos
- **Calibrado en la misma muestra**, sin conjunto de validación. Remuestrear semanas deshace la tendencia, pero la varianza entre semanas incluye parte de ella: los límites son, si acaso, algo conservadores.
- Solo se modela dependencia a 7 días; sin modelo de cambios de método ni de la dificultad del puzle.
- Las tasas por trayectoria son simulaciones (evaluaciones solapadas), no garantías.
- Tango y Wend sin calibración hasta ≈ finales de diciembre; Patches sin señal en ningún horizonte.
- Un artefacto versionado envejece si no se recalibra (trimestral).

## 7. Fuera de este diseño
Anotaciones de método y bloqueos (cambian L10), indicador global agregado, análisis por día de la semana, recomendaciones de qué observar después, interpretación a 90 d y «Todo», flechas a 7 d.

## 8. Decisiones (resueltas)
| Decisión | Resolución |
|---|---|
| Nivel y filtro | **B:** 2,5 % por cola + dos semanas consecutivas con la misma etiqueta |
| Artefacto versionado | **Sí**, generado fuera de línea, regla única (§3) y revisable por PR |
| Flechas a 7 días | **Eliminadas**; solo a 28 días |
| Recalibración | **Trimestral** y extraordinaria cuando Tango y Wend alcancen 112 días |
Siguiente paso tras la aprobación: un PR de implementación separado (P1a medición, P1b interpretación, artefacto, interfaz).
