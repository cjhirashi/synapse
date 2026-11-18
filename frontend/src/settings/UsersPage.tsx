import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, HardDrive, Hourglass, Plus, Search, Users, Folder } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/auth";
import { PROBLEM } from "../api/problems";
import { useMe } from "../auth/RequireAuth";
import { ConfirmDialog } from "../editor/ConfirmDialog";
import { useMediaQuery } from "../layout/useMediaQuery";
import { DataTable, type DataColumn } from "../ui/DataTable";
import {
  type AdminUser, type UserLimits, type UserUsage,
  createUser, deleteUser, formatBytes, formatCount, getUsage, listUsers, restoreUser, updateLimits, updateRole,
} from "./adminUsers";
import { CreateUserDialog, LimitsDialog, UsageDialog } from "./UsersDialogs";
import {
  AccountCell, RowActions, StatusCell, StorageCell, UserCard, VaultsCell, type RowHandlers,
} from "./usersView";
import "./agents.css";
import "./users.css";

type Filter = "all" | "guest" | "admin" | "gone";
type Dialog = { kind: "create" } | { kind: "limits"; user: AdminUser } | { kind: "usage"; user: AdminUser } | null;

const COLUMNS: DataColumn<AdminUser>[] = [
  { key: "account", label: "Cuenta", key_column: true, size: "xl", sortValue: (u) => u.email },
  { key: "vaults", label: "Bóvedas", size: "lg", sortValue: (u) => u.vaults_used ?? -1 },
  { key: "storage", label: "Archivos", size: "lg", sortValue: (u) => u.storage_bytes },
  { key: "status", label: "Estado", size: "lg", sortValue: (u) => (u.deleted_at ? 3 : u.grace.length > 0 ? 2 : u.must_change_password ? 1 : 0) },
];

/**
 * Gestión de cuentas (H-060): el administrador crea cuentas con la contraseña base, ajusta sus límites, ve su uso y las
 * elimina (con 30 días para recuperarlas). El super admin además crea administradores y cambia roles. Escritorio: la tabla
 * compartida (`DataTable`); celular: tarjetas compactas con los mismos datos y acciones. Los formularios van en ventanas.
 * La visibilidad de la sección es cortesía; el servidor protege cada ruta.
 */
export default function UsersPage() {
  const me = useMe();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const isSuper = me.role === "super_admin";
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const [dialog, setDialog] = useState<Dialog>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UserUsage | "loading" | "error">("loading");
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [typed, setTyped] = useState("");
  const [roleChange, setRoleChange] = useState<AdminUser | null>(null);

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

  async function submitCreate(email: string, role: "guest" | "admin", limits: UserLimits) {
    setFormError(null);
    setBusy(true);
    try {
      await createUser(email, role, limits);
      setDialog(null);
      setNotice("Cuenta creada. Entra con el correo y la contraseña inicial admin1234; se le pedirá cambiarla.");
      await load();
    } catch (err) {
      if (!onUnauthorized(err)) setFormError(explain(err, "No se pudo crear la cuenta. Inténtalo de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  async function submitLimits(user: AdminUser, limits: UserLimits) {
    setFormError(null);
    setBusy(true);
    try {
      const saved = await updateLimits(user.id, limits);
      setDialog(null);
      setNotice(
        saved.grace.length > 0
          ? "Límites guardados. La persona quedó por encima en algo: recibió un aviso y tiene 30 días para reducirlo."
          : "Límites guardados.",
      );
      await load();
    } catch (err) {
      if (!onUnauthorized(err)) setFormError(explain(err, "No se pudieron guardar los límites. Inténtalo de nuevo."));
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

  async function openUsage(user: AdminUser) {
    setDialog({ kind: "usage", user });
    setUsage("loading");
    try {
      setUsage(await getUsage(user.id));
    } catch (err) {
      if (!onUnauthorized(err)) setUsage("error");
    }
  }

  const handlers: RowHandlers = {
    isSuper, meId: me.user_id, busy,
    onUsage: (u) => void openUsage(u),
    onLimits: (u) => { setFormError(null); setDialog({ kind: "limits", user: u }); },
    onRole: setRoleChange,
    onDelete: (u) => { setDeleting(u); setTyped(""); },
    onRestore: (u) => void run(() => restoreUser(u.id), "Cuenta recuperada.", "No se pudo recuperar la cuenta."),
  };

  const active = useMemo(() => (users ?? []).filter((u) => !u.deleted_at), [users]);
  const removed = useMemo(() => (users ?? []).filter((u) => u.deleted_at), [users]);
  const counts: Record<Filter, number> = {
    all: active.length,
    guest: active.filter((u) => u.role === "guest").length,
    admin: active.filter((u) => u.role !== "guest").length,
    gone: removed.length,
  };
  const visible = useMemo(() => {
    const base = filter === "gone" ? removed : filter === "guest" ? active.filter((u) => u.role === "guest")
      : filter === "admin" ? active.filter((u) => u.role !== "guest") : active;
    const q = query.trim().toLowerCase();
    return q ? base.filter((u) => u.email.toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q)) : base;
  }, [filter, query, active, removed]);

  const totals = {
    vaults: active.reduce((n, u) => n + (u.vaults_used ?? 0), 0),
    storage: active.reduce((n, u) => n + u.storage_bytes, 0),
    reducing: active.filter((u) => u.grace.length > 0).length,
  };

  // En el celular «Administradores» no cabe junto a las otras tres en una fila: se acorta.
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "Todas" }, { key: "guest", label: "Usuarios" }, { key: "admin", label: isMobile ? "Admins" : "Administradores" }, { key: "gone", label: "Eliminadas" },
  ];

  const emptyMessage = query.trim() ? "Ninguna cuenta coincide con la búsqueda." : filter === "gone" ? "No hay cuentas eliminadas." : "Aún no hay cuentas en este grupo.";

  return (
    <section className="users-page">
      <header className="us-head">
        <div>
          <h2>Usuarios</h2>
          <p className="settings-section-intro">Crea cuentas, ajusta lo que puede usar cada una y revisa cuánto usa. Las cuentas nuevas entran con la contraseña inicial <code>admin1234</code>.</p>
        </div>
        <button type="button" className="btn-primary us-create" aria-label="Crear usuario" onClick={() => { setFormError(null); setNotice(null); setDialog({ kind: "create" }); }}>
          <Plus size={16} aria-hidden="true" /> {isMobile ? "Crear" : "Crear usuario"}
        </button>
      </header>

      {users !== null && (
        <dl className="us-stats" aria-label="Resumen">
          <div className="us-stat"><dt><Users size={14} aria-hidden="true" /> Cuentas</dt><dd>{formatCount(active.length)}</dd></div>
          <div className="us-stat"><dt><Folder size={14} aria-hidden="true" /> Bóvedas</dt><dd>{formatCount(totals.vaults)}</dd></div>
          <div className="us-stat"><dt><HardDrive size={14} aria-hidden="true" /> Archivos</dt><dd>{formatBytes(totals.storage)}</dd></div>
          <div className="us-stat" data-tone={totals.reducing > 0 ? "warn" : undefined}><dt><Hourglass size={14} aria-hidden="true" /> Por reducir</dt><dd>{formatCount(totals.reducing)}</dd></div>
        </dl>
      )}

      {notice && <p role="status" className="ag-callout us-notice">{notice}</p>}

      <div className="us-toolbar">
        <div className="us-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="Buscar cuenta" placeholder="Buscar por correo o nombre" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="us-seg" role="group" aria-label="Filtrar cuentas">
          {FILTERS.map(({ key, label }) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label} <span className="us-seg-count">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {users === null && !loadError && <p className="ag-sub">Cargando…</p>}
      {loadError && (
        <div role="alert" className="ag-callout ag-callout--warn">
          No se pudieron cargar las cuentas. <button type="button" onClick={() => void load()}>Reintentar</button>
        </div>
      )}

      {users !== null && (isMobile ? (
        visible.length === 0 ? <p className="data-table-empty">{emptyMessage}</p> : (
          <ul className="us-cards" aria-label="Cuentas">
            {visible.map((u) => <UserCard key={u.id} user={u} h={handlers} />)}
          </ul>
        )
      ) : (
        <DataTable
          label="Cuentas" columns={COLUMNS} rows={visible} getRowKey={(u) => u.id} emptyMessage={emptyMessage}
          initialSort={{ key: "account", dir: "asc" }} actionsLabel="Acciones"
          renderCell={(u, column) => {
            switch (column.key) {
              case "account": return <AccountCell user={u} isMe={u.id === me.user_id} showRole />;
              case "vaults": return <VaultsCell user={u} withDocs />;
              case "storage": return <StorageCell user={u} />;
              default: return <StatusCell user={u} />;
            }
          }}
          rowActions={(u) => <RowActions user={u} h={handlers} />}
        />
      ))}

      {users !== null && users.length === 0 && !loadError && (
        <div className="ag-empty">
          <Archive size={28} aria-hidden="true" />
          <p>Aún no hay cuentas.</p>
        </div>
      )}

      {dialog?.kind === "create" && (
        <CreateUserDialog isSuper={isSuper} busy={busy} error={formError} onSubmit={(e, r, l) => void submitCreate(e, r, l)} onCancel={() => setDialog(null)} />
      )}
      {dialog?.kind === "limits" && (
        <LimitsDialog user={dialog.user} busy={busy} error={formError} onSubmit={(l) => void submitLimits(dialog.user, l)} onCancel={() => setDialog(null)} />
      )}
      {dialog?.kind === "usage" && <UsageDialog user={dialog.user} usage={usage} onClose={() => setDialog(null)} />}

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
