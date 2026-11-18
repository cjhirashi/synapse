/** Ventanas de la gestión de usuarios (H-060): alta, límites y uso. El formulario vive en una ventana, no dentro de la lista. */
import { FormEvent, useState } from "react";
import { BarChart3, SlidersHorizontal, UserPlus } from "lucide-react";
import DialogFrame from "../editor/DialogFrame";
import { MB, formatBytes, formatCount, parseLimit, type AdminUser, type UserLimits, type UserUsage } from "./adminUsers";
import { isLimited, Meter } from "./usersView";

/** Valores iniciales del formulario de alta (decisión de Carlos, 2026-11-18). */
export const INITIAL = { vaults: "2", notes: "100", storageMb: "500" };
export type LimitText = typeof INITIAL;

export function toText(limits: UserLimits): LimitText {
  return {
    vaults: limits.max_vaults === null ? "" : String(limits.max_vaults),
    notes: limits.max_notes_per_vault === null ? "" : String(limits.max_notes_per_vault),
    storageMb: limits.max_storage_bytes_per_vault === null ? "" : String(Math.round(limits.max_storage_bytes_per_vault / MB)),
  };
}

/** Los tres campos de texto → límites del servidor, o `null` si alguno no es un entero ≥ 0. */
export function toLimits(text: LimitText): UserLimits | null {
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

export function CreateUserDialog({ isSuper, busy, error, onSubmit, onCancel }: {
  isSuper: boolean; busy: boolean; error: string | null;
  onSubmit: (email: string, role: "guest" | "admin", limits: UserLimits) => void; onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"guest" | "admin">("guest");
  const [limits, setLimits] = useState<LimitText>(INITIAL);
  const [local, setLocal] = useState<string | null>(null);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    setLocal(null);
    const parsed = toLimits(limits);
    if (!email.trim()) return setLocal("Escribe el correo de la cuenta.");
    if (role === "guest" && !parsed) return setLocal("Los límites deben ser números enteros, o vacíos para no limitar.");
    onSubmit(email.trim(), role, parsed ?? toLimits(INITIAL)!);
  }

  const shown = local ?? error;
  return (
    <DialogFrame
      titleId="create-user-title" title="Nuevo usuario" glyph={UserPlus} tone="accent" size="md" top
      subtitle="La cuenta entra con la contraseña inicial admin1234 y debe cambiarla en su primer ingreso."
      onCancel={onCancel} backdropClosable={false} onEnter={() => submit()}
      actions={
        <>
          <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => submit()}>Crear cuenta</button>
        </>
      }
    >
      <form className="us-form" onSubmit={submit} aria-label="Nuevo usuario">
        {shown && <p role="alert" className="ag-callout ag-callout--warn">{shown}</p>}
        <div className="ag-field">
          <label htmlFor="us-email">Correo</label>
          <input id="us-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {isSuper && (
          <div className="ag-field">
            <label htmlFor="us-role">Rol</label>
            <select id="us-role" value={role} onChange={(e) => setRole(e.target.value as "guest" | "admin")}>
              <option value="guest">Usuario</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
        )}
        {role === "guest" && <LimitFields idPrefix="new" value={limits} onChange={setLimits} />}
      </form>
    </DialogFrame>
  );
}

export function LimitsDialog({ user, busy, error, onSubmit, onCancel }: {
  user: AdminUser; busy: boolean; error: string | null; onSubmit: (limits: UserLimits) => void; onCancel: () => void;
}) {
  const [limits, setLimits] = useState<LimitText>(toText(user.limits));
  const [local, setLocal] = useState<string | null>(null);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const parsed = toLimits(limits);
    if (!parsed) return setLocal("Los límites deben ser números enteros, o vacíos para no limitar.");
    setLocal(null);
    onSubmit(parsed);
  }

  const shown = local ?? error;
  return (
    <DialogFrame
      titleId="limits-user-title" title="Límites de la cuenta" glyph={SlidersHorizontal} tone="accent" size="md" top
      subtitle={user.email} onCancel={onCancel} backdropClosable={false} onEnter={() => submit()}
      actions={
        <>
          <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => submit()}>Guardar límites</button>
        </>
      }
    >
      <form className="us-form" onSubmit={submit} aria-label={`Límites de ${user.email}`}>
        {shown && <p role="alert" className="ag-callout ag-callout--warn">{shown}</p>}
        <LimitFields idPrefix={`lim-${user.id}`} value={limits} onChange={setLimits} />
        <p className="ag-help">Si bajas un límite por debajo de lo que ya usa, no se borra nada: recibe un aviso y tiene 30 días para reducir; después se retira lo más viejo.</p>
      </form>
    </DialogFrame>
  );
}

export function UsageDialog({ user, usage, onClose }: { user: AdminUser; usage: UserUsage | "loading" | "error"; onClose: () => void }) {
  const limited = isLimited(user);
  const { max_vaults: vaults, max_notes_per_vault: notes, max_storage_bytes_per_vault: storage } = user.limits;
  return (
    <DialogFrame
      titleId="usage-user-title" title="Uso de la cuenta" glyph={BarChart3} tone="accent" size="lg" subtitle={user.email}
      onCancel={onClose} actions={<button type="button" data-autofocus onClick={onClose}>Cerrar</button>}
    >
      <div className="us-usage" aria-label={`Uso de ${user.email}`}>
        {usage === "loading" && <p className="ag-sub">Calculando el uso…</p>}
        {usage === "error" && <p role="alert" className="ag-callout ag-callout--warn">No se pudo calcular el uso.</p>}
        {typeof usage === "object" && (
          <>
            <div className="us-usage-totals">
              <Meter label="Bóvedas" used={usage.vaults.length} limit={limited ? vaults : null} format={formatCount} />
              <Meter label="Documentos en total" used={usage.documents_total} limit={null} format={formatCount} />
              <Meter label="Archivos en total" used={usage.storage_bytes_total} limit={null} format={formatBytes} />
            </div>
            {usage.vaults.length === 0 ? <p className="ag-sub">Aún no tiene bóvedas.</p> : (
              <ul className="us-usage-vaults">
                {usage.vaults.map((v) => (
                  <li key={v.vault_id}>
                    <h4 title={v.name}>{v.name || "Sin nombre"}</h4>
                    <Meter label="Documentos" used={v.documents} limit={limited ? notes : null} format={formatCount} />
                    <Meter label="Archivos" used={v.storage_bytes} limit={limited ? storage : null} format={formatBytes} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </DialogFrame>
  );
}
