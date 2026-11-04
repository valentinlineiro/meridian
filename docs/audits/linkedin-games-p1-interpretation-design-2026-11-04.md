# Diseño P1: interpretación de la evolución en LinkedIn Games (2026-11-04)

Estado: borrador para revisión. **Sin código.** Parte del P0 (medición, `294008d`). Los umbrales **salen de la distribución histórica real** (170 días, 2026-05-17..2026-11-03; Tango y Wend, 58 días); lo que es convención está marcado como tal. Scripts reproducibles en `linkedin-games-p1-calibration/`.

## 1. Qué dicen los datos (y por qué cambia el diseño)

**1.1 El ruido es grande y distinto en cada juego.**
| Juego | n | cv de la eficiencia | autocorr. lag 7 | finde / entre semana | tendencia 4 meses (Spearman, p) |
|---|---|---|---|---|---|
| Mini Sudoku | 170 | 0,29 | 0,38 | ×1,32 | +0,47 (1e-10) |
| Patches | 170 | 0,59 | 0,03 | ×1,19 | +0,09 (0,24) |
| Queens | 170 | 0,44 | 0,43 | ×1,60 | +0,19 (0,013) |
| Zip | 170 | 0,65 | -0,01 | ×1,33 | +0,21 (0,006) |
| Tango | 57 | 0,34 | -0,03 | ×1,30 | +0,06 (0,65) |
| Wend | 57 | 0,33 | 0,11 | ×0,84 | +0,23 (0,087) |
Un umbral único no puede valer para todos. El ciclo semanal (Queens y Mini Sudoku) obliga a ventanas múltiplo de 7 y a remuestrear por **semanas completas**.

**1.2 Ruido entre dos ventanas sin cambio real.** Método: remuestreo de semanas completas del propio juego (destruye cualquier tendencia, conserva el ciclo semanal y la dependencia corta). `|Δ relativo de la mediana|`, percentil 95:
| Juego | 7 d (n≈6) | 14 d | 28 d (n≈27) | 56 d (n≈53) |
|---|---|---|---|---|
| Mini Sudoku | 47 % | 35 % | 26 % | 19 % |
| Patches | 78 % | 59 % | 42 % | 31 % |
| Queens | 48 % | 40 % | 33 % | 27 % |
| Zip | 69 % | 43 % | 30 % | 21 % |
| Tango | 44 % | 31 % | n/d | n/d |
| Wend | 63 % | 45 % | n/d | n/d |
El ruido baja como 1/√n. 90 d: n/d (hacen falta ≥ 187 días; hay 171). Tango/Wend a 28 d tienen un solo punto de evaluación: no fiable.

**1.3 La regla actual (aviso `regression`: caída ≥ 10 %, ≥ 10 datos, 28 d frente a 28 d) es sobre todo ruido.** Bajo «sin cambio» marcaría el **36–64 %** de las evaluaciones (Mini Sudoku 46, Patches 64, Queens 54, Tango 36, Wend 40, Zip 50). Sobre los datos reales marcó 7–9 de 17 semanas por juego. Hoy, Queens (−10,2 %) y Tango (−16 %) están **dentro del ruido** (banda de 28 d: Queens ±33 %). El test de Mann-Whitney tampoco vale como sustituto: no es independiente (autocorrelación) y da hasta un 18 % de falsos positivos en Mini Sudoku.

**1.4 Dos ventanas de 28 días no pueden ver el progreso real.** Primeros 56 d frente a últimos 56 d: Mini Sudoku +36 %, Queens +31 %, Zip +31 %, Patches +17 % (≈ +7 %/mes), frente a una banda de ruido de 26–42 % a 28 d. El progreso se ve con un **estadístico de tendencia sobre un horizonte largo**.

**1.5 Horizonte de la tendencia.** Spearman (eficiencia~tiempo) con banda nula = percentil 95 de |ρ| bajo remuestreo. Evaluaciones semanales marcadas como mejora (ninguna como deterioro en ningún horizonte):
| Juego | 56 d | 84 d | 112 d |
|---|---|---|---|
| Mini Sudoku | 0/17 | 6/13 | 7/9 |
| Queens | 4/17 | 4/13 | 7/9 |
| Zip | 1/17 | 3/13 | 4/9 |
| Patches | 0/17 | 0/13 | 1/9 |
La potencia sube con el horizonte; 112 d es el más corto probado con ≥ 44 % de detección en los tres juegos con progreso real. Bandas de |ρ| a 112 d: Mini Sudoku 0,27, Patches 0,20, Queens 0,16, Zip 0,19.

**1.6 La regla completa (§3) bajo «sin cambio»:** 2–3 % de falsos avisos por dirección (≈ 5 % en total) en los cuatro juegos con historia suficiente; sobre los datos reales: Mini Sudoku y Queens «mejora sostenida» en 7 de 9 evaluaciones, Zip en 4 de 9, Patches nunca, y **hoy los cuatro «estable»** (la mejora se frenó en el último trimestre). Tango y Wend: «datos insuficientes» (58 d < 112).

## 2. Decisiones (las cuatro que pediste)

### 2.1 Etiquetas
Una etiqueta por juego, con prioridad **Datos insuficientes > Deterioro > Mejora sostenida > Estable**:
- **Datos insuficientes:** falta alguno de los requisitos del §2.2.
- **Deterioro:** (a) *reciente*: mediana de eficiencia de los últimos 28 d frente a la de los 56 d anteriores cae más que la banda de ese juego; o (b) *sostenido*: ρ de la tendencia a 112 d < −banda ρ. El detalle («reciente» o «sostenido») va en la evidencia.
- **Mejora sostenida:** ρ a 112 d > +banda ρ (y la pendiente de Theil-Sen > 0). No existe «mejora reciente»: con estos n, una subida de un mes no se distingue del ruido.
- **Estable:** hay datos suficientes y ninguna señal supera su banda. **Se rotula «Estable (sin cambio detectable)» con el ruido típico del juego** («±33 % a 28 d»): ausencia de señal no es evidencia de estabilidad.
La potencia es asimétrica y se dice: una caída reciente solo se detecta si supera 22–35 % según el juego.

### 2.2 Umbrales (derivación)
**Derivados de los datos:** bandas de ruido por juego y ventana (§1.2); banda de |ρ| a 112 d por juego (§1.5); banda del contraste «28 d frente a 56 d previos» (percentil 95 bajo remuestreo): Mini Sudoku 22,1 %, Patches 35,3 %, Queens 30,4 %, Zip 26,1 %; horizonte 112 d (§1.5); remuestreo por bloques de 7 días (autocorr. lag 7 de 0,38–0,43).
**Convención (a aprobar, no salen de los datos):** nivel del 95 % (2,5 % por cola); cobertura mínima del 60 % de los días de cada ventana (≥ 17 de 28, ≥ 34 de 56, ≥ 68 de 112: la calibración se hizo con esa misma regla y solo vale con ella); historia mínima de 112 días (≥ 16 bloques semanales) para calibrar; B = 300 remuestreos, semilla fija derivada del juego (resultado reproducible).
Las bandas se **recalculan con todo el historial del juego hasta hoy**, así que se afinan solas; Tango y Wend tendrán etiqueta a partir de 112 días (≈ 2026-12-28).

### 2.3 Regresión
**Sustituir, no conservar.** El aviso actual tiene un 36–64 % de falsos positivos (§1.3) y convive mal con una etiqueta calibrada: dos señales que se contradicen. Propuesta: `regression` pasa a ser `interpretation.label === "deterioro"` (el campo se conserva en el JSON por compatibilidad, marcado obsoleto, y la interfaz deja de usarlo); se retira en una limpieza posterior. Antes de sustituirlo, se enseña en el PR cuántos avisos habría dado cada regla sobre el histórico.

### 2.4 Flechas
Se calculan por ventana (7, 28, 90, todo) con la misma lógica de bandas:
- **↑ / ↓** solo si |Δ| supera la banda de ese juego y ventana (§1.2) y hay cobertura suficiente.
- **→ (dentro del ruido)** si hay datos suficientes y |Δ| no la supera. Se muestra con la banda: «→ ±33 %».
- **—** si el periodo anterior no es comparable (regla de cobertura del P0) o faltan datos; sin flecha, con el motivo.
Consecuencia honesta: a 7 d la banda es del 44–78 %, así que casi nunca habrá flecha; es el comportamiento correcto.
La columna Δ sigue mostrando el número (medición) y la flecha es la interpretación.

## 3. Regla completa
Para cada juego, con `today` del cliente:
1. Cobertura: si ≥ 60 % de los 112 d, 28 d y 56 d previos tienen observaciones con `avg` y hay ≥ 112 d de historia → continuar; si no, **datos insuficientes**.
2. Calibrar (una vez por petición, determinista): remuestrear semanas completas del historial del juego (B, semilla fija), obtener el percentil 95 de |ρ| a 112 d y de |Δ| del contraste 28 d frente a 56 d.
3. Señales: ρ de Spearman y pendiente de Theil-Sen (log-eficiencia, en %/28 d) de los últimos 112 d; Δ relativo de medianas (28 d frente a 56 d previos).
4. Etiqueta según §2.1.

## 4. Contrato (aditivo, sin migraciones)
Por juego: `interpretation { label: "mejora_sostenida"|"estable"|"deterioro"|"datos_insuficientes", reason: null|"reciente"|"sostenido"|<motivo de insuficiencia>, trend { rho, band, slopePctPer28d, days, n }, recent { delta, band, nCur, nBase }, noiseBand { "7","28","90" } }` y, en cada `windows[W].delta`, `effRel.arrow: "up"|"down"|"flat"|null` con `effRel.band`. `regression` se mantiene (obsoleto). Dominio puro (`GameInterpretation.ts`, PRNG con semilla), sin tocar L10 ni el modelo de datos.

## 5. Pruebas previstas (`shouldXWhenY`)
Determinismo (mismo historial, misma etiqueta); calibración (serie estacionaria sintética: ≈ 5 % de avisos totales ± tolerancia fija); potencia (tendencia +30 % inyectada se detecta a 112 d); datos insuficientes por historia (< 112 d), por cobertura (< 60 %) y por periodo previo; prioridad deterioro > mejora; flecha solo sobre la banda, → dentro de ella, — sin cobertura; `regression` equivale a «deterioro»; el contrato añade campos sin cambiar los existentes. Verificación contra los scripts de `linkedin-games-p1-calibration/` sobre los 170 días (las cifras de §1.6).

## 6. Límites y riesgos (honestos)
- **Calibrado en la misma muestra** que se evalúa; con 170 días no hay conjunto de validación aparte. Remuestrear semanas deshace la tendencia, pero la varianza entre semanas incluye parte de ella: las bandas son, si acaso, algo conservadoras.
- **Evaluación continua:** con ≈ 5 % de falso aviso por evaluación y una evaluación semanal, esperar 2–3 falsos avisos por juego y año. Se puede exigir la misma etiqueta en 2 semanas seguidas; no se ha medido el efecto: decisión abierta.
- Solo se modela dependencia a 7 días; sin modelo de cambios de método o de dificultad del puzle; Tango/Wend sin historia para validar nada todavía.
- **Coste:** B × 6 juegos por petición (orden de millones de operaciones). Hay que medirlo en el Worker antes de fusionar (criterio de aceptación: CPU por petición dentro del presupuesto); alternativa si no cabe: calcular las bandas una vez al día y cachearlas, lo que requeriría persistencia (decisión aparte).

## 7. Fuera de este diseño
Anotaciones de método y bloqueos (cambian L10), indicador global agregado, análisis por día de la semana, recomendaciones de qué observar después.

## 8. Decisiones que necesito
1. ¿Aprobar las convenciones del §2.2 (95 %, cobertura 60 %, 112 d, bloques de 7 d)?
2. ¿Sustituir `regression` (recomendado) o conservarlo como señal aparte?
3. ¿Rotular «Estable (sin cambio detectable)» o mantener solo «Estable»?
4. ¿Exigir la misma etiqueta dos semanas seguidas (menos avisos falsos, más retraso)?
