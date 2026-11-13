/**
 * Esquemas de URL admitidos en el markdown de una nota (SPEC-0008 RF-007, Art. 5).
 *
 * El contenido de una nota llega de la réplica (otro dispositivo, otro cliente) y no es de
 * fiar: un enlace `javascript:` o una imagen `data:` no deben llegar al DOM. Se admite una
 * lista blanca de esquemas; lo demás se quita (devuelve `""`, un `href`/`src` vacío).
 *
 * - Enlaces: `http`, `https`, `mailto` y relativos (sin esquema).
 * - Imágenes: sólo `http` y `https` (y la foto de un agente de la app, ruta exacta `/agent-profiles/<id>/photo?v=N`).
 */

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Esquema de la URL en minúsculas, o `null` si es relativa. El navegador ignora los espacios
 * y los controles (tab, salto de línea…) dentro del esquema, así que `"java\nscript:"` es
 * `javascript:`: se quitan antes de mirar, para que no sirvan de camuflaje.
 */
function schemeOf(url: string): string | null {
  const compact = url.replace(/[\u0000- \u007f-\u009f]/g, "");
  const match = SCHEME.exec(compact);
  return match ? match[1].toLowerCase() : null;
}

const LINK_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto"]);
const IMAGE_SCHEMES: ReadonlySet<string> = new Set(["http", "https"]);

/** URL de un enlace, o `""` si su esquema no está admitido. */
export function safeLinkUrl(url: string): string {
  const scheme = schemeOf(url);
  return scheme === null || LINK_SCHEMES.has(scheme) ? url : "";
}

/** Foto de un agente de la propia app (H-053): solo esta ruta exacta, sin esquema, y solo como imagen. */
const AGENT_PHOTO = /^\/agent-profiles\/[a-z0-9][a-z0-9-]{0,31}\/photo\?v=\d{1,9}$/;

export function isAgentPhotoUrl(url: string): boolean {
  return AGENT_PHOTO.test(url);
}

/** URL de una imagen, o `""` si no es `http`/`https` ni la foto de un agente de la app. */
export function safeImageUrl(url: string): string {
  if (isAgentPhotoUrl(url)) return url;
  const scheme = schemeOf(url);
  return scheme !== null && IMAGE_SCHEMES.has(scheme) ? url : "";
}

/** Enlace `http`/`https` (externo al documento): se abre en una pestaña nueva; los relativos y `mailto` no. */
export function isExternalHttpLink(url: string): boolean {
  const scheme = schemeOf(url);
  return scheme === "http" || scheme === "https";
}
