/**
 * Cambios rechazados por el servidor (SPEC-0005 RF-006; PLAN-0005 §2.5).
 *
 * El cambio rechazado sigue en la réplica local: la vista lo explica con el motivo en español
 * y "Corregir" abre la bóveda (su formulario, o la papelera si está borrada). Al guardarla
 * corregida, el push sube la revisión nueva y el rechazo desaparece de la lista.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FIELD_MESSAGES, NAME_TAKEN } from "../vaults/fields";
import { useSync } from "./useSync";
import { ID_PREFIX, type Vault } from "./vaultStore";

/** Motivos fijos del servidor (`backend/app/routers/sync.py`, `REJECTION_REASON`). */
const REASONS = new Map<string, string>([
  ["vault-name-taken", NAME_TAKEN],
  ["owner-mismatch", "La bóveda pertenece a otro usuario."],
  ["immutable-field:created_at", "La fecha de creación de la bóveda no se puede cambiar."],
  ["delete-not-allowed", "El servidor no admite eliminar la bóveda de forma definitiva."],
  ["invalid-id", "El identificador de la bóveda no es válido."],
]);

const MALFORMED = "La bóveda tiene datos con un formato no válido.";

/**
 * Texto en español de un código de motivo. `validation-error:<campo>` usa el texto del
 * formulario cuando el campo es editable; el resto de campos y `not-normalized:<campo>` sólo
 * pueden venir de datos mal formados (la UI normaliza y valida antes de guardar).
 */
export function reasonText(code: string): string {
  const fixed = REASONS.get(code);
  if (fixed !== undefined) return fixed;
  const [kind, field] = code.split(":", 2);
  if (kind === "validation-error" && (field === "name" || field === "description" || field === "tags")) {
    return FIELD_MESSAGES[field];
  }
  if (kind === "validation-error" || kind === "not-normalized") return MALFORMED;
  return `El servidor rechazó el cambio (${code}).`;
}

export default function RejectionsPage() {
  const { vaults, rejections, dataVersion } = useSync();
  // Bóvedas de la réplica por id completo (activas y en la papelera), o `null` mientras carga.
  const [byId, setById] = useState<Map<string, Vault> | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([vaults.list(), vaults.list({ deleted: true })]).then(([active, trashed]) => {
      if (alive) setById(new Map([...active, ...trashed].map((vault) => [ID_PREFIX + vault.id, vault])));
    });
    return () => {
      alive = false;
    };
  }, [vaults, dataVersion]);

  return (
    <section>
      <h1>Cambios rechazados</h1>
      {byId === null ? (
        <p>Cargando…</p>
      ) : rejections.length === 0 ? (
        <p>No hay cambios rechazados.</p>
      ) : (
        <>
          <p>El servidor no aceptó estos cambios. Siguen guardados en este dispositivo: corrígelos para que se sincronicen.</p>
          <ul>
            {rejections.map((rejection) => {
              const vault = byId.get(rejection.id);
              return (
                <li key={rejection.id}>
                  {vault ? `«${vault.name}»${vault.deleted_at ? " (en la papelera)" : ""}` : rejection.id}:{" "}
                  {reasonText(rejection.reason)}
                  {vault && (
                    <>
                      {" "}
                      <Link to={vault.deleted_at ? "/vaults/trash" : `/vaults/${vault.id}/edit`}>Corregir</Link>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
