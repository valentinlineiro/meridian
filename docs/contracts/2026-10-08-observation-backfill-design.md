# Diseño del backfill de observaciones (P2 pieza 3)

**Estado:** 📝 BORRADOR para revisión del propietario (2026-10-08). No es una enmienda: implementa §4.7, §5, §6 y los gates del punto 10 de §12 del [contrato del modelo de observación](2026-10-05-observation-model-contract.md) (congelado). Si algo de aquí lo contradice, gana el contrato.

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
- Alternativa descartada: ruta autenticada en el Worker. Evita transferir ~55 MB, pero añade código y permisos permanentes para una operación puntual.

Volumen (de §0.1 Q2): ~740 snapshots de idiomas (~74 KB) y 38 de Chess (~400 KB). Lotes de 25 → unas 30 llamadas de lectura.

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

Estimación: idiomas ~740 × ~27 filas ≈ **20.000** + Chess 38 + K7 ≤ 105 ⇒ **~20.200 filas**. La referencia de línea base fue de ~46.000 filas/día en consultas listadas y el límite gratuito citado en A1 es de 100.000/día.

- **Tope por ejecución: 8.000 filas** (el script corta el lote al llegar y devuelve el cursor).
- **Una ejecución por día** hasta ver la línea base del día; ⇒ ~3 días.
- Medición: `meta.rows_written` que devuelve cada `d1 execute` (exacta, sin depender de `d1 insights`, que hoy falla con error 10000).
- El tope de 8.000 es **provisional y queda sujeto a la consulta previa** de §6.1 (plan y límites de D1, y cuántos payloads traen `dailyGoalXp`). Esa medición es un gate de **ejecución**, no de este diseño.

## 5. Informe de cobertura y segunda pasada (§6.4)

El script puede ejecutarse en modo `--verify` (solo lectura): re-extrae cada snapshot y comprueba que **todas** las filas esperadas existen.

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
- **Escapado del SQL generado:** comillas, saltos de línea y Unicode en `title`/`teaching_objective` (el SQL se ejecuta tal cual en D1).

## 8. Decisiones que necesito del propietario

1. **Mecanismo:** script local que genera SQL (recomendado) frente a ruta en el Worker.
2. **K5:** sin backfill dedicado, confiando en la ingesta en vivo (recomendado).
3. **K7:** regla "más nuevo con valor gana, solo sobre `NULL`" (recomendado).
4. **Presupuesto:** tope de 8.000 filas por ejecución, una al día (propuesta; ajustable tras la consulta previa).
5. **Chess:** incluir `elo_observations` ahora (38 filas; la compactación de Chess sigue bloqueada por §8.0, y extraer no borra nada).

## 9. Fuera de alcance

Cambio de lecturas (pieza 4), compactación y archivo (§8.1), bump de `extractor_version`, reclasificación de cursos, historia de árboles (K6).
