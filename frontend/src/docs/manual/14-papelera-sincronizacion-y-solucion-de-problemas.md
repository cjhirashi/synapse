<!-- pdf:portada -->

# Manual de Operación - {{atributo:programa}}

## 14 - Papelera, sincronización y solución de problemas

&nbsp;

&nbsp;

<div align="right">

**Autor:** {{atributo:autor}}

**Responsable:** {{atributo:responsable}}

</div>

<!-- /pdf:portada -->

<!-- pdf:indice -->

## Qué aprenderás

- Recuperar una bóveda que borraste.
- Leer el indicador de sincronización.
- Qué hacer con conflictos y cambios rechazados.
- Resolver los problemas más comunes.

## Antes de empezar

Synapse guarda una copia de tus datos **en tu dispositivo** y la sincroniza con el servidor. Así puedes seguir trabajando aunque se corte la conexión: tus cambios se envían al reconectar.

## La papelera de bóvedas

Una bóveda borrada no se elimina para siempre: pasa a la papelera (capítulo 03).

1. En el riel de bóvedas, abajo, pulsa **Papelera**.
2. Cada tarjeta muestra el nombre de la bóveda y cuándo se borró.
3. Pulsa «Restaurar» ① para recuperarla con todo su contenido.

<div align="center">

![Papelera de bóvedas|50%](https://synapse.cjhirashi.com/files/0de2ee6b-ef97-46d3-8fd5-d240998bdb02)

</div>

Las **notas** borradas tienen su propia papelera dentro de cada bóveda (capítulo 04).

## El indicador de sincronización

Arriba de la pantalla siempre ves cuándo se sincronizó por última vez ① y, junto a ello, el estado:

- **Sincronizado:** todo lo que hiciste ya está en el servidor.
- **Sincronizando…:** Synapse está enviando o recibiendo cambios en este momento.
- **Cambios pendientes:** hay cambios guardados en tu dispositivo que aún no llegan al servidor. Se envían solos.
- **Sin conexión:** no hay conexión con el servidor. Sigue trabajando: lo que hagas queda guardado en tu dispositivo y se envía al reconectar.
- **Aún no se ha sincronizado:** es la primera vez en este dispositivo.
- **La sesión caducó:** aparece con el botón «Iniciar sesión»; entra de nuevo para seguir sincronizando.

<div align="center">

![Indicador de sincronización](https://synapse.cjhirashi.com/files/221763fd-2aca-4ef0-833f-69af634c4d12)

</div>

## Conflictos

Si dos personas (o dos dispositivos) cambian lo mismo a la vez, Synapse no pierde ninguna de las dos versiones: te las muestra en la pantalla **Conflictos** (`/conflicts`) para que elijas o combines. Cuando todo está en orden dice «No hay conflictos por resolver» ①.

Cuando hay uno, ves los datos de cada versión (Nombre, Descripción, Etiquetas, Estado) y eliges cuál conservar o combinas los datos.

<div align="center">

![Pantalla de conflictos|50%](https://synapse.cjhirashi.com/files/d39186a4-d9fd-4675-81e3-5a340adad457)

</div>

## Cambios rechazados

A veces el servidor no acepta un cambio (por ejemplo, un nombre repetido o una nota demasiado grande). En **Cambios rechazados** (`/rejections`) ① aparece cada uno con el motivo en español y un botón «Corregir» que te lleva a donde arreglarlo. Mientras tanto, **siguen guardados en tu dispositivo**: no se pierden y se sincronizan en cuanto los corrijas.

<div align="center">

![Cambios rechazados|50%](https://synapse.cjhirashi.com/files/95dbe98a-bceb-4c53-881a-bbe3d08490da)

</div>

## Problemas comunes

| Situación | Qué hacer |
|---|---|
| No puedo iniciar sesión | Revisa el correo y la contraseña; si la olvidaste, pide a quien administra Synapse que la restablezca (capítulo 02). |
| Borré una nota o una bóveda | Restáurala desde la papelera de la bóveda o la papelera de bóvedas. |
| Mis cambios no aparecen en otro dispositivo | Mira el indicador: si dice «Cambios pendientes» o «Sin conexión», espera a que haya conexión. |
| Una imagen de mi documento publicado no se ve | El archivo es privado; hazlo público (capítulos 08 y 12). |
| La página publicada no tiene mis cambios | Republícala (capítulo 12). |
| No me llegan los avisos en el celular | Revisa «Notificaciones» en ajustes y los permisos del navegador (capítulo 10). |
| Un agente no puede escribir | Revisa su API key y «Agentes por bóveda» (capítulo 13). |

## Glosario

- **Agente:** asistente de IA que trabaja con tu cuenta, con los permisos que le das.
- **API key:** clave propia de un agente para conectarse a Synapse.
- **Atributo:** dato propio de un documento (por ejemplo `autor`); se cita en el texto con `{{atributo:autor}}`.
- **Bóveda:** espacio independiente con sus notas, tareas y archivos.
- **Bitácora:** registro automático de los cambios de una bóveda; solo lectura.
- **Etiqueta (tag):** palabra clave para encontrar notas.
- **Frontmatter / propiedades:** datos de una nota (título, descripción, etiquetas, estado).
- **Índice:** lista automática de los documentos de una carpeta o de los encabezados de un documento.
- **Markdown:** formato de texto plano que usa Synapse para guardar las notas.
- **Plantilla:** molde para documentos del mismo tipo.
- **Publicar:** crear una copia fija de un documento con enlace público.
- **Republicar:** actualizar esa copia pública con la versión actual.
- **Sincronizar:** enviar tus cambios al servidor y recibir los de los demás.
- **Wikilink:** enlace entre notas con `[[Nombre]]`.

## Consejos

- Revisa el indicador de sincronización antes de cerrar el navegador si estuviste sin conexión.
- Ante la duda con un conflicto, conserva las dos versiones combinando los datos.

## Si algo no sale como esperas

- **El indicador no cambia a «Sincronizado»:** espera unos segundos; si sigue, revisa tu conexión y que tu sesión no haya caducado.
- **Un cambio rechazado no se puede corregir:** copia tu texto antes de cerrar y pide ayuda a quien administra Synapse.
