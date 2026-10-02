# Contrato de Ingestión de Languages v0.1

Fecha: 2026-09-29  
Módulo: #16.7 Languages Ingestion  
Estado: Aprobado  

---

## 1. Contexto y Objetivos

A diferencia de Chess (donde la unidad discreta es la partida y cada sync pagina eventos inmutables), Languages combina:
1. **Actividad temporal (account-level)**: Serie cronológica diaria (`xp_summaries` con XP ganado, sesiones y minutos).
2. **Currículo y progreso pedagógico (course-level)**: Catálogo de cursos del usuario y estructura de secciones y unidades (`pathSectioned`).

La fuente expone el árbol curricular completo de un solo curso por captura. Capturas auxiliares de otros cursos se registran con `isAuxiliary = true` y nunca alteran el curso activo observado del usuario.

Este contrato formaliza la ingestión y garantiza que el auxiliary no genere falsos históricos en el curso activo del usuario ni multiplique artificialmente las series temporales de XP.

---

## 2. Envelope de Ingestión

Todo snapshot de `duolingo-lang` se envía encapsulado en la siguiente estructura:

```json
{
  "source": "duolingo-lang",
  "userId": "1000001",
  "syncId": "uuid-sync-sesion",
  "isAuxiliary": false,
  "originalCourseId": "DUOLINGO_XA_EN",
  "observedCourseId": "DUOLINGO_XA_EN",
  "data": {
    "user": {
      "id": 1000001,
      "username": "usuario",
      "totalXp": 420000,
      "streak": 1210,
      "currentCourseId": "DUOLINGO_XA_EN"
    },
    "courses": [
      {
        "id": "DUOLINGO_XA_EN",
        "title": "Demo Alpha",
        "xp": 18000,
        "learningLanguage": "xa",
        "fromLanguage": "en",
        "subject": "language",
        "topic": "xa"
      }
    ],
    "currentCourse": {
      "id": "DUOLINGO_XA_EN",
      "activePathSectionId": "demo-sec-2",
      "pathSectioned": [ ... ]
    },
    "xpSummaries": [
      {
        "date": 1790121600,
        "gainedXp": 82,
        "numSessions": 4,
        "totalSessionTime": 612,
        "streakExtended": true,
        "frozen": false,
        "repaired": false
      }
    ]
  }
}
```

### Semántica de Campos de Control

- **`syncId`**: Identificador único de la sesión de sincronización (agrupa todos los snapshots emitidos durante una misma corrida del cliente de ingesta).
- **`isAuxiliary`**:
  - `false`: Snapshot normal o inicial/final. El `current_course_id` de `user_state` **puede** actualizarse.
  - `true`: Captura curricular auxiliar durante el captura de un curso secundario. El `current_course_id` de `user_state` **NO** se modifica bajo ninguna circunstancia.
- **`originalCourseId`**: El curso que el usuario tenía realmente cargado al inicio de la sincronización.
- **`observedCourseId`**: El curso específico cuyo currículo se está hidratando en este snapshot particular (`currentCourse.id`).

---

## 3. Invariantes de Ingestión

1. **Invariante de Identidad de Cuenta**: `user_id` nunca muta dentro de una cuenta.
2. **Invariante de Sesión de Sync**: `sync_id` agrupa una sincronización completa en el tiempo.
3. **Invariante de Aislamiento del Auxiliary**: Un snapshot con `is_auxiliary = true` (o donde `observedCourseId != originalCourseId` en auxiliary) jamás altera `user_state.current_course_id`.
4. **Invariante de Pertenencia Curricular**: Las secciones y unidades de `currentCourse` se atribuyen de forma unívoca a `(user_id, course_id)`.
5. **Invariante de Idempotencia de XP**: La clave primaria de `xp_summaries` es `(user_id, date)`. Recibir $N$ veces el mismo bloque de 90 días de XP durante un auxiliary de $N$ cursos produce exactamente 90 filas, sin duplicados ni deltas acumulativos artificiales.
6. **Invariante de Repetición Idempotente**: Repetir una misma sincronización dos veces no genera filas nuevas salvo registros con fechas posteriores.
7. **Invariante de Observación Curricular**: `last_seen_at` en `courses` y `course_sections` refleja la última vez que la fuente confirmó la estructura curricular, no la fecha en que el usuario realizó lecciones.
8. **Invariante Forense**: La tabla `snapshots` almacena el payload bruto original con su checksum y contexto de auxiliary para trazabilidad y reprocesamiento.
9. **Invariante de Dominio Lingüístico**: Solo los cursos con `subject = 'language'` alimentan las métricas y progreso curricular de Languages. Cursos con `subject IN ('chess', 'music', 'math')` quedan excluidos.
10. **Invariante de Resiliencia del Auxiliary**: El fallo o descarte de un curso individual durante el auxiliary no invalida los cursos ya ingestados en esa misma sesión de sync.

---

## 4. Mapeo a Esquema Relacional D1

- **`user_state`**: PK `user_id`. Actualiza `streak`, `total_xp`, `updated_at`. Sólo actualiza `current_course_id` si `!is_auxiliary`.
- **`courses`**: PK `(user_id, course_id)`. Actualiza `title`, `learning_language`, `from_language`, `xp`, `last_seen_at`.
- **`course_sections`**: PK `(user_id, course_id, section_id)`. Actualiza `section_index`, `type`, `cefr_level`, `cefr_sublevel`, `completed_units`, `total_units`, `last_seen_at`.
- **`xp_summaries`**: PK `(user_id, date)`. `UPSERT` de `gained_xp`, `num_sessions`, `total_session_time`, `streak_extended`, `frozen`, `repaired`, `updated_at`.
- **`snapshots`**: Metadatos de auditoría forense (`id`, `created_at`, `user_id`, `source`, `sync_id`, `is_auxiliary`, `original_course_id`, `observed_course_id`, `raw_json`, `checksum`, `size_bytes`).
