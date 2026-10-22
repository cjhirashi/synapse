/**
 * Cambios rechazados por el servidor (SPEC-0005 RF-006; PLAN-0005 §2.5).
 *
 * El cambio rechazado sigue en la réplica local: la vista lo explica con el motivo en español
 * y "Corregir" abre la bóveda (su formulario, o la papelera si está borrada). Al guardarla
 * corregida, el push sube la revisión nueva y el rechazo desaparece de la lista.
 *
 * También las notas (SPEC-0008 RF-004, RF-013, RF-014): su motivo sale de `notes/messages.ts`
 * y "Corregir" abre la bóveda de la nota (`/vaults/{vault_id}`) con el id de la nota en el
 * estado de navegación (no persistido: RF-015), para que el espacio de trabajo la abra. Los
 * rechazos de notas de una bóveda en la papelera no se muestran: viven y reaparecen con ella.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { noteReasonText } from "../notes/messages";
import { NOTE_ID_PREFIX } from "../notes/noteRules";
import { FIELD_MESSAGES, NAME_TAKEN } from "../vaults/fields";
import type { Rejection } from "./rejections";
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

/** Id de la bóveda de un id de nota (`note:{vault_id}:{uuid}`), o `null` si no es de nota. */
function noteVaultId(id: string): string | null {
  return id.startsWith(NOTE_ID_PREFIX) ? id.slice(NOTE_ID_PREFIX.length).split(":", 1)[0] : null;
}

export default function RejectionsPage() {
  const { vaults, notes, rejections, dataVersion, notesVersion } = useSync();
  // Bóvedas de la réplica por id completo (activas y en la papelera), o `null` mientras carga.
  const [byId, setById] = useState<Map<string, Vault> | null>(null);
  // Ruta de cada nota rechazada (`null` si ya no está activa en la réplica).
  const [notePaths, setNotePaths] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    let alive = true;
    void Promise.all([vaults.list(), vaults.list({ deleted: true })]).then(([active, trashed]) => {
      if (alive) setById(new Map([...active, ...trashed].map((vault) => [ID_PREFIX + vault.id, vault])));
    });
    return () => {
      alive = false;
    };
  }, [vaults, dataVersion]);

  useEffect(() => {
    let alive = true;
    const ids = rejections.map((rejection) => rejection.id).filter((id) => noteVaultId(id) !== null);
    void Promise.all(ids.map((id) => notes.get(id).then((note) => [id, note.path] as const, () => [id, null] as const))).then(
      (entries) => {
        if (alive) setNotePaths(new Map(entries));
      },
    );
    return () => {
      alive = false;
    };
  }, [notes, rejections, notesVersion]);

  /** Fila de una nota rechazada (las de bóvedas en la papelera ya se quitaron en `visible`). */
  function noteItem(rejection: Rejection, vaultId: string) {
    const vault = byId?.get(ID_PREFIX + vaultId);
    const path = notePaths.get(rejection.id);
    return (
      <li key={rejection.id}>
        {path ? `«${path}»` : rejection.id}
        {vault ? ` (${vault.name})` : ""}: {noteReasonText(rejection.reason)}
        {vault && (
          <>
            {" "}
            <Link to={`/vaults/${vault.id}`} state={{ noteId: rejection.id }}>
              Corregir
            </Link>
          </>
        )}
      </li>
    );
  }

  // Sin las notas de bóvedas en la papelera (RF-014): lo que queda por mostrar.
  const visible = byId === null ? rejections : rejections.filter((rejection) => {
    const vaultId = noteVaultId(rejection.id);
    return vaultId === null || !byId.get(ID_PREFIX + vaultId)?.deleted_at;
  });

  return (
    <section>
      <h1>Cambios rechazados</h1>
      {byId === null ? (
        <p>Cargando…</p>
      ) : visible.length === 0 ? (
        <p>No hay cambios rechazados.</p>
      ) : (
        <>
          <p>El servidor no aceptó estos cambios. Siguen guardados en este dispositivo: corrígelos para que se sincronicen.</p>
          <ul>
            {visible.map((rejection) => {
              const vaultId = noteVaultId(rejection.id);
              if (vaultId !== null) return noteItem(rejection, vaultId);
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
