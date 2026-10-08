# Diseño: ancla de visita en servidor (P1 #8)

**Estado:** 📝 BORRADOR para decisión del propietario (2026-10-08). **Sin implementar: no hay migración, ni código, ni despliegue.** Es el requisito previo del *digest* ("desde tu última visita"); no es el digest.

**Qué resuelve:** hoy "Desde última visita" es, en la práctica, "los últimos 7 días". Tras este diseño es "desde la última vez que viste los cambios", en cualquier navegador.

---

## 1. Problema (hechos del código)

`fetchWhatChanged` / `markChangesAsSeenNow` (`src/frontend.ts`):

- El ancla vive en `localStorage['lastVisitedAt']`: **por navegador y por dispositivo**.
- **Solo se escribe** al pulsar "Marcar como visto ahora". No avanza sola. Si nunca se pulsa, el modo "Desde última visita" cae a 7 días sin decirlo.
- Se guarda con `new Date()` del **clic**, no con el `until` de la ventana que se estaba viendo: un cambio llegado entre que se pintó la ventana y el clic queda marcado como visto sin haberlo visto.

## 2. Qué es "visita" (decisión central, D1)

| Opción | Cómo avanza el ancla | Problema |
|---|---|---|
| A. Automática al cargar | al abrir el dashboard | **Gasta el ancla**: recargar, o abrir sin leer, borra los cambios que no se han leído. Contradice "no se pierde información". |
| **B. Explícita, en servidor** | solo al pulsar "Marcar como visto" | Requiere un gesto, pero es lo que ya hace el producto. Fiable y multi-dispositivo. |
| C. Implícita diferida | tras N segundos con la vista abierta, o al cerrar | Heurística (N arbitrario), difícil de explicar y de probar. |

**Propuesta: B.** El ancla se llama **`changes_seen_through`**: *"he visto los cambios hasta este instante"*. No dice que el usuario abrió la página, dice qué observaciones ha visto.

Reglas:

1. **Se guarda el `until` de la ventana mostrada**, no la hora del clic. Lo que llegó después sigue siendo "nuevo".
2. **Monótono:** nunca retrocede. Un PUT con un instante ≤ al actual no cambia nada (idempotente). Un PUT en el futuro (> ahora + 5 min de tolerancia de reloj) se rechaza.
3. **Varios navegadores:** el ancla es la **máxima** de lo marcado en cualquiera. Si lo marcas en el móvil, el portátil muestra desde ahí. Una pestaña vieja no puede moverla hacia atrás.
4. **Sin ancla** (primer uso): se muestran 7 días **y se dice**: "Sin visita registrada: mostrando los últimos 7 días". Ya no se hace pasar por "desde última visita".

## 3. Modelo de datos

Una tabla nueva, **aditiva** (D2):

```sql
-- 0016_user_view_state.sql
-- Meridian-owned view state, NOT an observation and NOT a setting. One current value per user, no history.
CREATE TABLE user_view_state (
  user_id              TEXT PRIMARY KEY,   -- provider user id, same key as user_settings
  changes_seen_through TEXT NOT NULL,      -- ISO-8601 UTC
  updated_at           TEXT NOT NULL
) WITHOUT ROWID;
```

- **Tabla separada de `user_settings`:** esa es "lo que el usuario elige"; esto es "lo que el usuario ha visto". Mezclarlas obliga a que cada una respete las reglas de la otra (p. ej. el `CHECK` del objetivo diario).
- **Sin histórico** de marcas (D6): no hay ninguna pregunta de producto que lo necesite. Si algún día la hay, se añade una tabla de eventos; no se anticipa.
- **Escrituras:** 1 fila por marca, solo cuando el instante avanza (`ON CONFLICT … DO UPDATE … WHERE excluded.changes_seen_through > user_view_state.changes_seen_through`). Despreciable frente al presupuesto de D1 medido en P2.
- **Reversible:** `DROP TABLE user_view_state`; el código antiguo no la usa.

## 4. API y arquitectura

Un slice nuevo, **`src/slices/visit-anchor/`**, con la misma forma que `daily-goal` (domain / ports / application / infrastructure / delivery / `module.ts`):

- `GET /api/me/changes-anchor` → `{ ok: true, seenThrough: string | null }`
- `PUT /api/me/changes-anchor` con `{ seenThrough: string }` → `{ ok: true, seenThrough }` (el valor **resultante**, que puede ser el anterior si el PUT era más viejo).
- Dominio: un value object `SeenThrough` (ISO válido, no futuro). Errores de dominio con `code` estable, mapeados en `src/api/errors.ts`.
- **Política de rutas:** el `PUT` debe añadirse a `IDENTITY_WRITE` en `src/api/router.ts` (si no, caería en la rama de token de máquina: cerrado por defecto). Sesión del propietario + same-origin, como `/api/me/settings`.
- **Identidad:** `ProviderAccountLookup` propio del slice (los slices no se importan entre sí), igual que `daily-goal`.

## 5. Frontend

- "Desde última visita" pide el ancla al servidor; `since = ancla ?? ahora − 7 días`.
- La cabecera de la vista dice cuál de los dos casos es, con la fecha en formato legible.
- **"Marcar como visto"** envía el `until` **de la respuesta que se está mostrando** y, tras el éxito, vuelve a pintar (estado vacío: "Nada nuevo desde …").
- **Cuándo se ofrece el botón (D4):** solo si la ventana mostrada cubre todo lo no visto, es decir, en modo "Desde última visita" o cuando `since ≤ ancla`. Si no, mirar 7 días con 20 sin ver y pulsar "visto" saltaría 13 días sin verlos.
- Los botones de 7 y 30 días **no** mueven el ancla.
- **Migración de `localStorage` (D3):** si el servidor no tiene ancla y `lastVisitedAt` existe, se sube una vez y se borra la clave. Si el servidor ya tiene ancla, se ignora y se borra.

## 6. Qué no cambia

`/api/what-changed` (siguen siendo `since`/`until`), las evaluaciones, los contratos de señales, los umbrales y el resto de superficies. El ancla solo decide el `since` que pide el cliente.

## 7. Orden de despliegue y riesgos

- **Migración antes que código** (la tabla es aditiva: el código actual no se rompe sin ella; el código nuevo sí necesita la tabla). El CD no aplica migraciones: se aplica `0016` a mano, **con aprobación explícita**, y después se mergea.
- Riesgo de reloj: la tolerancia de 5 min (§2.2) evita rechazar marcas legítimas por desfase.
- **Demo local:** el seed no crea `user_identities` / `user_provider_accounts`, por eso `/api/me/settings` devuelve 404 en el demo. Para probar este slice en el navegador hay que sembrar la identidad del propietario del demo (cambio de `demo/seed.ts`, sin tocar producción).

## 8. Tests previstos

- **Unit** (dominio y casos de uso reales, fakes de los puertos): `SeenThrough` rechaza fechas inválidas y futuras; avanzar actualiza; retroceder/igual no cambia y devuelve el valor vigente; sin cuenta de proveedor → no encontrado.
- **Integración** (HTTP al worker con SQLite real): GET sin ancla → `null`; PUT y GET; PUT más viejo no retrocede; PUT futuro → 400; sin sesión → 401; sin same-origin → 403.
- **Frontend:** `since` sale del servidor; sin ancla dice "Sin visita registrada…"; el botón envía el `until` mostrado; el botón no aparece en una ventana que no cubre lo no visto; migración única de `localStorage`.
- Guardia de arquitectura (`check_architecture_boundaries.py`) y nombres `shouldXWhenY`.

## 9. Decisiones para el propietario

| ID | Pregunta | Propuesta |
|---|---|---|
| **D1** | ¿Qué es "visita"? | Marca **explícita** en servidor (B), con el `until` mostrado y monótona. Se descarta el avance automático (A) y el diferido (C). |
| **D2** | ¿Dónde se guarda? | Tabla nueva `user_view_state`, no una columna de `user_settings`. |
| **D3** | ¿Qué pasa con `localStorage['lastVisitedAt']`? | Migración única al servidor y borrado de la clave. |
| **D4** | ¿Cuándo se ofrece "Marcar como visto"? | Solo si la ventana mostrada cubre todo lo no visto. |
| **D5** | ¿Qué se muestra sin ancla? | 7 días, diciéndolo, en lugar de aparentar "desde última visita". |
| **D6** | ¿Histórico de marcas? | No. Un valor vigente por usuario. |

## 10. Después de #8

El *digest* (home "desde tu última visita") **no** entra aquí. Se decide con la evidencia de producción de las evaluaciones y con #8 ya funcionando, no antes.
