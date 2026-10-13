import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSync } from "../sync/useSync";
import type { VaultField, VaultFields } from "../sync/vaultRules";
import {
  VaultChangedError,
  VaultNameTakenError,
  VaultNotFoundError,
  VaultValidationError,
  type Vault,
} from "../sync/vaultStore";
import { isStorageFull, STORAGE_FULL } from "./errors";
import { FIELD_MESSAGES, formatTags, NAME_TAKEN, parseTags, toDescription } from "./fields";

type FieldErrors = Partial<Record<VaultField, string>>;
type Load = "loading" | "ready" | "missing" | "error";

/**
 * Sólo los campos que difieren de la versión cargada: `update` no toca el resto (RF-009).
 * La descripción original se normaliza igual que la del formulario: una de sólo espacios
 * que no se tocó no cuenta como cambio (PLAN-0003 §15, VA-9).
 */
function changes(input: VaultFields, original: Vault): Partial<VaultFields> {
  const diff: Partial<VaultFields> = {};
  if (input.name !== original.name) diff.name = input.name;
  if (input.description !== toDescription(original.description ?? "")) diff.description = input.description;
  if (input.tags.join("\n") !== original.tags.join("\n")) diff.tags = input.tags;
  return diff;
}

/**
 * Crear (`/vaults/new`) o editar (`/vaults/:id/edit`) una bóveda de la réplica local
 * (SPEC-0003 RF-019; SPEC-0005 RF-009).
 *
 * No se recarga con `dataVersion`: un cambio que llegue mientras se escribe no pisa el
 * formulario. Si al guardar la revisión cargada ya no es la actual, se avisa y se cargan los
 * datos vigentes (el 412 de 0003).
 */
export default function VaultForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { vaults } = useSync();
  const editing = id !== undefined;

  const [original, setOriginal] = useState<Vault | null>(null);
  const [load, setLoad] = useState<Load>(editing ? "loading" : "ready");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Carga la versión vigente; sus valores sustituyen lo que hubiera en el formulario. */
  const fetchVault = useCallback(
    async (vaultId: string) => {
      try {
        const vault = await vaults.get(vaultId);
        setOriginal(vault);
        setName(vault.name);
        setDescription(vault.description ?? "");
        setTags(formatTags(vault.tags));
        setLoad("ready");
      } catch (err) {
        if (!(err instanceof VaultNotFoundError)) console.error(err);
        setLoad(err instanceof VaultNotFoundError ? "missing" : "error");
      }
    },
    [vaults],
  );

  useEffect(() => {
    if (id !== undefined) void fetchVault(id);
  }, [id, fetchVault]);

  function edit(field: VaultField, value: string) {
    ({ name: setName, description: setDescription, tags: setTags })[field](value);
    setFieldErrors(({ [field]: _cleared, ...rest }) => rest);
  }

  function showError(err: unknown) {
    if (err instanceof VaultValidationError) {
      setFieldErrors(Object.fromEntries(err.fields.map((field) => [field, FIELD_MESSAGES[field]])));
    } else if (err instanceof VaultNameTakenError) {
      setFieldErrors({ name: NAME_TAKEN });
    } else if (err instanceof VaultChangedError && id !== undefined) {
      setFormError("La bóveda cambió mientras la editabas. Se cargaron sus datos actuales; repite tus cambios.");
      void fetchVault(id);
    } else if (err instanceof VaultNotFoundError) {
      setLoad("missing");
    } else if (isStorageFull(err)) {
      setFormError(STORAGE_FULL);
    } else {
      console.error(err);
      setFormError("No se pudo guardar la bóveda. Inténtalo de nuevo.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const input: VaultFields = { name, description: toDescription(description), tags: parseTags(tags) };
    setBusy(true);
    try {
      if (original === null) {
        await vaults.create(input);
      } else {
        const diff = changes(input, original);
        if (Object.keys(diff).length > 0) await vaults.update(original.id, diff, original.rev);
      }
      navigate("/vaults");
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  if (load === "loading") return <p>Cargando…</p>;
  if (load === "missing" || load === "error") {
    return (
      <section>
        <p role="alert">
          {load === "missing" ? "Esta bóveda no existe o está en la papelera." : "No se pudo cargar la bóveda."}
        </p>
        <Link to="/vaults">Volver a las bóvedas</Link>
      </section>
    );
  }

  /** Atributos de accesibilidad que enlazan un campo con su error. */
  function errorProps(field: VaultField) {
    return fieldErrors[field] ? { "aria-invalid": true as const, "aria-describedby": `${field}-error` } : {};
  }

  /** Error del campo; `role="alert"` lo anuncia al aparecer (la descripción, al enfocar). */
  function errorText(field: VaultField) {
    return fieldErrors[field] && <p id={`${field}-error`} role="alert">{fieldErrors[field]}</p>;
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1>{editing ? "Editar bóveda" : "Nueva bóveda"}</h1>
      <label>
        Nombre
        <input value={name} onChange={(e) => edit("name", e.target.value)} {...errorProps("name")} />
      </label>
      {errorText("name")}
      <label>
        Descripción
        <textarea value={description} onChange={(e) => edit("description", e.target.value)} {...errorProps("description")} />
      </label>
      {errorText("description")}
      <label>
        Etiquetas
        <input value={tags} onChange={(e) => edit("tags", e.target.value)} placeholder="trabajo, ideas" {...errorProps("tags")} />
      </label>
      {errorText("tags")}
      {formError && <p role="alert">{formError}</p>}
      <button type="submit" disabled={busy}>
        {editing ? "Guardar cambios" : "Crear bóveda"}
      </button>{" "}
      <Link to="/vaults">Cancelar</Link>
    </form>
  );
}
