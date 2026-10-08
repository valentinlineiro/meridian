# Contrato de Observación de Cuenta de Languages v0.2

Fecha: 2026-10-05  
Módulo: Languages Ingestion (extiende v0.1 de 2026-09-29)  
Estado: **Aprobado (2026-10-05)** — decisiones §9 resueltas con las opciones recomendadas.

Cierra las auditorías F-01 (estado de cuenta congelado) y F-04 (campos de control que el cliente real no emite).
Complementa el contrato de ingesta v0.1 y lo sustituye donde se indica en §7.

---

## 1. Problema

El cliente de ingesta mezcla dos cosas distintas en el mismo tipo de snapshot:

| Concepto | Qué es | Quién puede afirmarlo |
|---|---|---|
| **Observación de cuenta** | XP total, racha y curso activo *de la cuenta* | Solo una lectura de la cuenta, no de un curso |
| **Observación de curso** | Catálogo, secciones y unidades *de un curso X* | Una lectura dirigida a X |

Hoy los snapshots de curso del barrido no llevan `totalXp`, `streak` ni `currentCourseId` (verificado en D1: 0 de 513 desde 2026-09-25), y no llevan
`syncId`, `isAuxiliary`, `originalCourseId` ni `observedCourseId` (0 de 513). El invariante de aislamiento de v0.1 existe en Meridian pero
nunca se activa en producción.

> Principio: **Observed ≠ Interpreted.** Un snapshot de curso observa un curso; no dice nada del estado de la cuenta.

---

## 2. Dos tipos de snapshot (ambos `source = "duolingo-lang"`)

### 2.1 Snapshot de cuenta (*account observation*)

- `isAuxiliary = false`
- `observedCourseId`: **ausente**
- `originalCourseId`: el curso activo de la cuenta al inicio de la ejecución
- `data.user` contiene `id`, `totalXp`, `streak`, `currentCourseId`, procedentes de la **lectura inicial de la cuenta**
- `data.courses`: catálogo de la lectura inicial (con `xp` por curso)
- `data.currentCourse`: ausente (no se observa currículo)

> Verificado (2026-10-05, D1 de solo lectura): los snapshots construidos desde la lectura inicial de la cuenta (último con `user.totalXp`, 2026-09-25T06:53Z)
> traen `courses[]` con `id,title,xp,learningLanguage,fromLanguage,subject,topic`, la misma cobertura de campos que los snapshots de curso actuales
> (16 cursos: `subject`/`topic`/`xp` presentes en los 16; `title` ausente solo en los 3 no-idioma, que `normalizeLanguagePayload` descarta).
> `upsertCourses` sobrescribe `title/subject/topic/...` sin condición, así que esta equivalencia es la que evita degradar `courses`.
- `data.xp_summaries` / `data.xpSummaries`: opcional (el upsert es idempotente)

### 2.2 Snapshot de curso (*course observation*)

- `isAuxiliary = true` **siempre**, también cuando el curso observado coincide con `originalCourseId`
- `observedCourseId` = el curso cuyo currículo contiene `data.currentCourse`
- `originalCourseId` = el mismo valor que en el snapshot de cuenta de la misma ejecución
- `data.user` **no** contiene `totalXp`, `streak` ni `currentCourseId`

> Decisión de diseño: un snapshot de cuenta separado (en vez de reutilizar el snapshot del curso original) hace que la cuenta
> se observe aunque el curso activo no sea un curso de idiomas (p. ej. ajedrez, que el barrido excluye).

### 2.2.1 Validez de la observación de cuenta ante un fallo posterior

La observación de cuenta afirma **el estado de la cuenta en el instante de la lectura inicial**, que ocurre antes de cualquier cambio de curso
del barrido. Esa afirmación sigue siendo verdadera aunque la ejecución falle después, incluida una restauración fallida del curso:

- Un fallo de restauración es un hecho **operacional**, no una corrección de la observación: la ejecución termina en error (código de salida ≠ 0)
  y así lo ve quien lanzó la sincronización. Nunca se informa como sincronización limpia.
- Si la cuenta externa queda en un curso distinto, la lectura inicial de la siguiente ejecución lo observará como lo que es (el curso activo en ese
  momento). La secuencia de observaciones refleja la realidad; no se necesita un estado de "confirmación".
- Por eso la observación se envía **antes** del primer cambio de curso: ningún efecto del barrido puede contaminarla.

No se introduce ningún mecanismo de confirmación posterior (más estado, sin consumidor).

### 2.3 Envelope común

Ambos usan el envelope de v0.1 §2. `syncId` es **obligatorio** en el cliente real:

- **`syncId`**: un UUID generado **una vez por ejecución completa** del cliente de ingesta y compartido por todos sus snapshots
  (1 de cuenta + N de curso). No se genera por snapshot.

Meridian sigue aceptando snapshots sin estos campos (compatibilidad con histórico y con otros clientes), pero los trata como
**no clasificables como cuenta**: ver §4.

---

## 3. Responsabilidades

**Cliente (collector, `scripts/collector.sh` de este repo; antes en `duolingo-stats`)**
1. Leer la cuenta una vez; derivar `originalCourseId` de esa lectura.
2. Emitir un snapshot de cuenta a partir de **esa lectura**, no de ninguna respuesta del barrido.
3. Emitir un snapshot de curso por curso barrido, con `isAuxiliary = true`, sin los campos de cuenta.
4. Poner el mismo `syncId` en todos.
5. Si el snapshot de cuenta no se puede construir o enviar, la ejecución **falla** (la cuenta es la observación que alimenta la cabecera).

**Meridian**
1. Solo un snapshot con `isAuxiliary = false` puede modificar `user_state` (XP, racha, curso actual y sus `*_observed_at`).
2. Un snapshot con `isAuxiliary = true` nunca modifica `total_xp`, `streak`, `current_course_id` ni sus `*_observed_at`, **aunque el payload los traiga**.
3. La resolución de "estado de cuenta en el instante t" (what-changed) considera solo snapshots con `is_auxiliary = 0` (§5).

---

## 4. Invariantes (cada uno, un test con nombre `shouldXWhenY`)

| # | Invariante | Test propuesto |
|---|---|---|
| A1 | Un snapshot auxiliar con observación del curso X nunca convierte X en `current_course_id` | `shouldNotChangeCurrentCourseWhenAnAuxiliarySnapshotObservesAnotherCourse` |
| A2 | Un snapshot auxiliar no altera `total_xp`, `streak` ni `*_observed_at`, aunque traiga esos campos | `shouldIgnoreAccountFieldsWhenTheSnapshotIsAuxiliary` |
| A3 | Un snapshot de cuenta fija XP, racha y curso actual y avanza sus `*_observed_at` | `shouldSetAccountStateWhenTheSnapshotIsAnAccountObservation` |
| A4 | Un snapshot de cuenta sin `currentCourse` ingiere catálogo de cursos y no crea secciones | `shouldIngestCoursesWithoutSectionsWhenTheAccountSnapshotHasNoCurrentCourse` |
| A5 | Un barrido completo (1 cuenta + N cursos, mismo `syncId`) con el payload real del cliente deja `current_course_id` = `originalCourseId` y la XP de la cuenta | `shouldKeepAccountStateWhenAFullSweepIsIngested` |
| A6 | `syncId` identifica una ejecución completa del collector (ID de correlación por ejecución, no un identificador de lote persistido). Todos los snapshots enviados en esa ejecución llevan el mismo `syncId`. La ingesta puede deduplicar un snapshot cuyo contenido observado ya está registrado; en ese caso no genera un registro nuevo y no figura como parte persistida de la ejecución | `shouldGroupASweepBySyncIdWhenAllSnapshotsShareIt` (sobre los registros creados); la deduplicación no se altera |
| A7 | El fallo de un snapshot de curso no invalida los ya ingestados ni el de cuenta | (v0.1 §3.10, se mantiene) |
| A8 | Reenviar la misma ejecución es idempotente en `xp_summaries`, `courses` y `user_state` | (v0.1 §3.5–3.6, se mantiene) |
| A9 | Cliente: el payload de cuenta se construye desde la lectura inicial, no desde la respuesta del barrido | `tests/collectorSnapshots.test.ts` con fixture del payload real |
| A10 | Cliente: si la restauración final falla, la ejecución termina en error y la observación de cuenta enviada antes del barrido no se retira | `tests/collectorSnapshots.test.ts`: `shouldKeepThePreSweepAccountObservationAndFailTheRunWhenTheFinalRestoreFails` |

Los fixtures de A5 y A9 deben ser **el payload real del cliente** (con la forma que produce hoy el collector), no una versión enriquecida:
F-01 pasó 859 tests precisamente porque los fixtures traían campos que el cliente real no envía.

---

## 5. Estado de cuenta en el instante t (what-changed)

`getLanguagesBaseline` y `getLanguagesTarget` toman hoy el último snapshot `duolingo-lang` con `created_at <= t`, sea cual sea su tipo.
Con snapshots de curso esto devuelve un payload sin `user.totalXp`.

Regla v0.2: el estado de cuenta en t sale del último snapshot con `is_auxiliary = 0` y `created_at <= t`. Si no existe → desconocido (nunca 0). `activeCourseId` sale únicamente de `user.currentCourseId`; `currentCourse.id` describe un curso observado, no la cuenta.

Efecto sobre el histórico: los 513 snapshots anteriores a v0.2 figuran con `is_auxiliary = 0` pero sin bloque de cuenta.
Con esta regla resolverán `totalXp = null` → "desconocido", que es lo que realmente se observó. **No se reescribe el histórico** (ver §6).

---

## 5.1 Deduplicación y `last_seen_at` (conocido, sin acción)

El checksum de deduplicación se calcula sobre el contenido (`source`, `userId`, `data`) y **excluye** los campos de control. Por tanto, si un snapshot de curso
repite un contenido ya registrado, la ingesta lo trata como no-op: no guarda sus campos de control y tampoco refresca `course_sections.last_seen_at`
(`courses.last_seen_at` sí se refresca, porque el snapshot de cuenta vuelve a observar el catálogo). Es coherente con el modelo («re-enviar datos idénticos es un no-op»)
y no afecta al estado de cuenta. Verificado en producción el 2026-10-05: un run sin actividad nueva dejó 13 snapshots de curso deduplicados y 1 de cuenta persistido (08:21Z).
Si tampoco cambia el contenido de la cuenta, esa observación también se deduplica: verificado el mismo día (run de las 10:06Z), una ejecución sin cambios no creó ningún snapshot y
`user_state` y sus `*_observed_at` no avanzaron. La lectura queda evidenciada por `deduplicated: true` en la respuesta y por el bloque de cuenta del log del collector, no por una fila nueva.
(`courses.last_seen_at` solo se refresca cuando la observación de cuenta se persiste.) No se modifica la deduplicación para evitarlo.

## 6. Datos existentes

- **No se hace backfill de `is_auxiliary`.** Marcar retroactivamente los snapshots antiguos como auxiliares sería reinterpretar una observación pasada bajo una regla nueva.
- `user_state` (665397 XP, 1077 racha, `DUOLINGO_IT_EN`, observados 2026-09-25) permanece intacto hasta el primer snapshot de cuenta nuevo.
- Entre 2026-09-25 y el despliegue de v0.2 la cuenta queda **sin observar** (hueco real, y así lo muestra el dashboard desde la unidad B).

---

## 7. Qué sustituye de v0.1

| v0.1 | v0.2 |
|---|---|
| §2 `isAuxiliary=false`: "snapshot normal o inicial/final" | §2.1: snapshot de cuenta, definido |
| §2 `isAuxiliary=true`: no modifica `current_course_id` | §3 Meridian-2: tampoco `total_xp`, `streak` ni `*_observed_at` |
| §3.3 solo protege `current_course_id` | A1 + A2 |
| §4 `user_state` actualiza `streak`, `total_xp` sin condición | solo si `!is_auxiliary`; añade `*_observed_at` (migración 0011) |
| §4 `course_sections` PK `(user_id, course_id, section_id)` | **drift ya existente**: la PK real es `(user_id, course_id, section_index)` desde 0009. Solo documental, sin cambio de esquema |

---

## 8. Fuera de alcance

- Cualquier cambio en la extracción (qué se pide a la fuente y cómo): el contrato solo fija **qué viaja** a Meridian.
- Cambios de esquema D1 (no hacen falta: `snapshots` ya tiene `sync_id`, `is_auxiliary`, `original_course_id`, `observed_course_id`).
- Retención de `raw_json` (F-06) y atomicidad de la ingesta (F-02/F-03), que se tratan aparte.

---

## 9. Decisiones (aprobadas)

1. **Snapshot de cuenta separado** (recomendado, §2.1) frente a reutilizar el del curso original. Coste: +1 snapshot de ~75 KB por ejecución (≈ +8 %).
2. **Sin backfill del histórico** (recomendado, §6) frente a clasificar retroactivamente los snapshots posteriores al 2026-09-25 como auxiliares.
3. **Orden de despliegue**: primero Meridian (A1/A2/§5, compatible con el cliente actual porque solo endurece), después el collector.
   Con ese orden, entre ambos despliegues el sistema no empeora: sigue sin observar la cuenta, como hoy.
