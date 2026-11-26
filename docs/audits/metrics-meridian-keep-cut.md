# Meridian: keep or cut

## Goal

| Goal | Signal | Metric |
|---|---|---|
| Every surface on screen is one the owner uses | The owner opens it or presses it in daily use | Distinct days with its page view or event in Umami |

## Window

2026-11-27 to 2026-12-14, 18 days. Read on 2026-12-15. Days are counted, not hits.

## Validity

The reading counts only if Umami has page views on 10 or more of the 18 days. Below that, tracking is not capturing the owner's use (content blocker, installed app) and nothing is cut.

## Rule

| Days used | Verdict |
|---|---|
| 3 or more | Keep |
| 1 or 2 | Owner decides: name the question it answered. No question, cut |
| 0 | Cut |

Cut removes the surface from the interface. Stored snapshots and day records stay.

## Surfaces judged

| Surface | Measured by | If cut |
|---|---|---|
| Hoy, register button | event `overview-games-register` | Remove the button; register from Games |
| Qué cambió | views of `/changes` | Remove the screen and its navigation entry |
| Ajedrez | views of `/chess` | Remove from navigation |
| Ajedrez, period chooser | event `chess-period` | One fixed period: 90 days |
| Partidas | views of `/chess/partidas` | Remove the link and the list |
| Game viewer from the player profile | event `engine-game-open` | Remove "Qué partidas revisar" |
| Perfil route | views of `/profile` | Remove the route |
| Games | views of `/games` | Remove from navigation; keep the register |
| Games, period chooser | event `games-period` | One fixed period: 4 weeks |
| Report per game | event `games-open` | Cards stop linking; remove the report |
| Idiomas | views of `/languages` | Remove from navigation |
| Idiomas, period chooser | event `languages-period` | One fixed period: 30 days |
| Course detail | event `languages-course-open` | Rows stop opening; remove the detail |

## Outside the frequency rule

| Item | Verdict |
|---|---|
| Configuración, goal save | Keep: set rarely by nature |
| CSV exports (Ajedrez, Games) | Keep: the way to take the data out |
| Hidden legacy chess blocks (`CHESS_LEGACY`) | Delete: no one can reach them |

## Folded blocks

A tap that opens or closes the block counts. Cut removes the block.

| Block | Event |
|---|---|
| Ajedrez, detail | `chess-detail` |
| Ajedrez, player profile | `chess-profile` |
| Games, weekday table | `games-weekday` |
| Idiomas, detail | `languages-detail` |
| Game report, Más detalle | `report-more` |
| Game report, Cuándo | `report-when` |
| Game report, Cómo de regular | `report-regular` |
| Game report, Cuánto confiar | `report-trust` |

## Opening and saving

| Action | Event | If unused |
|---|---|---|
| Open a game from Partidas | `chess-game-open` | Partidas stops opening the viewer |
| Save results (sheet or quick entry) | `games-save` | Owner decides: the register is the product's Games source |
