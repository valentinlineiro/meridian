# Contrato de Ingestión de LinkedIn Games v0.1

Fecha: 2026-10-13  
Módulo: LinkedIn Games Ingestion  
Estado: Borrador (sin implementar; opción A de la evaluación: solo almacenar)  

---

## 1. Contexto y Objetivos

LinkedIn Games no expone API pública. La única fuente es la página de resultados de cada juego (`/games/<juego>/results/`) de una sesión autenticada del propio usuario. Un colector externo (fuera de este repositorio) la lee y envía un snapshot diario.

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
| L1 | `data.date` (ISO, día local del usuario en `tz`) es **obligatorio**. Entra en el checksum (`source\|userId\|data`), de modo que dos días con resultados idénticos no se deduplican entre sí. |
| L2 | Un snapshot por día y usuario. Re-ejecuciones con datos idénticos se deduplican por checksum; si un juego pasa de `unplayed` a jugado, el nuevo contenido produce otro snapshot (la lectura futura toma el más reciente por `date`). |
| L3 | `score`/`avg` se conservan **como cadena original**; `scoreSeconds`/`avgSeconds` son derivados enteros (juegos de tiempo). Pinpoint usa `guesses`; una derrota es `guesses: 5, lost: true`. |
| L4 | Ausente no es nulo: un juego no presente en `games` significa "no recolectado"; `unplayed: true` significa "recolectado y no jugado". |
| L5 | `avg` es el promedio global del día publicado por LinkedIn, no una estadística propia. |
| L6 | El colector **no** debe visitar la página de un juego sin jugar (puede arrancar su temporizador). Se ancla en un juego ya jugado y lee la lista "play another game". |
| L7 | Si el colector detecta cambio de estructura (ningún juego parseado), **no envía** snapshot vacío: falla con código distinto de cero. |

---

## 4. Comportamiento del pipeline (verificado solo por lectura de código)

- `ingestSnapshot` solo ramifica por `duolingo-lang`; cualquier otra fuente cae en la rama de chess: `extractMatches` devuelve 0 partidas, no escribe en `matches`.
- Se guarda la fila de `snapshots` con `raw_json`, `games_count = 0`, `pages_count = 0`.
- `extractObservations` devuelve observaciones vacías para fuentes desconocidas.
- Verificado por `tests/linkedinGamesIngest.test.ts` (5 pruebas, sin cambios en código de producción): el payload se almacena, `observeSchema`/`recordObservations` lo toleran, y no cambian `matches`, observaciones, `user_state` ni `courses`.
- Sigue sin verificar: que las vistas de lectura (p. ej. la lista de snapshots del dashboard) se comporten bien con una fuente nueva; no se comprobó a nivel HTTP/UI.

---

## 5. Pruebas de aceptación (implementadas en `tests/linkedinGamesIngest.test.ts`)

- `shouldStoreSnapshotWithoutMatchesOrObservationsWhenSourceIsLinkedinGames`.
- `shouldNotDeduplicateWhenSameResultsOnDifferentDates`.
- `shouldDeduplicateWhenSamePayloadIsRetried`.
- `shouldStoreANewSnapshotWhenAGameGoesFromUnplayedToPlayed`.
- `shouldNotChangeChessOrLanguageStateWhenLinkedinSnapshotIngested`.

---

## 6. Fuera de alcance (v0.1)

- Tabla/observaciones `game_results`, migración y vistas: requieren enmienda del modelo de observaciones; se decide cuando haya una lectura concreta que servir.
- Colector (Playwright): repositorio/script aparte. Pendiente una pasada de descubrimiento de las respuestas de red de la página de resultados para saber si hay JSON estructurado (percentil, racha) antes que parsear el DOM.
- Backfill: no existe fuente histórica.
