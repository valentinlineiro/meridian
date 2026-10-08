# Meridian — operación del Worker

Para volver a operar el Worker tras meses sin tocarlo. Solo describe lo comprobado; lo que no, está marcado **(sin verificar)**.

> La recolección de datos (GitHub Actions, `scripts/collector.sh`) vive en el repositorio del colector y tiene su propio runbook. Este documento cubre el Worker: configuración, despliegue, diagnóstico y recuperación.
> No contiene identificadores de producción a propósito: están en `wrangler.private.jsonc` (local, sin versionar) y en `npx wrangler d1 info meridian`.

## 1. Configuración

| Qué | Dónde |
|---|---|
| Config privada del Worker | `wrangler.private.jsonc` (**sin versionar**, listada en `.git/info/exclude`). Se recrea copiando `wrangler.jsonc` y poniendo el `database_id` de `npx wrangler d1 info meridian`. |
| Config pública | `wrangler.jsonc` (id de D1 ficticio `0000…`) |
| Destino de "Sincronizar" | variables `SYNC_REPO` (`owner/repo`), `SYNC_WORKFLOW` y `SYNC_REF` en `wrangler.private.jsonc`. Sin las tres, `/api/me/sync` responde 503 `SYNC_NOT_CONFIGURED` |
| Todos los comandos de wrangler | llevan `--config wrangler.private.jsonc` |

### Secretos del Worker (`npx wrangler secret list --config wrangler.private.jsonc`)

| Secreto | Para qué |
|---|---|
| `ADMIN_EMAIL` | único correo con acceso |
| `ADMIN_PASSWORD_HASH` | `pbkdf2-sha256$iteraciones$sal$hash`. Se genera con `scripts/hash-password.mjs` (uso en su cabecera; la contraseña no pasa por argv) |
| `SESSION_SECRET` | firma las cookies (≥ 32 bytes). Rotarlo cierra todas las sesiones |
| `IMPORT_TOKEN` | credencial de máquina del collector (escrituras y `pending-details`) |
| `GITHUB_ACTIONS_TOKEN` | PAT que lanza y consulta el workflow del collector (permiso de Actions sobre el repo del colector, `SYNC_REPO`) |

Alta/rotación: `npx wrangler secret put NOMBRE --config wrangler.private.jsonc`.

## 2. Rutina de cambios

```bash
npx tsc --noEmit && npx vitest run && python3 scripts/check_architecture_boundaries.py   # desde un clon de meridian
# si hay migraciones nuevas (aditivas: antes del deploy)
yes | npx wrangler d1 migrations apply meridian --remote --config wrangler.private.jsonc
npx wrangler deploy --config wrangler.private.jsonc
```

- `migrations apply` pregunta confirmación; `yes |` la acepta en no interactivo. Lista antes lo pendiente con `npx wrangler d1 migrations list meridian --remote --config wrangler.private.jsonc`.
- Orden: una migración **aditiva** se aplica antes del deploy (el código viejo la ignora). Una destructiva requeriría otro plan.
- Las pruebas usan SQLite en memoria con las migraciones del repo: toda migración nueva debe añadirse a las listas de `tests/helpers/testDb.ts` y a los tests que montan su propio esquema.
- El deploy no pasa por CI: se hace a mano con `wrangler deploy` desde un clon de este repo (CI solo ejecuta typecheck, guard y tests). `wrangler.private.jsonc` no se versiona: cópialo al clon y mantenlo fuera de git (`.git/info/exclude`).
- Código nuevo: slices verticales (`docs/ARCHITECTURE.md`).

### Despliegue desde GitHub Actions (`.github/workflows/deploy.yml`)

Hace lo mismo que la rutina anterior, pero en CI: typecheck, guarda y tests; genera `wrangler.production.jsonc` (nunca despliega con el `wrangler.jsonc` de ejemplo); se niega a desplegar si hay migraciones pendientes (**no las aplica**, siguen siendo a mano y antes del deploy); despliega y comprueba `/login` 200, `/` 303 y la API cerrada (401). Si el smoke falla, el run queda en rojo: `npx wrangler rollback <version-id> --config wrangler.private.jsonc`.

- Secretos del repo: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`.
- Variables del repo: `SYNC_REPO`, `SYNC_WORKFLOW`, `SYNC_REF` (sin ellas, un deploy apagaría Sincronizar: el workflow se niega) y `PROD_URL`.
- Disparo manual (pestaña Actions, *Run workflow* sobre `main`): siempre permitido.
- Disparo en cada push a `main`: **activo** mientras la variable `CD_AUTO_DEPLOY` valga `true` (desde 2026-10-08). Para apagarlo: `gh variable set CD_AUTO_DEPLOY --body false`.
- Una migración nueva hay que aplicarla a mano **antes** de mergear su código: si no, el paso de migraciones pendientes falla y no se despliega (producción no cambia).


## 3. Si "Sincronizar" falla: qué mirar (todo de solo lectura)

La UI solo dice "Sincronización fallida". El motivo está en otro sitio:

```bash
# 1. ¿Falló el collector? Estado y log del último run
cd <clon del repo del colector>
gh run list --workflow collector.yml --limit 5
gh run view <id> --log | grep -E "ERROR|WARN|restore|Sweep done|hydration:"

# 2. ¿Responde el Worker? (sin sesión: 303 en /, 401 en /api/*)
curl -s -o /dev/null -w "%{http_code}\n" https://<tu-worker>/login        # 200
npx wrangler deployments list --config wrangler.private.jsonc | tail -6   # versión desplegada

# 3. ¿Qué llegó a D1? (SELECT)
npx wrangler d1 execute meridian --remote --config wrangler.private.jsonc --command "SELECT * FROM user_state"
npx wrangler d1 execute meridian --remote --config wrangler.private.jsonc --command \
  "SELECT source,is_auxiliary,sync_id,observed_course_id,created_at FROM snapshots ORDER BY created_at DESC LIMIT 20"
```

Síntomas típicos:

| Síntoma | Causa probable |
|---|---|
| Botón en rojo al instante (respuesta 502 de `/api/me/sync`) | `GITHUB_ACTIONS_TOKEN` caducado o sin permiso; GitHub caído o con límite de peticiones. El Worker **no registra** el motivo: está solo en el cuerpo de la respuesta HTTP |
| 409 "sync already running" | hay un run en curso o en cola (el botón sigue ese run); el workflow tiene `concurrency` y no se solapan |
| Run de GitHub en rojo | log del run: fallo de la fuente (JWT), de la ingesta (token) o de la restauración del curso |
| Run verde pero datos "iguales" | los snapshots idénticos se deduplican (no-op): es normal si no hubo actividad |
| 401 en todo | `SESSION_SECRET` rotado o cookie caducada: volver a entrar |

Comprobaciones de salud de datos (SELECT): huérfanos `matches`↔`snapshots`↔`match_details`, `games_count` vs enlaces, tamaño con `npx wrangler d1 info meridian --config wrangler.private.jsonc`.

## 4. Recuperación

| Situación | Acción |
|---|---|
| Despliegue malo | `npx wrangler rollback <version-id> --config wrangler.private.jsonc` (versiones: `wrangler deployments list`) |
| Dato malo en D1 | D1 Time Travel: `npx wrangler d1 time-travel info meridian --config wrangler.private.jsonc` (disponible, verificado). La restauración **sobrescribe** el estado: anota el bookmark actual antes |
| Pérdida del clon local | El código está en GitHub (este repo). Los datos están en D1. Reconstruir `wrangler.private.jsonc` (§1) y redesplegar |

## 5. Límites conocidos (de la auditoría de 2026-10-05)

- **Capacidad de D1 (plan Free, confirmado por el propietario el 2026-10-05).** Límite de 500 MB por base de datos; tamaño el 2026-10-05: 69,7 MB.
  Crecimiento medido (días completos 26-sep a 2-oct): ≈ 5,4 MB/día de `raw_json` ≈ 6,6 MB/día de base de datos (con índices), con el cron cada 6 h (cambiado a diario el 2026-10-05).
  Cada ejecución aporta ≈ 1,3 MB (13 snapshots de curso de ≈ 74 KB cuando el contenido cambia, más ≈ 0,4 MB de ajedrez cuando hay partidas nuevas; el de cuenta pesa ≈ 18 KB).
  Horizonte hasta 500 MB desde el 2026-10-05: cron 6 h ≈ 65 días (≈ 9 dic 2026); 12 h ≈ 105 días; diario ≈ 180 días (supone ≈ 0,5 sincronizaciones manuales al día).
  **Umbrales** (comprobar con `npx wrangler d1 info meridian --config wrangler.private.jsonc`): a **350 MB** hay que haber decidido y aplicado una medida
  (adelgazar snapshots de curso antiguos, o Workers Paid); a **450 MB**, urgencia. Otros límites Free con margen hoy: filas escritas ≈ 36 k/día (tope 100 k), leídas ≈ 0,76 M/día (tope 5 M).
- **F-06, estado (2026-10-05): estrategia abierta, implementación bloqueada.** Alternativas: (a) compactar eliminando `units`/`levels` tras 30 días (D1 bajo, se pierde el currículo profundo);
  (b) compactar conservando `units`/`levels` (solo quita `xp_summaries` embebido y `matchHistory` de ajedrez: ahorro mucho menor); (c) D1 + almacenamiento de objetos (R2) para el raw completo (conserva todo; más piezas).
  La pregunta de fondo es de producto: ¿se quiere conservar el currículo histórico a nivel de unidad/nivel? Sin R2, segunda BD ni compresión física hasta decidirlo.
  Orden: (1) primer run con actividad real (valida el camino auxiliar, que aún no existe en producción: 14 snapshots, mismo `sync_id`, 1 cuenta + 13 auxiliares, `user_state` solo por la cuenta); (2) ensayo reversible sobre una **copia** midiendo tamaño y resultados de todos los
  consumidores de `raw_json` (what-changed, trayectoria, deltas, `eloRating`, `/api/stats/lang`) con y sin `units`/`levels`; (3) enmienda del contrato (ventana de 30 días explícita si aplica; dependencia del consumidor legacy).
  Nada es elegible antes del 2026-10-23. Decidir y ensayar antes de ≈ finales de enero de 2027 (350 MB).
- La ingesta no es transaccional, pero escribe el snapshot (el que lleva el checksum UNIQUE) **al final**: si falla algo antes, el reintento idéntico no se toma por duplicado y vuelve a aplicar el estado derivado, que es idempotente. Tras un fallo parcial pueden quedar `matches.snapshot_id` / `match_snapshots` apuntando a un snapshot que no llegó a existir y `schema_observations.occurrence_count` inflado: ningún código los lee, no son una garantía de consistencia.
- `course_sections.last_seen_at` no avanza con snapshots deduplicados.
- El Worker no registra los motivos de fallo de `Sincronizar` (solo la respuesta HTTP).
- El dashboard y `/raw` llevan CSP (con `script-src 'unsafe-inline'`: 21 handlers inline), `no-store`, `nosniff` y `X-Frame-Options`; las respuestas JSON de la API siguen sin `Cache-Control` ni `nosniff`.
- La cuenta de Duolingo tiene como curso activo uno de ajedrez (`CHESS_CH` el 2026-10-05): el sweep no lo recorre y la restauración vuelve a él. Es lo esperado al leer el log.
- `wrangler` instalado es 3.114 (hay 4.x disponible); no se ha actualizado.
