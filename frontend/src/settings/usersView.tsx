/** Piezas de presentación de la ventana de usuarios (H-060): las comparten la tabla de escritorio y las tarjetas del celular. */
import type { ReactNode } from "react";
import { BarChart3, Hourglass, RotateCcw, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { formatBytes, formatCount, type AdminRole, type AdminUser, type Grace } from "./adminUsers";

export const ROLE_LABEL: Record<AdminRole, string> = { super_admin: "Super admin", admin: "Administrador", guest: "Usuario" };
export const GRACE_LABEL: Record<Grace["kind"], string> = { vaults: "bóvedas", documents: "documentos", storage: "archivos" };

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

/** ¿Tiene límites? Solo los usuarios; admin y super admin no. */
export const isLimited = (user: AdminUser) => user.role === "guest";

export function Avatar({ user }: { user: AdminUser }) {
  return (
    <span className="us-avatar" data-role={user.role} aria-hidden="true">
      {(user.display_name || user.email).charAt(0).toUpperCase()}
    </span>
  );
}

/** Cuenta: inicial, correo (se corta con «…» y el título lo completa) y una línea de apoyo. En la tabla esa línea lleva el rol;
 * en la tarjeta del celular el rol va aparte, como píldora. */
export function AccountCell({ user, isMe, showRole }: { user: AdminUser; isMe: boolean; showRole?: boolean }) {
  return (
    <span className="us-account">
      <Avatar user={user} />
      <span className="us-account-text">
        <span className="us-email" title={user.email}>{user.email}</span>
        <span className="us-sub">
          {showRole && <><span className="us-rolename" data-role={user.role}>{ROLE_LABEL[user.role]}</span><span aria-hidden="true">·</span></>}
          <span>{user.display_name ? `${user.display_name} · ` : ""}Creada el {fmtDate(user.created_at)}</span>
          {isMe && <span className="us-me">Tú</span>}
        </span>
      </span>
    </span>
  );
}

export function RolePill({ role }: { role: AdminRole }) {
  return <span className="us-role" data-role={role}>{ROLE_LABEL[role]}</span>;
}

/** Uso frente al límite con una barra que pasa a ámbar desde el 80 % (también al llegar al tope) y a rojo solo al pasarse. */
export function Meter({ label, used, limit, format, hideLabel }: {
  label: string; used: number; limit: number | null; format: (n: number) => string; hideLabel?: boolean;
}) {
  const ratio = limit === null ? 0 : limit === 0 ? 1 : used / limit;
  return (
    <span className="us-meter">
      <span className={hideLabel ? "us-meter-label us-sr" : "us-meter-label"}>{label}</span>
      <span className="us-meter-value">{limit === null ? format(used) : `${format(used)} de ${format(limit)}`}</span>
      {limit !== null && (
        <progress aria-label={label} value={Math.min(used, limit || 1)} max={limit || 1} data-level={ratio > 1 ? "over" : ratio >= 0.8 ? "high" : "ok"} />
      )}
    </span>
  );
}

/** Tope de documentos por bóveda en una frase corta; vacío para un administrador (sin límites). */
function docsText(user: AdminUser): string {
  if (!isLimited(user)) return "Sin límites";
  const cap = user.limits.max_notes_per_vault;
  return cap === null ? "Documentos sin límite" : `${formatCount(cap)} documentos por bóveda`;
}

/** Bóvedas usadas contra su tope. En la tabla lleva debajo el tope de documentos; en la tarjeta ese dato va en su propio renglón. */
export function VaultsCell({ user, withDocs }: { user: AdminUser; withDocs?: boolean }) {
  if (user.vaults_used === null) return <span className="us-muted">–</span>;
  return (
    <span className="us-stack us-stack--fill">
      <Meter label="Bóvedas" used={user.vaults_used} limit={isLimited(user) ? user.limits.max_vaults : null} format={formatCount} hideLabel />
      {withDocs && <span className="us-muted">{docsText(user)}</span>}
    </span>
  );
}

/** Versión corta para la tarjeta del celular, donde la etiqueta «Documentos» ya está encima. */
export function DocsCell({ user }: { user: AdminUser }) {
  const cap = user.limits.max_notes_per_vault;
  if (!isLimited(user) || cap === null) return <span>Sin límite</span>;
  return <span>{formatCount(cap)} por bóveda</span>;
}

export function StorageCell({ user }: { user: AdminUser }) {
  const cap = user.limits.max_storage_bytes_per_vault;
  return (
    <span className="us-stack">
      <span className="us-strong">{formatBytes(user.storage_bytes)}</span>
      <span className="us-muted">{isLimited(user) && cap !== null ? `máx. ${formatBytes(cap)} por bóveda` : "Sin límite"}</span>
    </span>
  );
}

/** Estado en una sola píldora, por prioridad: eliminada > debe reducir > contraseña inicial > activa. */
export function StatusCell({ user, inline }: { user: AdminUser; inline?: boolean }) {
  const wrap = inline ? "us-inline" : "us-stack";
  if (user.deleted_at) {
    return (
      <span className={wrap}>
        <span className="us-pill" data-tone="bad">Eliminada</span>
        {user.purge_at && <span className="us-muted">Se borra el {shortDate(user.purge_at)}</span>}
      </span>
    );
  }
  if (user.grace.length > 0) {
    const first = user.grace[0];
    return (
      <span className={wrap}>
        <span className="us-pill" data-tone="warn"><Hourglass size={12} aria-hidden="true" /> Debe reducir</span>
        <span className="us-muted">{GRACE_LABEL[first.kind]} antes del {shortDate(first.deadline_at)}{user.grace.length > 1 ? ` (+${user.grace.length - 1})` : ""}</span>
      </span>
    );
  }
  if (user.must_change_password) {
    return (
      <span className={wrap}>
        <span className="us-pill" data-tone="info">Invitación pendiente</span>
        {!inline && <span className="us-muted">Contraseña inicial</span>}
      </span>
    );
  }
  return <span className="us-pill" data-tone="ok">Activa</span>;
}

export interface RowHandlers {
  isSuper: boolean;
  meId: string;
  busy: boolean;
  onUsage: (user: AdminUser) => void;
  onLimits: (user: AdminUser) => void;
  onRole: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
  onRestore: (user: AdminUser) => void;
}

/** Acciones de una cuenta. `labeled`: botones con texto de 44 px para el celular; si no, íconos de 32 px con su título. */
export function RowActions({ user, h, labeled }: { user: AdminUser; h: RowHandlers; labeled?: boolean }) {
  const gone = user.deleted_at !== null;
  const isMe = user.id === h.meId;
  // `short`: la etiqueta visible en el celular (cuatro botones en una fila); el título y el nombre accesible llevan el texto completo.
  const item = (label: string, short: string, ariaLabel: string, icon: ReactNode, onClick: () => void, extra?: { danger?: boolean; disabled?: boolean }) => (
    <button
      type="button" className={extra?.danger ? "us-act us-act--danger" : "us-act"} aria-label={ariaLabel} title={label}
      disabled={extra?.disabled} onClick={onClick}
    >
      {icon}
      {labeled && <span>{short}</span>}
    </button>
  );
  return (
    <span className={labeled ? "us-actions us-actions--labeled" : "us-actions"}>
      {gone ? (
        item("Recuperar", "Recuperar", `Recuperar ${user.email}`, <RotateCcw size={16} aria-hidden="true" />, () => h.onRestore(user), { disabled: h.busy })
      ) : (
        <>
          {item("Ver uso", "Uso", `Ver el uso de ${user.email}`, <BarChart3 size={16} aria-hidden="true" />, () => h.onUsage(user))}
          {isLimited(user) && item("Límites", "Límites", `Límites de ${user.email}`, <SlidersHorizontal size={16} aria-hidden="true" />, () => h.onLimits(user), { disabled: h.busy })}
          {h.isSuper && !isMe && user.role !== "super_admin" &&
            item(user.role === "admin" ? "Hacer usuario" : "Hacer admin", "Rol", `Cambiar el rol de ${user.email}`, <ShieldCheck size={16} aria-hidden="true" />, () => h.onRole(user), { disabled: h.busy })}
          {!isMe && item("Eliminar", "Eliminar", `Eliminar ${user.email}`, <Trash2 size={16} aria-hidden="true" />, () => h.onDelete(user), { danger: true, disabled: h.busy })}
        </>
      )}
    </span>
  );
}

/** Tarjeta de una cuenta para el celular (~190 px): cuenta con su rol y fecha, dos datos lado a lado (bóvedas con su tope de
 * documentos, y archivos), el estado solo si no es «Activa» y las acciones en una sola fila. */
export function UserCard({ user, h }: { user: AdminUser; h: RowHandlers }) {
  const active = !user.deleted_at && user.grace.length === 0 && !user.must_change_password;
  return (
    <li className={user.deleted_at ? "us-card us-card--gone" : "us-card"} aria-label={user.email}>
      <AccountCell user={user} isMe={user.id === h.meId} showRole />
      {!active && <div className="us-card-status"><StatusCell user={user} inline /></div>}
      <div className="us-facts">
        <div><span className="us-fact-label">Bóvedas</span><VaultsCell user={user} withDocs /></div>
        <div><span className="us-fact-label">Archivos</span><StorageCell user={user} /></div>
      </div>
      <RowActions user={user} h={h} labeled />
    </li>
  );
}
