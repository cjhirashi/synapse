<!-- pdf:portada -->

# Manual de Operación - {{atributo:programa}}

## 13 - Agentes y API keys

&nbsp;

&nbsp;

<div align="right">

**Autor:** {{atributo:autor}}

**Responsable:** {{atributo:responsable}}

</div>

<!-- /pdf:portada -->

<!-- pdf:indice -->

## Qué aprenderás

- Qué es un agente y una API key.
- Crear, ver y revocar API keys.
- Conectar un agente (ChatGPT, Claude, Gemini u otro).
- Decidir en qué carpetas puede escribir cada agente.
- Qué son las carpetas del sistema de cada bóveda.

## Antes de empezar

Un **agente** es un asistente de inteligencia artificial que trabaja contigo dentro de Synapse: puede leer y escribir notas, subir archivos y crear tareas. Para entrar, cada agente usa una **API key**, que es como una contraseña propia: el agente actúa **con tu cuenta**, pero solo ve tus datos y solo escribe donde tú le permitas.

**Lo que un agente nunca puede hacer:** crear o revocar API keys, cambiar tu perfil o tu contraseña, leer tus avisos ni publicar documentos en la web (eso solo lo haces tú).

## Paso a paso: crear una API key

1. Abre tu cuenta y elige **API keys** en el menú de ajustes. Ves tus claves en dos grupos: las activas y, abajo, las **Revocadas**.
2. Pulsa «Crear API key» ①.
3. Escribe el **Nombre de la key**: sirve para reconocerla en la lista (por ejemplo «asistente-compras»).
4. En **Agente (opcional)** escribe su id corto (minúsculas, números y guiones; por ejemplo `aira`). Con el id, Synapse sabe qué agente escribe y le aplica sus permisos por bóveda. Sin id, la key es **general**.
5. Pulsa «Crear».

<div align="center">

![Lista de API keys|50%](https://synapse.cjhirashi.com/files/75dd7022-d81c-4a0e-afd1-99fdba51b147)

</div>

Cada tarjeta de la lista muestra el nombre ②, cuándo se creó, su **último uso**, si está «Activa» o «Revocada» y el agente. «Personalizar» (en las keys de agente) cambia el nombre y la foto con que se muestra el agente; «Revocar» la desactiva.

## La clave se muestra una sola vez

Al crearla aparece «API key creada» con el valor completo ①. **Cópiala ahora** con «Copiar» ②: por seguridad no se vuelve a mostrar. Después pulsa «Entendido». Si la pierdes, no hay forma de recuperarla: revócala y crea otra.

<div align="center">

![Clave recién creada|50%](https://synapse.cjhirashi.com/files/4999756b-8563-4da5-b24e-ee01a52853bb)

</div>

**Por qué importa:** quien tenga el valor de la key puede actuar como ese agente. Guárdala en un lugar seguro y no la pegues en documentos ni en chats.

## Revocar una key

1. En la tarjeta de la key, pulsa «Revocar».
2. Confirma. Aviso de Synapse: un agente que la use **perderá el acceso** y la acción **no se puede deshacer**.

La key pasa a «Revocadas». Para que el agente vuelva a conectarse, crea una nueva.

## Cómo conectar un agente

La pestaña «Cómo conectar un agente» ③ trae la guía:

1. **Datos de conexión:** la URL base de tu Synapse y el encabezado `Authorization: Bearer syn_ak_…` con tu key.
2. **Probar la conexión:** un comando de terminal; responde **200** si la key funciona y **401** si es inválida o está revocada.
3. **Qué puede hacer un agente con su key:** leer y escribir notas y carpetas, subir archivos, crear y actualizar tareas y sincronizar. Para editar una nota envía el `ETag` que recibió al leerla, en el encabezado `If-Match` (así no pisa cambios de otra persona).
4. **Por plataforma:** pasos para ChatGPT (GPT personalizado con Actions), Claude (Claude Code o la API de Anthropic), Gemini (API o Gemini CLI), cualquier agente con código y n8n, Make o Zapier.
5. **Instrucción lista para pegar:** un texto para pegar en las instrucciones del agente, para que sepa cómo usar Synapse.

<div align="center">

![Guía para conectar un agente|50%](https://synapse.cjhirashi.com/files/50cd66c6-b254-46ae-ab16-221a990258bf)

</div>

## Paso a paso: dónde puede escribir cada agente

Una key conecta al agente; **«Agentes por bóveda»** decide dónde puede escribir.

1. En el menú de ajustes elige **Agentes por bóveda**.
2. En **Bóveda a asignar** ① elige la bóveda.
3. Junto a ella, la etiqueta de **Cumplimiento** dice cómo se aplican los permisos: «Sombra» (el servidor solo registra lo que haría, todavía no bloquea a nadie), activo (rechaza las escrituras fuera de lo asignado) o apagado.
4. Cada agente registrado ② tiene su tarjeta con las claves que usa y su **Estado** (activo o no). En **Carpetas con escritura** escribe una carpeta por línea; `*` significa toda la bóveda salvo las carpetas reservadas.
5. Pulsa «Guardar» (por ejemplo «Guardar aira»). «Quitar» lo saca de esa bóveda.
6. Para dar de alta a otro agente, escribe su id en **Registrar otro agente (id)** ③ y pulsa «Registrar».

El desplegable «¿Cómo funcionan los permisos?» explica las reglas con más detalle.

<div align="center">

![Agentes por bóveda|50%](https://synapse.cjhirashi.com/files/09d1344a-9ec8-4477-b0b4-e4b60d34cccc)

</div>

**Por qué importa:** puedes darle a un agente toda la bóveda de un proyecto y solo una carpeta de otra. Si no registras a un agente en una bóveda, no puede escribir en ella.

## Las carpetas del sistema

Toda bóveda trae, arriba del árbol y bajo el rótulo **META** ①, cinco carpetas con candado: **AG - SKILLS**, **AG - MENSAJES**, **AG - AGENTES**, **BITACORA** y **PLANTILLAS**. Son de la propia bóveda y de sus agentes: las tres «AG» sirven para que los agentes guarden sus habilidades, se mensajeen entre sí y se registren; **PLANTILLAS** guarda tus plantillas (capítulo 07).

<div align="center">

![Carpetas del sistema|50%](https://synapse.cjhirashi.com/files/af38786b-5252-472d-86cb-e06b52b06ff2)

</div>

## La bitácora

**BITACORA** guarda un documento por día, agrupado por mes. Cada documento enumera, con su hora y quién lo hizo, los cambios que hubo en la bóveda: creaciones, ediciones y borrados de notas. **Solo lectura:** la escribe el servidor, no se puede editar, mover ni borrar. Sirve para saber qué pasó y cuándo, incluso lo que hizo un agente.

<div align="center">

![Bitácora del día|50%](https://synapse.cjhirashi.com/files/6ec21fbb-97a6-491b-ac14-4fd718c53ce2)

</div>

## Consejos

- Una key por agente o plataforma, con un nombre claro: así sabes cuál revocar.
- Empieza dando a un agente una sola carpeta; amplía cuando confíes en su trabajo.
- Revisa la bitácora de vez en cuando.

## Si algo no sale como esperas

- **El agente recibe 401:** la key es inválida o está revocada. Crea otra.
- **El agente no puede escribir en una carpeta:** no está registrado en esa bóveda o la carpeta no está en su lista (revisa «Agentes por bóveda»).
- **Perdí el valor de la key:** no se puede recuperar; revócala y crea otra.
- **No puedo editar una carpeta con candado:** es del sistema y está protegida.
