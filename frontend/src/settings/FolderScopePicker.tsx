/** Selector de las carpetas donde escribe un agente: ninguna, toda la bóveda o las elegidas (H-064 F5c). */
import { useState } from "react";
import "../sharing/sharing.css";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  folders: string[];
  disabled?: boolean;
  idPrefix: string;
}

type Scope = "none" | "all" | "custom";

const SCOPES: Array<{ scope: Scope; label: string; help: string }> = [
  { scope: "none", label: "Ninguna", help: "No escribe en ninguna carpeta (solo en AG - MENSAJES y en sus skills)." },
  { scope: "all", label: "Toda la bóveda", help: "Escribe en todas las carpetas, salvo las del sistema." },
  { scope: "custom", label: "Carpetas", help: "Elige las carpetas; cada una incluye sus subcarpetas." },
];

const depth = (folder: string) => (folder.match(/\//g) ?? []).length;

export default function FolderScopePicker({ value, onChange, folders, disabled, idPrefix }: Props) {
  const all = value.includes("*");
  // «Carpetas» es una elección de la persona: con [] no se distingue de «Ninguna».
  const [custom, setCustom] = useState(value.length > 0 && !all);
  const [search, setSearch] = useState("");
  const scope: Scope = custom ? "custom" : all ? "all" : "none";

  function pick(next: Scope) {
    setCustom(next === "custom");
    if (next === "none") onChange([]);
    else if (next === "all") onChange(["*"]);
    else if (all) onChange([]);
  }

  // Las carpetas elegidas que ya no existen se muestran para poder quitarlas y se conservan al marcar otras.
  const gone = value.filter((v) => v !== "*" && !folders.includes(v));
  const query = search.toLowerCase();
  const rows = [...gone, ...folders.filter((f) => f.toLowerCase().includes(query))];

  function toggle(folder: string) {
    const next = new Set(value);
    if (!next.delete(folder)) next.add(folder);
    onChange([...folders.filter((f) => next.has(f)), ...gone.filter((g) => next.has(g))]);
  }

  return (
    <div className="share-grants-editor">
      <fieldset className="share-role-group">
        <legend className="share-role-legend">Escribe en</legend>
        <div role="radiogroup" className="share-role-buttons fsp-scope">
          {SCOPES.map(({ scope: s, label }) => (
            <label key={s} className={`share-role-button${scope === s ? " share-role-button--active" : ""}`}>
              <input type="radio" name={`${idPrefix}-scope`} value={s} checked={scope === s} disabled={disabled} onChange={() => pick(s)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="share-role-help">{SCOPES.find((s) => s.scope === scope)?.help}</p>
      </fieldset>

      {scope === "custom" && (
        <div className="fsp-custom">
          {folders.length > 8 && (
            <input type="search" className="fsp-search" placeholder="Filtrar carpetas" aria-label="Filtrar carpetas" value={search} disabled={disabled} onChange={(e) => setSearch(e.target.value)} />
          )}
          {gone.length === 0 && folders.length === 0 ? (
            <p className="fsp-empty">Esta bóveda aún no tiene carpetas.</p>
          ) : (
            <ul className="fsp-list">
              {rows.map((folder) => (
                <li key={folder}>
                  <label className="fsp-label" style={{ paddingLeft: depth(folder) * 14 + 12 }}>
                    <input type="checkbox" checked={value.includes(folder)} disabled={disabled} onChange={() => toggle(folder)} />
                    <span className="fsp-name" title={folder}>
                      {folder}
                      {gone.includes(folder) && <span className="fsp-gone"> (ya no existe)</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
