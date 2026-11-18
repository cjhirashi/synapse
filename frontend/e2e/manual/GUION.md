# Guion del Manual de Operación de Synapse (H-059)

Fuente de verdad de las capturas: cada fila es una captura que el script de `e2e/manual/` debe producir, con nombre `MAN-<cap>-<nn>-<tema>.png`.
Todo sale del arnés local con datos de demostración; **nunca de producción**. Las imágenes se suben a la bóveda **Proyectos** como `public`
(decisión de Carlos, 2026-11-18: el manual se publica) en `capturas-de-aira/synapse/manual/`.

## Reglas de captura

- **Datos de demostración** (los crea el propio script por la API, no los de las pruebas): persona «Ana Torres», bóveda **Café Aurora**, carpetas
  Ventas, Compras, Clientes y Recetas con 8 a 10 notas realistas, 1 plantilla `informe`, 6 tareas (1 vencida, 1 en curso, 1 con subtarea, 1 bloqueada,
  1 asignada a un agente), 1 proyecto «Apertura», 4 archivos (2 públicos y 2 privados), 2 documentos publicados y avisos reales (asignación de un agente y vencimiento).
- **Tamaño:** escritorio 1280 × 800; celular 390 × 844 (táctil). Tema claro salvo donde se pida el oscuro. Sin barras de desplazamiento ni cursores visibles.
- **Marcadores:** círculos rojos numerados (28 px, borde blanco) puestos por el script sobre los elementos citados en los pasos, que el texto del capítulo
  llama «①», «②»… El script los quita al terminar cada captura. Los recortes (`clip`) se usan cuando la pantalla completa distrae.
- **Sin información real:** ni correos, ni dominios, ni claves, ni rutas del servidor. El correo del usuario de la barra se reemplaza por `ana@cafeaurora.mx`.
- **Aprobación:** Sonnet revisa cada captura a la vista (hojas de contacto por capítulo) antes de usarla.

## Capítulos y capturas

Los textos de botones son los reales de la app (inventario de pantallas del 2026-11-18).

### 01 Conceptos y recorrido
| id | pantalla y estado | tamaño | marcadores |
|---|---|---|---|
| 01-01 | `/vaults` con 3 bóvedas | 1280 | ① riel, ② «Nueva bóveda», ③ tarjeta de bóveda |
| 01-02 | Bóveda abierta con una nota en Lectura | 1280 | ① riel de bóvedas, ② pestañas, ③ árbol, ④ documento, ⑤ barra derecha (índice y tareas), ⑥ estado de sincronización |
| 01-03 | Lo mismo en celular, barra de notas oculta | 390 | ① botón de la barra de notas, ② documento |

### 02 Primeros pasos y cuenta
| 02-01 | Pantalla de entrada | 1280 | ① correo, ② contraseña, ③ botón de entrar |
| 02-02 | `/settings/password` | 1280 | ① campos, ② «Cambiar contraseña» |
| 02-03 | `/settings/profile` con foto y nombre | 1280 | ① «Elegir foto», ② nombre, ③ «Guardar» |
| 02-04 | `/settings/theme` claro y oscuro (dos imágenes) | 1280 | ① las tres opciones |
| 02-05 | Menú de cuenta (`Cuenta`) abierto y «Cerrar sesión» | 1280 | ① menú |
| 02-06 | Indicador «Sincronizado» y «Sin conexión» (recorte) | 1280 | ① indicador |

### 03 Bóvedas
| 03-01 | `/vaults/new` completo | 1280 | ① nombre, ② etiquetas, ③ ícono, ④ color, ⑤ «Crear bóveda» |
| 03-02 | Selector de ícono abierto (recorte) | 1280 | ① íconos |
| 03-03 | Lista con 3 bóvedas y sus botones | 1280 | ① Abrir, ② Editar, ③ Borrar |
| 03-04 | Confirmación de borrar bóveda | 1280 | ① confirmar |
| 03-05 | Riel expandido («Expandir riel de bóvedas») | 1280 | ① botón, ② bóvedas |

### 04 Notas y carpetas
| 04-01 | Árbol con carpetas desplegadas | 1280 | ① «Nueva nota en…», ② «Nueva carpeta en…», ③ carpeta, ④ nota |
| 04-02 | Crear una nota (nombre escrito) | 1280 | ① campo de nombre |
| 04-03 | Menú «Acciones de Ventas»: Renombrar y Borrar | 1280 | ① acciones |
| 04-04 | Vista de carpeta (INDICE): descripción, subcarpetas y documentos | 1280 | ① descripción, ② documentos |
| 04-05 | Botones «Atrás» y «Adelante» (recorte) | 1280 | ① botones |
| 04-06 | Árbol en celular con la barra de notas | 390 | ① árbol |
| 04-07 | «Papelera de la bóveda» con una nota borrada | 1280 | ① restaurar |

### 05 El editor
| 05-01 | Nota en Lectura y botón «Editar» | 1280 | ① «Editar», ② «Opciones de la nota» |
| 05-02 | Edición en modo Visual con barra de formato | 1280 | ① Leer, ② Visual/Código, ③ Guardar, ④ barra de formato |
| 05-03 | Modo Código (Markdown) con propiedades | 1280 | ① Código, ② propiedades |
| 05-04 | Tabla creada y su menú | 1280 | ① tabla |
| 05-05 | Imagen en un documento y botón de pantalla completa | 1280 | ① imagen, ② pantalla completa |
| 05-06 | Visor con zoom (−, porcentaje, +) | 1280 | ① controles |
| 05-07 | Visor en celular durante un pellizco | 390 | ① controles |
| 05-08 | Comentario de revisión (ventana gris con autor) | 1280 | ① comentario |
| 05-09 | Columnas, alineación y bloques de portada, índice y salto | 1280 | ① bloques |
| 05-10 | Enlace entre notas `[[…]]` y su vista previa | 1280 | ① enlace |
| 05-11 | Editor en celular | 390 | ① barra |

### 06 Propiedades, etiquetas y filtro por tags
| 06-01 | Panel de propiedades: título, descripción, etiquetas, estado y plantilla | 1280 | ① campos |
| 06-02 | «Añadir propiedad» y sus tipos | 1280 | ① tipos |
| 06-03 | «Filtro por tags» con tags y resultados | 1280 | ① tags, ② resultados |
| 06-04 | Barra derecha: índice del documento y tareas ligadas | 1280 | ① índice, ② tareas |

### 07 Plantillas
| 07-01 | Una plantilla abierta (dónde se usa, atributos, estados, estructura) | 1280 | ① alcance, ② atributos, ③ estados |
| 07-02 | Estados con color | 1280 | ① colores |
| 07-03 | Documento creado desde la plantilla: selector «Plantilla» y estado | 1280 | ① plantilla, ② estado |
| 07-04 | «Diseño del PDF» de la plantilla | 1280 | ① hoja, ② tipografía, ③ encabezado y pie |
| 07-05 | Tarjeta «Publicación en la web» | 1280 | ① interruptor |

### 08 Archivos
| 08-01 | Pestaña «Archivos» con 4 archivos | 1280 | ① «Subir archivo», ② carpetas, ③ tabla |
| 08-02 | Subir: elección de visibilidad pública o privada | 1280 | ① visibilidad |
| 08-03 | Menú de un archivo: renombrar, copiar link, borrar | 1280 | ① menú |
| 08-04 | Imagen del archivo dentro de un documento | 1280 | ① imagen |

### 09 Tareas
| 09-01 | Pestaña «Tareas» en Lista con filtros | 1280 | ① filtros, ② vistas, ③ «Nueva tarea» |
| 09-02 | Kanban | 1280 | ① columnas |
| 09-03 | Calendario (mes) | 1280 | ① tareas |
| 09-04 | Línea de tiempo (Gantt) | 1280 | ① barras |
| 09-05 | Formulario de tarea nueva | 1280 | ① título, ② asignada, ③ fechas, ④ recordatorios |
| 09-06 | Detalle de una tarea con subtarea | 1280 | ① subtareas |
| 09-07 | Tarea bloqueada («Bloqueada por») | 1280 | ① bloqueo |
| 09-08 | Ventana «Proyectos» | 1280 | ① proyecto |
| 09-09 | `/tareas`: todas las bóvedas | 1280 | ① filtro de bóveda |
| 09-10 | Tareas en celular | 390 | ① lista |

### 10 Avisos y notificaciones
| 10-01 | `/avisos` con tarjetas por día | 1280 | ① tarjeta, ② «Marcar todo como leído», ③ «Sin leer» |
| 10-02 | `/settings/notifications`: tipos, dispositivo y horas silenciosas | 1280 | ① tipos, ② horas |
| 10-03 | Campana de avisos con contador (recorte) | 1280 | ① campana |

### 11 PDF
| 11-01 | Botón «PDF» junto a «Editar» | 1280 | ① «PDF» |
| 11-02 | Primera hoja del PDF generado (portada) | hoja | – |
| 11-03 | Hoja de índice y hoja de contenido (montaje de dos) | hoja | – |

### 12 Publicar en la web
| 12-01 | Botón de publicar (globo) junto a «PDF» | 1280 | ① globo |
| 12-02 | Diálogo «Publicar documento» con la casilla de confirmación | 1280 | ① aviso, ② casilla, ③ «Publicar» |
| 12-03 | Recursos privados: «Hacer público» por archivo y «Hacer públicos todos» | 1280 | ① lista, ② botones |
| 12-04 | Fecha de despublicación (selector en hora de CDMX) | 1280 | ① casilla, ② fecha |
| 12-05 | «Documento publicado»: enlace, «Copiar», «Cambiar», «Quitar», «Republicar» | 1280 | ① enlace, ② fecha |
| 12-06 | Aviso «con cambios sin republicar» | 1280 | ① punto ámbar |
| 12-07 | Pestaña «Publicados» | 1280 | ① tarjeta, ② acciones |
| 12-08 | Página pública en escritorio (índice lateral) | 1280 | ① índice |
| 12-09 | Página pública en celular y barra de índice abierta | 390 | ① botón, ② barra |
| 12-10 | «Esta página no está disponible» (despublicada) | 390 | – |

### 13 Agentes y API keys
| 13-01 | `/settings/api-keys` con una clave | 1280 | ① «Crear API key», ② lista |
| 13-02 | Clave recién creada (se muestra una sola vez; valor ficticio) | 1280 | ① copiar |
| 13-03 | «Cómo conectar un agente» | 1280 | ① pasos |
| 13-04 | `/settings/agent-access`: registrar un agente en una bóveda | 1280 | ① bóveda, ② agente, ③ «Registrar» |
| 13-05 | Carpetas de sistema (META): AG - SKILLS, AG - MENSAJES, AG - AGENTES, BITACORA, PLANTILLAS | 1280 | ① META |
| 13-06 | Una bitácora del día | 1280 | ① entradas |

### 14 Papelera, sincronización y solución de problemas
| 14-01 | `/vaults/trash` con una bóveda borrada | 1280 | ① restaurar |
| 14-02 | `/conflicts` (pantalla vacía y con un conflicto) | 1280 | ① opciones |
| 14-03 | `/rejections` | 1280 | ① lista |
| 14-04 | Indicador sin conexión con cambios pendientes | 1280 | ① indicador |

Total: 80 capturas (53 con marcadores, el resto de contexto).

## Notas del manual (reglas de redacción)

- Segunda persona, tono directo, una acción por paso, nombres de botones entre «comillas angulares» tal como se ven.
- Cada capítulo sigue la plantilla `plantilla-manual-operacion`: Qué aprenderás, Antes de empezar, Paso a paso (con capturas), Consejos, Si algo no sale como esperas.
- Se explica qué hace cada cosa y **por qué importa** (por ejemplo: «una copia publicada es fija; si cambias el documento, republica»).
- Lo que solo hacen los agentes (publicar no; subir y escribir sí) se dice con claridad: la persona decide qué se publica y qué archivos son públicos.
- Todo número con formato mexicano; fechas y horas en hora de la Ciudad de México.
