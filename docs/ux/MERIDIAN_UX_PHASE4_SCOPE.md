# Fase 4 — Integración global: alcance y criterios de aceptación

**Fecha:** 2026-11-05 · **Base:** `main` 2cff5b7 · **Rama:** `feat/ux-phase4-integration`

## Origen

Auditoría de integración sobre `main` (datos demo, capturas locales) y validación de solo lectura contra producción
(SQL agregado, sin escrituras, sin Neon). Hechos de producción usados (corte 2026-11-04): 1.683 partidas, 1.650 contra bots y 33 PvP;
blancas 596 victorias en 922 partidas y negras 450 en 761 (tablas incluidas, como las muestra el panel; +5,5 pp, IC95 [+0,9; +10,2]); racha de Duolingo 1.117 días; Games con 170 días, último registro 2026-11-03; el
último curso que reporta Duolingo (`CHESS_CH`) no existe en la tabla `courses`.

## Regla de la fase

Corregir lo que la evidencia demuestra; no afirmar certezas donde no hay observación. Presentación y semántica, sin backend,
sin migraciones, sin contratos de evaluación (`whatChanged`, `trajectory`): las métricas que se necesitan (`diffCiLower`,
`diffCiUpper`, `status`, `reasons`, `criteria`) ya viajan en cada evaluación.

## Validación en producción (2026-11-05)

Al redactar este alcance no había sesión en producción y solo existía evidencia SQL y reproducción local (el acceso es el
`/login` propio de Meridian, con cookie de sesión; no Cloudflare Access, como decía una versión anterior de este texto).
Tras el despliegue de la PR #100 y de la PR #101 (`91e3cdc`), con una sesión abierta por el propietario y **solo lecturas**,
se comprobó en producción, a ancho de escritorio:

- Portada: «Duolingo · 🔥 1117 días de racha» sin `CUENTA`; Games con «Sin registro desde 2026-11-03» y tarjeta en «Tu semana»;
  cabecera «Actualizado» oculta fuera de Ajedrez; `CHESS_CH` no aparece.
- Idiomas: curso por defecto Russian EN, línea de sincronización sin id crudo, 13 cursos distinguidos por idioma de origen y
  destino, nota «El total de la cuenta supera en 260.607 XP la suma de los 13 cursos del catálogo…», título «Tus cursos»
  separado de su contador, sin desbordamiento horizontal.
- Ajedrez, Trayectoria y Qué cambió: «Diferencia detectable: sí (+5,5 pp · IC95 [+0,9; +10,2] pp)» y «Patrón persistente: no
  demostrado» (Trayectoria: SIN INDICIO con el resumen de diferencia detectable).

**No comprobado:** el ancho móvil en producción (390 px solo se midió con datos demo locales), Safari y Chrome móvil reales, y
las comprobaciones de la portada en producción no incluyeron capturas de móvil. La nota del XP total no se atribuye a ningún
curso concreto: es una diferencia observada, no una causa verificada.

## Cambios

| # | Cambio | Criterio de aceptación |
|---|---|---|
| 1 | Último curso de Duolingo | Se muestra (portada y línea de sincronización de Idiomas) solo si el id pertenece al catálogo de Idiomas; nunca un id crudo. |
| 2 | Racha | La portada dice `Duolingo · N días de racha`, con la antigüedad del dato si la sincronización tiene más de 2 días; ya no lleva la etiqueta `CUENTA`. |
| 3 | Games, último registro | Con racha 0 se muestra `Sin registro desde <fecha>` (portada y Games) y la racha máxima; nunca `0 días seguidos`. |
| 4 | Games en «Tu semana» | Tercera tarjeta con registros por día en 7 días, calculados con los datos que ya llegan (`trajectory["7"]`). Sin backend. |
| 5 | Color: dos conclusiones | Componente compartido (Ajedrez, Trayectoria, Qué cambió): «Diferencia detectable: sí/no (IC95)» y «Patrón persistente: sí / no demostrado». No se usa `INSUFICIENTE` cuando el intervalo ya detecta la diferencia. |
| 6 | Ajedrez: un reparto | El hero muestra la tasa histórica (no la de la ventana de Forma actual) y `N de M partidas contra bots`. Se retiran los KPI que repiten ELO y % de victorias. Cada métrica conserva una ubicación principal; las ventanas 20/50/100 viven en «Forma actual». |
| 7 | Cabecera | `Actualizado …` la escribe Ajedrez: solo se muestra en la vista de Ajedrez y dice «Ajedrez · actualizado …». |
| 8 | Navegación | Una entrada por dominio: `Ajedrez`, `Idiomas`, `LinkedIn Games`. «Perfil» y «Exportar partidas» salen del menú y pasan a acciones contextuales en Ajedrez; `/profile` sigue funcionando. |
| 9 | Evidencia de ajedrez | Se mantiene la partida sugerida y los filtros. Se aclara que «peores» ordena por pérdida media por jugada; los errores graves son información adicional. |

## Fuera de alcance

Games en «Qué cambió» y Trayectoria (probablemente toca contratos), nuevas métricas, nuevas páginas, cambios de backend,
Neon, producción, merge.

## Verificación

`npm test`, `npm run typecheck`, Playwright en escritorio (1440×900) y móvil (390×844) con datos demo locales; después, lectura
de producción como se describe arriba.
