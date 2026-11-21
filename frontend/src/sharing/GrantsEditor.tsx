/** Editor de concesiones de permisos por carpeta (H-064 F5b). */
import { X } from "lucide-react";
import { useState } from "react";
import type { Grant } from "./sharingApi";
import { roleOf, type Role } from "./grants";
import "./sharing.css";

interface Props {
  value: Grant[];
  onChange: (grants: Grant[]) => void;
  folders: string[];
  disabled?: boolean;
  idPrefix: string;
}

const ROLES: Array<{ role: Role; label: string; help: string }> = [
  { role: "lector", label: "Lector", help: "Ve todo, no cambia nada." },
  { role: "editor", label: "Editor", help: "Ve y edita todo." },
  { role: "personalizado", label: "Personalizado", help: "Elige qué carpetas ve y cuáles edita." },
];

const ALL = "*";

export default function GrantsEditor({ value, onChange, folders, disabled, idPrefix }: Props) {
  // «Personalizado» es una elección de la persona: con una sola concesión «toda la bóveda» las concesiones solas dirían Lector o Editor.
  const [custom, setCustom] = useState(roleOf(value) === "personalizado");
  const role: Role = custom ? "personalizado" : roleOf(value);
  const used = new Set(value.map((g) => g.folder));
  const options = [ALL, ...folders];
  const nextFree = options.find((f) => !used.has(f));

  function pick(next: Role) {
    setCustom(next === "personalizado");
    if (next === "lector") onChange([{ folder: ALL, level: "lectura" }]);
    else if (next === "editor") onChange([{ folder: ALL, level: "escritura" }]);
  }

  const update = (index: number, change: Partial<Grant>) => onChange(value.map((g, i) => (i === index ? { ...g, ...change } : g)));

  // Con «toda la bóveda» en lectura, lo útil de agregar una carpeta es darle escritura.
  const add = () => nextFree !== undefined && onChange([...value, { folder: nextFree, level: used.has(ALL) ? "escritura" : "lectura" }]);

  return (
    <div className="share-grants-editor">
      <fieldset className="share-role-group">
        <legend className="share-role-legend">Tipo de acceso</legend>
        <div role="radiogroup" className="share-role-buttons">
          {ROLES.map(({ role: r, label }) => (
            <label key={r} className={`share-role-button${role === r ? " share-role-button--active" : ""}`}>
              <input type="radio" name={`${idPrefix}-role`} value={r} checked={role === r} disabled={disabled} onChange={() => pick(r)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="share-role-help">{ROLES.find((r) => r.role === role)?.help}</p>
      </fieldset>

      {role === "personalizado" && (
        <div className="share-custom-grants">
          {value.map((grant, index) => {
            // Una carpeta que ya no existe sigue siendo elegible mientras esté concedida.
            const rowOptions = options.includes(grant.folder) ? options : [...options, grant.folder];
            return (
              <div key={index} className="share-grant-row">
                <div className="share-grant-col">
                  <label htmlFor={`${idPrefix}-folder-${index}`} className="share-grant-label">Carpeta</label>
                  <select id={`${idPrefix}-folder-${index}`} className="share-select" value={grant.folder} disabled={disabled} onChange={(e) => update(index, { folder: e.target.value })}>
                    {rowOptions.map((f) => (
                      <option key={f} value={f} disabled={used.has(f) && f !== grant.folder}>
                        {f === ALL ? "Toda la bóveda" : options.includes(f) ? f : `${f} (ya no existe)`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="share-grant-col">
                  <label htmlFor={`${idPrefix}-level-${index}`} className="share-grant-label">Acceso</label>
                  <select id={`${idPrefix}-level-${index}`} className="share-select" value={grant.level} disabled={disabled} onChange={(e) => update(index, { level: e.target.value as Grant["level"] })}>
                    <option value="lectura">Solo lectura</option>
                    <option value="escritura">Lectura y escritura</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="shared-btn share-grant-remove"
                  disabled={disabled || value.length === 1}
                  aria-label={`Quitar permiso de ${grant.folder === ALL ? "toda la bóveda" : grant.folder}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            );
          })}
          <button type="button" className="shared-btn share-add-grant" disabled={disabled || nextFree === undefined} onClick={add}>
            Agregar carpeta
          </button>
        </div>
      )}
    </div>
  );
}
