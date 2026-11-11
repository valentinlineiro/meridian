# Fase 3 — calibración offline del diagnóstico

Genera `diagnosis-thresholds.json` (el artefacto) a partir de la exportación de resultados del propietario. **Los datos de entrada no se versionan**
(son personales); el artefacto solo contiene estadísticos de réplicas de permutación, no filas.

    # 1. la exportación, con la sesión del propietario (solo lectura): GET /api/me/linkedin-games/export.csv  -> fecha,juego,miseg,mediaseg
    # 2. guardarla FUERA del repositorio y calibrar
    python3 calibrate.py /ruta/fuera/del/repo/export.csv /ruta/salida
    python3 calibrate.py --selftest        # datos sintéticos: comprueba el esquema y las reglas

Escribe `diagnosis-thresholds.json` (por juego: qué dimensiones son evaluables y las `R = 1000` réplicas conjuntas de `(día, regularidad)`)
y `calibration-summary.json` (por juego: evaluabilidad, p ajustado de hoy y estabilidad semanal de la regla sobre el histórico).
Determinista para una exportación y una entropía dadas (`ENTROPY` en el script). `calibrate.py` reutiliza `joint_null` de
`../linkedin-games-phase3-simulation/sim_absence.py`, la misma transformación que se validó. Informe: `report.md`.
