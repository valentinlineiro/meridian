# Idiomas rediseñado por utilidad (diseño)

Fecha: 2026-11-24 · Estado: borrador para aprobación del dueño · Tamaño: cambio mediano (solo front end)

## Intención y por qué

El dueño casi no abre Idiomas porque no le ayuda. Quiere saber de un vistazo el nivel que tiene en cada idioma, el grado de completitud de cada curso y estadísticas útiles. Hoy la pantalla abre con el curso elegido (selector, nivel o unidades, barra), "Actividad" de 7 días, y plegados "Tu cuenta", "Tus cursos" y "Análisis y métricas longitudinales" (seis bloques); el detalle de curso es una pantalla aparte.

## Objetivos

1. Una fila por curso con: bandera y nombre, nivel (o "—"), completitud (barra y %), avance desde la última observación y XP.
2. Una frase de resumen del periodo para toda la cuenta: XP, días con actividad y cambio frente al periodo anterior.
3. Selector de periodo (7 d, 30 d, 90 d), que solo gobierna el resumen.
4. Cursos en curso arriba; los completados o sin empezar, plegados.
5. Un solo plegable de detalle con lo que de verdad aporta. El detalle por curso queda como está.

## No objetivos

- Backend, migraciones o cambiar el detalle por curso.
- Rachas, avisos o presión (PRODUCT.md, principio 2).
- Presentar el nivel como una evaluación del alumno.

## Antiobjetivos (fracaso aunque funcione)

- Un nivel que parezca una evaluación tuya: es el tramo del curso donde vas, según Duolingo. Cada fila lo dice en su ayuda.
- Un nivel inventado cuando un curso no trae CEFR: se muestra "—" y las unidades.
- XP de cuenta presentado como XP de un curso.

## Restricciones

- Sin cambios de servidor: `/api/languages/analytics` ya devuelve por curso `completedUnits`, `totalUnits`, `ratio` y `cefrBreakdown` (nivel, unidades hechas y totales); las XP diarias son de cuenta (90 días).
- Español, un tema oscuro, tokens y vocabulario de `web/DESIGN.md`; pruebas `shouldXWhenY`; antes de subir: `typecheck`, `web:lint`, `web:test`, e2e, axe.

## Enfoques considerados

**A. Marcador de cursos con el nivel de `cefrBreakdown` (elegido).** Primero pensé que hacía falta un campo nuevo en el servidor; el servidor ya lo calcula y no se usaba en la lista, así que A es solo front end.
**B. Nivel solo del curso elegido.** No cumple "nivel en cada idioma". Descartado.
**C. Agrupar por idioma.** Oculta cursos y no se sabe cómo agrupan. Descartado.

## Diseño

### Pantalla de `/languages`

1. Selector de periodo (7/30/90 d, en la URL) y una frase: "Últimos 30 días, toda la cuenta: 2.140 XP · 19 días con actividad · +12 % frente a los 30 anteriores" (sin comparación a 90 d, porque no hay datos previos).
2. Lista de cursos en curso, una fila cada uno. Nivel: el primer nivel CEFR sin completar (misma regla que `levelView`), mostrado solo si todos los tramos con unidades traen nivel; si no, "—" y "N de M unidades". Completitud: barra y porcentaje. Avance: "+N unidades desde el <fecha>" o "Sin avance" desde las diferencias ya observadas; sin dato comparable, nada. XP del curso. Toda la fila abre el detalle del curso.
3. Plegable "Cursos completados o sin empezar (N)" con las mismas filas.
4. Plegable "Ver detalle: sesiones y día de la semana": "XP y tiempo por sesión" y "Perfil por día de la semana" (de cuenta) y "En qué cursos pones el esfuerzo".
5. Pie: sincronización ("actualizado …") y aviso de datos antiguos.

### Qué se quita

La tarjeta del curso elegido y su selector (la lista lo sustituye), "Actividad" (la absorbe el resumen), "Tu cuenta" y la tira semanal, "Cambios observados" y "Cómo avanza cada curso" (cada fila lo dice). Se borra el código que solo ellos usaban.

### Medición

`data-umami-event`: `languages-period`, `languages-course-open`.

## Qué se deja al constructor

- Maquetación de la fila a 390 px con 13 cursos, y objetivos táctiles de 44 px.
- Copia exacta de las ayudas ("el nivel es el tramo del curso donde vas, según Duolingo") y de los vacíos.
- Pruebas: nivel con todos los tramos con nivel, con un tramo sin nivel y con tramos de 0 unidades; completitud 0 y 100 %; fila sin comparación; periodo sin días; plegables; filas que se abren con teclado.

## Abierto

- Con datos reales, cuántos de los 13 cursos muestran nivel y cuántos solo unidades (el ruso no trae CEFR; los tramos "Repaso diario" no tienen nivel y se ignoran si no tienen unidades). Requiere una concesión de lectura del dueño o mirar la pantalla en el móvil.
- Qué bloque del plegable de detalle se abre alguna vez: lo dirá Umami el 2026-12-15.
