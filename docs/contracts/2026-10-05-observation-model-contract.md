# Contrato P2: modelo de observaciones (extraer → paridad → conmutar → compactar)

**Fecha:** 2026-10-05
**Estado:** 🟡 **DRAFT: sin implementar y sin congelar.** No hay migración ni backfill. Todas las decisiones están tomadas (D1–D6 en §10, D-a…D-f en §7) y §0 está resuelto (§0.1); el contrato no se congela hasta pasar la revisión final de §12. El orden es: **qué conocimiento histórico debe sobrevivir (§2b) → representación mínima que lo conserva (§3)**. El esquema de §3 es provisional y deriva de §2b, no al revés.
**Origen:** auditoría de utilidad analítica (hallazgo: las series longitudinales dependen de parsear `snapshots.raw_json`).

**Pregunta rectora de cada campo:** qué observación histórica representa, de qué snapshot procede y si puede reconstruirse de forma determinista desde el `raw_json` actual.
**Gate de P2:** si se retira `raw_json` mañana, todas las lecturas actuales (§2) devuelven exactamente el mismo resultado, salvo las diferencias enumeradas y aprobadas en §7.

---

## 0. Precondiciones de datos (ejecutadas el 2026-10-06; resultados en §0.1)

Consultas de solo lectura sobre la base `meridian` de producción. Se conservan aquí tal como se ejecutaron:

```sql
-- Q1: cobertura de elo_after (decide si el ELO por partida es una serie o un fragmento)
SELECT COUNT(*) AS matches,
       SUM(md.elo_after IS NOT NULL) AS con_elo_after,
       SUM(m.page_elo   IS NOT NULL) AS con_page_elo
FROM matches m LEFT JOIN match_details md ON md.match_id = m.match_id;

-- Q2: coste real por fuente
SELECT source, COUNT(*) AS snapshots, SUM(size_bytes) AS bytes,
       AVG(size_bytes) AS avg_bytes, MIN(created_at) AS desde, MAX(created_at) AS hasta
FROM snapshots GROUP BY source;
```

```sql
-- Q3a: cursos SIN subject en el payload cuyo id lleva prefijo DUOLINGO_ (la inferencia que hoy hace la normalización).
-- Mirar también $.user.courses si el payload usa esa ruta.
SELECT COUNT(*) AS sin_subject_con_prefijo
FROM snapshots s, json_each(s.raw_json, '$.courses') c
WHERE s.source = 'duolingo-lang'
  AND json_extract(c.value, '$.subject') IS NULL
  AND COALESCE(json_extract(c.value, '$.id'), json_extract(c.value, '$.courseId')) LIKE 'DUOLINGO\_%' ESCAPE '\';

-- Q3b: cursos con learningLanguage pero subject distinto de 'language' (el criterio amplio de R4).
SELECT json_extract(c.value, '$.subject') AS subject, COUNT(*) AS n
FROM snapshots s, json_each(s.raw_json, '$.courses') c
WHERE s.source = 'duolingo-lang'
  AND json_extract(c.value, '$.learningLanguage') IS NOT NULL
  AND COALESCE(json_extract(c.value, '$.subject'), '') <> 'language'
GROUP BY 1;
```

**Regla de decisión de Q3:** si ambas dan 0, la excepción `DUOLINGO_` y el criterio amplio de R4 no tienen respaldo en datos y se retiran en un cambio posterior. Si alguna da > 0, **no** se amplía el predicado en silencio: se abre una enmienda explícita de la Invariante 9 con ese dato como justificación.

```sql
-- Q4: tamaño esperado de K5 (filas de unidades y niveles de los 5 últimos snapshots de idiomas con Path).
SELECT s.id, s.created_at,
  (SELECT COUNT(*) FROM json_tree(s.raw_json, '$.currentCourse.pathSectioned') t WHERE t.path LIKE '%.units'  AND t.type = 'object') AS units,
  (SELECT COUNT(*) FROM json_tree(s.raw_json, '$.currentCourse.pathSectioned') t WHERE t.path LIKE '%.levels' AND t.type = 'object') AS levels
FROM snapshots s
WHERE s.source = 'duolingo-lang' AND s.raw_json LIKE '%pathSectioned%'
ORDER BY s.created_at DESC LIMIT 5;
```

```sql
-- Q5: ventana de xp_summaries que trae cada payload de idiomas (para D-f).
SELECT s.created_at,
  COALESCE(json_array_length(s.raw_json, '$.xpSummaries'), json_array_length(s.raw_json, '$.xp_summaries')) AS dias_en_payload,
  (SELECT MIN(json_extract(v.value, '$.date')) FROM json_each(s.raw_json,
     CASE WHEN json_type(s.raw_json, '$.xpSummaries') = 'array' THEN '$.xpSummaries' ELSE '$.xp_summaries' END) v) AS fecha_min,
  (SELECT MAX(json_extract(v.value, '$.date')) FROM json_each(s.raw_json,
     CASE WHEN json_type(s.raw_json, '$.xpSummaries') = 'array' THEN '$.xpSummaries' ELSE '$.xp_summaries' END) v) AS fecha_max
FROM snapshots s
WHERE s.source = 'duolingo-lang'
ORDER BY s.created_at DESC LIMIT 10;
```

Q2 se repite para detectar el factor de redundancia: `SUM(size_bytes)` frente a `SUM(LENGTH(raw_json))` de la última fila por fuente.

---

### 0.1 Resultados (2026-10-06, producción, solo lectura)

| Consulta | Resultado | Consecuencia |
|---|---|---|
| **Q1** | 1.507 partidas; **0** con `elo_after`; 1.507 con `page_elo`. | No existe serie de ELO por partida desde `match_details`. El ELO por partida solo sale de `page_elo`. Se aplica la regla de §4: lo que dependa de `elo_after` devuelve *Insufficient evidence*, sin `COALESCE`. |
| **Q2** | Chess: 38 snapshots, 15 MB, ~400 KB cada uno. Idiomas (`duolingo-lang`): 612 snapshots, 45,6 MB, ~74 KB cada uno (~47 al día). | Idiomas aporta 45,6 MB frente a 15 MB de Chess, por número de snapshots, no por tamaño. Es el dato para dimensionar la compactación (bloqueada por §8.1). |
| **Q3** | 9.792 entradas de curso en los payloads; 7.943 con `subject: language`. Sin `subject`: **16**, todas del 2026-09-23; **13** con prefijo `DUOLINGO_`. | Q3a > 0: por la regla de decisión no se amplía el predicado en silencio. **Se abre la enmienda de la Invariante 9** (D-e) con este dato. Q3b no se registró por separado en esta ejecución: repetirla antes de decidir el criterio amplio de R4. |
| **Q4** | Entre 71 y 311 unidades y entre 6 y 197 niveles por snapshot de curso. | Tamaño de K5 acotado: cientos de filas por curso, no por snapshot. |
| **Q5** | Todos los payloads traen la misma ventana de **91 días** (2026-07-08 a 2026-10-06). | La ventana del payload es fija (91 días). D-f sigue **abierta**: falta decidir cuál es el contrato (payload o tabla) y la comprobación del cliente externo. |
| **Q3b** | Entradas con `learningLanguage` y `subject` distinto de `language`: **13**, todas con `subject = null`. Ninguna con otro subject. | El criterio amplio de R4 añade exactamente las 13 de Q3a; no hay otra población. |
| **Q3c** (nueva) | Las 16 entradas sin `subject` están **todas en un único snapshot**: el primero de idiomas (`92f89377…`, 2026-09-23T12:18:12Z). 13 son `DUOLINGO_*` con `learningLanguage`; las otras 3 son `CHESS_CH`, `MUSIC_MT`, `MATH_BT`. | D-c y D-e son **la misma población**. Ese snapshot es el `start` que R4 usa hoy (primero, medio, último). |
| **D-a** | 0 de 612 snapshots de idiomas traen `totalXp`/`streak` de nivel superior. | La aceptación de nivel superior no tiene respaldo en datos. |
| **D-b** | 595 de 612 snapshots de idiomas **no** traen `user.currentCourseId`. Los 17 que traen datos de cuenta (`user.totalXp`, `streak` y `currentCourseId` a la vez) son: 3 el 09-23, 4 el 09-24, 2 el 09-25, 6 el 10-05 y 2 el 10-06. **Hueco de 9 días** (09-26 a 10-04) sin ninguna. 0 con ambos ids distintos. | Los snapshots por curso del colector son de **solo identidad**. La serie de cuenta es dispersa, con un hueco de 9 días. R3 hoy toma "el último snapshot `<= t`" sea cual sea y, sin `user.*`, cae a `currentCourse.id` del último snapshot por curso. |

Las cifras de Q3 cuentan entradas en payloads (un mismo curso aparece en muchos snapshots), no cursos distintos.

---

## 1. Alcance

**Dentro:** observaciones derivadas de `snapshots.raw_json` que alimentan lecturas analíticas.
**Principio:** extraer no implica borrar. Preparar tablas de observación (p. ej. `elo_observations`) no depende de que se cierre la compactación de Chess (§8.0).
**Regla sobre consumidores externos:** el contrato solo se amplía por un consumidor real o una responsabilidad contractual que haya que preservar. No se modela todo lo que un cliente externo *podría* hacer.
**Fuera:** compactar o borrar nada (solo se fijan los criterios, §8); P1 (epistemología de Chess); P3 (semántica de Languages); `match_snapshots`, `collection_runs`, `schema_observations` (§9).

---

## 2. Inventario de lecturas de `raw_json` (la fuente del contrato)

| ID | Consumidor | Qué lee | Observaciones |
|---|---|---|---|
| R1 | `api/stats.ts` `summary` | `json_extract($.eloRating)` de **todos** los snapshots, primero y último | No filtra por `source`: depende de que los de idiomas no traigan `eloRating`. |
| R2 | `api/stats.ts` `timeline` | `id, created_at, $.eloRating` de todos los snapshots | Incluye filas de idiomas con `elo = null`. |
| R3 | `d1WhatChangedAdapter` (baseline y target de idiomas) | `user.totalXp`, `user.streak`, `user.currentCourseId ?? currentCourse.id` del último snapshot `<= t` | Solo lee `user.*`; la normalización también acepta campos de nivel superior. |
| R4 | `d1TrajectoryAdapter` (idiomas) | `courses[].xp` en 3 snapshots (primero, medio, último) | Su filtro de curso difiere del de la normalización. |
| R5 | `api/languagesAnalytics.ts` `getCurriculumDeltas` | `currentCourse.id`, `pathSectioned[].index/completedUnits/totalUnits` de todos los snapshots que contengan `pathSectioned` (`LIKE`) | Aplica `?? 0` a `completedUnits` y `totalUnits`. |
| R6 | `api/stats.ts` `/api/stats/lang` | **Payload completo** del último snapshot de idiomas: `totalXp`, `streak`, `courses`, `xp_summaries` (incl. `dailyGoalXp`), `currentCourse` con árbol de unidades y niveles | Sin consumidor externo comprobado (§7.1); el respaldo del dashboard sí lo usa. Con D-f = A, `summaries` y `totals` salen de `xp_summaries`. |
| R7 | `buildCourseProgressHistory` / `buildCourseProgressIndex` | `currentCourse` de los últimos 30 snapshots (`COURSE_HISTORY_LIMIT`) | Un Path por curso, del último snapshot que lo tuvo cargado. |
| R8 | `/api/snapshots/:id?raw=1` y página `/raw` | Payload íntegro | Herramienta de depuración. |

Lo que **no** lee `raw_json` y no entra en el gate: `xp_summaries`, `courses`, `course_sections`, `user_state` (tablas ya normalizadas por ingesta, estado mutable "último valor").

**Hallazgo del inventario:** las tres tablas propuestas en la auditoría (cuenta, XP por curso, ELO) cubren R1–R4 y R5 solo parcialmente. **R6, R7 y R8 no quedan cubiertas**, porque necesitan el árbol de unidades/niveles y campos que la normalización descarta (`dailyGoalXp`). Ver decisiones D1 y D2.

**Qué consume realmente cada capa de R6/R7** (verificado en `src/` y `src/frontend.ts`):

| Dato | Servido por la API | Leído por el dashboard | Otros lectores |
|---|---|---|---|
| Resumen por sección (`index`, `type`, `cefr`, `completedUnits`, `totalUnits`), sección activa, CEFR actual, ratio | `courseProgressIndex`, `courseProgressHistory[].path` | **Sí** (`frontend.ts` ~706–760) | tests |
| `xp` del curso en cada punto de historial, `capturedAt` | idem | **Sí** | tests |
| Árbol completo `units[]` y `levels[]` (`teachingObjective`, `state`, `finishedSessions`, `reachedScore`, `crownLevelIndex`, …) | Solo el campo `courseProgress` del **último** snapshot (marcado "backward compat" en `lang.ts`) | **No** | `tests/courseProgress.test.ts`; cliente de ingesta externo: **no lo lee** (comprobado, §7.1) |
| `dailyGoalXp` por día | `summaries[]` de `/api/stats/lang` | **No** | cliente de ingesta externo: **no verificado** |
| Historial de `levels` por snapshot | **Nadie lo sirve**: `buildCourseProgressHistory` reduce a resumen de sección | No | ninguno |

Esto no cambia las decisiones D1/D2 (§10): "servido por la API" ya es consumo y la regla es no romper paridad. Sí fija la **granularidad mínima**: lo que sirve el dashboard es nivel sección; lo que sirve la API es el estado *actual* del árbol, no su historia.

---

## 2b. Conocimiento histórico que debe sobrevivir

Se decide **antes** de diseñar tablas. "Sobrevivir" significa que existe una representación recuperable, no necesariamente en la misma tabla ni en caliente.

| ID | Conocimiento | ¿Irreemplazable? | Lectura que lo usa | Decisión |
|---|---|---|---|---|
| K1 | Serie de estado de cuenta por snapshot (XP total, racha, curso declarado), solo de snapshots que traen datos de cuenta (D-b) | Sí | R3 | **Sobrevive**, normalizado |
| K2 | Serie de XP vitalicio por curso por snapshot | Sí | R4 | **Sobrevive**, normalizado |
| K3 | Serie de ELO de nivel snapshot | Sí | R1, R2 | **Sobrevive**, normalizado |
| K4 | Estructura de secciones observada por snapshot (unidades completadas/totales, CEFR), `null` preservado, incl. snapshots con `format_error` | Sí | R5, R7 | **Sobrevive**, normalizado |
| K5 | Estado **actual** del árbol completo de cada curso (secciones, unidades y niveles), con el `snapshot_id` de origen | Sí (solo existe en el payload) | R6 (R7 solo a nivel sección) | **Sobrevive**, normalizado como **estado** (§3.2), no como serie |
| K6 | **Historia** de unidades/niveles por snapshot | Sí | ninguna | **CONFIRMADO:** sobrevive archivada (`raw_json` en frío, §8.1.5), **no** normalizada: ninguna lectura la usa y normalizarla multiplicaría las filas por snapshot |
| K7 | `dailyGoalXp` por día | Sí | `/api/stats/lang` | **Sobrevive** como columna nullable de `xp_summaries` (mismo grano `user,date`) |
| K8 | Evidencia de mutación de partidas de Chess tras el primer avistamiento | Sí (ver D3) | `/raw`; ningún análisis | **Sobrevive** en `raw_json`; **bloquea la compactación de Chess** (§8.0) |
| K9 | Primer avistamiento de cada partida | No (ya en `matches.raw_json`) | `matches` | Sin cambios |

Regla de lectura de K5/K6: separar **estado** (cómo está el árbol hoy) de **serie** (cómo ha cambiado). El producto actual sirve lo primero a nivel de árbol y lo segundo solo a nivel de sección. No se cambia esa frontera para acomodar el almacenamiento.

---

## 3. Modelo provisional

Series (K1–K4): filas **inmutables**, hijas de un snapshot, con `extractor_version`. Estado (K5, K7): filas **sobrescritas** con un snapshot más reciente, mismo patrón que `courses` / `course_sections` / `xp_summaries`.

```text
snapshots (id, created_at, source, user_id, checksum, raw_json, …)
   │
   ├── account_observations   PK (snapshot_id)                         K1   lang
   ├── course_observations    PK (snapshot_id, course_id)              K2   lang   (antes "course_observations")
   ├── path_observations      PK (snapshot_id)                         K4   lang   cabecera del Path cargado
   │     └── section_observations  PK (snapshot_id, section_index)     K4   lang
   └── elo_observations       PK (snapshot_id)                         K3   chess

ESTADO
   ├── course_path_units      PK (user_id, course_id, unit_index)      K5   nueva
   (las secciones de K5 NO tienen tabla propia: se leen de section_observations, §3.2; `course_sections` queda fuera de P2, D5)
   ├── course_path_levels     PK (user_id, course_id, unit_index, level_ordinal)  K5  nueva
   └── xp_summaries.daily_goal_xp                                      K7   columna nullable nueva
```

K6 y K8 **no** tienen tabla: se conservan archivados.

### 3.1 Series

| Tabla | Columnas | Semántica |
|---|---|---|
| `account_observations` | `snapshot_id, user_id, observed_at, total_xp, streak, declared_course_id, extractor_version` | Estado de **cuenta**, solo de snapshots que traen `user.totalXp`, `user.streak` o `user.currentCourseId` (D-b). `declared_course_id` = `user.currentCourseId`. El curso observado (`currentCourse.id`) **no** es estado de cuenta: vive en `path_observations.course_id`. Hoy R3 los fusiona con `??`; deja de hacerlo. |
| `course_observations` | `snapshot_id, user_id, observed_at, course_id, subject, learning_language, from_language, title, xp, extractor_version` | Entrada observada de `courses[]` en el snapshot. `xp` es **vitalicio** (serie, no estado); sin `xp` numérico se guarda `null`, nunca `0`. Se guarda lo **observado**; la pertenencia a "curso de idiomas" se decide al leer (D4). `title` y `from_language` existen porque `courseProgress` (R6) los toma de `courses[]` **del mismo snapshot**, no del catálogo actual. |
| `path_observations` | `snapshot_id, user_id, observed_at, course_id, active_section_id, format_error, extractor_version` | Un registro por snapshot que trae `currentCourse`. `format_error` conserva el texto de `CourseProgressFormatError` cuando la estructura no coincide (hoy se sirve como `courseProgressError` y `courseProgressHistory[].formatError`); en ese caso **no** hay filas de sección. |
| `section_observations` | `snapshot_id, section_index, section_id, type, cefr_level, cefr_sublevel, completed_units, total_units` | Una fila por sección del Path (todas, incluidas las `daily_refresh`). `null` conservado. `section_id` se guarda porque la sección activa se identifica por `id === activeSectionId` **dentro del snapshot**; no es estable entre snapshots (la fuente rota los UUID, migración `0009`). |
| `elo_observations` | `snapshot_id, user_id, observed_at, elo, extractor_version` | ELO **de nivel snapshot** (`$.eloRating`). **No es** `match_details.elo_after`; nada las fusiona con `COALESCE`. |

Lo que **no** se guarda por derivable: `completionRatio`, totales por curso y "sección activa" resuelta. Se calculan al leer con `summarizeCourseProgress` (que ya filtra `type === 'learning'` y exige contadores no nulos). Se guarda lo observado, no lo interpretado.

### 3.2 K5: estado del árbol (columnas exactas, de `parseCourseProgress`)

Cada columna sale de un campo que `parseCourseProgress` ya modela; **no se añade ninguno más**. Los campos `title`, `xp`, `fromLanguage`, `learningLanguage` de `CourseProgress` **no** son del árbol: vienen de `courses[]` y viven en `course_observations`.

**Nivel sección → `section_observations` (§3.1), no `course_sections` (D5 = NO).** El estado de secciones de un curso es `section_observations` del **último `path_observations` de ese curso** (`ORDER BY observed_at DESC, snapshot_id DESC`). No hay tabla de estado gemela ni escritura nueva sobre `course_sections`.

**`course_path_units`** (una fila por `CourseUnit`):

| Columna | Origen (`CourseUnit`) | Nota |
|---|---|---|
| `user_id, course_id` | contexto | |
| `unit_index` | `index` (`unitIndex`) | **Posición en el curso entero**, no dentro de la sección. Obligatorio (`required`): si falta, `format_error`. |
| `section_index` | sección contenedora | Conserva el anidamiento del payload. |
| `teaching_objective` | `teachingObjective` | nullable |
| `cefr_level` | `cefrLevel` | Etiqueta gruesa de la fuente (`"Intro"`, `"A1"`…), distinta de `section.cefr`. nullable |
| `is_unlocked` | `isUnlocked` | **Bandera cruda**, nullable. Observada `false` incluso en unidades completadas: no es progreso (comentario en `courseProgress.ts`). |
| `levels_captured` | `levels != null` | **Distingue "no capturado" de "capturado y vacío"**. El payload solo trae `levels` de algunas secciones (el fixture: la activa y la 0). |
| `snapshot_id` | origen | Snapshot del que procede el árbol. |

**`course_path_levels`** (una fila por `CourseLevel`; solo si `levels_captured`):

| Columna | Origen (`CourseLevel`) | Nota |
|---|---|---|
| `user_id, course_id, unit_index` | contexto | |
| `level_ordinal` | posición en el array `levels` | El payload **no trae índice propio**; el orden del array es el dato. |
| `state` | `state` | Obligatorio (`required`). Observado: `legendary \| passed \| active \| locked \| unit_test`. Texto libre, **sin CHECK**: la fuente puede añadir estados. |
| `finished_sessions`, `total_sessions` | idem | nullable |
| `skill_id`, `crown_level_index`, `tree_id` | `pathLevelMetadata.*` | nullable |
| `reached_score`, `learning_score`, `reached_progress`, `completed_progress` | `levelScoreInfo.*` | nullable |

**Semántica de estado (paridad con hoy):**

1. **Reemplazo por curso.** Al ingerir un snapshot con Path de un curso, se borran las filas `course_path_units`/`course_path_levels` de ese `(user, course)` y se insertan las del snapshot, en el mismo `db.batch`, **solo si** su `observed_at` es mayor que el del árbol almacenado. Es lo que hoy ocurre en `courseProgress` (R6): solo el árbol del último snapshot.
2. **Sin fusión.** Si el snapshot nuevo trae `levels` para otra sección distinta de la anterior, los niveles de la sección que ya no se capturó **se pierden del estado** (quedan en el archivo, K6). Esa es la conducta actual; una fusión por sección sería una mejora, no paridad (D6).
3. **Un solo curso servido.** R6 sirve `courseProgress` únicamente del `currentCourse` del **último snapshot de idiomas**; si ese snapshot no trae `currentCourse`, es `null`. La paridad exige leer el estado de ese curso **y** comprobar que su `snapshot_id` coincide con el último snapshot. Mantener el árbol por curso es un superconjunto natural, no un requisito de R6.
4. **Puntero implícito.** `course_path_units.snapshot_id` identifica de qué snapshot procede el árbol. El árbol solo se sirve como `courseProgress` si ese `snapshot_id` es el del **último snapshot de idiomas** y su `path_observations.format_error` es `null`; si el último snapshot trae `format_error`, se sirve el error y no el árbol (paridad con hoy). Un snapshot con `format_error` **no** toca `course_path_units`/`course_path_levels`.
5. **Un único extractor.** K4 y K5 se extraen **llamando a `parseCourseProgress`** (no a un parser nuevo), de modo que los criterios de `required` y de `CourseProgressFormatError` son idénticos.

### 3.3 Tamaño (por medir)

El comentario de `stats.ts` sitúa el payload con niveles en ~100–200 KB por snapshot. El estado K5 es **uno por curso**, no uno por snapshot; su tamaño depende de unidades × niveles. Se mide con Q4 (§0) antes de congelar.

`user_id` se repite en las series para consultar por usuario sin join; si D1 penaliza el espacio, se retira y se hace join (decisión de implementación).

---

## 4. Semántica

1. **`observed_at` = `snapshots.created_at`**, texto ISO-8601 UTC. Es el instante de **registro**, no el de la fuente. Es comparable lexicográficamente (las lecturas actuales ya hacen `created_at <= ?`). Hoy `createdAt` puede venir suministrado en `IngestArgs`: ese campo es parte de la frontera de confianza y su efecto sobre el orden longitudinal debe quedar documentado, no asumido.
2. **Ámbitos separados.** ACCOUNT (`account_observations`), COURSE (`course_observations`, `section_observations`), CHESS (`elo_observations`). Ninguna tabla mezcla ámbitos, y ninguna lectura puede etiquetar una como la otra.
3. **Snapshot de solo identidad** (los que el colector emite por curso; no traen `user.totalXp`, `user.streak` ni `user.currentCourseId`; en producción, 595 de 612):
   - `account_observations`: **no se escribe fila** (D-b). Que falte la observación no es lo mismo que `null`: la lectura de cuenta usa la **última observación de cuenta `<= t`** y devuelve su `observed_at`, sin presentarla como actual.
   - `course_observations`: válida (el catálogo `courses[]` es completo en cualquier snapshot).
   - `path_observations` / `section_observations`: válidas para el curso en `currentCourse.id` del snapshot.
4. **Snapshot deduplicado** (`checksum` repetido): no genera filas nuevas. Una observación existe por snapshot, y un snapshot por checksum.
5. **Atomicidad.** Hoy `ingestSnapshot` encadena `await`s sin transacción. La inserción de las filas de observación debe ir en el mismo `db.batch` que el snapshot, o el snapshot queda **sin observaciones** (defecto detectable, §6.4).
6. **Valores ausentes:** `null`, nunca `0`. Un campo ausente en un payload antiguo es `null`.
7. **Un único extractor puro** `extractObservations(source, rawJson, meta)` en `normalization/`, usado por ingesta **y** por backfill. La paridad ingesta/backfill se garantiza por construcción, no por revisión.
8. **`extractor_version`** permite ver cuándo cambió una regla de extracción: contrapeso al riesgo de "semántica que cambia con el tiempo".

---

## 5. Unicidad e idempotencia

- Claves primarias de §3. Escritura con `INSERT … ON CONFLICT DO NOTHING`. Una observación **no se actualiza**: si cambia `extractor_version`, se escribe en una pasada de backfill explícita y versionada.
- Dos snapshots distintos con el mismo `observed_at` son legítimos; el orden de desempate es `id`.

---

## 6. Backfill

1. Recorre `snapshots` por `created_at ASC, id ASC`, por lotes (límite de D1 por petición).
2. Aplica `extractObservations`. Las filas ya existentes no cambian (§5).
3. **Los snapshots no parseables no se saltan en silencio:** se cuentan y se listan en un informe (`snapshot_id`, causa).
4. **Informe de cobertura:** snapshots por fuente, filas por tabla, snapshots sin observación, snapshots no parseables. Una segunda ejecución debe dar **diferencia cero**.
5. Observaciones antiguas con esquema distinto: el extractor las lee con las mismas reglas; los campos ausentes quedan `null`. No hay "arreglo" retroactivo de semántica.

---

## 7. Paridad con las lecturas actuales

Procedimiento: sobre el dataset demo **y** sobre una copia de producción, para un conjunto fijo de instantes `t`, ejecutar cada lectura de §2 antes y después de conmutarla y comparar el JSON de salida.

| Lectura | Nueva fuente | Diferencia conocida (debe aprobarse o corregirse) |
|---|---|---|
| R1, R2 | `elo_observations` | R1 deja de depender de la ausencia de `eloRating` en idiomas (filtro por fuente). R2 deja de listar filas de idiomas con `elo = null`: **el cliente debe tolerarlo**. |
| R3 | `account_observations` | **D-a:** la normalización acepta `totalXp`/`streak` de nivel superior, R3 solo `user.*`. **D-b:** R3 fusiona `currentCourseId ?? currentCourse.id`; con snapshots auxiliares eso puede producir un falso `courseChanged`. La nueva lectura usa `declared_course_id` de la última observación de cuenta (D-b aprobada). |
| R4 | `course_observations` + predicado de D4 | **D-c:** R4 acepta un curso por `subject==='language' \|\| learningLanguage \|\| id` con prefijo `DUOLINGO_`; el contrato congelado de ingesta (Invariante 9) exige `subject='language'`. Se adopta el predicado único de D4 y se **mide cuántas filas cambian** respecto al criterio amplio de R4. |
| R5 | `section_observations` | **D-d:** R5 convierte `null` en `0` (`?? 0`); la nueva fuente conserva `null`, lo que puede mover un veredicto `comparable` a `insufficient_observation`. |
| R6 | `account_observations` + `course_observations` + `path_observations` + K5 (§3.2) + `xp_summaries` (con `daily_goal_xp`) | `/api/stats/lang` debe ser **idéntica** campo a campo, incluidos `courseProgress` (solo del último snapshot) y `summaries[].dailyGoalXp`. **Ojo:** hoy `summaries` sale del `xp_summaries` **del payload** (ventana móvil del último sync), no de la tabla; leer de la tabla cambia el conjunto de días. Ver D-f. |
| R7 | `path_observations` + `section_observations` + `course_observations` | Idéntica a la actual: un Path por curso, con `capturedAt`, `xp` y `formatError` por punto. `xp` sale del `courses[]` del snapshot, con **fallback al catálogo más reciente** cuando el snapshot no trae `courses[]` (`buildCourseProgressHistory`): ese fallback debe reproducirse. El límite de 30 snapshots deja de ser necesario, pero el resultado debe coincidir con él en el dataset de prueba. |
| R8 | `raw_json` archivado (K8) | Se mantiene operativo mientras no se cumpla §8. |
| (todas) | — | **D-e:** la normalización escribe `subject = 'language'` inferido por prefijo `DUOLINGO_` cuando el payload no lo trae; la observación guardará `subject = null`. Con el predicado de D4 esos cursos pasarían a **no ser** de idiomas. Se mide con Q3a antes de cualquier conmutación. |
| R6 | `xp_summaries` | **D-f:** R6 sirve `summaries` del payload del último snapshot (con `dailyGoalXp`); la tabla `xp_summaries` acumula días de **todos** los syncs. Mismos campos, distinto conjunto de filas. La paridad exige decidir cuál es el contrato. |

Las diferencias D-a…D-f son **cambios de comportamiento**, no regresiones de paridad: cada una se aprueba individualmente antes del cambio de lectura. Mientras no haya aprobación, la lectura debe reproducir el comportamiento actual.

---

### 7.1 D-f: **DECIDIDA: opción A** (aprobada por el propietario el 2026-10-06)

Qué expone hoy `/api/stats/lang` (verificado en código):

- `summaries` = el array `xp_summaries` / `xpSummaries` **del payload del último snapshot de idiomas** (`summarizeLang`), ordenado por fecha. Su longitud la fija la fuente en cada sync. El contrato de ingesta habla de un "bloque de 90 días" (Invariante 5); Q5 (§0.1) mide una ventana fija de 91 días.
- `totals` (días, XP, sesiones, medias) se calculan sobre ese mismo array.
- Consumidores conocidos: el dashboard **solo como respaldo** (`loadLanguagesDashboard`, cuando `/api/languages` viene vacío o falla) y `/api/me/stats/lang`; el cliente de ingesta externo lo usaría en un paso de verificación según la auditoría de lectura; **comprobado el 2026-10-06 que el colector real no lo hace** (ver abajo). El flujo principal del dashboard usa `/api/languages/xp?days=90`, que lee la **tabla** (contrato read-api: `days` defecto 90, máx 365).

Qué significa la tabla: `xp_summaries` acumula los días de **todos** los syncs (PK `(user,date)`, última escritura gana). Puede cubrir más de 90 días y sus filas coinciden con el payload del último sync solo dentro de la ventana de ese sync.

Opciones (**elegida: A**):

| Opción | Efecto | Coste |
|---|---|---|
| A | `summaries` pasa a salir de la tabla (conjunto temporal más amplio) | Cambia semántica y `totals`; decisión de producto |
| B | Paridad exacta: guardar en `account_observations` los límites de la ventana del payload (`xp_window_start`, `xp_window_end`) y servir de la tabla **solo ese rango** | Dos columnas; mantiene `raw_json` fuera de la ruta de lectura sin cambiar el resultado |
| C | Deprecar `summaries` de `/api/stats/lang` y apuntar a `/api/languages/xp` | Cambia el contrato de una ruta que el cliente externo puede usar |

**Regla de decisión** (cada dato responde a una pregunta distinta):

- **Q5** determina cómo se comporta realmente la ventana (días por payload, fecha mínima y máxima, estabilidad).
- **El código del cliente externo** determina si esa ventana es observable o contractual. Hoy solo está demostrado que el cliente usa la **ruta**; que lea `summaries` **no** está demostrado.

| Resultado en el cliente | Opciones que quedan abiertas |
|---|---|
| No lee `summaries` | A o C |
| Lee `summaries`, sin depender de la ventana exacta | A basta |
| Depende de la ventana entregada por la fuente | B (la conservadora; suficiente solo si los límites guardados por `account_observation` bastan para reproducir el comportamiento) |

Este contrato no añade ninguna otra inferencia sobre el cliente.

**Comprobación del cliente externo (2026-10-06, código local).**

- `meridian-collector`, rama `private/operational`, `scripts/`: `collector.sh` solo hace `POST /api/snapshot` (cuenta, cada curso, Chess) y llama a Duolingo; `hydrateChessDetails.mjs` solo usa `GET /api/chess/matches/pending-details` y `POST …/detail`. Ningún script lee `/api/stats/lang`, `/api/me/stats/lang`, `summaries`, `courseProgress` ni `dailyGoalXp`.
- Los scripts de `duolingo-stats` y `longitudinal-analytics-staging` tampoco llaman a esas rutas (solo aparecen en tests).
- El único consumidor en código es el respaldo del dashboard (`loadLanguagesDashboard`, `src/frontend.ts`): `renderLang(legacy)` cuando `/api/languages` viene vacío o falla.
- La afirmación de la auditoría de lectura ("ingest-client verify step") **no tiene respaldo** en el colector actual.
- **Límite de la comprobación:** `/api/stats/lang` no exige autenticación, así que un consumidor fuera de estos repositorios (marcador, script ajeno) no es observable desde el código. No se ha demostrado su ausencia.

Según la tabla de arriba, "no lee `summaries`" deja abiertas **A o C**. C obligaría además a reescribir el respaldo del dashboard, que sí consume `summaries`. **Decisión (2026-10-06): A.** `summaries` y `totals` de `/api/stats/lang` salen de la tabla `xp_summaries`; el cambio de conjunto de días (más amplio que los 91 del payload) queda aceptado como diferencia D-f. `dailyGoalXp` se sirve de la columna nueva `xp_summaries.daily_goal_xp` (K7). Consecuencia: R6 deja de depender de `raw_json` por esta vía. Las opciones B y C quedan descartadas.

Hasta decidir, la lectura R6 **debe seguir saliendo de `raw_json`** y por tanto R6 **bloquea** la compactación de snapshots de idiomas (§8.1).

---

### 7.2 Resolución de D-a…D-e (**TODAS APROBADAS el 2026-10-06**; D-c+D-e con condición de paridad)

Cada una se aprueba por separado (§7). La evidencia es la de §0.1.

| ID | Propuesta | Efecto sobre lo que se ve hoy | Evidencia |
|---|---|---|---|
| **D-a ✅ aprobada** | El extractor de `account_observations` lee solo `user.*`. La aceptación de nivel superior de la normalización se deja como está y no se usa. | Ninguno (R3 ya lee solo `user.*`). | 0/612 snapshots con campos de nivel superior. |
| **D-b ✅ aprobada** | Solo los snapshots que **traen datos de cuenta** (`user.totalXp`, `user.streak` o `user.currentCourseId`) generan fila en `account_observations`. Los snapshots por curso (solo identidad) **no** generan fila: ausencia de observación ≠ `null`. Se retiran `is_auxiliary` y `observed_course_id`: `declared_course_id` es lo único que la cuenta declara; el curso observado vive en `path_observations.course_id`. R3 lee la **última observación de cuenta `<= t`**, no el último snapshot. | R3 deja de devolver XP nulo y de deducir el curso activo a partir de un snapshot por curso. Para `t` anterior a 2026-09-23 pasa a "no disponible". Para `t` entre 09-26 y 10-04 la última observación tiene hasta 9 días de antigüedad: `observedAt` debe reflejarlo y la lectura no la presenta como actual. | 595/612 sin `user.currentCourseId`; cuenta en 17 snapshots, con un hueco 09-26…10-04. |
| **D-c + D-e ✅ aprobada, con condición** (evidencia en §7.3) | **Sin enmienda de la Invariante 9.** `isLanguageCourse` = `subject === 'language'`, estricto. Las 13 entradas `DUOLINGO_*` sin `subject` se guardan tal cual (`subject = null`). **Condición obligatoria:** el `start` de R4 es el **primer snapshot cuyas observaciones cumplen el predicado**, no el primer snapshot cronológico. | Con la condición, el resultado de R4 es **idéntico** al actual (§7.3); `startedAt` de idiomas se desplaza 78 minutos. Sin la condición, el XP de H1 se multiplica por 120. | Q3a/Q3b/Q3c y paridad §7.3. |
| **D-d ✅ aprobada** (evidencia en §7.3) | Se conserva `null` en `completed_units`/`total_units` (observado ≠ interpretado). | **Ninguno observable hoy:** 0 nulos. | 0 de 4.234 secciones `learning` (y 0 de 604 `daily_refresh`) con contadores nulos, en 604 snapshots. |

### 7.3 Paridad de R4 y medición de D-d (2026-10-06, producción, solo lectura)

R4 (`getLanguagesTrajectoryData`) toma tres snapshots: el primero, el último `<=` punto medio y el último, y calcula la ganancia de XP por curso en cada mitad. Se recalculó con los datos reales (inicio 2026-09-23T12:18:12Z, medio 2026-09-29T23:11Z, fin 2026-10-06):

| Variante | H1: XP / cursos | H2: XP / cursos |
|---|---|---|
| Actual (criterio amplio, `start` = primer snapshot) | 3.502 / 2 | 4.905 / 9 |
| Estricto ingenuo (`subject = language`, `start` = primer snapshot) | **420.595 / 13** | 4.905 / 9 |
| Estricto + `start` = primer snapshot que cumple el contrato (2026-09-23T13:36:48Z) | 3.502 / 2 | 4.905 / 9 |

- **Por qué falla la variante ingenua:** el primer snapshot no trae `subject`; sus 13 cursos `DUOLINGO_*` quedan fuera del conjunto inicial, el XP inicial de cada uno pasa a 0 y todo su XP vitalicio cuenta como ganancia de H1.
- **La variante con condición reproduce el resultado actual** campo a campo en los snapshots medidos. Límite: el punto medio se mantuvo fijo; con el `start` desplazado 78 minutos el medio se desplaza unos 39 y podría elegir otro snapshot. Esa comprobación forma parte del test de paridad de R4 antes de conmutar.
- **D-d:** 0 de 4.234 secciones `learning` con `completedUnits` o `totalUnits` nulos (604 snapshots); conservar `null` en vez de convertirlo en 0 no cambia hoy ningún veredicto de R5.

**Comprobación del punto medio (2026-10-06).** Con el `end` real (2026-10-06T11:34:17Z) el medio es 2026-09-29T23:56:15Z con `start` cronológico y 2026-09-30T00:35:33Z con `start` contractual. Los snapshots de idiomas llegan en lotes: el último lote `<=` ambos medios termina en 2026-09-29T21:57:52Z (`7b9e0bd3`) y el siguiente empieza el 2026-09-30T04:17:22Z. Ambos medios caen en ese hueco, así que **eligen el mismo snapshot** y el resultado de H1/H2 es idéntico (§7.3, tercera fila). **La comprobación pasa.**

Alcance de esa comprobación: es una medición sobre los datos de hoy, no una propiedad. El `end` avanza con cada sync y el medio con él; cuando el medio cruce el siguiente lote, el snapshot de medio cambiará con cualquiera de los dos `start`. Lo que debe cumplirse siempre es que, **para un `end` dado**, desplazar el `start` al primer snapshot contractual no altere el resultado salvo por esa selección. Por eso la paridad de R4 es un **test de fixture obligatorio** (el caso ingenuo debe fallar y el condicionado pasar), no esta medición puntual.

---

## 8. Criterios para poder compactar `raw_json`

### 8.0 Invariante de evidencia única

> **No se elimina ni se compacta una representación histórica de una entidad si otra tabla solo conserva su primer avistamiento y no existe una representación equivalente de su estado posterior.**

Aplicación inmediata: `matches` conserva el primer avistamiento (K9) y `upsertMatches` solo actualiza `last_seen_at`/`played_at`. Por tanto **la compactación de los snapshots de Chess queda bloqueada** hasta que exista una representación del estado posterior de una partida o una decisión explícita y registrada de aceptar su pérdida. La extracción de `elo_observations` **no** está bloqueada: extraer no elimina nada.

**Ninguna decisión de este contrato (D1–D6, D-a…D-f) autoriza borrar o compactar `raw_json`.** El contrato describe qué modelo hay que poder extraer y demostrar; la política de destrucción de evidencia viene después y está gobernada solo por §8.1.

### 8.1 Condiciones

Deben cumplirse **todos**:

1. §0 resuelto (Q1 y Q2 ejecutadas, resultados registrados en este documento).
2. Informe de cobertura (§6.4) sin snapshots sin observación ni no parseables sin explicar.
3. Paridad aprobada para R1–R5 (§7), con D-a…D-f decididas.
4. Decisiones D1–D4 (§10) implementadas, y K5/K7 operativos con paridad de R6/R7 demostrada.
5. **Archivo antes de borrar:** exportar `raw_json` a almacenamiento frío y comprobar `checksum` tras la restauración (el `checksum` actual es `sha256(source|user|stableStringify(data))` y permite verificarlo).
6. **Retención fijada:** el último snapshot completo por (fuente, usuario) se conserva sin compactar como fixture de regresión. Los snapshots de Chess quedan **excluidos** de la compactación mientras §8.0 siga bloqueándolos.
7. Plan de reversión probado: restaurar un snapshot compactado desde el archivo y verificar su checksum.

---

## 9. Fuera de alcance, pero con estado

| Objeto | Estado | Antes de poder eliminarlo |
|---|---|---|
| `match_snapshots` | Candidato. Sin lectores en `src/`; solo aparece en `tests/helpers/testDb.ts` y en la migración. | Verificar herramientas fuera de `src/` (cliente de ingesta, scripts de recuperación), uso en auditoría o recuperación, y que se necesite una nueva migración de `DROP` (las migraciones existentes son inmutables). |
| `collection_runs` | Candidato. Sin lectores ni escritores en `src/`. | Mismas comprobaciones. |
| `schema_observations` | Se mantiene. Solo se escribe; sin consumidor no cumple su función de detectar cambios de semántica. | Añadir un consumidor (diff de deriva) o reevaluar. |

**Ninguno se elimina en P2.** La ausencia de lectores en la aplicación es una evidencia fuerte, no suficiente para un `DROP` irreversible.

---

## 10. Decisiones

Estado: **decididas, pendientes de revisión (§12)**. Cada una se toma sobre §2b (qué sobrevive), no sobre el esquema.

| ID | Decisión | Resolución | Notas y evidencia |
|---|---|---|---|
| **D1** | Árbol de unidades y niveles (R6/R7) | **Se conserva como observación normalizada**, con la **granularidad mínima que exigen las lecturas**: estado actual del árbol por curso (K5) y serie a nivel de sección (K4). No se reduce a totales para facilitar F-06. | El dashboard solo lee nivel sección; la API sirve el árbol completo solo del último snapshot (§2). La **historia** de unidades/niveles (K6) no la lee nadie: se conserva archivada, no normalizada. Columnas exactas de K5 en §3.2 (de `parseCourseProgress`). |
| **D2** | `dailyGoalXp` | **Se conserva**: columna nullable `xp_summaries.daily_goal_xp`, extraída y con backfill. El valor de producto del campo se audita **aparte**, no en P2. | La API lo sirve (`summaries[].dailyGoalXp`); el dashboard no lo lee. Cliente de ingesta externo: no verificado. `xp_summaries` es "último valor por día": no conserva revisiones del objetivo, igual que sus otros campos. |
| **D3** | Mutaciones de Chess y `/raw` | **Se conserva la evidencia histórica.** Los snapshots de Chess no se compactan hasta definir qué evidencia mutante se quiere conservar (§8.0). `/raw` sigue operativo. | `upsertMatches` solo actualiza `last_seen_at`/`played_at`; los cambios posteriores de una partida viven solo en los snapshots. Corrección respecto a la auditoría original. |
| **D4** | Definición de curso de idiomas | **Un único predicado de dominio `isLanguageCourse(course)`**, usado por R4, R6, R7, comparabilidad, XP por curso y cualquier observación futura. Sin listas ni filtros SQL propios. | Ya existe contrato congelado: **Invariante 9** de `languages-ingestion-contract` (`subject = 'language'`). R4 lo incumple hoy (criterio más amplio). La inferencia por prefijo `DUOLINGO_` de la normalización es una extensión no contractual y **no entra en el predicado** (ver D4.1). Se mantiene como divergencia documentada (D-e, §7) hasta que Q3 justifique o descarte la enmienda. |

### D4.1 Clasificación que cambia en la fuente (**CONFIRMADA**)

La definición del predicado no resuelve qué pasa cuando **un curso cambia de clasificación**. Propuesta:

1. Las observaciones guardan lo **observado** (`subject`, `learning_language`) y la pertenencia se decide **al leer** con `isLanguageCourse`. Así un cambio de clasificación es visible en la serie y no la trunca en silencio.
2. El backfill **no reclasifica**: aplica el extractor con lo observado en cada snapshot, nunca con la clasificación actual del curso.
3. Una lectura que encuentre un curso con más de un valor de `subject` en su serie debe **declararlo** (`classificationChanged`), no elegir uno.
4. **Predicado único:** `isLanguageCourse(obs) ⇔ obs.subject === 'language'` (Invariante 9). Sin inferencia por `DUOLINGO_` y sin criterio por `learningLanguage`.
5. **Un `subject` ausente es `null`, no se infiere.** Un curso sin `subject` no es "curso de idiomas" bajo el contrato vigente. Si Q3 demuestra que hay observaciones legítimas que lo necesitan, el cambio entra por **enmienda explícita del contrato de ingesta**, no por el código.
6. Hasta que ese cambio exista, el comportamiento actual (`courses` filtra al escribir e infiere por prefijo) **no se modifica**: P2 es solo contrato y no cambia lecturas hoy.

### D5 `course_sections` fuera de P2 (**DECIDIDA: NO reutilizar**)

`course_sections` y K5 representan cosas distintas: la primera es el modelo histórico existente; K5 debe reproducir fielmente el árbol de `parseCourseProgress` con semántica de snapshot. Reutilizarla metería en P2 una migración semántica adicional y heredaría dos comportamientos dudosos ya identificados:

1. Con `index` ausente, `normalizeLanguagePayload` usa `sectionIndex = 0` y omite secciones sin `id` (el parser lanza `format_error`): varias secciones pueden colisionar en la PK y pisarse en silencio.
2. `upsertCourseSections` no borra: si la fuente reduce las secciones, quedan filas antiguas y `totalUnits` por curso puede estar inflado (hipótesis: **Insufficient evidence** sin datos).

Consecuencias: P2 **no escribe ni modifica** `course_sections`; `/api/languages/courses/:id` y `/api/languages/analytics` no cambian de comportamiento por P2. Una consolidación futura solo se estudia como trabajo separado, y solo si se demuestra que ambas tablas representan el mismo hecho. Los dos comportamientos de arriba quedan anotados como **backlog independiente**, fuera de este contrato.

### D6 Reemplazo de niveles (**DECIDIDA: reemplazo**)

Reemplazo por curso en cada snapshot con Path válido (§3.2.1): es la semántica de `courseProgress` hoy y por tanto la que permite demostrar paridad. La fusión por sección es una decisión de producto distinta y no entra en P2.

### D1.1 ELO: dos observaciones, no una

- `elo_after`: observación **por partida** (`match → elo_after`). Sirve al análisis de partidas.
- `elo_observations`: observación **por snapshot** (`snapshot → observed_at → elo`). Sirve a la evolución longitudinal.

Nunca se combinan con `COALESCE`. Si la cobertura de `elo_after` (Q1) es insuficiente, el efecto es que las preguntas que dependen de él devuelvan **Insufficient evidence**, no que se rellenen con `page_elo`.

---

## 11. Interacción con P1

- **Chess epistemics** puede avanzar en paralelo. El punto 1.3 queda reformulado por D1.1: usar `elo_after` para análisis por partida y `elo_observations` para la evolución, sin mezclarlas.
- El resultado de Q1 decide si el ELO por partida es una serie utilizable o si el histórico no hidratado debe declararse *Insufficient evidence*.

---

## 12. Orden previo al congelado

1. ~~**D5**~~ decidida: `course_sections` fuera de P2.
2. ~~**D6**~~ decidida: reemplazo.
3. ~~**D-f**~~ decidida: A (§7.1).
4. ~~**Q4**~~ ejecutada (§0.1): K5 acotado.
5. ~~**Q1, Q2, Q3a, Q3b, Q3c**~~ ejecutadas (§0.1). La enmienda de la Invariante 9 **no se propone** y D-c+D-e quedó aprobada sin ella (§7.2).
6. ~~Comprobar si el cliente externo depende de `courseProgress`, `dailyGoalXp` o `summaries`. Solo cambia el contrato si hay un consumidor real o una obligación contractual.~~ Hecho (§7.1): el colector real no los lee.
7. Aprobar **D-a…D-f** una a una contra datos reales. Hecho: D-a, D-b, D-c+D-e (con condición), D-d, D-f.
8. Revisión final de este apartado.
9. **Congelar.**
10. Solo entonces migración + backfill.

Cerradas: D1, D2, D3, D4/D4.1, D5, D6, D-f (A). Aprobadas: D-a, D-b, D-c+D-e (con condición de paridad, §7.3), D-d, D-f (A). No queda ninguna decisión de §7 abierta.
