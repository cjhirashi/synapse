import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/auth";
import {
  AgentKeyInfo,
  VaultAgentAccess,
  VaultOption,
  deleteAgentRegistration,
  getVaultAgentAccess,
  listVaultOptions,
  parseFolders,
  putAgentRegistration,
} from "./agentAccess";

const MODE_TEXT: Record<string, string> = {
  off: "Cumplimiento apagado: nada se evalúa.",
  shadow: "Modo sombra: el servidor solo registra lo que haría; todavía no bloquea a nadie.",
  enforce: "Cumplimiento activo: el servidor rechaza las escrituras fuera de lo asignado.",
};

function keyNames(keys: AgentKeyInfo[]): string {
  return keys.length === 0 ? "sin clave asignada" : keys.map((k) => k.label + (k.is_admin ? " (administrador)" : "")).join(", ");
}

interface RowProps {
  agentId: string;
  keys: AgentKeyInfo[];
  initialFolders: string[];
  initialEstado: string;
  registered: boolean;
  busy: boolean;
  onSave: (agentId: string, folders: string[], estado: "activo" | "suspendido") => void;
  onRemove: (agentId: string) => void;
}

/** Una fila del registro: el agente con el nombre de su clave, sus carpetas (una por línea) y su estado. */
function Row({ agentId, keys, initialFolders, initialEstado, registered, busy, onSave, onRemove }: RowProps) {
  const [folders, setFolders] = useState(initialFolders.join("\n"));
  const [estado, setEstado] = useState(initialEstado === "suspendido" ? "suspendido" : "activo");
  return (
    <li aria-label={`Agente ${agentId}`}>
      <h2>
        {agentId} <small>· clave: {keyNames(keys)}</small>
      </h2>
      <label>
        Carpetas con escritura (una por línea; * = toda la bóveda salvo las reservadas)
        <textarea rows={3} value={folders} onChange={(e) => setFolders(e.target.value)} />
      </label>
      <label>
        Estado
        <select value={estado} onChange={(e) => setEstado(e.target.value as "activo" | "suspendido")}>
          <option value="activo">activo</option>
          <option value="suspendido">suspendido</option>
        </select>
      </label>
      <button type="button" disabled={busy} onClick={() => onSave(agentId, parseFolders(folders), estado as "activo" | "suspendido")}>
        {registered ? `Guardar ${agentId}` : `Registrar ${agentId}`}
      </button>
      {registered && (
        <button type="button" disabled={busy} onClick={() => onRemove(agentId)}>
          Quitar {agentId}
        </button>
      )}
    </li>
  );
}

/**
 * Asignación de agentes a bóvedas (H-030): qué agente escribe en qué carpetas de cada bóveda. Es una interfaz
 * sobre el registro `AG - AGENTES/<id>.md`; reasignar es cambiar aquí, sin tocar código ni claves. Cada agente
 * aparece con el nombre de su clave (`op-…`).
 */
export default function AgentAccessPage() {
  const [vaults, setVaults] = useState<VaultOption[] | null>(null);
  const [vaultId, setVaultId] = useState("");
  const [access, setAccess] = useState<VaultAgentAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newAgent, setNewAgent] = useState("");
  const navigate = useNavigate();

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) return navigate("/login", { replace: true });
      setError(err instanceof ApiError && err.status === 422 ? "Las carpetas no son válidas (revisa los nombres)." : fallback);
    },
    [navigate],
  );

  useEffect(() => {
    listVaultOptions()
      .then((list) => {
        setVaults(list);
        if (list.length > 0) setVaultId(list[0].id);
      })
      .catch((err) => fail(err, "No se pudieron cargar las bóvedas."));
  }, [fail]);

  const load = useCallback(
    async (id: string) => {
      setAccess(null);
      try {
        setAccess(await getVaultAgentAccess(id));
      } catch (err) {
        fail(err, "No se pudo cargar la asignación de esta bóveda.");
      }
    },
    [fail],
  );

  useEffect(() => {
    if (vaultId) void load(vaultId);
  }, [vaultId, load]);

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load(vaultId);
    } catch (err) {
      fail(err, failure);
    } finally {
      setBusy(false);
    }
  }

  const save = (agentId: string, folders: string[], estado: "activo" | "suspendido") =>
    run(() => putAgentRegistration(vaultId, agentId, folders, estado), `No se pudo guardar ${agentId}.`);
  const remove = (agentId: string) => run(() => deleteAgentRegistration(vaultId, agentId), `No se pudo quitar ${agentId}.`);

  return (
    <section className="agent-access-page">
      <div className="page-header">
        <h1>Agentes por bóveda</h1>
        <Link to="/settings/api-keys">API keys</Link>
      </div>
      {error && <p role="alert">{error}</p>}
      {vaults === null && !error && <p>Cargando…</p>}
      {vaults !== null && vaults.length === 0 && <p>Aún no tienes bóvedas.</p>}
      {vaults !== null && vaults.length > 0 && (
        <label>
          Bóveda
          <select value={vaultId} onChange={(e) => setVaultId(e.target.value)}>
            {vaults.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {access && (
        <>
          <p>{MODE_TEXT[access.mode] ?? access.mode}</p>
          <p>
            Un agente registrado y activo lee toda la bóveda y escribe en sus carpetas, en su carpeta de AG - SKILLS y en
            AG - MENSAJES. Uno no registrado solo escribe en AG - MENSAJES.
          </p>
          {access.agents.length === 0 && <p>Ningún agente está registrado en esta bóveda.</p>}
          <ul className="card-list">
            {access.agents.map((a) => (
              <Row
                key={`${vaultId}-${a.agent_id}-${a.note_id}`}
                agentId={a.agent_id}
                keys={a.keys}
                initialFolders={a.carpetas}
                initialEstado={a.estado}
                registered
                busy={busy}
                onSave={save}
                onRemove={remove}
              />
            ))}
            {access.unregistered_agent_ids.map((id) => (
              <Row
                key={`${vaultId}-new-${id}`}
                agentId={id}
                keys={access.unregistered_keys.filter((k) => k.label.includes(id))}
                initialFolders={[]}
                initialEstado="activo"
                registered={false}
                busy={busy}
                onSave={save}
                onRemove={remove}
              />
            ))}
          </ul>
          <form
            className="card-form"
            onSubmit={(e) => {
              e.preventDefault();
              const id = newAgent.trim();
              if (id) {
                void save(id, [], "activo");
                setNewAgent("");
              }
            }}
          >
            <label>
              Registrar otro agente (id)
              <input value={newAgent} maxLength={32} placeholder="aira" onChange={(e) => setNewAgent(e.target.value)} />
            </label>
            <button type="submit" disabled={busy || !newAgent.trim()}>
              Registrar
            </button>
          </form>
        </>
      )}
    </section>
  );
}
