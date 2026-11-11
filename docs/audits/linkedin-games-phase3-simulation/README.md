# Fase 3 — comprobación del procedimiento con datos sintéticos

Solo datos sintéticos: **no lee producción**. Comprueba que el procedimiento de
`docs/superpowers/specs/2026-11-11-games-report-phase3-methodology.md` (§3-§4) mantiene su 5 % cuando debe y cuánto detecta cuando hay un efecto.

    python3 sim.py 1000 1000      # dos dimensiones (día de la semana + regularidad): la propuesta; escribe results_2dim.json
    python3 sim.py 1000 1000 3    # añade la tendencia, solo para la comparación; escribe results_3dim.json

Requiere `numpy`. ~1,5 min cada una. Dos flujos de semillas independientes: uno para los conjuntos de datos y otro para las
réplicas de permutación. Cada conjunto ejecuta el procedimiento completo (sus propias réplicas, su propio umbral).

Escenarios: W0 ruido puro; W1 solo asociación día-resultado; W2 semanas autocorrelacionadas (ρ 0,6); W3 W1+W2; W4 día concreto
sembrado; W5 tendencia sembrada; W6 aumento de la dispersión en las últimas 8 semanas.

Lectura de `results_*.json`: `any` es la proporción de conjuntos con algún hallazgo y las tres claves siguientes, a qué dimensión
se atribuyó. Es falso un hallazgo en una dimensión cuya verdad es nula en ese escenario.

Exploración previa (no guardada como fichero): con tendencia y semanas sueltas el falso hallazgo en tendencia con ρ 0,6 es ≈ 8-9 %;
con bloques de 4 semanas baja a ≈ 4 % pero la potencia de tendencia cae de ≈ 12 % a 2-4 %. De ahí que la tendencia no compita.
