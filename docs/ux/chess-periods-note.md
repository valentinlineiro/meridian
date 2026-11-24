# Ajedrez por periodos (nota de UX)

Diseño: `docs/superpowers/specs/2026-11-24-chess-periods-design.md`. Plan: `docs/superpowers/plans/2026-11-24-chess-periods.md`.

**Qué responde cada bloque** (palabras del dueño): mi ELO actual, mi tendencia de ELO, mis puntos fuertes y débiles, estadísticas por color, qué aperturas me funcionan mejor, qué finales (hoy: partidas largas) y mi perfil de jugador. Las partidas, en un submenú.

**Qué dicen los datos y qué no**
- "Partidas largas" son las de más de 80 jugadas (`classifyPhase`), no un final jugado; el tipo de final no está en los datos.
- El ELO de una semana es el último `elo_after` o, si falta, el de la última instantánea de esa semana. Los bots no guardan `elo_after`.
- Cada punto muestra su porcentaje y su n; con menos de 8 partidas no se clasifica.
- El perfil del motor no sigue el periodo: su `since` es una partida de corte, no una fecha.

**Accesibilidad:** los números están escritos junto a cada barra, así que la lista es su propia tabla; la línea de ELO lleva una tabla de datos desplegable.

**Pendiente:** retirar el DOM antiguo oculto tras la revisión de Umami; un perfil filtrado por fechas sería un cambio de backend.
