/**
 * Conflictos que el usuario debe resolver (SPEC-0005 RF-013, RF-015; ADR-003; PLAN-0005 §2.5).
 *
 * Por cada pareja ganadora (A) / perdedora (B) que `conflicts.ts` no pudo combinar, muestra
 * ambas versiones campo a campo. El resultado parte de A; el usuario copia el valor de B en
 * los campos que quiera o escribe uno combinado. Guardar llama a `resolveConflict`, que valida
 * con `vaultRules` y escribe; el push vuelve a validarlo y, si lo rechaza, sigue el flujo de
 * rechazos (RF-015). Ninguna versión se pierde hasta que el usuario guarda (RF-013).
 */
import { FormEvent, useState } from "react";
import { FIELD_MESSAGES, formatTags, parseTags, toDescription } from "../vaults/fields";
import type { VaultConflict } from "./conflicts";
import type { MergeBody } from "./merge";
import { useSync } from "./useSync";
import type { VaultField } from "./vaultRules";
import { utcNow, VaultChangedError, VaultValidationError } from "./vaultStore";

const FIELD_NAMES: Record<VaultField, string> = {
  name: "el nombre",
  description: "la descripción",
  tags: "las etiquetas",
};

/** "el nombre", "el nombre y la descripción", "el nombre, la descripción y las etiquetas". */
function listFields(fields: VaultField[]): string {
  const names = fields.map((field) => FIELD_NAMES[field]);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function reasonText(conflict: VaultConflict): string {
  switch (conflict.reason) {
    case "no-ancestor":
      return "No se puede saber qué cambió en cada versión: elige o combina los datos.";
    case "clash":
      return `Las dos versiones cambiaron ${listFields(conflict.fields)}: elige o combina los datos.`;
    case "invalid":
      return `La combinación automática no cumple las reglas en ${listFields(conflict.fields)}: elige o combina los datos.`;
  }
}

/** Aviso de la página: sobrevive a que el formulario desaparezca al resolverse su conflicto. */
type Notice = { kind: "resolved"; name: string } | { kind: "changed" } | null;

export default function ConflictView() {
  const { conflicts } = useSync();
  const [notice, setNotice] = useState<Notice>(null);

  return (
    <section>
      <h1>Conflictos</h1>
      {notice?.kind === "resolved" && <p role="status">Se guardó la resolución de «{notice.name}».</p>}
      {notice?.kind === "changed" && (
        <p role="alert">Este conflicto cambió mientras lo resolvías. Se muestran sus datos actuales.</p>
      )}
      {conflicts.length === 0 ? (
        <p>No hay conflictos por resolver.</p>
      ) : (
        conflicts.map((conflict) =>
          // Los conflictos de nota los pinta `NoteConflictCard` (SPEC-0008 RF-009): este
          // formulario es sólo de bóvedas (nombre, descripción y etiquetas).
          conflict.kind === "vault" ? (
            // Con otra ganadora o perdedora es otro conflicto: el formulario parte de cero.
            <ConflictForm
              key={`${conflict.id}:${conflict.winner.rev}:${conflict.loser.rev}`}
              conflict={conflict}
              onNotice={setNotice}
            />
          ) : null,
        )
      )}
    </section>
  );
}

type FieldErrors = Partial<Record<VaultField, string>>;

function ConflictForm({ conflict, onNotice }: { conflict: VaultConflict; onNotice: (notice: Notice) => void }) {
  const { resolveConflict } = useSync();
  const a = conflict.winner.doc;
  const b = conflict.loser.doc;
  const [name, setName] = useState(a.name);
  const [description, setDescription] = useState(a.description ?? "");
  const [tags, setTags] = useState(formatTags(a.tags));
  const [deletedAt, setDeletedAt] = useState(a.deleted_at);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Copia en el resultado el valor de una versión. */
  function use(field: VaultField | "deleted_at", doc: MergeBody) {
    if (field === "name") setName(doc.name);
    if (field === "description") setDescription(doc.description ?? "");
    if (field === "tags") setTags(formatTags(doc.tags));
    if (field === "deleted_at") setDeletedAt(doc.deleted_at);
    if (field !== "deleted_at") setFieldErrors(({ [field]: _cleared, ...rest }) => rest);
  }

  /** Mandar a la papelera conserva la fecha de borrado que ya tuviera alguna versión. */
  function toggleTrash(trashed: boolean) {
    setDeletedAt(trashed ? (a.deleted_at ?? b.deleted_at ?? utcNow()) : null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    onNotice(null);
    const choice = { name, description: toDescription(description), tags: parseTags(tags), deleted_at: deletedAt };
    try {
      await resolveConflict(conflict.id, conflict.loser.rev, choice);
      onNotice({ kind: "resolved", name: name.trim() });
    } catch (err) {
      if (err instanceof VaultValidationError) {
        setFieldErrors(Object.fromEntries(err.fields.map((field) => [field, FIELD_MESSAGES[field]])));
      } else if (err instanceof VaultChangedError) {
        // La lista de conflictos ya refleja el estado nuevo (se resolvió en otra pestaña, llegó otra versión…).
        onNotice({ kind: "changed" });
      } else {
        setFormError("No se pudo guardar la resolución. Inténtalo de nuevo.");
      }
    } finally {
      setBusy(false);
    }
  }

  /** Las dos versiones de un campo, con un botón por versión si difieren. */
  function versions(field: VaultField | "deleted_at", show: (doc: MergeBody) => string) {
    if (show(a) === show(b)) return <p>Igual en las dos versiones: {show(a)}</p>;
    return (
      <>
        <p>
          Versión A: {show(a)}{" "}
          <button type="button" onClick={() => use(field, a)}>
            Usar versión A
          </button>
        </p>
        <p>
          Versión B: {show(b)}{" "}
          <button type="button" onClick={() => use(field, b)}>
            Usar versión B
          </button>
        </p>
      </>
    );
  }

  function errorProps(field: VaultField) {
    const id = `${conflict.id}-${conflict.loser.rev}-${field}-error`;
    return fieldErrors[field] ? { "aria-invalid": true as const, "aria-describedby": id } : {};
  }

  function errorText(field: VaultField) {
    const id = `${conflict.id}-${conflict.loser.rev}-${field}-error`;
    return fieldErrors[field] && <p id={id} role="alert">{fieldErrors[field]}</p>;
  }

  return (
    <form aria-label={`Conflicto en «${a.name}»`} onSubmit={submit} noValidate>
      <h2>«{a.name}»</h2>
      <p>{reasonText(conflict)}</p>
      <fieldset>
        <legend>Nombre</legend>
        {versions("name", (doc) => doc.name)}
        <label>
          Nombre resultante
          <input value={name} onChange={(e) => setName(e.target.value)} {...errorProps("name")} />
        </label>
        {errorText("name")}
      </fieldset>
      <fieldset>
        <legend>Descripción</legend>
        {versions("description", (doc) => doc.description ?? "(sin descripción)")}
        <label>
          Descripción resultante
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} {...errorProps("description")} />
        </label>
        {errorText("description")}
      </fieldset>
      <fieldset>
        <legend>Etiquetas</legend>
        {versions("tags", (doc) => (doc.tags.length > 0 ? formatTags(doc.tags) : "(sin etiquetas)"))}
        <label>
          Etiquetas resultantes
          <input value={tags} onChange={(e) => setTags(e.target.value)} {...errorProps("tags")} />
        </label>
        {errorText("tags")}
      </fieldset>
      <fieldset>
        <legend>Estado</legend>
        {versions("deleted_at", (doc) => (doc.deleted_at ? "En la papelera" : "Activa"))}
        <label>
          <input type="checkbox" checked={deletedAt !== null} onChange={(e) => toggleTrash(e.target.checked)} />
          En la papelera
        </label>
      </fieldset>
      {formError && <p role="alert">{formError}</p>}
      <button type="submit" disabled={busy}>
        Guardar resolución
      </button>
    </form>
  );
}
