import { useCallback, useEffect, useState } from "react";
import { Bot, Info, UserPlus } from "lucide-react";
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
  putAgentRegistration,
  skillName,
} from "./agentAccess";
import { folderOptions } from "../sharing/folderOptions";
import { useSync } from "../sync/useSync";
import AgentBadge from "../agents/AgentBadge";
import { agentName, useAgentProfiles } from "../agents/agentProfiles";
import FolderScopePicker from "./FolderScopePicker";
import LeaveDialog from "./LeaveDialog";
import "./agents.css";

const MODE_TEXT: Record<string, string> = {
  off: "Cumplimiento apagado: nada se evalúa.",
  shadow: "Modo sombra: el servidor solo registra lo que haría; todavía no bloquea a nadie.",
  enforce: "Cumplimiento activo: el servidor rechaza las escrituras fuera de lo asignado.",
};

const MODE_PILL: Record<string, { label: string; tone: string }> = {
  off: { label: "Apagado", tone: "" },
  shadow: { label: "Sombra", tone: "ag-pill--warn" },
  enforce: { label: "Activo", tone: "ag-pill--ok" },
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
  folderChoices: string[];
  onSave: (agentId: string, folders: string[], estado: "activo" | "suspendido") => void;
  onRemove: (agentId: string) => void;
}

/** Una fila del registro: el agente con el nombre de su clave, sus carpetas y su estado. */
function Row({ agentId, keys, owns, invitedTo, initialFolders, initialEstado, registered, busy, folderChoices, onSave, onRemove }: RowProps) {
  const [folders, setFolders] = useState(initialFolders);
  const [estado, setEstado] = useState(initialEstado === "suspendido" ? "suspendido" : "activo");
  const profiles = useAgentProfiles();
  const displayName = agentName(agentId, profiles);
  const suspended = initialEstado === "suspendido";
  const status = !registered ? { label: "Sin registrar", tone: "ag-pill--warn" } : suspended ? { label: "Suspendido", tone: "ag-pill--bad" } : { label: "Activo", tone: "ag-pill--ok" };
  return (
    <li aria-label={`Agente ${agentId}`} className="ag-card">
      <div className="ag-row">
        <AgentBadge agentId={agentId} size={40} showName={false} />
        <div className="ag-grow">
          <h3>{displayName}{displayName !== agentId && <code className="ag-chip" style={{ marginLeft: 8 }}>{agentId}</code>}</h3>
          <span className="ag-sub">clave: {keyNames(keys)}</span>
        </div>
        <span className={`ag-pill ${status.tone}`}>{status.label}</span>
      </div>
      {registered && (
        <p className="ag-sub">
          Skills: posee {owns} activa{owns === 1 ? "" : "s"} · invitado en {invitedTo}
        </p>
      )}
      <div className="ag-field">
        <FolderScopePicker value={folders} onChange={setFolders} folders={folderChoices} disabled={busy} idPrefix={`fsp-${agentId}`} />
      </div>
      <div className="ag-actions">
        <div className="ag-field">
          <label htmlFor={`estado-${agentId}`}>Estado</label>
          <select id={`estado-${agentId}`} value={estado} onChange={(e) => setEstado(e.target.value as "activo" | "suspendido")}>
            <option value="activo">activo</option>
            <option value="suspendido">suspendido</option>
          </select>
        </div>
        <span className="ag-spacer" />
        {registered && (
          <button type="button" className="ag-danger" disabled={busy} onClick={() => onRemove(agentId)}>
            Quitar {agentId}
          </button>
        )}
        <button type="button" className="btn-primary" disabled={busy} onClick={() => onSave(agentId, folders, estado as "activo" | "suspendido")}>
          {registered ? `Guardar ${agentId}` : `Registrar ${agentId}`}
        </button>
      </div>
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
  const [folderChoices, setFolderChoices] = useState<string[]>([]);
  /** H-041 E4: quitar o suspender a un gestor que posee skills activas abre la ventana de resolución. */
  const [leaving, setLeaving] = useState<{ agentId: string; modo: "quitar" | "suspender" } | null>(null);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { notes, dataVersion } = useSync();

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

  useEffect(() => {
    if (!vaultId) return;
    let alive = true;
    notes
      .list(vaultId)
      .then((list) => alive && setFolderChoices(folderOptions(list.map((n) => n.path))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [vaultId, dataVersion, notes]);

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

  const mode = access ? MODE_PILL[access.mode] ?? { label: access.mode, tone: "" } : null;

  return (
    <section className="agent-access-page">
      <header className="ag-head">
        <div>
          <h2>Agentes por bóveda</h2>
          <p className="settings-section-intro">
            Decide en qué carpetas de cada bóveda puede escribir cada agente. Los agentes se identifican con su{" "}
            <Link className="ag-link" to="/settings/api-keys">API key</Link>.
          </p>
        </div>
      </header>
      {error && <p role="alert" className="ag-callout ag-callout--warn">{error}</p>}
      {vaults === null && !error && <p className="ag-sub">Cargando…</p>}
      {vaults !== null && vaults.length === 0 && (
        <div className="ag-empty">
          <p>Aún no tienes bóvedas.</p>
        </div>
      )}
      {vaults !== null && vaults.length > 0 && (
        <div className="ag-toolbar">
          <div className="ag-field">
            <label htmlFor="agent-access-vault">Bóveda a asignar</label>
            <select id="agent-access-vault" value={vaultId} onChange={(e) => setVaultId(e.target.value)}>
              {vaults.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          {mode && (
            <span className={`ag-pill ${mode.tone}`} title="Modo de cumplimiento del servidor">
              Cumplimiento: {mode.label}
            </span>
          )}
        </div>
      )}
      {access && (
        <>
          <p className="ag-callout">
            <Info size={18} aria-hidden="true" />
            <span>{MODE_TEXT[access.mode] ?? access.mode}</span>
          </p>
          <details className="ag-details">
            <summary>¿Cómo funcionan los permisos?</summary>
            <p>
              Un agente registrado y activo (gestor) lee toda la bóveda y escribe en sus carpetas y en AG - MENSAJES; en AG - SKILLS
              solo edita las skills de las que es propietario. Uno no registrado solo escribe en AG - MENSAJES.
            </p>
          </details>
          {access.agents.length === 0 && (
            <div className="ag-empty">
              <Bot size={28} aria-hidden="true" />
              <p>Ningún agente está registrado en esta bóveda.</p>
              <p className="ag-sub">Regístralo abajo con el id de su API key.</p>
            </div>
          )}
          <ul className="ag-list">
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
                folderChoices={folderChoices}
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
                folderChoices={folderChoices}
                onSave={save}
                onRemove={remove}
              />
            ))}
          </ul>
          {archived.length > 0 && (
            <section aria-label="Skills sin propietario" className="agent-orphan-skills">
              <h3 className="ag-section-title">Skills sin propietario</h3>
              <p className="ag-sub" style={{ marginBottom: "var(--space-3)" }}>
                Están archivadas: inactivas, en su carpeta, sin propietario ni invitados. Asigna cada una a un gestor para reactivarla (vuelve a «en revisión»).
              </p>
              <ul className="ag-list">
                {archived.map((skill) => {
                  const name = skillName(skill);
                  const target = assignTo[skill.note_id] ?? managers[0] ?? "";
                  return (
                    <li key={skill.note_id} aria-label={`Skill archivada ${name}`} className="ag-card">
                      <h3>{name}</h3>
                      <div className="ag-actions">
                        <div className="ag-field">
                          <label htmlFor={`assign-${skill.note_id}`}>Asignar {name} a</label>
                          <select id={`assign-${skill.note_id}`} value={target} disabled={managers.length === 0} onChange={(e) => setAssignTo((cur) => ({ ...cur, [skill.note_id]: e.target.value }))}>
                            {managers.map((id) => (
                              <option key={id} value={id}>
                                {id}
                              </option>
                            ))}
                            {managers.length === 0 && <option value="">Sin gestores activos</option>}
                          </select>
                        </div>
                        <span className="ag-spacer" />
                        <button
                          type="button"
                          disabled={busy || target === ""}
                          onClick={() => void run(() => assignSkill(vaultId, skill.note_id, target), `No se pudo asignar ${name}.`)}
                        >
                          Asignar {name}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <form
            className="ag-card ag-form"
            style={{ marginTop: "var(--space-4)" }}
            onSubmit={(e) => {
              e.preventDefault();
              const id = newAgent.trim();
              if (id) {
                void save(id, [], "activo");
                setNewAgent("");
              }
            }}
          >
            <div className="ag-inline">
              <div className="ag-field">
                <label htmlFor="agent-access-new">Registrar otro agente (id)</label>
                <input id="agent-access-new" value={newAgent} maxLength={32} placeholder="aira" onChange={(e) => setNewAgent(e.target.value)} />
              </div>
              <button type="submit" className="btn-primary" disabled={busy || !newAgent.trim()}>
                <UserPlus size={16} aria-hidden="true" /> Registrar
              </button>
            </div>
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
