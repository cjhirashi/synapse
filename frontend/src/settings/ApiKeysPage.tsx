import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/auth";
import { PROBLEM } from "../api/problems";
import { ConfirmDialog } from "../editor/ConfirmDialog";
import { AgentKey, CreatedAgentKey, createAgentKey, listAgentKeys, revokeAgentKey } from "./apiKeys";

// El backend limita el `label` a 1-64 caracteres (AgentKeyLabel); se valida también en cliente.
const MAX_LABEL = 64;

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
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAgentKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<AgentKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    try {
      const key = await createAgentKey(trimmed);
      setCreated(key);
      setCopied(false);
      setCreating(false);
      setLabel("");
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

  return (
    <section className="api-keys-page">
      <div className="page-header">
        <h1>API keys</h1>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setCreateError(null);
            }}
          >
            Crear API key
          </button>
        )}
      </div>

      {notice && <p role="alert">{notice}</p>}

      {created && (
        <div className="card-form api-key-created" role="group" aria-label="Nueva API key">
          <h2>API key creada</h2>
          <p>
            Cópiala ahora: por seguridad <strong>no se volverá a mostrar</strong>.
          </p>
          <code className="api-key-secret">{created.key}</code>
          <div className="api-key-created-actions">
            <button type="button" onClick={() => void copy(created.key)}>
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button type="button" onClick={() => setCreated(null)}>
              Entendido
            </button>
          </div>
        </div>
      )}

      {creating && (
        <form className="card-form" onSubmit={submitCreate}>
          {createError && <p role="alert">{createError}</p>}
          <label>
            Nombre de la key
            <input autoFocus value={label} maxLength={MAX_LABEL} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <div className="api-key-form-actions">
            <button type="submit" disabled={busy}>
              Crear
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setCreating(false);
                setCreateError(null);
                setLabel("");
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {keys === null && !loadError && <p>Cargando…</p>}

      {loadError && (
        <div role="alert">
          No se pudieron cargar las API keys.{" "}
          <button type="button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}

      {keys !== null && keys.length === 0 && !creating && <p>Aún no tienes API keys.</p>}

      {keys !== null && keys.length > 0 && (
        <ul className="card-list">
          {keys.map((k) => (
            <li key={k.id} aria-labelledby={`key-${k.id}`}>
              <h2 id={`key-${k.id}`}>{k.label}</h2>
              <p>
                Creada el {fmtDate(k.created_at)}
                {" · "}
                Último uso: {k.last_used_at ? fmtDate(k.last_used_at) : "nunca"}
                {" · "}
                <span className={k.revoked_at ? "api-key-revoked" : "api-key-active"}>
                  {k.revoked_at ? "Revocada" : "Activa"}
                </span>
              </p>
              {!k.revoked_at && (
                <button type="button" aria-label={`Revocar ${k.label}`} onClick={() => setRevoking(k)}>
                  Revocar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {revoking && (
        <ConfirmDialog
          titleId="revoke-key-title"
          title={`¿Revocar la API key «${revoking.label}»? Un agente que la use perderá el acceso y no se puede deshacer.`}
          onCancel={() => setRevoking(null)}
        >
          <button type="button" disabled={busy} onClick={() => void confirmRevoke(revoking)}>
            Revocar
          </button>
          <button type="button" data-autofocus disabled={busy} onClick={() => setRevoking(null)}>
            Cancelar
          </button>
        </ConfirmDialog>
      )}
    </section>
  );
}
