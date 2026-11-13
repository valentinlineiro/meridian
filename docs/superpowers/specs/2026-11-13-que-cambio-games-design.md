# «Qué cambió» incorpora Games — diseño (H2)

Origen: hallazgo H2 de `docs/audits/2026-11-13-rendimiento-usabilidad/INFORME.md`. Estado: **propuesto, sin implementar**.

## 1. Intención

«Qué cambió» debe ser un **resumen de evolución**, no un registro de eventos. Hoy ignora Games y, cuando ajedrez e idiomas no tienen actividad, afirma «No hay actividad registrada» (`changes.ts`, `bodyView`) aunque Games tenga registros. Esa frase mezcla tres situaciones distintas: nada registrado, nada ha cambiado y datos insuficientes.

Principio: un cambio es significativo solo si el **veredicto** de un juego (el mismo que muestra su etiqueta) es distinto entre dos fechas. Registrar partidas o acumular días no es un cambio.

## 2. Alcance

**Dentro**
- Una sección de Games en «Qué cambió» con una fila por juego.
- Una pieza de aplicación en el slice `linkedin-games` que compara los veredictos de dos fechas y devuelve un resultado cerrado.
- Reescribir el vacío de la página para que no afirme falsedades.
- El bloque «Actividad» existente pasa a secundario, plegado y separado de las evaluaciones.

**Fuera (decidido)**
- Hitos y récord de racha: esperan a cerrar H7 (qué significa «racha»).
- Cualquier umbral o regla estadística nueva: todo sale del motor actual (`GameInterpretation.ts`).
- Registrar visitas. Ver §4.
- Cambios en las evaluaciones de ajedrez e idiomas.
- Eliminar el bloque «Actividad».

## 3. Vocabulario compartido

Se reutiliza el de `web/src/app/core/words.ts`: Confirmado, Señal, Sin cambios, Pocos datos, y las etiquetas Mejorando / Estable / Bajando.

## 4. Ventana

- La comparación usa **exactamente dos fechas de juego** (`since`, `until`, formato `YYYY-MM-DD`) y la interfaz **las muestra** con su duración: «8 oct → 13 nov (36 días)».
- «Desde última visita» no registra visitas automáticamente: es un ancla que fija el usuario con «Marcar como visto» (`PUT /api/me/changes-anchor`). Este diseño no depende de ese nombre: consume las dos fechas que resuelva la ventana elegida. Renombrar el botón queda fuera.
- Conversión de instante a fecha de juego: se usa la misma zona horaria que ya usa el resumen de Games (`tz`). *Decisión mía; ver §9.*
- «Todo el historial»: **modo estado actual**. Una fila por juego con su veredicto de hoy y sin comparación ni transición.
- Ventana de menos de un día, o `since >= until`: sin comparación (ver caso N7).

## 5. Estados y resultados

### 5.1 Estado de un juego en una fecha

Se obtiene evaluando el resumen de Games **como estaba en esa fecha**, usando solo el historial hasta ella (ver §7). Combina la etiqueta publicada con `pending`:

| Estado | Origen en el motor |
|---|---|
| `MEJORANDO` | etiqueta publicada `mejora_sostenida` |
| `BAJANDO` | etiqueta publicada `deterioro` |
| `ESTABLE` | publicada `estable`, sin `pending` |
| `SEÑAL(dir)` | publicada `estable` con `pending` = mejora o deterioro |
| `POCOS_DATOS(motivo)` | `datos_insuficientes`, con motivo `cobertura_insuficiente` o `sin_calibracion` |

`MEJORANDO`, `BAJANDO` y `ESTABLE` son **estados publicables**. `SEÑAL` y `POCOS_DATOS` no lo son: solo los publicables se comparan entre sí como cambio.

### 5.2 Resultado por juego

Se calcula a partir de (estado en `since`, estado en `until`). La primera regla que coincide gana.

| # | Condición | Resultado |
|---|---|---|
| R1 | Cualquiera de los dos extremos es `POCOS_DATOS` | `EVIDENCIA` (ver subtipos) |
| R2 | Estado inicial confirmado X (`MEJORANDO` o `BAJANDO`) y estado final `SEÑAL(X)` | `NO_CONCLUYENTE` (la confirmación ha oscilado) |
| R3 | Estados publicables distintos | `CAMBIO_CONFIRMADO` (la señal final, si existe, se suprime) |
| R4 | Estado final `SEÑAL(dir)` y estado inicial publicable | `SEÑAL` (pendiente; no es un cambio) |
| R5 | Mismo estado publicable en ambos extremos, sin señal final | `SIN_CAMBIOS(estado)` |

Subtipos de `EVIDENCIA`:
- `GANADA`: inicial `POCOS_DATOS`, final con evidencia. Se dice «Ahora hay datos suficientes» y no se compara.
- `PERDIDA`: inicial con evidencia, final `POCOS_DATOS`.
- `AUSENTE`: pocos datos en ambos extremos.

Orden de presentación de las filas: el de `VERDICT_ORDER`, con `NO_CONCLUYENTE` entre `SEÑAL` y `SIN_CAMBIOS`.

### 5.3 Transiciones entre estados publicables

| Inicial → Final | Resultado | Lectura |
|---|---|---|
| ESTABLE → MEJORANDO / BAJANDO | CAMBIO_CONFIRMADO | aparece una tendencia |
| MEJORANDO ⇄ BAJANDO | CAMBIO_CONFIRMADO | la tendencia se invierte |
| MEJORANDO / BAJANDO → ESTABLE | CAMBIO_CONFIRMADO | «ya no se aprecia la tendencia»; **no** se dice «sin cambios» ni «sin problema» |
| X → X | SIN_CAMBIOS(X) | sigue igual, solo con datos suficientes |
| ESTABLE (sin señal) → ESTABLE (sin señal) | SIN_CAMBIOS(ESTABLE) | |

Una señal inicial se ignora para comparar: el estado inicial se toma por su etiqueta publicada.

### 5.4 Casos en que no se concluye nada

| # | Caso | Qué se muestra |
|---|---|---|
| N1 | Poca evidencia en cualquiera de los extremos (R1) | «No hay datos suficientes para comparar» + motivo, sin juicio de mejora ni deterioro |
| N2 | La confirmación oscila (R2) | «No se puede concluir: la tendencia dejó de estar confirmada» |
| N3 | Señal pendiente (R4) | «Posible mejora/deterioro; se confirma si se repite la semana que viene» |
| N4 | `sin_calibracion` | «Este juego aún no tiene calibración» (es una limitación del sistema, no de los datos del usuario) |
| N5 | Juego sin ninguna partida con media en todo el historial | no aparece fila |
| N6 | Cero partidas registradas en la ventana | se añade el hecho «No registraste Games en este periodo»; los veredictos se calculan igualmente |
| N7 | Ventana inválida (menos de un día, o `since >= until`) | «Esta ventana es demasiado corta para comparar» |

## 6. Texto

Cada fila dice **qué cambió, respecto a cuándo y con qué evidencia**. Ejemplos (ilustrativos):

- CAMBIO_CONFIRMADO: «Zip: de Estable a Bajando (8 oct → 13 nov). Tus últimos 28 días van más lentos que los 56 anteriores y se mantiene desde hace una semana.»
- SEÑAL: «Queens: posible mejora. Se confirma si se repite la semana que viene.»
- SIN_CAMBIOS: «Wend: sigue Estable, igual que el 8 oct.»
- EVIDENCIA.GANADA: «Tango: ahora hay datos suficientes. Está Estable. El 8 oct no había base para compararlo.»
- EVIDENCIA.PERDIDA: «Patches: ya no hay datos suficientes para valorarlo (no se registraron partidas en las últimas semanas).»
- NO_CONCLUYENTE: «Mini Sudoku: no se puede concluir. Su tendencia estaba confirmada y dejó de estarlo.»

Cabecera de la sección: «Games · 8 oct → 13 nov (36 días): 1 cambió, 1 señal, 3 sin cambios, 1 con pocos datos». Con vacío, cada situación se redacta distinto: «No registraste Games en este periodo» (hecho), «Sin cambios» (hay datos y no hay variación) y «Pocos datos» (no se puede juzgar).

## 7. Arquitectura

- Una pieza en la capa de aplicación del slice `linkedin-games` (p. ej. un caso de uso `GetGamesChange`) recibe `ownerEmail`, `since` y `until`. Devuelve un resultado cerrado: ventana, modo (`compare` / `current-only`), una fila por juego (`game`, resultado, estado inicial, estado final, evidencia) y los conteos. «Qué cambió» consume ese resultado y **no conoce `GameInterpretation`**.
- Cálculo: `summarize(days, fecha)` ya es una función pura del historial y de la fecha, así que no hace falta guardar nada.
- **Riesgo principal: no filtrar el futuro.** El estado inicial debe calcularse con el historial **truncado a `since`**. Si `summarize` incluyera días posteriores, el estado inicial se contaminaría con datos que no existían entonces. La implementación debe demostrarlo con una prueba (§8).
- Las bandas de calibración son constantes en el tiempo, así que «el veredicto de hace un mes» es el que se habría calculado con los datos de entonces. Si cambian, esa igualdad se rompe y debe documentarse.
- La confirmación del estado de `since` necesita evaluar también en `since − 7 días`. Con historial insuficiente cae a `POCOS_DATOS`.
- La capa de entrega expone el resultado; el contrato externo sigue la misma regla que el resto de la API (errores de dominio mapeados en el borde).

## 8. Criterios de aceptación

Pruebas por resultado, con nombres `shouldXWhenY`:
1. Cada fila de §5.3 produce el resultado indicado.
2. R1–R5 se aplican en orden; en concreto, estados publicables iguales con señal final dan `SEÑAL` y **nunca** `SIN_CAMBIOS`.
3. Transición confirmada + señal final: solo aparece la transición (sin duplicar).
4. Una transición hacia o desde `POCOS_DATOS` nunca se llama mejora, deterioro ni cambio.
5. **Sin fuga de futuro:** el estado inicial calculado con el historial completo y con el truncado a `since` es el mismo.
6. `Todo el historial` no devuelve transiciones.
7. Ventana inválida (N7) y cero partidas (N6) tienen su texto.
8. La página ya no muestra «No hay actividad registrada» como afirmación global; esa frase pasa al bloque plegado «Actividad».
9. Con datos en Games y ninguna actividad de ajedrez/idiomas, la página muestra la sección de Games.

Verificación manual: capturas a 390 y 1200 px de las seis situaciones de §6, con datos demo.

## 9. Decisiones y huecos

Decididas por Valentín:
1. Hitos fuera de esta iteración.
2. «Actividad» se mantiene, plegada y separada.
3. «Todo el historial» = estado actual, sin transiciones.
4. La lógica vive en el slice de Games y «Qué cambió» consume un resultado de aplicación.
5. Solo se comparan estados publicables; la señal se muestra pendiente y sin duplicar; «sin cambios» solo con datos suficientes y comparables en ambos extremos; la ventana usa dos fechas explícitas.

Decisiones mías, a revisar:
- Conversión de la ventana a fechas de juego con la zona horaria del resumen de Games.
- R2: si una tendencia confirmada pasa a señal de la misma dirección, se declara no concluyente.
- Una señal inicial se ignora al comparar.
- «Estable» tras una tendencia confirmada es un cambio confirmado y no «sin cambios».

Abierto para la implementación:
- Si el estado a `since − 7 días` coincide con lo que se mostró ese día (ver §7).
- La redacción final de los textos.
- Si «Actividad» plegado se recuerda entre visitas.
