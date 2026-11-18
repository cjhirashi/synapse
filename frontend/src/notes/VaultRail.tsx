/**
 * Riel de bóvedas (SPEC-0008 RF-001; SPEC-0009 RF-001, RF-002; PLAN-0008 §2.6, PLAN-0009 §2.3 b):
 * un chip circular por cada bóveda activa, con su ícono o sus iniciales. El click abre
 * `/vaults/{id}`; la bóveda abierta se marca. Se relee con `dataVersion`, así una bóveda que llega
 * por el pull (o cuyo ícono cambia) aparece sin recargar.
 *
 * El nombre completo sale en un tooltip propio (`RailTooltip`) al pasar el cursor o enfocar con el
 * teclado. Se monta en `document.body`: el riel tiene scroll (`overflow`) y recortaría un hijo.
 */
import { BookOpen, ChevronsLeft,ChevronsRight, ListChecks, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { useMe } from "../auth/RequireAuth";
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
  // El nombre/foto del usuario para la entrada «Usuario»; se refresca al guardar en /settings (B10).
  const me = useMe();
  const [items, setItems] = useState<Vault[]>([]);
  const [tip, setTip] = useState<Tip | null>(null);
  // Estado local, sin persistencia: el riel siempre carga colapsado, en cualquier viewport (C-2).
  const [expanded, setExpanded] = useState(false);
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

  // Nombre visible del usuario para la entrada «Usuario»: el nombre si lo hay, si no el correo (H-028 A6).
  const userLabel = me.display_name || me.email;

  return (
    <nav ref={rail} aria-label="Bóvedas abiertas" className={expanded ? "vault-rail is-expanded" : "vault-rail"}>
      {/* Toggle al inicio del riel: alterna colapsado (botones redondos) y expandido (píldoras). */}
      <button
        type="button"
        className="vault-rail-toggle"
        aria-expanded={expanded}
        aria-label={expanded ? "Colapsar riel de bóvedas" : "Expandir riel de bóvedas"}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? <ChevronsLeft size={20} aria-hidden="true" /> : <ChevronsRight size={20} aria-hidden="true" />}
      </button>
      {/* Zona superior (H-028 A1): las bóvedas ocupan la altura disponible y sólo esta zona hace
          scroll cuando no caben. Al hacer scroll el tooltip (fijo) quedaría descolocado: se oculta. */}
      <div className="vault-rail-scroll" onScroll={() => setTip(null)}>
        {items.map((vault) => (
          <NavLink
            key={vault.id}
            to={`/vaults/${encodeURIComponent(vault.id)}`}
            // Expandido: el nombre ya es texto visible, así que el nombre accesible sale de él (sin
            // duplicar las iniciales); colapsado: lo da el `aria-label` (C-4).
            aria-label={expanded ? undefined : accessibleName(vault)}
            className="vault-rail-icon"
            onMouseEnter={expanded ? undefined : (event) => showTip(event.currentTarget, vault.name)}
            onMouseLeave={expanded ? undefined : () => setTip(null)}
            onMouseDown={() => (pointerFocus.current = true)}
            onFocus={
              expanded
                ? undefined
                : (event) => {
                    if (!pointerFocus.current) showTip(event.currentTarget, vault.name);
                    pointerFocus.current = false;
                  }
            }
            onBlur={expanded ? undefined : () => setTip(null)}
          >
            <VaultChip id={vault.id} name={vault.name} icon={vault.icon} />
            {expanded && <span className="vault-rail-name">{vault.name}</span>}
          </NavLink>
        ))}
      </div>
      {/* Zona inferior (H-028 A2): altura de su contenido; Tareas, Papelera, Documentación (H-061) y Usuario (al final). Los avisos salieron al navbar. */}
      <div className="vault-rail-bottom">
        <NavLink to="/tareas" className="vault-rail-icon vault-rail-action" aria-label="Tareas de todas las bóvedas" title="Tareas de todas las bóvedas">
          <span className="vault-rail-glyph">
            <ListChecks size={18} aria-hidden="true" />
          </span>
          {expanded && <span className="vault-rail-name">Tareas</span>}
        </NavLink>
        <NavLink to="/vaults/trash" className="vault-rail-icon vault-rail-action" aria-label="Papelera" title="Papelera">
          <span className="vault-rail-glyph">
            <Trash2 size={18} aria-hidden="true" />
          </span>
          {expanded && <span className="vault-rail-name">Papelera</span>}
        </NavLink>
        <NavLink to="/docs" className="vault-rail-icon vault-rail-action" aria-label="Documentación" title="Documentación">
          <span className="vault-rail-glyph">
            <BookOpen size={18} aria-hidden="true" />
          </span>
          {expanded && <span className="vault-rail-name">Documentación</span>}
        </NavLink>
        <NavLink
          to="/settings"
          className="vault-rail-icon vault-rail-action vault-rail-user"
          aria-label={expanded ? undefined : `Usuario: ${userLabel}`}
          title={userLabel}
        >
          {/* Icono = foto del usuario o, si no hay, sus iniciales (A6). */}
          {me.photo_url ? (
            <img className="vault-rail-avatar" src={me.photo_url} alt="" aria-hidden="true" />
          ) : (
            <span className="vault-rail-initials" aria-hidden="true">
              {initials(userLabel)}
            </span>
          )}
          {expanded && <span className="vault-rail-name">{userLabel}</span>}
        </NavLink>
      </div>
      {/* El tooltip sólo tiene sentido en colapsado (en expandido el nombre ya se ve, C-4). */}
      {!expanded && tip && <RailTooltip tip={tip} />}
    </nav>
  );
}
