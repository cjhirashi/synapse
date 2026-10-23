/**
 * Riel de bóvedas (SPEC-0008 RF-001; PLAN-0008 §2.6): un icono con las iniciales del nombre
 * por cada bóveda activa. El click abre `/vaults/{id}`; la bóveda abierta se marca. Se relee
 * con `dataVersion`, así una bóveda que llega por el pull aparece sin recargar.
 */
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useSync } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";
import { initials } from "../vaults/vaultIcon";
import "./notes.css";

// Las iniciales viven con el resto de la presentación del ícono; se re-exportan aquí porque este era
// su sitio original (SPEC-0008) y su test las importa de este módulo.
export { initials };

export default function VaultRail() {
  const { vaults, dataVersion } = useSync();
  const [items, setItems] = useState<Vault[]>([]);

  useEffect(() => {
    let alive = true;
    void vaults.list().then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [vaults, dataVersion]);

  return (
    <nav aria-label="Bóvedas abiertas" className="vault-rail">
      {items.map((vault) => (
        <NavLink
          key={vault.id}
          to={`/vaults/${encodeURIComponent(vault.id)}`}
          // El nombre accesible empieza por el texto visible (WCAG 2.5.3, U-4).
          aria-label={`${initials(vault.name)} ${vault.name}`}
          title={vault.name}
          className="vault-rail-icon"
        >
          {initials(vault.name)}
        </NavLink>
      ))}
    </nav>
  );
}
