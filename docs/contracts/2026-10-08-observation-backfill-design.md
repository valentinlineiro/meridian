# Diseño del backfill de observaciones (P2 pieza 3)

**Estado:** 📝 BORRADOR para revisión del propietario (2026-10-08). Cifras reales de la consulta previa incorporadas el 2026-10-08 (§2, §4, §10). No es una enmienda: implementa §4.7, §5, §6 y los gates del punto 10 de §12 del [contrato del modelo de observación](2026-10-05-observation-model-contract.md) (congelado). Si algo de aquí lo contradice, gana el contrato.

**Alcance:** poblar `account/course/path/section/elo_observations` y `xp_summaries.daily_goal_xp` con el histórico existente. **No** cambia lecturas, **no** compacta, **no** reclasifica (D4.1.2).

## 1. Principios (heredados del contrato)

1. **Un solo extractor.** `extractObservations` + `observationStatements` (los mismos que usa la ingesta). El backfill no tiene lógica de extracción propia: la paridad ingesta/backfill sale por construcción (§4.7).
2. **Idempotente.** `INSERT … ON CONFLICT DO NOTHING` con las PK de §3. Convive con la ingesta en vivo (mismas claves, mismas filas).
3. **`observed_at = snapshots.created_at`**, `isAuxiliary = snapshots.is_auxiliary` (el extractor aplica la regla ya existente), `extractor_version` vigente. Nunca la clasificación actual del curso (D4.1.2).
4. **Nada se salta en silencio:** los no parseables se cuentan y se listan (§6.3).

## 2. Mecanismo: script local que genera SQL (recomendado)

`scripts/backfillObservations.mjs`, ejecutado a mano:

```text
SELECT id, source, user_id, created_at, is_auxiliary, raw_json
FROM snapshots WHERE (created_at, id) > (?, ?) ORDER BY created_at, id LIMIT 25
   │  (wrangler d1 execute --remote --json, solo lectura)
   ▼
extractObservations(source, raw_json, meta) → observationStatements(db, …)
   │  un D1 falso registra SQL + parámetros; se serializan como literales escapados
   ▼
lote.sql  →  revisión  →  wrangler d1 execute --remote --file lote.sql
```

- Reutiliza **exactamente** `observationStatements`, así que no hay un segundo juego de INSERT que mantener.
- **Sin superficie nueva en producción** (ningún endpoint de administración) y el SQL es revisable antes de aplicarlo.
- Cursor `(created_at, id)` pasado y devuelto por el script; **sin tabla de progreso** (idempotencia basta).
- **El presupuesto se aplica por snapshot completo.** El script nunca corta la extracción de un snapshot: si el siguiente haría superar el tope, el lote termina *antes* de él y el cursor queda en el último snapshot completamente emitido. Así el cursor no puede saltarse filas y el mecanismo es reanudable. (Un snapshot suelto nunca pasa de unas decenas de filas, así que el tope se supera, como mucho, por esa cantidad si es el primero del lote.)
- Alternativa descartada: ruta autenticada en el Worker. Evita transferir ~55 MB, pero añade código y permisos permanentes para una operación puntual.

Volumen real (consulta previa de solo lectura, 2026-10-08): 655 snapshots de idiomas (~74 KB, 118 auxiliares), 41 de Chess (~400 KB) y 1 con `source = 'test'` y payload `{}` (no genera nada). Los 697 son JSON válido y objeto. Lotes de 25 ⇒ unas 27 llamadas de lectura. **El script no depende de estas cifras:** el dry-run calcula el volumen real y de él sale el número de lotes.

## 3. Qué se rellena y cómo

| Destino | Regla | Nota |
|---|---|---|
| `account_observations` | Extractor tal cual. Solo los ~17+ snapshots con `user.*` generan fila (D-b). | Aux nunca habla por la cuenta. |
| `course_observations` | Extractor: ~16 filas por snapshot de idiomas. | Es el grueso de las escrituras. |
| `path_observations` / `section_observations` | Extractor, incluido `format_error`. | |
| `elo_observations` | Extractor sobre Chess (`eloRating`). | 38 snapshots. Sin tocar `match_details` (sin `COALESCE`). |
| **K7** `xp_summaries.daily_goal_xp` | Pasada propia, **del más nuevo al más antiguo**: `UPDATE xp_summaries SET daily_goal_xp=? WHERE user_id=? AND date=? AND daily_goal_xp IS NULL`, con el valor numérico de `xpSummaries[].dailyGoalXp` de cada snapshot. | El más nuevo con valor gana; la guarda `IS NULL` protege lo escrito por la ingesta en vivo y hace la pasada idempotente y troceable. No inserta días, no toca `updated_at`. |
| **K5** | **No se hace backfill dedicado.** La ingesta en vivo materializa cada curso en cuanto llega un snapshot con Path (los 13 cursos entran a diario). | K6 (historia de árboles) queda archivada, no normalizada (D1). Solo si tras 2 días algún curso sigue sin `course_path_state`, se aplica `applyPathState` una vez con su último snapshot válido. |

**Limitación asumida de K7:** `xp_summaries` es "último valor por día" y no conserva revisiones del objetivo (D2). El backfill asigna a cada día el último valor *observado*, no necesariamente el vigente ese día. Si los payloads antiguos no traen `dailyGoalXp`, quedan `NULL` (nunca `0`, §4.6).

## 4. Presupuesto de escrituras

Cifras reales (calculadas en SQL, aún no con el extractor real): `course_observations` 10.480 (16 cursos únicos en cada uno de los 655 snapshots), `section_observations` 5.150, `path_observations` 643, `account_observations` 20, `elo_observations` 41 ⇒ **16.334 filas**, más hasta 105 actualizaciones de K7 (bloqueadas, §10) ⇒ **~16.440**. Es menos que la estimación inicial (~20.200). Los errores de formato dentro de `parseCourseProgress` no están descontados (bajarían algo `section_observations`); solo el dry-run con el extractor real y `--verify` lo cierran.

- **Tope por ejecución: 8.000 filas** (con las cifras reales, 3 ejecuciones) (el script corta el lote al llegar y devuelve el cursor).
- **Una ejecución por día** hasta ver la línea base del día; ⇒ 3 días. La ingesta en vivo escribió ~6.300 filas en las últimas 24 h.
- Medición: `meta.rows_written` que devuelve cada `d1 execute` (exacta, sin depender de `d1 insights`, que hoy falla con error 10000).
- El tope de 8.000 es **provisional y queda sujeto a la consulta previa** de §6.1 (plan y límites de D1: **no se puede determinar con wrangler**, el propietario debe confirmarlo en Workers & Pages > Plans; el límite gratuito de ~100.000 filas/día citado en A1 sigue sin verificarse en la documentación). Esa medición es un gate de **ejecución**, no de este diseño.

## 5. Informe de cobertura y segunda pasada (§6.4)

El script puede ejecutarse en modo `--verify` (solo lectura): re-extrae cada snapshot y comprueba que **todas las filas que el extractor determina como esperadas para él existen**. Las ausencias clasificadas *por diseño* no son diferencias.

Informe, tomado del propio extractor (no de conteos paralelos):

- snapshots por fuente y filas esperadas/presentes por tabla;
- **snapshots sin observación**, separando *por diseño* (p. ej. idiomas sin `courses[]` ni `currentCourse`; Chess sin `eloRating`) de *defecto* (debería haber filas y no están);
- **no parseables** (`unparseable_json`, `payload_not_an_object`): `snapshot_id` y causa, **listados**;
- K7: días con valor / sin valor.

Gate: **segunda ejecución completa ⇒ 0 filas escritas y 0 diferencias** en `--verify`.

## 6. Pasos y puertas de aprobación

1. **Consulta previa (solo lectura, conteos):** nº de snapshots por fuente; cuántos payloads traen `dailyGoalXp`; plan/límites de D1 en uso. *Necesita tu autorización de lectura.*
2. **Implementación sin producción:** script + test de paridad (§7). PR; no escribe en producción.
3. **Ensayo en seco:** el script lee producción (solo lectura), genera el SQL y el informe esperado **sin aplicar**. Tú revisas conteos y la lista de no parseables. *Autorización de lectura de payloads.*
4. **Aplicar por lotes** respetando el tope diario. *Tu "adelante" (una vez por ejecución o una vez por todo el plan, a tu elección).*
5. **Segunda ejecución + `--verify`** ⇒ diferencia cero.
6. Cierre: informe en el repo. Solo entonces empieza la pieza 4 (lecturas, una a una, cada una con su paridad).

## 7. Tests (sin producción)

- **Paridad ingesta/backfill:** N fixtures ingeridos por `ingestSnapshot` en la BD A; la tabla `snapshots` de A copiada a B y pasada por el backfill; las cinco tablas de observación deben ser **idénticas**.
- **Idempotencia:** segunda pasada ⇒ 0 filas cambiadas.
- **Convivencia:** filas de la ingesta en vivo no se alteran; el backfill no pisa `daily_goal_xp` ya escrito.
- **Orden y cursor:** reanudar desde el cursor no repite ni omite snapshots con el mismo `created_at`.
- **No parseable:** aparece en el informe, no se omite.
- **Serialización prepared-statement → SQL literal:** el SQL generado se ejecuta en SQLite y debe dejar **exactamente los mismos valores** que el prepared statement equivalente. Casos: `NULL`, enteros y reales, string vacío, comillas simples, saltos de línea, Unicode, backslash (sin tratamiento especial), y booleanos (se vuelven 0/1 como hace la ingesta). `NaN` e `Infinity` **no pueden llegar como literal**: el serializador falla en voz alta en lugar de emitirlos.
- **Cursor:** un lote cortado por el tope no deja ningún snapshot parcialmente emitido; encadenar lotes equivale a una sola pasada (mismas filas, mismo resultado).

## 8. Decisiones que necesito del propietario

1. **Mecanismo:** script local que genera SQL (recomendado) frente a ruta en el Worker.
2. **K5:** sin backfill dedicado, confiando en la ingesta en vivo (recomendado).
3. **K7:** regla "más nuevo con valor gana, solo sobre `NULL`" (recomendado).
4. **Presupuesto:** tope de 8.000 filas por ejecución, una al día (propuesta; ajustable tras la consulta previa).
5. **Chess:** incluir `elo_observations` ahora (38 filas; la compactación de Chess sigue bloqueada por §8.0, y extraer no borra nada).

## 9. Fuera de alcance

Cambio de lecturas (pieza 4), compactación y archivo (§8.1), bump de `extractor_version`, reclasificación de cursos, historia de árboles (K6).

## 10. Hallazgos de la consulta previa que cambian el plan

- **K7 bloqueado hasta aclarar la semántica.** `dailyGoalXp` aparece en el 100 % de los 655 snapshots (105 días, un solo usuario, 59.472 elementos) pero con **un único valor: el entero 1**, sin variación ni al principio ni al final de la serie. En los 105 días hay racha extendida y se ganaron entre 29 y 1.737 XP, así que los datos no distinguen un objetivo de 1 XP de cualquier valor ≤ 29. No se hace el backfill de K7 hasta que el propietario confirme qué significa el valor (cuál es su objetivo diario en la app). Si no es un objetivo en XP, el contrato necesita una enmienda (A2) o la columna se deja en `NULL`. **La escritura en vivo ya despliega K7:** la columna es nullable y reversible (`UPDATE … SET daily_goal_xp = NULL`), y ninguna lectura la usa todavía.
- **Sin snapshots sin observación en idiomas:** los 12 sin `currentCourse` (todos auxiliares) siguen produciendo sus 16 filas de curso. Los auxiliares no generan `account_observations`.
- **Plan de D1 sin confirmar** (ver §4).
