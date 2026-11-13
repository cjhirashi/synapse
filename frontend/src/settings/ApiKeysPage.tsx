import { FormEvent, useCallback, useEffect, useState } from "react";
import { BookOpen, Check, KeyRound, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/auth";
import { PROBLEM } from "../api/problems";
import { ConfirmDialog } from "../editor/ConfirmDialog";
import { AgentKey, CreatedAgentKey, createAgentKey, listAgentKeys, revokeAgentKey } from "./apiKeys";
import ConnectAgentGuide from "./ConnectAgentGuide";
import "./agents.css";

// El backend limita el `label` a 1-64 caracteres (AgentKeyLabel); se valida también en cliente.
const MAX_LABEL = 64;
// Mismo patrón que el servidor (`AgentId`): id corto en minúsculas, p. ej. «aira».
const AGENT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Gestión de las API keys de agente del usuario de la sesión (SPEC-0013 / H-002.5): listar,
 * crear (con el secreto visible una sola vez) y revocar con confirmación. Sólo la interfaz
 * sobre `/auth/agent-keys`; el backend ya existe y está probado. Mismo patrón que
 * `ChangePasswordPage`: un 401 final (sesión cerrada) lleva a `/login`.
 */
export default function ApiKeysPage() {
  const [keys, setKeys] = useState<AgentKey[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [agentId, setAgentId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAgentKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<AgentKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"keys" | "connect">("keys");
  const navigate = useNavigate();

  // Un 401 aquí es una sesión cerrada (`request()` ya intentó renovarla); el resto se decide
  // por `type` del catálogo, no por código (SPEC-0004).
  const onUnauthorized = useCallback(
    (err: unknown): boolean => {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/login", { replace: true });
        return true;
      }
      return false;
    },
    [navigate],
  );

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setKeys(await listAgentKeys());
    } catch (err) {
      if (!onUnauthorized(err)) setLoadError(true);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const trimmed = label.trim();
    if (!trimmed) return setCreateError("Escribe un nombre para la key.");
    if (trimmed.length > MAX_LABEL) return setCreateError(`El nombre no puede superar los ${MAX_LABEL} caracteres.`);
    const agent = agentId.trim();
    if (agent && !AGENT_ID.test(agent)) {
      return setCreateError("El agente debe ser un id corto en minúsculas, números o guiones (p. ej. aira).");
    }
    setBusy(true);
    try {
      const key = await (agent ? createAgentKey(trimmed, { agent_id: agent, is_admin: isAdmin }) : createAgentKey(trimmed));
      setCreated(key);
      setCopied(false);
      setCreating(false);
      setLabel("");
      setAgentId("");
      setIsAdmin(false);
      await load();
    } catch (err) {
      if (onUnauthorized(err)) return;
      if (err instanceof ApiError && err.type === PROBLEM.agentKeyLabelTaken) {
        setCreateError("Ya tienes una API key activa con ese nombre. Usa otro.");
      } else if (err instanceof ApiError && err.type === PROBLEM.validationError) {
        setCreateError("El nombre de la key no es válido.");
      } else {
        setCreateError("No se pudo crear la API key. Inténtalo de nuevo.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke(key: AgentKey) {
    setBusy(true);
    setNotice(null);
    try {
      await revokeAgentKey(key.id);
      setRevoking(null);
      await load();
    } catch (err) {
      if (onUnauthorized(err)) return;
      setRevoking(null);
      setNotice(`No se pudo revocar «${key.label}». Inténtalo de nuevo.`);
    } finally {
      setBusy(false);
    }
  }

  async function copy(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // Sin API de portapapeles: el usuario puede seleccionar el texto manualmente.
    }
  }

  const active = (keys ?? []).filter((k) => !k.revoked_at);
  const revoked = (keys ?? []).filter((k) => k.revoked_at);

  const keyCard = (k: AgentKey) => (
    <li key={k.id} aria-labelledby={`key-${k.id}`} className={`ag-card${k.revoked_at ? " ag-card--muted" : ""}`}>
      <div className="ag-row">
        <span className={`ag-icon${k.revoked_at ? "" : " ag-icon--accent"}`} aria-hidden="true">
          <KeyRound size={18} />
        </span>
        <div className="ag-grow">
          <h3 id={`key-${k.id}`}>{k.label}</h3>
          <p className="ag-sub">
            Creada el {fmtDate(k.created_at)} · Último uso: {k.last_used_at ? fmtDate(k.last_used_at) : "nunca"}
          </p>
        </div>
        <span className={`ag-pill ${k.revoked_at ? "ag-pill--bad" : "ag-pill--ok"}`}>{k.revoked_at ? "Revocada" : "Activa"}</span>
      </div>
      <div className="ag-row">
        <div className="ag-meta" style={{ flex: 1 }}>
          <span className="ag-chip">Agente: {k.agent_id ? <code>{k.agent_id}</code> : "general"}</span>
          {k.is_admin && <span className="ag-chip">Administrador</span>}
        </div>
        {!k.revoked_at && (
          <button type="button" className="ag-danger" aria-label={`Revocar ${k.label}`} onClick={() => setRevoking(k)}>
            Revocar
          </button>
        )}
      </div>
    </li>
  );

  return (
    <section className="api-keys-page">
      <header className="ag-head">
        <div>
          <h2>API keys</h2>
          <p className="settings-section-intro">
            Conecta agentes externos (Claude, ChatGPT, Gemini, n8n…) a tus bóvedas. Cada key identifica a un agente y actúa con tu cuenta.
          </p>
        </div>
        {tab === "keys" && !creating && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setCreating(true);
              setCreateError(null);
            }}
          >
            <Plus size={16} aria-hidden="true" /> Crear API key
          </button>
        )}
      </header>

      <div className="ag-tabs" role="tablist" aria-label="API keys">
        <button type="button" role="tab" id="tab-keys" aria-selected={tab === "keys"} aria-controls="panel-keys" onClick={() => setTab("keys")}>
          Mis API keys{keys !== null ? ` (${active.length})` : ""}
        </button>
        <button type="button" role="tab" id="tab-connect" aria-selected={tab === "connect"} aria-controls="panel-connect" onClick={() => setTab("connect")}>
          Cómo conectar un agente
        </button>
      </div>

      {tab === "connect" && (
        <div role="tabpanel" id="panel-connect" aria-labelledby="tab-connect">
          <ConnectAgentGuide />
        </div>
      )}

      {tab === "keys" && (
        <div role="tabpanel" id="panel-keys" aria-labelledby="tab-keys" className="ag-list">
          {notice && <p role="alert" className="ag-callout ag-callout--warn">{notice}</p>}

          {created && (
            <div className="ag-card ag-secret" role="group" aria-label="Nueva API key">
              <h3>
                <Check size={18} aria-hidden="true" /> API key creada
              </h3>
              <p>
                Cópiala ahora: por seguridad <strong>no se volverá a mostrar</strong>.
              </p>
              <code className="ag-secret-value">{created.key}</code>
              <div className="ag-actions">
                <button type="button" className="btn-primary" onClick={() => void copy(created.key)}>
                  {copied ? "Copiado" : "Copiar"}
                </button>
                <button type="button" onClick={() => setCreated(null)}>
                  Entendido
                </button>
                <button type="button" onClick={() => setTab("connect")}>
                  <BookOpen size={14} aria-hidden="true" /> Ver cómo conectar un agente
                </button>
              </div>
            </div>
          )}

          {creating && (
            <form className="ag-card ag-form" onSubmit={submitCreate}>
              <h3>Nueva API key</h3>
              {createError && <p role="alert" className="ag-callout ag-callout--warn">{createError}</p>}
              <div className="ag-field">
                <label htmlFor="ak-label">Nombre de la key</label>
                <input id="ak-label" autoFocus value={label} maxLength={MAX_LABEL} onChange={(e) => setLabel(e.target.value)} />
                <p className="ag-help">Para distinguirla en la lista, por ejemplo el agente o la plataforma (op-chatgpt).</p>
              </div>
              <div className="ag-field">
                <label htmlFor="ak-agent">Agente (opcional; sin agente la key es general)</label>
                <input id="ak-agent" value={agentId} maxLength={32} placeholder="aira" onChange={(e) => setAgentId(e.target.value)} />
                <p className="ag-help">Id corto en minúsculas. Con él el servidor sabe qué agente escribe y aplica sus permisos por bóveda.</p>
              </div>
              <label className="ag-switch-row" aria-disabled={!agentId.trim()}>
                <input className="ag-switch" type="checkbox" checked={isAdmin} disabled={!agentId.trim()} onChange={(e) => setIsAdmin(e.target.checked)} />
                <span>Agente administrador</span>
              </label>
              <div className="ag-actions">
                <button type="submit" className="btn-primary" disabled={busy}>
                  Crear
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCreating(false);
                    setCreateError(null);
                    setLabel("");
                    setAgentId("");
                    setIsAdmin(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {keys === null && !loadError && <p className="ag-sub">Cargando…</p>}

          {loadError && (
            <div role="alert" className="ag-callout ag-callout--warn">
              No se pudieron cargar las API keys.{" "}
              <button type="button" onClick={() => void load()}>
                Reintentar
              </button>
            </div>
          )}

          {keys !== null && keys.length === 0 && !creating && (
            <div className="ag-empty">
              <KeyRound size={28} aria-hidden="true" />
              <p>Aún no tienes API keys.</p>
              <p className="ag-sub">Crea una para conectar un agente a tus bóvedas.</p>
            </div>
          )}

          {active.length > 0 && <ul className="ag-list">{active.map(keyCard)}</ul>}
          {revoked.length > 0 && (
            <>
              <h3 className="ag-section-title">Revocadas</h3>
              <ul className="ag-list">{revoked.map(keyCard)}</ul>
            </>
          )}
        </div>
      )}

      {revoking && (
        <ConfirmDialog
          titleId="revoke-key-title"
          title={`¿Revocar la API key «${revoking.label}»?`}
          tone="danger"
          body="Un agente que la use perderá el acceso. No se puede deshacer."
          onCancel={() => setRevoking(null)}
        >
          <button type="button" data-autofocus disabled={busy} onClick={() => setRevoking(null)}>
            Cancelar
          </button>
          <button type="button" className="btn-danger" disabled={busy} onClick={() => void confirmRevoke(revoking)}>
            Revocar
          </button>
        </ConfirmDialog>
      )}
    </section>
  );
}
