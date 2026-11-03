import type { AttributeCatalog } from "../sync/vaultRules";
import { ESTADOS_ESTANDAR } from "./attributeRules";

/** Estados propios de la bóveda (los del catálogo que no son estándar), para ofrecerlos en cada nota. */
export function catalogEstados(catalog: AttributeCatalog | null | undefined): string[] {
  return catalog?.estado?.options ?? [];
}

/**
 * Catálogo con `estado` ampliado con un estado nuevo, o `null` si no hay nada que cambiar (ya es estándar
 * o ya está en el catálogo). `estado` se declara siempre como `select`.
 */
export function withEstado(catalog: AttributeCatalog | null | undefined, estado: string): AttributeCatalog | null {
  if ((ESTADOS_ESTANDAR as readonly string[]).includes(estado)) return null;
  const options = catalogEstados(catalog);
  if (options.includes(estado)) return null;
  return { ...(catalog ?? {}), estado: { type: "select", options: [...options, estado] } };
}
