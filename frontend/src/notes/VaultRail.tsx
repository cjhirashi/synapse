/**
 * Riel de bóvedas (SPEC-0008 RF-001; PLAN-0008 §2.6): un icono con las iniciales del nombre
 * por cada bóveda activa. El click abre `/vaults/{id}`; la bóveda abierta se marca. Se relee
 * con `dataVersion`, así una bóveda que llega por el pull aparece sin recargar.
 */
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useSync } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";
import "./notes.css";

/** Iniciales del nombre: la primera letra de las dos primeras palabras, o las dos primeras de una sola. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words.slice(0, 2).map((word) => [...word][0]) : [...(words[0] ?? "?")].slice(0, 2);
  return letters.join("").toLocaleUpperCase("es");
}

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
          aria-label={vault.name}
          title={vault.name}
          className="vault-rail-icon"
        >
          {initials(vault.name)}
        </NavLink>
      ))}
    </nav>
  );
}
