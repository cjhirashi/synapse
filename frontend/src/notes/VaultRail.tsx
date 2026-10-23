/**
 * Riel de bóvedas (SPEC-0008 RF-001; SPEC-0009 RF-001, RF-002; PLAN-0008 §2.6, PLAN-0009 §2.3 b):
 * un chip circular por cada bóveda activa, con su ícono o sus iniciales. El click abre
 * `/vaults/{id}`; la bóveda abierta se marca. Se relee con `dataVersion`, así una bóveda que llega
 * por el pull (o cuyo ícono cambia) aparece sin recargar.
 *
 * El nombre completo sale en un tooltip propio (`RailTooltip`) al pasar el cursor o enfocar con el
 * teclado. Se monta en `document.body`: el riel tiene scroll (`overflow`) y recortaría un hijo.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { useSync } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";
import VaultChip from "../vaults/VaultChip";
import { initials, parseIcon } from "../vaults/vaultIcon";
import "./notes.css";

// Las iniciales viven con el resto de la presentación del ícono; se re-exportan aquí porque este era
// su sitio original (SPEC-0008) y su test las importa de este módulo.
export { initials };

/** Dónde se dibuja el tooltip: a la derecha del riel, centrado en vertical con el enlace. */
interface Tip {
  name: string;
  top: number;
  left: number;
}

/** Nombre completo de la bóveda junto a su chip. Decorativo: el nombre accesible ya está en el enlace. */
function RailTooltip({ tip }: { tip: Tip }) {
  return createPortal(
    <div className="rail-tooltip" style={{ top: tip.top, left: tip.left }} aria-hidden="true">
      {tip.name}
    </div>,
    document.body,
  );
}

/**
 * Nombre accesible del enlace: con iniciales visibles empieza por ellas (WCAG 2.5.3, U-4); con
 * ícono no hay texto visible y es el nombre solo (SPEC-0009 RF-007).
 */
function accessibleName(vault: Vault): string {
  return parseIcon(vault.icon).glyph === null ? `${initials(vault.name)} ${vault.name}` : vault.name;
}

export default function VaultRail() {
  const { vaults, dataVersion } = useSync();
  const [items, setItems] = useState<Vault[]>([]);
  const [tip, setTip] = useState<Tip | null>(null);
  const rail = useRef<HTMLElement>(null);
  /** El foco que viene de un clic de ratón no debe mostrar el tooltip (sólo el del teclado). */
  const pointerFocus = useRef(false);

  useEffect(() => {
    let alive = true;
    void vaults.list().then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [vaults, dataVersion]);

  function showTip(link: HTMLElement, name: string) {
    const box = link.getBoundingClientRect();
    setTip({ name, top: box.top + box.height / 2, left: rail.current?.getBoundingClientRect().right ?? box.right });
  }

  return (
    // Al hacer scroll el enlace se mueve y el tooltip (fijo) quedaría descolocado: se oculta.
    <nav ref={rail} aria-label="Bóvedas abiertas" className="vault-rail" onScroll={() => setTip(null)}>
      {items.map((vault) => (
        <NavLink
          key={vault.id}
          to={`/vaults/${encodeURIComponent(vault.id)}`}
          aria-label={accessibleName(vault)}
          className="vault-rail-icon"
          onMouseEnter={(event) => showTip(event.currentTarget, vault.name)}
          onMouseLeave={() => setTip(null)}
          onMouseDown={() => (pointerFocus.current = true)}
          onFocus={(event) => {
            if (!pointerFocus.current) showTip(event.currentTarget, vault.name);
            pointerFocus.current = false;
          }}
          onBlur={() => setTip(null)}
        >
          <VaultChip id={vault.id} name={vault.name} icon={vault.icon} />
        </NavLink>
      ))}
      {tip && <RailTooltip tip={tip} />}
    </nav>
  );
}
