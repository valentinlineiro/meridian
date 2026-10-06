# Contrato P1.5: incertidumbre de las tasas de victoria (Wilson y Newcombe)

**Fecha:** 2026-10-05
**Estado:** 🔒 **CONGELADO (2026-10-05), sin implementar.** Puntos abiertos O1–O3 resueltos en §9; O4 aparcado. Cualquier cambio posterior entra por enmienda explícita.
**Origen:** auditoría de utilidad analítica. Hallazgo: Meridian muestra diferencias de win rate (forma, color, hallazgos) sin medida de incertidumbre, y los umbrales actuales (15 pp con n≥10 o n≥40) no garantizan que una diferencia se distinga del ruido.
**Decisiones tomadas:** A(b), B fijo, C en dos PRs (§8).

**Principio:** *Insufficient evidence no significa ausencia de diferencia.* Un intervalo que incluye 0 no demuestra que no haya efecto; solo que estos datos no permiten afirmarlo.

---

## 1. Qué se mide

La métrica es el **win rate sobre partidas decididas** (regla común de #1: victorias entre victorias + derrotas + tablas). Es una proporción binaria (victoria / no victoria).

- `n` = partidas **decididas** del grupo. Las desconocidas no cuentan (ya están fuera del denominador).
- **El `scoreRate` NO tiene intervalo en P1.5.** Cuenta las tablas como 0,5, así que no es una proporción binomial y Wilson no le aplica. No se inventa un intervalo para él (ver O1).

---

## 2. Definiciones (dominio: `src/domain/proportion.ts`)

Módulo puro, sin dependencias, junto a `result.ts`. No conoce Chess: es una utilidad de proporciones.

```text
Z_95 = 1.96                      constante con nombre; no es parámetro ni opción de API
```

### 2.1 `wilson(wins, n)`

Intervalo de Wilson (score interval) al 95 %:

```text
p̂      = wins / n
centro = (p̂ + z²/(2n)) / (1 + z²/n)
mitad  = z · sqrt( p̂(1−p̂)/n + z²/(4n²) ) / (1 + z²/n)
lower  = centro − mitad
upper  = centro + mitad
```

Devuelve `{ p, lower, upper }`, todo en fracción 0–1.

| Caso | Comportamiento |
|---|---|
| `n = 0` | **`null`**. Sin partidas decididas no hay estimación (coherente con `winRate = null`). |
| `wins = 0` | `lower = 0` exacto; `upper > 0`. |
| `wins = n` | `upper = 1` exacto; `lower < 1`. |
| `wins < 0`, `wins > n`, `n` no entero o negativo | `RangeError` (violación de invariante del llamante, no dato de entrada). |
| Redondeo | **Ninguno** en dominio ni en API. La UI redondea. |

Valores de referencia que deben cumplirse (tolerancia 1e-3):

| wins / n | lower | upper |
|---|---|---|
| 0 / 10 | 0 | 0,278 |
| 5 / 10 | 0,237 | 0,763 |
| 10 / 10 | 0,722 | 1 |

### 2.2 `newcombeDiff(a, b)`

Intervalo para la **diferencia de dos proporciones independientes** (Newcombe 1998, método 10), construido sobre Wilson:

```text
a = { wins, n }  → p1, l1, u1   (grupo de interés)
b = { wins, n }  → p2, l2, u2   (grupo de referencia)
diff  = p1 − p2
lower = diff − sqrt( (p1 − l1)² + (u2 − p2)² )
upper = diff + sqrt( (u1 − p1)² + (p2 − l2)² )
```

Devuelve `{ diff, lower, upper }` (fracción 0–1; positivo = `a` mejor que `b`). **Si `a.n = 0` o `b.n = 0` devuelve `null`.**

**Convención de signo (estable en todo Meridian):** `diff = a − b`, con `a` y `b` fijados por superficie:

| Superficie | `a` | `b` |
|---|---|---|
| Forma reciente | ventana (últimas N) | partidas **anteriores** a la ventana (P1.4) |
| Color | blancas | negras |
| What-changed, intervalo frente al vitalicio previo | partidas del intervalo | partidas hasta `since` |

### 2.3 `distinguishable(delta)`

`true` si y solo si `lower > 0` **o** `upper < 0` (desigualdad estricta). `null` → `false`.

---

## 3. Supuestos y limitaciones (parte del contrato)

1. **Independencia entre observaciones.** Wilson y Newcombe asumen partidas independientes. Las partidas de un mismo jugador pueden presentar dependencia temporal y conductual (rachas, mezcla de bots y humanos con dificultades distintas). Por tanto **el intervalo debe interpretarse como una estimación mínima de la incertidumbre, no como una garantía estadística de independencia.**
2. **Independencia entre grupos.** Se cumple por construcción en las comparaciones de este contrato porque los grupos son **disjuntos** (ventana vs anteriores, desde P1.4; intervalo vs vitalicio previo; blancas vs negras). Si un grupo futuro se solapa con otro, Newcombe no es válido y debe declararse.
3. **Multiplicidad: limitación conocida, no resuelta aquí.** Con muchas comparaciones a la vez (color, aperturas, fases, oponentes) cabe esperar algún falso positivo a nivel 95 %. P1.5 **no** aplica Bonferroni ni FDR; sería otra decisión estadística.
4. **95 % fijo.** No es configurable, para que dos consumidores no produzcan lecturas distintas de la misma métrica.
5. **Tamaños mínimos.** P1.5 **no oculta** nada por n pequeño: el propio intervalo expresa la incertidumbre. Anchura **total** de referencia del intervalo (tasa 50 %): ≈27 pp con n=50 (±13), ≈19 con n=100 (±10), ≈10 con n=400 (±5).

---

## 4. Regla de hallazgo (decisión A(b))

Un hallazgo basado en una diferencia de proporciones se emite si y solo si se cumplen **las tres**:

```text
1. gate de n existente        (decididas: ≥10 en What-changed, ≥40 por color en Trayectoria)
2. umbral de efecto existente (≥15 pp; Trayectoria: ≥10 pp en cada mitad)
3. distinguishable(delta)     (el IC95 de la diferencia excluye 0)
```

- La regla **solo puede eliminar** hallazgos que hoy se emiten, nunca crear nuevos.
- Relevancia práctica (2) y evidencia estadística (3) son condiciones **independientes**: una diferencia pequeña pero clara no es hallazgo por sí sola.
- **Trayectoria:** la condición 3 se evalúa sobre la diferencia **global** blancas − negras (todas las partidas decididas). Las mitades siguen sujetas solo al umbral de efecto (2), porque con n por mitad la exigencia del IC volvería la regla casi inalcanzable y mezclaría persistencia con significación.
- **El intervalo se sigue mostrando aunque no haya hallazgo.**

Casos de aceptación (deben cumplirse como tests):

| Caso | Diferencia | IC95 | ¿Hallazgo? |
|---|---|---|---|
| What-changed, 5 vs 5 decididas, 80 % vs 40 % | +40 pp | [−16,3 ; +72,6] | **No** (hoy sí) |
| Trayectoria, 40 vs 40 decididas, +25 pp | +25 pp | [+3,8 ; +43,3] | Sí |
| Trayectoria, 40 vs 40 decididas, +15 pp | +15 pp | [−6,4 ; +34,6] | **No** (hoy sí) |
| Demo: forma 20 vs anteriores 40, 65 % vs 62,5 % | +2,5 pp | [−23,0 ; +25,4] | n/a (no es hallazgo) |

---

## 5. Superficies

### 5.1 P1.5a: medición (`winRateCi`)

`summarize()` consume `wilson` y añade `winRateCi: { lower, upper } | null` (misma unidad que su `winRate`: fracción 0–1). Se propaga a todo lo que ya usa `summarize`:

| Ruta | Dónde aparece |
|---|---|
| `/api/stats/summary` | resumen global |
| `/api/stats/results` | resumen global |
| `/api/stats/color` | `groups[]` |
| `/api/stats/opponents` | `segments[]` y `macro[]` |
| `/api/stats/recent` | ventana y `before` |
| `/api/stats/openings` | `white[]` y `black[]` |
| `/api/stats/phases` | `phases[]` |

**UI (P1.5a):** `renderCompare` (color, oponentes, aperturas, fases) y la tarjeta de forma muestran el intervalo junto a la tasa, p. ej. `65,0 % [43–82]` (tasa a 1 decimal, límites sin decimales). Sin `winRateCi` (n=0) se muestra "—".

**Denominador de `renderCompare` (O2):** las barras de victorias/derrotas/tablas pasan a usar partidas **decididas** como denominador (hoy `games`), el mismo que la tasa que se muestra al lado. Las desconocidas se declaran aparte (`unknown`), no se reparten en la barra. **No cambia ningún hallazgo ni ningún umbral.**

**No reciben `winRateCi` en P1.5a:** KPIs globales y hero (no son comparaciones; ver O3), `scoreRate`, los porcentajes de resultado `win/loss/draw` de `/results` (son reparto, no la métrica comparada), y los campos de idiomas.

### 5.2 P1.5b: decisión (`delta`)

`delta: { diff, lower, upper } | null` con la convención de §2.2. **Unidad: la de la tasa hermana de la misma respuesta.**

| Superficie | Campo nuevo | Unidad |
|---|---|---|
| `/api/stats/recent` | `delta` (ventana − anteriores) | fracción 0–1 |
| `/api/stats/color` | `difference` (blancas − negras) | fracción 0–1 |
| `/api/what-changed` → `chess` | `colorDelta` (blancas − negras en el intervalo) y `historicalDelta` (intervalo − vitalicio previo) | **porcentaje 0–100** (como `intervalWinRate`) |
| Hallazgo de Trayectoria | `metrics.diffCi` (diferencia global) | **porcentaje 0–100** (como `diffPp`) |

Las dos unidades coexisten hoy en el código (rutas de estadísticas en fracción, What-changed y Trayectoria en porcentaje); el contrato no las unifica, solo exige la misma unidad que la tasa vecina.

**UI (P1.5b):** ningún delta se muestra desnudo. Formato: `+2,5 pp · IC95 [−23, +25]`, y cuando el IC incluye 0, la etiqueta **"sin evidencia suficiente"** (nunca "sin diferencia"). Afecta a: tarjeta de forma, línea de diferencia por color (`#colDiff`, duplicada en dos funciones: **se unifica en esta PR**) y "Delta WR histórico" de What-changed. **Se retira la línea "pp score vs anteriores" de la tarjeta de forma (O1)**: `scoreRate` no tiene intervalo definido y dejarla sería un delta desnudo.

**Criterio de hallazgo:** §4, aplicado en `evaluateSignificantChanges` y `evaluateTrajectoryPatterns`. Los datos de `delta`/IC los calculan los casos de uso (o el dominio) y se pasan a esas funciones puras; los adaptadores de persistencia **no** calculan intervalos.

---

## 6. Tests exigidos

**P1.5a**
- Wilson: valores de referencia de §2.1, `n = 0` → `null`, `wins = 0` y `wins = n` en los bordes exactos, `RangeError` en entradas inválidas, límites siempre en [0, 1].
- `summarize`: `winRateCi` presente y coherente con `winRate`; `null` sin decididas; las desconocidas no mueven el intervalo.
- Una prueba de contrato por ruta de §5.1 (campo presente, misma unidad).
- Frontend: `renderCompare` y la tarjeta de forma muestran el intervalo y "—" sin datos; las barras de `renderCompare` suman 100 sobre decididas y no cuentan las desconocidas (O2).
- **Invariante:** el conjunto de hallazgos de What-changed y Trayectoria es idéntico antes y después de P1.5a.

**P1.5b**
- Newcombe: simetría (`newcombeDiff(a,b)` = −`newcombeDiff(b,a)` en signo y límites), `n = 0` en cualquiera → `null`, los cuatro casos de §4.
- Puertas: combinaciones donde n, umbral e IC se cumplen o fallan **cada uno por separado** (cada condición debe poder bloquear sola).
- Frontend: ningún delta sin IC; etiqueta de "sin evidencia suficiente" cuando `lower ≤ 0 ≤ upper`.

---

## 7. Fuera de alcance

- Multiplicidad (Bonferroni/FDR), niveles de confianza distintos, pruebas bayesianas.
- Intervalo para `scoreRate` (O1).
- Idiomas: sus hallazgos no son proporciones.
- ELO (`elo_after` vs `page_elo`) y el modelo de observaciones (contrato P2).
- Retirar la heurística de "muestra pequeña" del frontend (`games<50` o <5 %): queda para P1.6, cuando el intervalo ya la sustituya.

---

## 8. División en PRs

| PR | Contenido | ¿Cambia hallazgos? |
|---|---|---|
| **P1.5a** | `proportion.ts` (Wilson, Newcombe, `distinguishable`) + `winRateCi` en `summarize` y rutas de §5.1 + intervalo en `renderCompare` y forma | **No** |
| **P1.5b** | `delta`, deltas con IC en la UI y regla de §4 en What-changed y Trayectoria | **Sí: puede eliminar hallazgos** |

P1.5b parte de P1.5a ya fusionada. Newcombe se implementa en P1.5a (es dominio puro) o en P1.5b si no tiene consumidor en P1.5a (decisión de implementación).

---

## 9. Resolución de puntos abiertos

| ID | Resolución | Dónde se aplica |
|---|---|---|
| **O1** | **Retirar** el delta de `score` de la tarjeta de forma. | P1.5b |
| **O2** | **Corregir** el denominador de las barras de `renderCompare` a decididas. | P1.5a |
| **O3** | **Sin intervalo** en KPIs globales ni hero: son cifras descriptivas, no comparaciones, y un intervalo las convertiría en inferencia sin decisión equivalente. | Fuera de P1.5 |
| **O4** | **Aparcado.** "Últimas N" con menos de N partidas: la etiqueta debe reflejar las observaciones reales, sin rellenar. Deuda aparte, no entra en P1.5. | P1.6 u otro |
