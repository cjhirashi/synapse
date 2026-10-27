import "./brand.css";

/**
 * Logo oficial de Synapse (SPEC-0011 RF-008…RF-017). Decorativo: el nombre accesible del bloque de
 * marca es el texto «Synapse» que lo acompaña, no el logo (RF-012), así que es un `span` oculto a las
 * tecnologías de asistencia. Va como imagen de fondo (no `<img>`) por tres razones de raíz (PLAN-0011
 * P-2): un fondo que no carga no pinta nada (RF-020; un `<img>` roto pinta un marco gris), el tema lo
 * decide `data-theme` en CSS sin estado de React (RF-016) y no hay ids de SVG que puedan colisionar.
 * El tamaño lo pone el contexto con `--brand-logo-size` (cabecera 28 px, login 32 px).
 */
export default function BrandLogo() {
  return <span className="brand-logo" aria-hidden="true" />;
}
