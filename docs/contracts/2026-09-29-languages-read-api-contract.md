# Contrato de Lectura de Languages v0.1 (Read API)

Fecha: 2026-09-29  
Módulo: #16.7 Languages Read API  
Estado: Aprobado  

---

## 1. Principios de Diseño

1. **Fidelidad estricta al origen**: La Read API expone exactamente los datos fácticos reportados por la fuente sin añadir métricas sintéticas o interpretativas prematuras ("fluidez", "nivel estimado", "porcentaje ponderado").
2. **Desacoplamiento de granularidad**: Se separan los tres ejes de consulta:
   - Catálogo de cursos y estado global de cuenta (`/api/languages`).
   - Estructura curricular y avance de secciones por curso (`/api/languages/courses/:courseId`).
   - Serie temporal de actividad y esfuerzo diario (`/api/languages/xp`).
3. **Consistencia multitenant**: Todos los endpoints aceptan el parámetro opcional `userId`. Si no se especifica, resuelven el usuario activo en la base de datos.
4. **Respuesta tipada y predecible**: Códigos HTTP semánticos (200 OK, 404 Not Found si el curso no existe, 400 Bad Request en parámetros inválidos).

---

## 2. Especificación de Endpoints

### 2.1 `GET /api/languages`

Devuelve el estado general del usuario lingüístico y el catálogo de cursos de idiomas registrados.

- **Parámetros query**:
  - `userId` *(opcional, string)*: Identificador de cuenta de la fuente.

- **Respuesta 200 OK**:
```json
{
  "userId": "1000001",
  "currentCourseId": "DUOLINGO_XA_EN",
  "totalXp": 420000,
  "streak": 1210,
  "updatedAt": "2026-09-29T08:00:00.000Z",
  "courses": [
    {
      "courseId": "DUOLINGO_XA_EN",
      "title": "Demo Alpha",
      "learningLanguage": "xa",
      "fromLanguage": "en",
      "subject": "language",
      "topic": "xa",
      "xp": 18000,
      "lastSeenAt": "2026-09-29T08:00:00.000Z"
    },
    {
      "courseId": "DUOLINGO_XB_EN",
      "title": "Demo Beta",
      "learningLanguage": "xb",
      "fromLanguage": "en",
      "subject": "language",
      "topic": "xb",
      "xp": 94000,
      "lastSeenAt": "2026-09-29T08:00:00.000Z"
    }
  ]
}
```

---

### 2.2 `GET /api/languages/courses/:courseId`

Devuelve la ficha detallada de un curso y la lista ordenada de sus secciones curriculares observadas.

- **Parámetros de ruta**:
  - `courseId` *(requerido, string)*: ID del curso (ej. `DUOLINGO_XA_EN`).
- **Parámetros query**:
  - `userId` *(opcional, string)*.

- **Respuesta 200 OK**:
```json
{
  "userId": "1000001",
  "course": {
    "courseId": "DUOLINGO_XA_EN",
    "title": "Demo Alpha",
    "learningLanguage": "xa",
    "fromLanguage": "en",
    "subject": "language",
    "topic": "xa",
    "xp": 18000,
    "lastSeenAt": "2026-09-29T08:00:00.000Z"
  },
  "sections": [
    {
      "sectionId": "demo-sec-0",
      "sectionIndex": 0,
      "type": "learning",
      "cefrLevel": "INTRO",
      "cefrSublevel": null,
      "completedUnits": 10,
      "totalUnits": 10,
      "lastSeenAt": "2026-09-29T08:00:00.000Z"
    },
    {
      "sectionId": "demo-sec-2",
      "sectionIndex": 2,
      "type": "learning",
      "cefrLevel": "A1",
      "cefrSublevel": 2,
      "completedUnits": 9,
      "totalUnits": 30,
      "lastSeenAt": "2026-09-29T08:00:00.000Z"
    }
  ]
}
```

- **Respuesta 404 Not Found**:
```json
{
  "ok": false,
  "error": "course not found"
}
```

---

### 2.3 `GET /api/languages/xp`

Devuelve la serie cronológica diaria de actividad del usuario desde `xp_summaries`.

- **Parámetros query**:
  - `userId` *(opcional, string)*.
  - `days` *(opcional, entero, defecto `90`, máx `365`)*: Número de días hacia atrás a recuperar.
  - `order` *(opcional, `"asc"` \| `"desc"`, defecto `"asc"`)*: Orden cronológico por `date`.

- **Respuesta 200 OK**:
```json
{
  "userId": "1000001",
  "days": 90,
  "summaries": [
    {
      "date": 1790121600,
      "gainedXp": 82,
      "numSessions": 4,
      "totalSessionTime": 612,
      "streakExtended": true,
      "frozen": false,
      "repaired": false,
      "updatedAt": "2026-09-29T08:00:00.000Z"
    }
  ]
}
```
