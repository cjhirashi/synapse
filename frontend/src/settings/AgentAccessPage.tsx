import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/auth";
import {
  AgentKeyInfo,
  SkillInfo,
  SkillResolution,
  VaultAgentAccess,
  VaultOption,
  assignSkill,
  deleteAgentRegistration,
  getVaultAgentAccess,
  leaveAgent,
  listSkills,
  listVaultOptions,
  parseFolders,
  putAgentRegistration,
  skillName,
} from "./agentAccess";
import LeaveDialog from "./LeaveDialog";

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
  /** Skills activas que posee y skills a las que está invitado (H-041 E4). */
  owns: number;
  invitedTo: number;
  initialFolders: string[];
  initialEstado: string;
  registered: boolean;
  busy: boolean;
  onSave: (agentId: string, folders: string[], estado: "activo" | "suspendido") => void;
  onRemove: (agentId: string) => void;
}

/** Una fila del registro: el agente con el nombre de su clave, sus carpetas (una por línea) y su estado. */
function Row({ agentId, keys, owns, invitedTo, initialFolders, initialEstado, registered, busy, onSave, onRemove }: RowProps) {
  const [folders, setFolders] = useState(initialFolders.join("\n"));
  const [estado, setEstado] = useState(initialEstado === "suspendido" ? "suspendido" : "activo");
  return (
    <li aria-label={`Agente ${agentId}`}>
      <h2>
        {agentId} <small>· clave: {keyNames(keys)}</small>
      </h2>
      {registered && (
        <p>
          Skills: posee {owns} activa{owns === 1 ? "" : "s"} · invitado en {invitedTo}
        </p>
      )}
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
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  /** H-041 E4: quitar o suspender a un gestor que posee skills activas abre la ventana de resolución. */
  const [leaving, setLeaving] = useState<{ agentId: string; modo: "quitar" | "suspender" } | null>(null);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) return navigate("/login", { replace: true });
      if (err instanceof ApiError && err.status === 409) {
        setError("Ese agente todavía es propietario de skills activas: resuelve antes qué pasa con cada una.");
        return;
      }
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
        const [loaded, loadedSkills] = await Promise.all([getVaultAgentAccess(id), listSkills(id).catch(() => [] as SkillInfo[])]);
        setAccess(loaded);
        setSkills(loadedSkills);
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

  const ownedBy = (agentId: string) => skills.filter((s) => s.propietario === agentId && s.estado !== "archivado");
  const invitedTo = (agentId: string) => skills.filter((s) => s.agentes.includes(agentId)).length;

  const save = (agentId: string, folders: string[], estado: "activo" | "suspendido") => {
    const current = access?.agents.find((a) => a.agent_id === agentId);
    if (estado === "suspendido" && current?.estado === "activo" && ownedBy(agentId).length > 0) {
      setLeaving({ agentId, modo: "suspender" });
      return Promise.resolve();
    }
    return run(() => putAgentRegistration(vaultId, agentId, folders, estado), `No se pudo guardar ${agentId}.`);
  };
  const remove = (agentId: string) => {
    if (ownedBy(agentId).length > 0) {
      setLeaving({ agentId, modo: "quitar" });
      return Promise.resolve();
    }
    return run(() => deleteAgentRegistration(vaultId, agentId), `No se pudo quitar ${agentId}.`);
  };
  async function confirmLeave(resolutions: SkillResolution[]) {
    if (leaving === null) return;
    const { agentId, modo } = leaving;
    await run(() => leaveAgent(vaultId, agentId, modo, resolutions), `No se pudo ${modo} ${agentId}.`);
    setLeaving(null);
  }
  const archived = skills.filter((s) => s.estado === "archivado");
  const managers = (access?.agents ?? []).filter((a) => a.estado === "activo").map((a) => a.agent_id);

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
          Bóveda a asignar
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
            Un agente registrado y activo (gestor) lee toda la bóveda y escribe en sus carpetas y en AG - MENSAJES; en AG - SKILLS
            solo edita las skills de las que es propietario. Uno no registrado solo escribe en AG - MENSAJES.
          </p>
          {access.agents.length === 0 && <p>Ningún agente está registrado en esta bóveda.</p>}
          <ul className="card-list">
            {access.agents.map((a) => (
              <Row
                key={`${vaultId}-${a.agent_id}-${a.note_id}`}
                agentId={a.agent_id}
                keys={a.keys}
                owns={ownedBy(a.agent_id).length}
                invitedTo={invitedTo(a.agent_id)}
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
                owns={0}
                invitedTo={0}
                initialFolders={[]}
                initialEstado="activo"
                registered={false}
                busy={busy}
                onSave={save}
                onRemove={remove}
              />
            ))}
          </ul>
          {archived.length > 0 && (
            <section aria-label="Skills sin propietario" className="agent-orphan-skills">
              <h2>Skills sin propietario</h2>
              <p>Están archivadas: inactivas, en su carpeta, sin propietario ni invitados. Asigna cada una a un gestor para reactivarla (vuelve a «en revisión»).</p>
              <ul className="card-list">
                {archived.map((skill) => {
                  const name = skillName(skill);
                  const target = assignTo[skill.note_id] ?? managers[0] ?? "";
                  return (
                    <li key={skill.note_id} aria-label={`Skill archivada ${name}`}>
                      <h3>{name}</h3>
                      <label>
                        Asignar {name} a
                        <select value={target} disabled={managers.length === 0} onChange={(e) => setAssignTo((cur) => ({ ...cur, [skill.note_id]: e.target.value }))}>
                          {managers.map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                          {managers.length === 0 && <option value="">Sin gestores activos</option>}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={busy || target === ""}
                        onClick={() => void run(() => assignSkill(vaultId, skill.note_id, target), `No se pudo asignar ${name}.`)}
                      >
                        Asignar {name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
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
      {leaving !== null && (
        <LeaveDialog
          agentId={leaving.agentId}
          modo={leaving.modo}
          owned={ownedBy(leaving.agentId)}
          busy={busy}
          onConfirm={(resolutions) => void confirmLeave(resolutions)}
          onCancel={() => setLeaving(null)}
        />
      )}
    </section>
  );
}
