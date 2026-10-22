/**
 * Ruta `/vaults/:id`: la bóveda abierta, con su sidebar de notas y el editor (SPEC-0008
 * RF-001, RF-002, RF-014, RF-015, RF-019; PLAN-0008 §2.6).
 *
 * - La bóveda se lee de la réplica y se relee con `dataVersion`: una que llega después por el
 *   pull sustituye al 404, y una que se borra mientras está abierta pasa a 404 (RF-002, RF-014).
 *   Un id que no es un UUID canónico no se consulta siquiera.
 * - La nota abierta vive sólo en el estado del componente (RF-015): ni URL ni almacenamiento,
 *   así que al entrar (o volver a montar) el editor está vacío.
 * - El editor (Milkdown + CodeMirror) se carga bajo demanda con `React.lazy`: `/vaults` no lo
 *   descarga (P-3).
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useSync } from "../sync/useSync";
import type { Vault } from "../sync/vaultStore";
import { NOTE_ID_PREFIX } from "./noteRules";
import NoteSidebar from "./NoteSidebar";
import NoteTrash from "./NoteTrash";
import "./notes.css";

const NoteEditor = lazy(() => import("../editor/NoteEditor"));

/** UUID en su forma canónica (minúsculas), la única que forman los ids de bóveda. */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Load = { state: "loading" } | { state: "missing" } | { state: "ready"; vault: Vault };

export default function VaultWorkspacePage() {
  const { id = "" } = useParams();
  const { vaults, dataVersion } = useSync();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    if (!CANONICAL_UUID.test(id)) {
      setLoad({ state: "missing" });
      return;
    }
    let alive = true;
    vaults.get(id).then(
      (vault) => alive && setLoad({ state: "ready", vault }),
      // `get` falla si no existe o está en la papelera (RF-002); un error de lectura se trata igual.
      () => alive && setLoad({ state: "missing" }),
    );
    return () => {
      alive = false;
    };
  }, [vaults, id, dataVersion]);

  if (load.state === "loading") return <p>Cargando…</p>;
  if (load.state === "missing") {
    return (
      <section>
        <p role="alert">Esta bóveda no existe o está en la papelera.</p>
        <Link to="/vaults">Volver a las bóvedas</Link>
      </section>
    );
  }
  // `key`: otra bóveda es otro espacio de trabajo, sin nota abierta ni borradores heredados.
  return <Workspace key={load.vault.id} vault={load.vault} />;
}

/**
 * Nota que pide el estado de navegación (el "Corregir" de un rechazo, SPEC-0008 RF-004),
 * sólo si es de esta bóveda: el id de nota lleva el de su bóveda.
 */
function requestedNote(state: unknown, vaultId: string): string | null {
  const noteId = (state as { noteId?: unknown } | null)?.noteId;
  return typeof noteId === "string" && noteId.startsWith(`${NOTE_ID_PREFIX}${vaultId}:`) ? noteId : null;
}

function Workspace({ vault }: { vault: Vault }) {
  const location = useLocation();
  const navigate = useNavigate();
  /** Nota abierta (RF-015: nunca persiste fuera de este estado). */
  const [openId, setOpenId] = useState<string | null>(() => requestedNote(location.state, vault.id));

  // El estado de navegación vive en el historial del navegador y sobreviviría a recargar:
  // una vez usado se limpia, para que entrar de nuevo a la bóveda siga abriendo vacía (RF-015).
  useEffect(() => {
    if (location.state !== null) navigate(location.pathname, { replace: true, state: null });
    // Sólo al montar: es lo que el estado inicial de `openId` ya consumió.
  }, []);
  /** La nota recién creada abre en edición; una elegida del árbol, en lectura. */
  const [editOnOpen, setEditOnOpen] = useState(false);
  const [showTrash, setShowTrash] = useState(false);

  function open(id: string, options?: { edit: boolean }) {
    setOpenId(id);
    setEditOnOpen(options?.edit ?? false);
    setShowTrash(false);
  }

  return (
    <div className="vault-workspace">
      <div className="vault-workspace-side">
        <h1>{vault.name}</h1>
        <NoteSidebar
          vaultId={vault.id}
          openId={openId}
          onOpen={open}
          onDeleted={(id) => setOpenId((current) => (current === id ? null : current))}
          onShowTrash={() => setShowTrash(true)}
        />
      </div>
      <div className="vault-workspace-main">
        {showTrash && (
          <NoteTrash vaultId={vault.id} onRestored={() => undefined} onClose={() => setShowTrash(false)} />
        )}
        {/* Con la papelera abierta el editor sigue montado (oculto): no se pierde un borrador. */}
        <div hidden={showTrash}>
          {openId === null ? (
            <p>Abre o crea una nota para empezar.</p>
          ) : (
            <Suspense fallback={<p>Cargando el editor…</p>}>
              <NoteEditor noteId={openId} editOnOpen={editOnOpen} onCancelOpen={setOpenId} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
