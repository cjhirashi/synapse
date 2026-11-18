<!-- pdf:portada -->

# Manual de Operación - {{atributo:programa}}

## 09 - Tareas

&nbsp;

&nbsp;

<div align="right">

**Autor:** {{atributo:autor}}

**Responsable:** {{atributo:responsable}}

</div>

<!-- /pdf:portada -->

<!-- pdf:indice -->

## Qué aprenderás

- Ver tus tareas en cuatro vistas: Lista, Kanban, Calendario y Línea de tiempo.
- Filtrarlas, crearlas y editarlas.
- Usar subtareas, bloqueos y proyectos.
- Ver las tareas de todas tus bóvedas juntas.

## Antes de empezar

Cada bóveda tiene sus propias tareas en la pestaña «Tareas». Una tarea es algo que alguien (tú o un agente) debe hacer, con estado, prioridad y, si quieres, fechas.

## Paso a paso: la pestaña Tareas

1. Abre una bóveda y elige la pestaña «Tareas» (cuarta pestaña).
2. A la izquierda están los **Filtros** ①. Arriba, un aviso rojo cuenta las tareas vencidas (por ejemplo «1 vencida») y su botón «Ver» las muestra. Debajo filtras por **Proyecto**, **Asignada a**, **Estado** (Pendiente, En progreso, Hecha, Cancelada) y **Vence** (Todas, Vencidas, Hoy, Próximos 7 días, Sin fecha). Si no eliges ningún estado, se muestran todos. «Limpiar filtros» los quita.
3. Arriba del contenido están las **vistas** ②: «Lista», «Kanban», «Calendario» y «Línea de tiempo».
4. El botón azul «+» ③ crea una tarea nueva. «Proyectos» abre la ventana de proyectos.

La **Lista** muestra, por columnas, la **Tarea**, su **Estado**, su **Prioridad**, el **Responsable** y cuándo **Vence**. Las tareas con subtareas muestran una barra de avance («1/2»), y una tarea bloqueada lo indica con una etiqueta naranja.

<div align="center">

![Pestaña Tareas en vista Lista|50%](https://synapse.cjhirashi.com/files/a7ed2274-1f1f-41c8-9107-f26c552cfe99)

</div>

## Las otras vistas

**Kanban.** Cada estado es una columna ① ②: Pendiente, En progreso, Hecha y Cancelada, con su conteo. Cambia el estado de una tarjeta con su menú de estado, o arrástrala a otra columna.

<div align="center">

![Vista Kanban|50%](https://synapse.cjhirashi.com/files/df564981-e761-47f0-9235-3d7a0a897853)

</div>

**Calendario.** Muestra cada tarea en el día en que vence ①. Arriba eliges ver el **Año**, el **Mes**, la **Semana** o el **Día**, y «Hoy» te regresa a la fecha actual. Las tareas vencidas salen en rojo.

<div align="center">

![Vista Calendario|50%](https://synapse.cjhirashi.com/files/de3de9a2-e83d-49bf-b5b4-3fcd1fe01b9a)

</div>

**Línea de tiempo.** Dibuja una barra por tarea, desde su inicio hasta su vencimiento ①, y solo para las que tienen ambas fechas (el aviso de arriba dice cuántas quedan fuera). Elige la escala ② Día, Semana o Mes. Arrastra una barra para moverla, o sus bordes para cambiar el inicio o el vencimiento.

<div align="center">

![Línea de tiempo|50%](https://synapse.cjhirashi.com/files/c4d16502-39e0-4a1b-864b-3ad9f8500bad)

</div>

**En el celular** no hay Kanban: quedan Lista y Calendario (y la línea de tiempo según el espacio).

## Paso a paso: crear una tarea

1. Pulsa «+».
2. Escribe el **Título** ① (lo único obligatorio) y, si quieres, una **Descripción**.
3. Elige a quién se **Asigna** ②: a ti o a un agente.
4. Elige la **Prioridad**: Baja, Media o Alta.
5. Si quieres, pon cuándo **Inicia** ③ y cuándo **Vence**. Las horas son de la Ciudad de México.
6. En **Notificaciones** ④ (antes del vencimiento) decide cuándo te avisa: por ejemplo «1 día antes» y «1 hora antes». «Añadir notificación» agrega otra y la «×» quita una. Solo aparecen cuando la tarea tiene fecha de vencimiento.
7. Opcional: **Proyecto**, **Bloqueada por**, **Ruta** (documento o carpeta donde se trabaja) y **Notas de avance**.
8. Pulsa «Guardar».

<div align="center">

![Formulario de tarea nueva|50%](https://synapse.cjhirashi.com/files/23f5ca73-9954-4edf-9fcb-7c19e2c90dd5)

</div>

**Por qué importa:** una fecha de vencimiento y sus notificaciones hacen que Synapse te avise sin que tengas que acordarte (capítulo 10).

## El detalle de una tarea y sus subtareas

Haz clic en una tarea para abrir su detalle. Arriba eliges el estado: Pendiente, En progreso, Hecha o Cancelada. Más abajo ves el proyecto, a quién está asignada, la prioridad, las fechas, las notificaciones, la ruta, la descripción y las notas de avance.

Al final están las **Subtareas** ①: pasos más pequeños de la tarea. Cada una tiene su propio estado, y el contador «1/2» dice cuántas van hechas. «Añadir subtarea» crea otra. **El estado de una tarea con subtareas lo decide Synapse a partir de ellas**: se cierra cuando todas se cierran.

«Editar» abre el formulario, «Eliminar» la borra y «Cerrar» regresa a la lista.

<div align="center">

![Detalle de una tarea con subtareas|50%](https://synapse.cjhirashi.com/files/a9ba1a7e-63b5-4d5a-b984-e115e078c6e1)

</div>

## Tareas bloqueadas

En **Dependencias** ① una tarea puede estar «Bloqueada por» otras ②. Mientras las bloqueadoras no estén hechas, puedes ponerla En progreso, pero **no** darla por hecha. Para bloquear, en el formulario elige las bloqueadoras en «Bloqueada por».

<div align="center">

![Tarea bloqueada|50%](https://synapse.cjhirashi.com/files/b6c7fb2b-80e4-409e-a903-f556f1f3cbea)

</div>

## Proyectos

Un **proyecto** agrupa tareas de la bóveda. Pulsa «Proyectos» para ver los de la bóveda ①: cada uno muestra su descripción, su estado (Activo, En pausa o Completado) y cuántas tareas lleva hechas («0/3 tareas hechas»). Con «Nuevo proyecto» creas uno; el lápiz lo edita y el bote de basura lo borra. Una tarea pertenece a un solo proyecto y sus subtareas van con ella.

<div align="center">

![Ventana de proyectos|50%](https://synapse.cjhirashi.com/files/b3e502e0-e2f1-4ae7-adcb-6bd822e19b13)

</div>

## Tareas de todas las bóvedas

En el riel de bóvedas, abajo, el acceso «Tareas» abre la pantalla **Tareas de todas las bóvedas**. Funciona igual, con un filtro más: **Bóveda** ①, para ver todas o solo una. Cada tarea indica a qué bóveda pertenece.

<div align="center">

![Tareas de todas las bóvedas|50%](https://synapse.cjhirashi.com/files/4aca7d67-bcbc-4a90-9dd7-5746e7a65ac9)

</div>

## En el celular

Los filtros se abren como un panel sobre la lista, con una «×» («Cerrar filtros») para volver a ella. La lista muestra cada tarea con su estado y, deslizando, el resto de columnas.

<div align="center">

![Tareas en el celular|40%](https://synapse.cjhirashi.com/files/6522b616-c953-46df-a877-6f3ce324ec7f)

</div>

## Consejos

- Crea primero la tarea con título y fecha; el resto se puede completar después.
- Usa subtareas para tareas grandes en vez de varias tareas sueltas: el avance se ve solo.

## Si algo no sale como esperas

- **No puedo marcar una tarea como Hecha:** tiene subtareas abiertas o está bloqueada por otra que no está hecha.
- **Una tarea no aparece en la línea de tiempo:** le falta la fecha de inicio o la de vencimiento.
- **No veo las tareas de otra bóveda:** usa «Tareas» del riel (todas las bóvedas).
