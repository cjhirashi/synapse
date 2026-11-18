/** Ventanas de la gestión de usuarios (H-060): alta, límites y uso. El formulario vive en una ventana, no dentro de la lista. */
import { FormEvent, useEffect, useRef, useState } from "react";
import { BarChart3, FileText, Folder, HardDrive, Lock, SlidersHorizontal, UserPlus, type LucideIcon } from "lucide-react";
import DialogFrame from "../editor/DialogFrame";
import { MB, formatBytes, formatCount, parseLimit, type AdminUser, type UserLimits, type UserUsage } from "./adminUsers";
import { isLimited, Meter, RolePill } from "./usersView";

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

interface FieldSpec {
  key: keyof LimitText;
  label: string;
  icon: LucideIcon;
  unit: string;
  help: string;
  /** Valores sugeridos: lo que se escribe en el campo y cómo se lee en el botón. */
  presets: { value: string; label: string }[];
}

const FIELDS: FieldSpec[] = [
  {
    key: "vaults", label: "Bóvedas", icon: Folder, unit: "bóvedas", help: "Cuántas bóvedas puede tener la cuenta.",
    presets: [{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "5", label: "5" }, { value: "10", label: "10" }],
  },
  {
    key: "notes", label: "Documentos por bóveda", icon: FileText, unit: "documentos",
    help: "Notas de cada bóveda; no cuentan índices ni documentos de sistema.",
    presets: [{ value: "50", label: "50" }, { value: "100", label: "100" }, { value: "500", label: "500" }, { value: "1000", label: "1,000" }],
  },
  {
    key: "storageMb", label: "Almacenamiento por bóveda", icon: HardDrive, unit: "MB", help: "Espacio para los archivos de cada bóveda.",
    presets: [{ value: "100", label: "100 MB" }, { value: "500", label: "500 MB" }, { value: "1024", label: "1 GB" }, { value: "5120", label: "5 GB" }],
  },
];

/** Una tarjeta de límite: campo con la unidad dentro, interruptor «Sin límite», valores sugeridos y un aviso en vivo. */
function LimitField({ spec, idPrefix, value, onChange, note }: {
  spec: FieldSpec; idPrefix: string; value: string; onChange: (next: string) => void; note?: { text: string; tone?: "warn" };
}) {
  const unlimited = value.trim() === "";
  const id = `${idPrefix}-${spec.key}`;
  // El interruptor devuelve el último valor escrito (o el inicial) en vez de dejar el campo en blanco.
  const remembered = useRef(INITIAL[spec.key]);
  useEffect(() => {
    if (value.trim() !== "") remembered.current = value;
  }, [value]);
  const Icon = spec.icon;
  return (
    <div className="us-limit" data-unlimited={unlimited ? "" : undefined}>
      <div className="us-limit-head">
        <span className="us-limit-icon" aria-hidden="true"><Icon size={16} /></span>
        <div className="us-limit-title">
          <label htmlFor={id}>{spec.label}</label>
          <p>{spec.help}</p>
        </div>
      </div>
      <div className="us-limit-row">
        <div className="us-limit-input">
          <input id={id} type="text" inputMode="numeric" autoComplete="off" placeholder="Sin límite" value={value} onChange={(e) => onChange(e.target.value)} />
          <span aria-hidden="true">{spec.unit}</span>
        </div>
        <label className="ag-switch-row us-limit-switch">
          <input
            className="ag-switch" type="checkbox" role="switch" checked={unlimited} aria-label={`Sin límite de ${spec.label.toLowerCase()}`}
            onChange={() => onChange(unlimited ? remembered.current : "")}
          />
          <span aria-hidden="true">Sin límite</span>
        </label>
      </div>
      <div className="us-limit-presets" role="group" aria-label={`Valores sugeridos de ${spec.label.toLowerCase()}`}>
        {spec.presets.map((preset) => (
          <button key={preset.value} type="button" aria-pressed={value.trim() === preset.value} onClick={() => onChange(preset.value)}>
            {preset.label}
          </button>
        ))}
      </div>
      {note && <p className="us-limit-note" data-tone={note.tone}>{note.text}</p>}
    </div>
  );
}

/** Los tres límites de una cuenta. Con `vaultsUsed` (edición) avisa si el tope de bóvedas queda por debajo de lo que ya usa. */
function LimitFields({ idPrefix, value, onChange, vaultsUsed }: {
  idPrefix: string; value: LimitText; onChange: (next: LimitText) => void; vaultsUsed?: number | null;
}) {
  const set = (key: keyof LimitText) => (next: string) => onChange({ ...value, [key]: next });
  const noteFor = (key: keyof LimitText): { text: string; tone?: "warn" } | undefined => {
    const parsed = parseLimit(value[key]);
    if (key === "vaults" && vaultsUsed != null) {
      if (typeof parsed === "number" && parsed < vaultsUsed) {
        return { text: `Hoy usa ${formatCount(vaultsUsed)}: tendrá 30 días para reducir antes de que se retire lo más viejo.`, tone: "warn" };
      }
      return { text: `Hoy usa ${formatCount(vaultsUsed)}.` };
    }
    if (key === "storageMb" && typeof parsed === "number" && parsed >= 1024) return { text: `Equivale a ${formatBytes(parsed * MB)}.` };
    return undefined;
  };
  return (
    <div className="us-limits">
      {FIELDS.map((spec) => (
        <LimitField key={spec.key} spec={spec} idPrefix={idPrefix} value={value[spec.key]} onChange={set(spec.key)} note={noteFor(spec.key)} />
      ))}
      <p className="us-limits-help">Solo rigen para usuarios; los administradores no tienen límites.</p>
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
        <LimitFields idPrefix={`lim-${user.id}`} value={limits} onChange={setLimits} vaultsUsed={user.vaults_used} />
        <p className="us-limits-help">Si bajas un límite por debajo de lo que ya usa, no se borra nada: la persona recibe un aviso y tiene 30 días para reducir; después se retira lo más viejo.</p>
      </form>
    </DialogFrame>
  );
}

export function UsageDialog({ user, usage, onClose }: { user: AdminUser; usage: UserUsage | "loading" | "error"; onClose: () => void }) {
  const limited = isLimited(user);
  const { max_vaults: vaults, max_notes_per_vault: notes, max_storage_bytes_per_vault: storage } = user.limits;
  return (
    <DialogFrame
      titleId="usage-user-title" title="Uso de la cuenta" glyph={BarChart3} tone="accent" size="lg"
      subtitle={<span className="us-usage-who">{user.email} <RolePill role={user.role} /></span>}
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

            <section className="us-usage-list" aria-label="Uso por bóveda">
              <h3>Por bóveda</h3>
              {usage.vaults.length === 0 ? (
                <p className="us-usage-empty">Aún no tiene bóvedas.</p>
              ) : (
                <>
                  <div className="us-usage-head" aria-hidden="true">
                    <span>Bóveda</span><span>Documentos{limited && notes !== null ? ` · máx. ${formatCount(notes)}` : ""}</span>
                    <span>Archivos{limited && storage !== null ? ` · máx. ${formatBytes(storage)}` : ""}</span>
                  </div>
                  <ul className="us-usage-rows">
                    {usage.vaults.map((v) => (
                      <li key={v.alias}>
                        <span className="us-usage-alias"><Folder size={16} aria-hidden="true" />{v.alias}</span>
                        <Meter label="Documentos" used={v.documents} limit={limited ? notes : null} format={formatCount} />
                        <Meter label="Archivos" used={v.storage_bytes} limit={limited ? storage : null} format={formatBytes} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <p className="us-privacy"><Lock size={14} aria-hidden="true" /> Las bóvedas se muestran con un alias: su nombre y su contenido son privados de la persona.</p>
          </>
        )}
      </div>
    </DialogFrame>
  );
}
