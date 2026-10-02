# Contrato de Transición Longitudinal: Languages (#16.9)

**Fecha:** 2026-09-29  
**Módulo:** Languages Longitudinal Analysis (`#16.9`)  
**Estado:** 🔒 **VALIDATED & FROZEN ($t_0 \to t_1 \to t_2$)**  
**Propósito:** Definir las reglas formales, contratos de datos e invariantes para comparar observaciones sucesivas ($t_n \to t_{n+1}$) del currículum y progreso lingüístico sin alterar la ontología ni asumir dinámicas causales.

---

## 1. Principio Fundamental de Observabilidad

Un análisis longitudinal genuino requiere que **el sistema de referencia sea observable antes de interpretar el cambio**.

No todo delta numérico representa avance de aprendizaje:
* Si la plataforma reestructura un curso, el árbol curricular muta.
* La comparabilidad de progreso ($\Delta completedUnits$) está condicionada a la invariancia de la métrica total del marco curricular ($\Delta totalUnits = 0$).

---

## 2. Definición Formal de Transición de Curso ($t_n \to t_{n+1}$)

Para cada curso $c \in C$ observado en snapshots de auxiliary sucesivos $S(t_n)$ y $S(t_{n+1})$:

### 2.1. Métricas Primarias de Entrada

* $totalUnits(c, t)$: Total de unidades reportadas en `pathSectioned` del curso $c$ en el instante $t$.
* $completedUnits(c, t)$: Unidades marcadas como completadas en `pathSectioned` en el instante $t$.
* $courseXP(c, t)$: XP acumulado reportado en el catálogo de cursos para $c$ en el instante $t$.

### 2.2. Reglas de Comparabilidad y Evaluación Curricular

$$\Delta totalUnits(c) = totalUnits(c, t_{n+1}) - totalUnits(c, t_n)$$

$$\Delta courseXP(c) = courseXP(c, t_{n+1}) - courseXP(c, t_n)$$

$$\text{status}(c) = \begin{cases} 
\text{"comparable"} & \text{si } \Delta totalUnits(c) = 0 \\
\text{"structural\_change"} & \text{si } \Delta totalUnits(c) \neq 0 \\
\text{"insufficient\_observation"} & \text{si } c \notin S(t_n) \lor c \notin S(t_{n+1})
\end{cases}$$

$$\Delta completedUnits(c) = \begin{cases} 
completedUnits(c, t_{n+1}) - completedUnits(c, t_n) & \text{si } \text{status}(c) = \text{"comparable"} \\
\text{null} & \text{si } \text{status}(c) \neq \text{"comparable"}
\end{cases}$$

> [!IMPORTANT]
> **Invariante Curricular:** Si $\text{status}(c) = \text{"structural\_change"}$, el valor de $\Delta completedUnits(c)$ debe ser estrictamente `null`. Queda prohibido calcular o interpretar deltas de avance cuando el marco de unidades del curso ha cambiado entre observaciones.

---

## 3. Contrato de Actividad Diaria (`xp_summaries`)

La actividad diaria registrada en `xp_summaries` procede de la observación de actividad a nivel de cuenta:

```text
xp_summaries: (userId, date) -> { gainedXp, numSessions, totalSessionTime, streakExtended, frozen, repaired }
```

### Reglas de Integración Temporal:

1. **Unicidad de fechas:** Al procesar $t_{n+1}$, únicamente se incorporan fechas (`date`) no observadas previamente o se actualiza el día en curso si la sesión continuó en la misma jornada.
2. **Aislamiento ontológico de cuenta:** La actividad registrada en `xp_summaries` es estrictamente a **nivel de cuenta**. Queda prohibido:
   * Prorratear `gainedXp`, `numSessions` o `totalSessionTime` entre los cursos activos.
   * Modificar el esquema para forzar un atributo `course_id` artificial en `xp_summaries`.
3. **Reconciliación descriptiva vs ontológica:** Si en un intervalo $t_n \to t_{n+1}$ el incremento de XP de cuenta coincide con el incremento de XP de un curso específico, se documenta como *reconciliación empírica observada*, pero ambas fuentes conservan su separación ontológica.

---

## 4. Clasificación de Fases Temporales

```text
       t₀ (Baseline)
             │
             ▼
       t₁ (Primera transición) ───► Comparación puntual de fotografías
             │
             ▼
       t₂ (Segunda transición) ───► Comienzo de serie longitudinal (distinción entre
                                     evento aislado y dinámica recurrente)
```

1. **Fotografía puntual ($t_0 \to t_1$):** Permite verificar la estabilidad del marco, la comparabilidad curricular y la presencia o ausencia de actividad en la ventana inmediata.
2. **Serie longitudinal ($t_0 \to t_1 \to t_2 \dots \to t_n$):** Permite estimar dinámicas de hábito, alternancia entre cursos, distribución temporal de sesiones y tendencias sin asunciones causales.
