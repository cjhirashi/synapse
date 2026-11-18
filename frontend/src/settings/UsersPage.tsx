import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/auth";
import { PROBLEM } from "../api/problems";
import { useMe } from "../auth/RequireAuth";
import { ConfirmDialog } from "../editor/ConfirmDialog";
import {
  type AdminRole, type AdminUser, type Grace, type UserLimits, type UserUsage, MB,
  createUser, deleteUser, formatBytes, formatCount, getUsage, listUsers, parseLimit, restoreUser, updateLimits, updateRole,
} from "./adminUsers";
import "./agents.css";
import "./users.css";

const ROLE_LABEL: Record<AdminRole, string> = { super_admin: "Super admin", admin: "Administrador", guest: "Usuario" };
const GRACE_LABEL: Record<Grace["kind"], string> = { vaults: "bóvedas", documents: "documentos", storage: "archivos" };

/** Valores iniciales del formulario de alta (decisión de Carlos, 2026-11-18). */
const INITIAL = { vaults: "2", notes: "100", storageMb: "500" };

type LimitText = typeof INITIAL;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

function toText(limits: UserLimits): LimitText {
  return {
    vaults: limits.max_vaults === null ? "" : String(limits.max_vaults),
    notes: limits.max_notes_per_vault === null ? "" : String(limits.max_notes_per_vault),
    storageMb: limits.max_storage_bytes_per_vault === null ? "" : String(Math.round(limits.max_storage_bytes_per_vault / MB)),
  };
}

/** Los tres campos de texto → límites del servidor, o `null` si alguno no es un entero ≥ 0. */
function toLimits(text: LimitText): UserLimits | null {
  const vaults = parseLimit(text.vaults);
  const notes = parseLimit(text.notes);
  const storage = parseLimit(text.storageMb);
  if (vaults === undefined || notes === undefined || storage === undefined) return null;
  return { max_vaults: vaults, max_notes_per_vault: notes, max_storage_bytes_per_vault: storage === null ? null : storage * MB };
}

function LimitFields({ idPrefix, value, onChange }: { idPrefix: string; value: LimitText; onChange: (next: LimitText) => void }) {
  const field = (key: keyof LimitText, label: string, unit: string) => (
    <div className="ag-field">
      <label htmlFor={`${idPrefix}-${key}`}>{label}</label>
      <div className="us-input">
        <input
          id={`${idPrefix}-${key}`} type="text" inputMode="numeric" autoComplete="off" placeholder="Sin límite"
          value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
        <span aria-hidden="true">{unit}</span>
      </div>
    </div>
  );
  return (
    <div className="us-limits">
      {field("vaults", "Bóvedas", "bóvedas")}
      {field("notes", "Documentos por bóveda", "documentos")}
      {field("storageMb", "Almacenamiento por bóveda", "MB")}
      <p className="ag-help us-limits-help">Déjalo vacío para no poner límite. Solo rigen para usuarios; los administradores no tienen límites.</p>
    </div>
  );
}

/** Uso frente al límite: «12 de 100» o «12» si no hay límite, con una barra que avisa al pasar del 80 %. */
function Meter({ label, used, limit, format }: { label: string; used: number; limit: number | null; format: (n: number) => string }) {
  const ratio = limit === null || limit === 0 ? 0 : Math.min(used / limit, 1);
  return (
    <div className="us-meter">
      <span className="us-meter-label">{label}</span>
      <span className="us-meter-value">{limit === null ? format(used) : `${format(used)} de ${format(limit)}`}</span>
      {limit !== null && <progress aria-label={label} value={used} max={limit || 1} data-high={ratio >= 0.8 ? "" : undefined} />}
    </div>
  );
}

function UsagePanel({ user, usage }: { user: AdminUser; usage: UserUsage | "loading" | "error" }) {
  if (usage === "loading") return <p className="ag-sub">Calculando el uso…</p>;
  if (usage === "error") return <p role="alert" className="ag-callout ag-callout--warn">No se pudo calcular el uso.</p>;
  const { max_vaults: vaults, max_notes_per_vault: notes, max_storage_bytes_per_vault: storage } = user.limits;
  const limited = user.role === "guest";
  return (
    <div className="us-usage" aria-label={`Uso de ${user.email}`}>
      <Meter label="Bóvedas" used={usage.vaults.length} limit={limited ? vaults : null} format={formatCount} />
      <Meter label="Documentos en total" used={usage.documents_total} limit={null} format={formatCount} />
      <Meter label="Archivos en total" used={usage.storage_bytes_total} limit={null} format={formatBytes} />
      {usage.vaults.length === 0 ? <p className="ag-sub">Aún no tiene bóvedas.</p> : (
        <ul className="us-usage-vaults">
          {usage.vaults.map((v) => (
            <li key={v.vault_id}>
              <h4>{v.name || "Sin nombre"}</h4>
              <Meter label="Documentos" used={v.documents} limit={limited ? notes : null} format={formatCount} />
              <Meter label="Archivos" used={v.storage_bytes} limit={limited ? storage : null} format={formatBytes} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function limitChips(user: AdminUser) {
  const { max_vaults: vaults, max_notes_per_vault: notes, max_storage_bytes_per_vault: storage } = user.limits;
  const none = "sin límite";
  return [
    `Bóvedas: ${user.vaults_used === null ? "–" : formatCount(user.vaults_used)} de ${vaults === null ? none : formatCount(vaults)}`,
    `Documentos por bóveda: ${notes === null ? none : formatCount(notes)}`,
    `Almacenamiento por bóveda: ${storage === null ? none : formatBytes(storage)}`,
    `Archivos en total: ${formatBytes(user.storage_bytes)}`,
  ];
}

/**
 * Gestión de cuentas (H-060): el administrador crea cuentas con la contraseña base, ajusta sus límites y las elimina (con 30 días
 * para recuperarlas). El super admin además crea administradores y cambia roles. Móvil primero: tarjetas, no tabla.
 * La visibilidad de la sección es cortesía; el servidor protege cada ruta.
 */
export default function UsersPage() {
  const me = useMe();
  const navigate = useNavigate();
  const isSuper = me.role === "super_admin";
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"guest" | "admin">("guest");
  const [newLimits, setNewLimits] = useState<LimitText>(INITIAL);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [editLimits, setEditLimits] = useState<LimitText>(INITIAL);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [typed, setTyped] = useState("");
  const [roleChange, setRoleChange] = useState<AdminUser | null>(null);
  const [usageOf, setUsageOf] = useState<string | null>(null);
  const [usage, setUsage] = useState<UserUsage | "loading" | "error">("loading");

  // Un 401 aquí es una sesión cerrada (`request()` ya intentó renovarla).
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
      setUsers(await listUsers());
    } catch (err) {
      if (!onUnauthorized(err)) setLoadError(true);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  function explain(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
      if (err.type === PROBLEM.emailTaken) return "Ya existe una cuenta con ese correo.";
      if (err.type === PROBLEM.userActionForbidden) return "No puedes hacer eso con esa cuenta (la tuya, la de otro administrador o el último super admin).";
      if (err.type === PROBLEM.userNotFound) return "Esa cuenta ya no existe. Se actualizó la lista.";
      if (err.type === PROBLEM.userStateConflict) return "La cuenta cambió mientras la veías. Se actualizó la lista.";
      if (err.type === PROBLEM.validationError) return "Revisa los datos: el correo debe ser válido y los límites, números enteros.";
    }
    return fallback;
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const limits = toLimits(newLimits);
    if (!email.trim()) return setCreateError("Escribe el correo de la cuenta.");
    if (!limits) return setCreateError("Los límites deben ser números enteros, o vacíos para no limitar.");
    setBusy(true);
    try {
      await createUser(email.trim(), newRole, limits);
      setCreating(false);
      setEmail("");
      setNewRole("guest");
      setNewLimits(INITIAL);
      setNotice(`Cuenta creada. Entra con el correo y la contraseña inicial admin1234; se le pedirá cambiarla.`);
      await load();
    } catch (err) {
      if (!onUnauthorized(err)) setCreateError(explain(err, "No se pudo crear la cuenta. Inténtalo de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<unknown>, done: string | null, fallback: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
    } catch (err) {
      if (onUnauthorized(err)) return;
      setNotice(explain(err, fallback));
    } finally {
      setBusy(false);
      await load();
    }
  }

  async function toggleUsage(user: AdminUser) {
    if (usageOf === user.id) return setUsageOf(null);
    setUsageOf(user.id);
    setUsage("loading");
    try {
      const loaded = await getUsage(user.id);
      setUsage((current) => (current === "loading" ? loaded : current));
    } catch (err) {
      if (!onUnauthorized(err)) setUsage("error");
    }
  }

  async function submitLimits(e: FormEvent, user: AdminUser) {
    e.preventDefault();
    setEditError(null);
    const limits = toLimits(editLimits);
    if (!limits) return setEditError("Los límites deben ser números enteros, o vacíos para no limitar.");
    setBusy(true);
    try {
      const saved = await updateLimits(user.id, limits);
      setEditing(null);
      setNotice(
        saved.grace.length > 0
          ? "Límites guardados. La persona quedó por encima en algo: recibió un aviso y tiene 30 días para reducirlo."
          : "Límites guardados.",
      );
      await load();
    } catch (err) {
      if (!onUnauthorized(err)) setEditError(explain(err, "No se pudieron guardar los límites. Inténtalo de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  const active = (users ?? []).filter((u) => !u.deleted_at);
  const removed = (users ?? []).filter((u) => u.deleted_at);

  const card = (u: AdminUser) => {
    const isMe = u.id === me.user_id;
    const gone = u.deleted_at !== null;
    const unlimited = u.role !== "guest";
    return (
      <li key={u.id} aria-labelledby={`user-${u.id}`} className={`ag-card${gone ? " ag-card--muted" : ""}`}>
        <div className="ag-row">
          <span className="ag-icon" aria-hidden="true">{u.role === "guest" ? <UserRound size={18} /> : <ShieldCheck size={18} />}</span>
          <div className="ag-grow us-who">
            <h3 id={`user-${u.id}`}>{u.email}</h3>
            <p className="ag-sub">
              {u.display_name ? `${u.display_name} · ` : ""}Creada el {fmtDate(u.created_at)}{isMe ? " · Eres tú" : ""}
            </p>
          </div>
        </div>

        <div className="ag-meta">
          <span className="ag-pill">{ROLE_LABEL[u.role]}</span>
          {unlimited ? <span className="ag-chip">Sin límites</span> : limitChips(u).map((text) => <span key={text} className="ag-chip">{text}</span>)}
          {u.must_change_password && !gone && <span className="ag-chip us-chip-warn">Aún no cambia la contraseña inicial</span>}
          {u.grace.map((g) => (
            <span key={`${g.kind}-${g.vault_id}`} className="ag-chip us-chip-warn">
              Debe reducir sus {GRACE_LABEL[g.kind]} antes del {fmtDate(g.deadline_at)}
            </span>
          ))}
          {gone && u.purge_at && <span className="ag-chip us-chip-warn">Se borra para siempre el {fmtDate(u.purge_at)}</span>}
        </div>

        {editing === u.id ? (
          <form className="ag-form us-edit" onSubmit={(e) => void submitLimits(e, u)} aria-label={`Límites de ${u.email}`}>
            {editError && <p role="alert" className="ag-callout ag-callout--warn">{editError}</p>}
            <LimitFields idPrefix={`lim-${u.id}`} value={editLimits} onChange={setEditLimits} />
            <div className="ag-actions">
              <button type="submit" className="btn-primary" disabled={busy}>Guardar límites</button>
              <button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <div className="ag-actions us-actions">
            {gone ? (
              <button type="button" disabled={busy} aria-label={`Recuperar ${u.email}`} onClick={() => void run(() => restoreUser(u.id), "Cuenta recuperada.", "No se pudo recuperar la cuenta.")}>
                <RotateCcw size={14} aria-hidden="true" /> Recuperar
              </button>
            ) : (
              <>
                <button type="button" aria-expanded={usageOf === u.id} aria-label={`Ver el uso de ${u.email}`} onClick={() => void toggleUsage(u)}>
                  {usageOf === u.id ? "Ocultar uso" : "Ver uso"}
                </button>
                {u.role === "guest" && (
                  <button type="button" disabled={busy} aria-label={`Límites de ${u.email}`} onClick={() => { setEditing(u.id); setEditLimits(toText(u.limits)); setEditError(null); }}>
                    Límites
                  </button>
                )}
                {isSuper && !isMe && u.role !== "super_admin" && (
                  <button type="button" disabled={busy} aria-label={`Cambiar el rol de ${u.email}`} onClick={() => setRoleChange(u)}>
                    {u.role === "admin" ? "Hacer usuario" : "Hacer administrador"}
                  </button>
                )}
                {!isMe && (
                  <button type="button" className="ag-danger" disabled={busy} aria-label={`Eliminar ${u.email}`} onClick={() => { setDeleting(u); setTyped(""); }}>
                    Eliminar
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {usageOf === u.id && !gone && <UsagePanel user={u} usage={usage} />}
      </li>
    );
  };

  return (
    <section className="users-page">
      <header className="ag-head">
        <div>
          <h2>Usuarios</h2>
          <p className="settings-section-intro">
            Crea cuentas y ajusta lo que puede usar cada una. Las cuentas nuevas entran con la contraseña inicial <code>admin1234</code> y deben cambiarla en su primer ingreso.
          </p>
        </div>
        {!creating && (
          <button type="button" className="btn-primary" onClick={() => { setCreating(true); setCreateError(null); setNotice(null); }}>
            <Plus size={16} aria-hidden="true" /> Crear usuario
          </button>
        )}
      </header>

      <div className="ag-list">
        {notice && <p role="status" className="ag-callout">{notice}</p>}

        {creating && (
          <form className="ag-card ag-form" onSubmit={submitCreate} aria-label="Nuevo usuario">
            <h3>Nuevo usuario</h3>
            {createError && <p role="alert" className="ag-callout ag-callout--warn">{createError}</p>}
            <div className="ag-field">
              <label htmlFor="us-email">Correo</label>
              <input id="us-email" type="email" autoFocus autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {isSuper && (
              <div className="ag-field">
                <label htmlFor="us-role">Rol</label>
                <select id="us-role" value={newRole} onChange={(e) => setNewRole(e.target.value as "guest" | "admin")}>
                  <option value="guest">Usuario</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            )}
            {newRole === "guest" && <LimitFields idPrefix="new" value={newLimits} onChange={setNewLimits} />}
            <div className="ag-actions">
              <button type="submit" className="btn-primary" disabled={busy}>Crear cuenta</button>
              <button type="button" disabled={busy} onClick={() => { setCreating(false); setCreateError(null); }}>Cancelar</button>
            </div>
          </form>
        )}

        {users === null && !loadError && <p className="ag-sub">Cargando…</p>}
        {loadError && (
          <div role="alert" className="ag-callout ag-callout--warn">
            No se pudieron cargar las cuentas. <button type="button" onClick={() => void load()}>Reintentar</button>
          </div>
        )}
        {users !== null && active.length === 0 && !creating && (
          <div className="ag-empty">
            <UserRound size={28} aria-hidden="true" />
            <p>Aún no hay cuentas.</p>
            <p className="ag-sub">Crea la primera para dar acceso a otra persona.</p>
          </div>
        )}
        {active.length > 0 && <ul className="ag-list">{active.map(card)}</ul>}
        {removed.length > 0 && (
          <>
            <h3 className="ag-section-title">Eliminadas</h3>
            <p className="ag-sub">Se pueden recuperar durante 30 días; después se borra todo lo suyo.</p>
            <ul className="ag-list">{removed.map(card)}</ul>
          </>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          titleId="delete-user-title"
          title={`¿Eliminar la cuenta de ${deleting.email}?`}
          tone="danger"
          onCancel={() => setDeleting(null)}
          body={
            <>
              <p>Su sesión se cierra y no podrá entrar. Tienes 30 días para recuperarla; pasado ese plazo se borran para siempre sus bóvedas, documentos y archivos.</p>
              <div className="ag-field us-confirm-field">
                <label htmlFor="us-confirm">Para confirmar, escribe su correo</label>
                <input id="us-confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </div>
            </>
          }
        >
          <button type="button" data-autofocus disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button>
          <button
            type="button" className="btn-danger" disabled={busy || typed.trim().toLowerCase() !== deleting.email}
            onClick={() => { const target = deleting; setDeleting(null); void run(() => deleteUser(target.id), `Cuenta de ${target.email} eliminada. Puedes recuperarla durante 30 días.`, "No se pudo eliminar la cuenta."); }}
          >
            Eliminar cuenta
          </button>
        </ConfirmDialog>
      )}

      {roleChange && (
        <ConfirmDialog
          titleId="role-user-title"
          title={roleChange.role === "admin" ? `¿Quitar el rol de administrador a ${roleChange.email}?` : `¿Hacer administrador a ${roleChange.email}?`}
          tone="warning"
          onCancel={() => setRoleChange(null)}
          body={roleChange.role === "admin"
            ? "Volverá a ser un usuario, con los límites que tenía. Su sesión se cierra y debe entrar de nuevo."
            : "Podrá crear y gestionar usuarios, y dejará de tener límites. Su sesión se cierra y debe entrar de nuevo."}
        >
          <button type="button" data-autofocus disabled={busy} onClick={() => setRoleChange(null)}>Cancelar</button>
          <button
            type="button" className="btn-primary" disabled={busy}
            onClick={() => { const target = roleChange; setRoleChange(null); void run(() => updateRole(target.id, target.role === "admin" ? "guest" : "admin"), "Rol actualizado.", "No se pudo cambiar el rol."); }}
          >
            Confirmar
          </button>
        </ConfirmDialog>
      )}
    </section>
  );
}
