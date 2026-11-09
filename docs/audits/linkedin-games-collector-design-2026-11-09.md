# Diseño: colector de LinkedIn Games (2026-11-09)

Estado: borrador para revisión. Sin código. D1 y D2 resueltas el 2026-11-09 (§8). Parte del contrato `docs/contracts/2026-10-13-linkedin-games-ingestion-contract.md` (L1–L10), que ya prevé "un colector externo".

## 1. Objetivo y decisión de riesgo
Registrar los resultados diarios sin teclearlos, con el mismo patrón que el colector de Duolingo (programado, sin intervención). El propietario eligió este camino conociendo el riesgo:
- LinkedIn no tiene API para Games. La única fuente es la página `/games/<juego>/results/` de una sesión autenticada.
- El User Agreement (§8.2: "scripts, robots… crawlers, browser plugins"; §13: "bots or other unauthorized automated methods") lo prohíbe, y §3.4 permite restringir o cerrar la cuenta. El riesgo recae sobre la cuenta real del propietario. Decisión aceptada el 2026-11-09. Que otro autor publique una herramienta similar (Brian Lutz, `robertblutz/linkedin-games-data-collector`, sin licencia) no es permiso de LinkedIn. **No se copia su código.**
- Alternativa sin riesgo, siempre disponible: entrada manual (A1/A2, aparte).

## 2. Arquitectura (espejo de Duolingo)
| Pieza | Duolingo (hoy) | LinkedIn Games |
|---|---|---|
| Repo | `meridian-collector` (privado) | el mismo |
| Workflow | `collector.yml` | `linkedin-games.yml` nuevo |
| Cron | declarado pero inerte hasta `vars.COLLECTOR_SCHEDULE == 'enabled'` | igual, con `vars.LINKEDIN_GAMES_SCHEDULE` |
| Disparo manual | `workflow_dispatch` ("Sync now") | igual |
| Concurrencia | `group` único, sin cancelar | igual (`linkedin-games-collector`) |
| Secreto de origen | `DUOLINGO_JWT` | `LINKEDIN_LI_AT` (cookie de sesión; nunca la contraseña) |
| Destino | `POST /api/snapshot` con `MERIDIAN_IMPORT_TOKEN` | igual, `source: "linkedin-games"` |
| Servidor | sin cambios previstos | sin cambios previstos: la ingesta y la validación de `data.date` (L1) ya existen |

Flujo: abrir el resultado de un juego ya jugado (ancla) → leer la lista de los demás (L6) → leer los jugados → construir **el acumulado del día** (L8) → `POST` con `data: { schema: 1, date, tz, games }`.

## 3. Reglas del colector
| Id | Regla |
|---|---|
| C1 | Solo captura el día en curso: la fuente no tiene historia (contrato §1). Un día no capturado se pierde. |
| C2 | Nunca abre la página de un juego sin jugar (L6): puede arrancar su temporizador y falsear el resultado. Si una página redirige fuera de `/results/`, el juego se omite. |
| C3 | Si no se parsea ningún juego, **no envía** y sale con código distinto de cero (L7). |
| C4 | Solo los seis juegos de Meridian (zip, tango, queens, mini_sudoku, patches, wend). Pinpoint y Crossclimb quedan fuera (L10). |
| C5 | Sin `capturedAt`: el reenvío idéntico se deduplica por checksum. Si la media global cambia durante el día, es una versión nueva legítima (la vigente es la última, L2). |
| C6 | Sesión caducada o cuestionada (redirige a `/login`, `/checkpoint` o CAPTCHA): sale con código 3, **sin reintentar** (reintentar aumenta el riesgo para la cuenta). |
| C7 | La cookie nunca se imprime (`::add-mask::`); sin contraseña ni 2FA automatizado. |

## 4. Calendario
Dos ejecuciones al día cerca del final del día local (no hay backfill, así que una sola pasada fallida pierde el día). El cron de Actions va en UTC: se programan dos horas y el script sale con 0 si la hora local no cae en la ventana, para tolerar el cambio de horario. La media global cambia durante el día; capturar tarde da una media más estable. Un fallo del workflow avisa por el correo normal de GitHub.

## 5. Riesgos técnicos
1. **IP de datacenter.** Usar la cookie `li_at` desde un runner de GitHub (otra IP, otro país) puede provocar un `checkpoint` e invalidar la sesión. Es el mayor riesgo y no se puede evaluar sin probarlo. Con Duolingo, Cloudflare recibió un 403 con las mismas credenciales que desde WSL daban 200 (2026-09-24).
2. **Fragilidad del HTML.** El parseo depende de clases CSS de LinkedIn. Se esperan roturas; C3 y C6 las hacen visibles en lugar de silenciosas.
3. **Precedencia (resuelta, D2).** El colector es la fuente; gana la última versión (L2). No se registra a mano, salvo la importación de un CSV.
4. **Frontera del día.** No se sabe en qué zona horaria cambia el puzzle de LinkedIn. Se verifica con el número de puzzle: el histórico de 170 días ya tiene pares (fecha, número).

## 6. Fase 0: prueba de viabilidad, solo lectura, sin `POST`
Un workflow de un solo uso (`workflow_dispatch`, sin cron) que, desde un runner de Actions, con `li_at`:
- abre el ancla y lista juegos;
- guarda por cada juego el estado HTTP, si hubo redirección, cuántos juegos se parsean y el número de puzzle;
- guarda el HTML **sanitizado** (sin cookies ni datos personales) como fixture.

Criterio de paso: todos los jugados del día parseados, número de puzzle coherente con el histórico, ninguna redirección a `checkpoint`/CAPTCHA, y la sesión sigue válida después.
Criterio de parada: cualquier checkpoint, CAPTCHA o sesión invalidada. Se detiene sin reintentar y el colector pasa a un runner local (cron en WSL) con **el mismo script**. Con Duolingo, WSL funcionó donde la nube no.

## 7. Pruebas (`shouldXWhenY`, con `fakeUpstream` y fixtures de la Fase 0)
- `shouldPostTheAccumulatedDayWhenSeveralGamesWerePlayed`.
- `shouldNotVisitUnplayedGamePages`.
- `shouldFailWithoutPostingWhenNoGameIsParsed`.
- `shouldExitWithCode3WithoutRetryWhenTheSessionIsRedirectedToCheckpoint`.
- `shouldNeverLogTheSessionCookie`.
- `shouldSkipTheRunWhenLocalHourIsOutsideTheWindow`.

## 8. Decisiones abiertas para el propietario
| Id | Pregunta | Propuesta |
|---|---|---|
| D1 | ¿Sigue vigente el congelado legal? | **No vigente** (propietario, 2026-11-09). Ya no bloquea la implementación. |
| D2 | Precedencia manual frente a colector | **Manda el colector** (propietario, 2026-11-09): no se registra a mano, salvo importar un CSV. Gana la última versión (L2); no hace falta leer la versión vigente antes de enviar, así que no hay lectura por token de máquina. El formulario manual (`PUT /api/me/linkedin-games`) queda para decidir su retirada cuando el colector esté activo; la importación de CSV se diseña aparte. |
| D3 | Frontera del día | Resolver con la Fase 0 (número de puzzle frente a histórico). |
| D4 | Runner | Actions primero; local si la Fase 0 falla. |
| D5 | Pinpoint y Crossclimb | Fuera. |

## 9. Fases
0. Fase 0 (sección 6), en `meridian-collector`, sin tocar Meridian.
1. Colector + tests con fixtures, `POST` solo tras pasar la Fase 0, cron inerte.
2. Activar el cron (`vars.LINKEDIN_GAMES_SCHEDULE`) tras una semana de ejecuciones manuales correctas.
3. ~~Lectura por token de máquina~~: descartada por D2.
4. Aparte: importación de CSV (única vía manual) y decidir la retirada del formulario manual.
