/**
 * Chip de una bóveda: su ícono del set curado o, sin él, las iniciales del nombre, con el color
 * elegido o uno derivado del id (SPEC-0009 RF-001; PLAN-0009 §2.3 b, P-1, P-2).
 *
 * Sólo se pinta lo que sale de las listas cerradas de `vaultIcon.ts`: el glifo es un componente
 * del catálogo y el color una variable de la paleta; cualquier otro valor degrada a iniciales o al
 * color derivado, así `icon` nunca inyecta marcado ni estilo. Es decorativo (`aria-hidden`): el
 * nombre accesible lo da el enlace o el título que lo acompaña.
 */
import type { CSSProperties } from "react";
import { colorVar, derivedColor, ICON_SET, initials, parseIcon } from "./vaultIcon";
import "./VaultChip.css";

interface VaultChipProps {
  /** Id de la bóveda: de él depende el color por omisión (estable al renombrar). */
  id: string;
  name: string;
  /** `Vault.icon` tal cual (`null`/ausente = iniciales). */
  icon?: string | null;
}

export default function VaultChip({ id, name, icon }: VaultChipProps) {
  const { glyph, color } = parseIcon(icon);
  const Glyph = glyph === null ? null : ICON_SET[glyph];
  const style = { "--chip-color": colorVar(color ?? derivedColor(id)) } as CSSProperties;

  return (
    <span className="vault-chip" style={style} aria-hidden="true">
      {Glyph ? <Glyph size={18} strokeWidth={2} data-icon={glyph} /> : initials(name)}
    </span>
  );
}
