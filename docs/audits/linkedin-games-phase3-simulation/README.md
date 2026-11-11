# Fase 3 — comprobación del procedimiento con datos sintéticos

Solo datos sintéticos: **no lee producción**. Comprueba que el procedimiento de
`docs/superpowers/specs/2026-11-11-games-report-phase3-methodology.md` (§3-§4) mantiene su 5 % cuando debe y cuánto detecta cuando hay un efecto.

    python3 sim.py 5000 1000 0.05 20261111   # la propuesta (día de la semana + regularidad); escribe results_a0.05.json
    python3 sim.py 5000 1000 0.025 424242    # la corrección pre-registrada, con otra semilla; escribe results_a0.025.json

    python3 sim_absence.py 2000 1000 0.05 20261111   # semanas con huecos (regla de la misma máscara); escribe results_absence_a0.05.json

Requiere `numpy`. ~1,5 min cada una (4 procesos). Cada resultado lleva el intervalo de Wilson al 95 %. Dos flujos de semillas independientes: uno para los conjuntos de datos y otro para las
réplicas de permutación. Cada conjunto ejecuta el procedimiento completo (sus propias réplicas, su propio umbral).

Escenarios: W0 ruido puro; W1 solo asociación día-resultado; W2 semanas autocorrelacionadas (ρ 0,6); W3 W1+W2; W4 día concreto
sembrado; W6 aumento de la dispersión en las últimas 8 semanas; W7 estrés (ρ 0,9). Sin tendencia (no compite, ver §3.6 de la metodología).

Lectura de `results_*.json`: `any` = algún hallazgo; `false_in_null_dimension` = hallazgo atribuido a una dimensión cuya verdad es nula
en ese escenario; `power` = hallazgo en la dimensión con efecto sembrado. Cada tasa: [valor, [límite inferior, límite superior]].

Exploración previa (no guardada como fichero): con tendencia y semanas sueltas el falso hallazgo en tendencia con ρ 0,6 es ≈ 8-9 %;
con bloques de 4 semanas baja a ≈ 4 % pero la potencia de tendencia cae de ≈ 12 % a 2-4 %. De ahí que la tendencia no compita.
