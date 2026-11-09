# Contrato de Ingestión de LinkedIn Games v0.1

Fecha: 2026-10-13  
Módulo: LinkedIn Games Ingestion  
Estado: Borrador (sin implementar; opción A de la evaluación: solo almacenar)  

---

## 1. Contexto y Objetivos

LinkedIn Games no expone API pública. La única fuente es la página de resultados de cada juego (`/games/<juego>/results/`) de una sesión autenticada del propio usuario. Un colector externo (fuera de este repositorio) la lee y envía un snapshot diario. **Descartado el 2026-11-09:** la sesión de LinkedIn no sobrevive a más de un uso desde GitHub Actions y el propietario descartó leer de LinkedIn; el registro es manual, por texto o tabla (L11). Las reglas L5–L9 se conservan como contrato del snapshot.

Objetivo de v0.1: **acumular historia sin pérdida**. No hay backfill posible en la fuente (la página solo muestra el día en curso), así que cada día no capturado se pierde para siempre. Por eso este contrato solo fija el envelope y el almacenamiento; la lectura/observaciones quedan fuera (§6).

---

## 2. Envelope

Se usa el pipeline existente: `POST /api/import` (Bearer de import) → `ingestSnapshot`.

```json
{
  "source": "linkedin-games",
  "userId": "<id estable del usuario en Meridian>",
  "syncId": "uuid-sync-sesion",
  "data": {
    "schema": 1,
    "date": "2026-10-13",
    "tz": "Europe/Madrid",
    "games": {
      "zip":     { "number": 449, "score": "0:08", "scoreSeconds": 8,  "avg": "0:17", "avgSeconds": 17 },
      "pinpoint":{ "number": 530, "score": "3",    "scoreSeconds": null, "guesses": 3,  "avg": "4",    "lost": false },
      "tango":   { "number": null, "unplayed": true }
    }
  }
}
```

---

## 3. Reglas

| Id | Regla |
|---|---|
| L1 | `data.date` (ISO `YYYY-MM-DD`, día local del usuario en `tz`) es **obligatorio** y debe ser una fecha de calendario real. Entra en el checksum (`source\|userId\|data`), de modo que dos días con resultados idénticos no se deduplican entre sí. El servidor lo valida **antes** de calcular el checksum y responde 400 si falta o es inválida (una fecha ausente colapsaría días distintos de forma irrecuperable). |
| L2 | Se conservan **varias versiones** por `(source, user_id, date)` de forma intencionada: el esquema solo impone unicidad sobre `checksum`, no sobre la fecha. Un reintento idéntico se deduplica; una revisión del mismo día (p. ej. un juego pasa de `unplayed` a jugado) produce otra fila. La versión vigente de un día es la de mayor `created_at` y, ante empate, la de mayor `id`. El payload bruto sigue siendo la fuente de verdad. No se afirma ninguna garantía de concurrencia por fuente: dos importaciones simultáneas con contenido distinto se almacenan ambas y la regla anterior decide cuál prevalece. |
| L3 | `score`/`avg` se conservan **como cadena original**; `scoreSeconds`/`avgSeconds` son derivados enteros (juegos de tiempo). Pinpoint usa `guesses`; una derrota es `guesses: 5, lost: true`. |
| L4 | Ausente no es nulo: un juego no presente en `games` significa "no recolectado"; `unplayed: true` significa "recolectado y no jugado". |
| L5 | `avg` es el promedio global del día publicado por LinkedIn, no una estadística propia. |
| L6 | El colector **no** debe visitar la página de un juego sin jugar (puede arrancar su temporizador). Se ancla en un juego ya jugado y lee la lista "play another game". |
| L7 | Si el colector detecta cambio de estructura (ningún juego parseado), **no envía** snapshot vacío: falla con código distinto de cero. |
| L8 | Como la versión vigente de un día es la última (L2), cada captura debe ser el **acumulado del día**, no un juego suelto. Un emisor que capture juego a juego (colector, entrada manual) debe fusionar con la versión vigente antes de enviar; una captura parcial posterior a una completa haría que una lectura vea menos juegos. |
| L9 | Una corrección que devuelve un valor a uno anterior produce un payload idéntico a una versión previa y se deduplicaría por checksum, de modo que la versión vigente seguiría siendo la posterior. Todo emisor que pueda revisar un día debe incluir `capturedAt` (ISO) en `data`. La entrada manual (`PUT /api/me/linkedin-games`) lo hace y no añade versión si nada cambió. |
| L10 | Entrada manual: el servidor lee la versión vigente del día, incorpora un juego (los seis habituales: zip, tango, queens, mini_sudoku, patches, wend; `avg` y `number` opcionales, tiempos `M:SS`) y guarda el acumulado. `userId` es el id interno de Meridian (`users.id`) del propietario de la sesión, no una cuenta de proveedor. La fecha es la de la partida, editable, y el servidor rechaza fechas posteriores al día actual en la zona horaria enviada por el cliente (`tz`); si falta o no es válida, se tolera hasta UTC+14 para no rechazar una fecha legítima en el cambio de día. `capturedAt` se genera una vez por operación: un reintento que ya tuvo éxito encuentra los juegos sin cambios y no añade versión. Al corregir un juego se actualiza lo enviado y se conserva el resto: un `avg` o `number` vacío nunca borra el valor guardado, y los metadatos de otra captura se mantienen. No hay forma de borrar un campo en v0.1. Pinpoint y CrossClimb quedan fuera hasta decisión expresa. |
| L11 | Importación por texto (2026-11-09): `POST /api/me/linkedin-games/import` con `{ text, today, tz?, apply? }` (sesión de propietario + mismo origen, como L10; el token de importación solo NO vale). El texto es una línea por juego (`Z, 6, 12`: inicial o nombre, segundos o `M:SS` propios, media opcional), con líneas de fecha opcionales (`AAAA-MM-DD`, `hoy`, `ayer`), o una tabla CSV/TSV/Markdown con columnas `Fecha`, `Juego`, `Mi_seg`, `Media_seg`. Gana lo importado sobre lo guardado para los juegos mencionados; el resto del día se conserva y una media ausente no borra la guardada (L10). Una versión acumulada por fecha cambiada (L8); lo que no cambia no añade versión. Validación todo o nada: cualquier línea inválida (juego desconocido, fecha futura o imposible, tiempo o media no válidos; una media dada nunca se descarta en silencio) no escribe nada y se devuelve con su número de línea. La escritura es una versión por fecha y **no es atómica**: si una falla, las anteriores quedan guardadas; repetir la misma importación la completa sin duplicar (lo ya guardado sale «igual»). El CSV admite comillas (`"a, b"`, `""`). `apply: false` (por defecto) solo responde qué cambiaría. Pinpoint y Crossclimb se rechazan como juego desconocido hasta decisión expresa (L10). |
| L12 | Exportación y perfil por día (2026-11-09): `GET /api/me/linkedin-games/export.csv` (sesión de propietario) devuelve una línea por juego jugado con `fecha,juego,miseg,mediaseg` (segundos; media vacía si no hay), las columnas que L11 lee: exportar e importar a un almacén vacío reproduce lo mismo. El resumen añade `weekdays` (lunes = 0 … domingo = 6; todos los juegos juntos, histórico completo: `n`, `eff`, `beat`); la pantalla no dice nada de un día con menos de 8 partidas. |

---

## 4. Comportamiento del pipeline (verificado solo por lectura de código)

- `ingestSnapshot` solo ramifica por `duolingo-lang`; cualquier otra fuente cae en la rama de chess: `extractMatches` devuelve 0 partidas, no escribe en `matches`.
- Se guarda la fila de `snapshots` con `raw_json`, `games_count = 0`, `pages_count = 0`.
- `extractObservations` devuelve observaciones vacías para fuentes desconocidas.
- Verificado por `tests/linkedinGamesIngest.test.ts` (sin cambios en el pipeline salvo la validación de `data.date`, L1): el payload se almacena, `observeSchema`/`recordObservations` lo toleran, y no cambian `matches`, observaciones, `user_state` ni `courses`.
- Verificado a nivel HTTP: `POST /api/import` con Bearer de import y `GET /api/snapshots` con sesión de propietario (el Bearer solo no basta para la lectura). El dashboard (UI) no se ha comprobado.

---

## 5. Pruebas de aceptación (implementadas en `tests/linkedinGamesIngest.test.ts`)

- `shouldStoreSnapshotWithoutMatchesOrObservationsWhenSourceIsLinkedinGames`.
- `shouldNotDeduplicateWhenSameResultsOnDifferentDates`.
- `shouldDeduplicateWhenSamePayloadIsRetried`.
- `shouldStoreANewSnapshotWhenAGameGoesFromUnplayedToPlayed` (y la versión vigente por `created_at` contiene el resultado jugado).
- `shouldRejectWhenDateIsMissingOrNotARealCalendarDate`.
- `shouldAcceptViaImportTokenAndListViaOwnerSessionWhenSourceIsLinkedinGames` (HTTP).
- `shouldNotChangeChessOrLanguageStateWhenLinkedinSnapshotIngested`.

---

## 6. Fuera de alcance (v0.1)

- Validación del resto del envelope: `tz`, `schema` y `games` **no** se validan en el servidor (decisión deliberada). La fuente no tiene backfill y `raw_json` es la verdad: rechazar una captura ligeramente malformada pierde ese día, mientras que almacenarla la deja recuperable. La defensa contra capturas vacías es L7, en el colector.
- Garantías de concurrencia por fuente y pruebas de aislamiento por usuario más allá de la no contaminación global (§5).

- Tabla/observaciones `game_results`, migración y vistas: requieren enmienda del modelo de observaciones; se decide cuando haya una lectura concreta que servir.
- Colector (Playwright): repositorio/script aparte. Pendiente una pasada de descubrimiento de las respuestas de red de la página de resultados para saber si hay JSON estructurado (percentil, racha) antes que parsear el DOM.
- Backfill: no existe fuente histórica.
