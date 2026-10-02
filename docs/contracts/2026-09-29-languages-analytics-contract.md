# Contrato Analítico: Languages Analytics (#16.8)

**Fecha:** 2026-09-29  
**Estado:** Propuesta / v0.1  
**Módulo:** Languages Analytics (`#16.8`)  
**Base Validada:** Cloudflare D1 (`migrations/0008_languages.sql` + `migrations/0009_course_sections_pk.sql`)  

---

## 1. Principios Epistemológicos y Marco de Validez

Este contrato rige la capa de derivación matemática y analítica sobre los datos lingüísticos validados en `#16.7`. Se fundamenta en tres distinciones formales:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. FACT (Hecho directamente observable en D1)                          │
│    Observación empírica registrada en base de datos sin transformación. │
├────────────────────────────────────────────────────────────────────────┤
│ 2. DERIVED (Derivado matemático determinístico)                        │
│    Cálculo reproducible, cerrado y libre de opinión sobre los hechos.  │
├────────────────────────────────────────────────────────────────────────┤
│ 3. INTERPRETATION (Hipótesis o modelo explicativo)                     │
│    Juicio subjetivo o atribución causal. ESTRICTAMENTE NO NORMATIVO.   │
└────────────────────────────────────────────────────────────────────────┘
```

### Invariantes Negativas (Lo que el contrato prohíbe explícitamente concluir)

1. **Aislamiento de Atribución Diaria por Idioma:**  
   `xp_summaries` registra la actividad diaria agregada a nivel de cuenta (`gained_xp`, `num_sessions`, `total_session_time`). La fuente **no desglosa** la actividad diaria por curso.  
   ❌ **PROHIBIDO:** Atribuir sesiones o tiempo diario a un `course_id` específico.
2. **No Prescripción ni Eficiencia Cognitiva:**  
   `xp_per_minute` y `xp_per_session` describen la relación matemática entre el XP de gamificación emitido y el tiempo de interacción registrado por la aplicación.  
   ❌ **PROHIBIDO:** Denominar estas métricas "eficiencia de aprendizaje", "productividad" o inferir que un ratio alto denota mejor retención o calidad de estudio.
3. **No Velocidad de Aprendizaje ni Proyecciones de Finalización:**  
   Las unidades curriculares no son homogéneas ni estables en el tiempo (el árbol de la fuente cambia periódicamente).  
   ❌ **PROHIBIDO:** Calcular "velocidad de avance" (unidades/día), proyectar fechas estimadas de término de curso o estimar probabilidades de abandono.
4. **No Métricas de Fluidez:**  
   El progreso curricular refleja hitos en el grafo de la aplicación.  
   ❌ **PROHIBIDO:** Derivar porcentajes de fluidez comunicativa o dominio del idioma.
5. **Neutralidad de Concentración:**  
   El índice $HHI$ es una medida numérica de concentración histórica.  
   ❌ **PROHIBIDO:** Añadir etiquetas normativas ("disperso", "óptimo", "desbalanceado").

---

## 2. Dimensión de Calidad y Comparabilidad Longitudinal

Para el análisis de progreso entre observaciones temporales ($t_1 < t_2$), cada serie curricular debe clasificarse bajo uno de tres estados obligatorios:

```text
LONGITUDINAL COMPARABILITY STATUS
│
├── 'comparable'
│   Condición: Misma identidad de curso y sección + total_units(t₁) = total_units(t₂)
│   Resultado: ΔcompletedUnits es calculable y matemáticamente válido.
│
├── 'structural_change'
│   Condición: Misma identidad de curso y sección + total_units(t₁) ≠ total_units(t₂)
│   Resultado: Denominador alterado por la fuente (árbol reestructurado). ΔcompletedUnits
│              NO es comparable directamente. Se registra el cambio estructural.
│
└── 'insufficient_observation'
    Condición: No existe snapshot de referencia previo o intervalo insuficiente.
    Resultado: Comparación longitudinal no calculable.
```

---

## 3. Catálogo Canónico de Métricas

### Bloque A: Actividad Temporal

| Métrica | Naturaleza | Fuente D1 | Fórmula Canónica | Unidad | Interpretación Estricta | Qué NO permite concluir |
|:---|:---:|:---|:---|:---:|:---|:---|
| `active_days` | `Derived` | `xp_summaries` | $\sum \mathbf{1}_{\{gained\_xp > 0\}}$ | días | Días con al menos 1 XP registrado en la ventana. | No garantiza profundidad ni calidad de práctica. |
| `calendar_days` | `Derived` | `xp_summaries` | $\frac{\max(date) - \min(date)}{86400} + 1$ | días | Total de días naturales cubiertos por el intervalo. | No es una meta ni una cuota. |
| `activity_density` | `Derived` | `xp_summaries` | $\frac{active\_days}{calendar\_days}$ | ratio $[0, 1]$ | Proporción de días del calendario con actividad. | No califica el "hábito" ni la "consistencia moral". |
| `total_sessions` | `Fact` | `xp_summaries` | $\sum num\_sessions$ | sesiones | Conteo acumulado de sesiones completadas en la app. | No informa la duración de cada sesión individual. |
| `total_reported_time` | `Fact` | `xp_summaries` | $\sum total\_session\_time$ | segundos | Suma de tiempo de sesión reportado por la API. | No es tiempo de estudio fuera de pantalla ni concentración mental. |
| `daily_xp_median` | `Derived` | `xp_summaries` | $\text{Mediana}(gained\_xp)$ | XP/día | Valor central de la distribución diaria de XP. | No es el XP esperado de cualquier día futuro. |
| `daily_xp_iqr` | `Derived` | `xp_summaries` | $Q_3(gained\_xp) - Q_1(gained\_xp)$ | XP/día | Rango intercuartílico de la dispersión de XP diario. | No mide volatilidad anómala por sí sola. |

---

### Bloque B: Intensidad Descriptiva

Se separa con rigor el **ratio agregado global** de la **distribución de ratios diarios**, evitando el sesgo de equiparar la media de ratios con el ratio de sumas:

#### 1. Ratios Globales Agregados (Nivel Periodo)
* **`global_xp_per_session`:**
  $$\bar{XP}_{\text{global}} = \frac{\sum gained\_xp}{\sum num\_sessions}$$
* **`global_seconds_per_session`:**
  $$\bar{T}_{\text{global}} = \frac{\sum total\_session\_time}{\sum num\_sessions}$$
* **`global_xp_per_minute`:**
  $$R_{\text{global}} = \frac{\sum gained\_xp}{\sum total\_session\_time / 60}$$

#### 2. Distribución de Ratios Diarios (Nivel Día)
* **`daily_xp_per_session_median`:** $\text{Mediana}(gained\_xp_t / num\_sessions_t)$.
* **`daily_seconds_per_session_median`:** $\text{Mediana}(total\_session\_time_t / num\_sessions_t)$.
* **`daily_xp_per_minute_median`:** $\text{Mediana}(gained\_xp_t / (total\_session\_time_t / 60))$.

---

### Bloque C: Perfil Descriptivo por Día de la Semana

Para cada día de la semana $d \in \{0..\text{Domingo}, 1..\text{Lunes}, \dots, 6..\text{Sábado}\}$:
* **Muestras:** $N_d$ (días observados correspondientes a ese weekday).
* **Estadísticos de orden:** $\text{Mediana}(XP)_d$, $\text{IQR}(XP)_d$, $\text{Mediana}(Ses)_d$, $\text{IQR}(Ses)_d$, $\text{Mediana}(Time)_d$, $\text{IQR}(Time)_d$.
* **Regla estricta:** La salida es un perfil descriptivo de la ventana observada. **No se declara ningún "día óptimo" ni causalidad.**

---

### Bloque D: Concentración Histórica de Cursos

* **Población:** Cursos lingüísticos en tabla `courses`.
* **Fuente:** `courses.xp` (XP vitalicio acumulado del curso en la cuenta).
* **`lifetime_linguistic_xp`:** $\sum_{c \in \text{courses}} c.xp$.
* **`course_xp_share`:**
  $$P_i = \frac{courses.xp_i}{lifetime\_linguistic\_xp} \times 100$$
* **`hhi_concentration`:**
  $$HHI = \sum_{i=1}^{N} \left(\frac{courses.xp_i}{lifetime\_linguistic\_xp}\right)^2$$
* **`effective_course_count`:**
  $$N_{\text{eff}} = \frac{1}{HHI}$$
* **`top3_share`:** Cuota conjunta acumulada por los 3 cursos principales.

---

### Bloque E: Estructura y Progreso Curricular

* **`course_completed_units`:** $\sum_{s \in \text{sections}} s.completed\_units$.
* **`course_total_units`:** $\sum_{s \in \text{sections}} s.total\_units$.
* **`course_completion_ratio`:**
  $$R_{\text{progreso}} = \frac{course\_completed\_units}{course\_total\_units}$$
  *(Expresado como ratio exacto; no proyecta tiempo ni lecciones restantes).*
* **`cefr_breakdown`:** Tabla descriptiva de unidades completadas y totales agregadas por `cefr_level` (`INTRO`, `A1`, `A2`, `B1`, `B2`, `null`).
* **`curriculum_delta`:**
  * Si `status == 'comparable'`: $\Delta \text{completedUnits} = completed(t_2) - completed(t_1)$.
  * Si `status == 'structural_change'`: Se reporta $\Delta \text{totalUnits}$ y se marca no comparable directamente.

---

## 4. Tipos e Interfaces TypeScript Canónicos

```typescript
export type ComparabilityStatus = "comparable" | "structural_change" | "insufficient_observation";

export interface ActivitySummary {
  activeDays: number;
  calendarDays: number;
  activityDensity: number; // activeDays / calendarDays
  totalSessions: number;
  totalReportedSeconds: number;
  dailyXpMedian: number;
  dailyXpIqr: number;
  dailySessionsMedian: number;
  dailySessionsIqr: number;
  dailySecondsMedian: number;
  dailySecondsIqr: number;
}

export interface IntensityMetrics {
  global: {
    xpPerSession: number;
    secondsPerSession: number;
    xpPerMinute: number;
  };
  dailyDistribution: {
    xpPerSessionMedian: number;
    xpPerSessionIqr: number;
    secondsPerSessionMedian: number;
    secondsPerSessionIqr: number;
    xpPerMinuteMedian: number;
    xpPerMinuteIqr: number;
  };
}

export interface WeekdayProfileEntry {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  dayName: string;
  sampleCount: number;
  medianXp: number;
  iqrXp: number;
  medianSessions: number;
  iqrSessions: number;
  medianSeconds: number;
  iqrSeconds: number;
}

export interface CourseShareEntry {
  courseId: string;
  title: string | null;
  learningLanguage: string | null;
  fromLanguage: string | null;
  lifetimeXp: number;
  sharePercentage: number;
}

export interface ConcentrationMetrics {
  totalLinguisticXp: number;
  hhi: number;
  effectiveCourseCount: number; // 1 / HHI
  top3SharePercentage: number;
  courses: CourseShareEntry[];
}

export interface CefrProgressEntry {
  cefrLevel: string | null;
  sectionsCount: number;
  completedUnits: number;
  totalUnits: number;
  ratio: number;
}

export interface CourseCurriculumState {
  courseId: string;
  completedUnits: number;
  totalUnits: number;
  ratio: number;
  sectionsCount: number;
  cefrBreakdown: CefrProgressEntry[];
}

export interface CurriculumObservationDelta {
  courseId: string;
  previousObservedAt: string;
  latestObservedAt: string;
  previousTotalUnits: number;
  latestTotalUnits: number;
  deltaCompletedUnits: number | null;
  status: ComparabilityStatus;
}

export interface LanguagesAnalyticsContract {
  period: {
    startDate: string; // ISO
    endDate: string; // ISO
    calendarDays: number;
  };
  activity: ActivitySummary;
  intensity: IntensityMetrics;
  weekdayProfile: WeekdayProfileEntry[];
  historicalConcentration: ConcentrationMetrics;
  curriculum: {
    courses: CourseCurriculumState[];
    recentDeltas: CurriculumObservationDelta[];
  };
}
```
