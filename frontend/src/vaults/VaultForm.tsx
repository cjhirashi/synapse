import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, PROBLEM } from "../api/problems";
import { createVault, getVault, updateVault, Vault, VaultInput, VAULT_PROBLEM } from "../api/vaults";
import { isSessionClosed } from "./errors";

type Field = "name" | "description" | "tags";
type FieldErrors = Partial<Record<Field, string>>;
type Load = "loading" | "ready" | "missing" | "error";

/** Textos propios de cada campo: el `detail` de un 422 llega en inglés (SPEC-0004). */
const FIELD_MESSAGES: Record<Field, string> = {
  name: "El nombre debe tener entre 1 y 100 caracteres.",
  description: "La descripción admite hasta 2000 caracteres.",
  tags: "Hasta 20 etiquetas de 1 a 32 caracteres cada una.",
};

const NAME_TAKEN = "Ya tienes una bóveda con ese nombre.";

/** Campo de un error de validación por su JSON Pointer (`#/tags/3` → `tags`). */
function fieldOf(pointer: string | undefined): Field | undefined {
  const top = pointer?.match(/^#\/([^/]+)/)?.[1];
  return top === "name" || top === "description" || top === "tags" ? top : undefined;
}

/** Etiquetas separadas por comas; el backend las pasa a minúsculas y quita repetidas. */
function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

/** Sólo los campos que difieren de la versión cargada: `PATCH` no toca el resto (RF-009). */
function changes(input: VaultInput, original: Vault): Partial<VaultInput> {
  const diff: Partial<VaultInput> = {};
  if (input.name !== original.name) diff.name = input.name;
  if (input.description !== original.description) diff.description = input.description;
  if (input.tags.join("\n") !== original.tags.join("\n")) diff.tags = input.tags;
  return diff;
}

/** Crear (`/vaults/new`) o editar (`/vaults/:id/edit`) una bóveda (RF-019). */
export default function VaultForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = id !== undefined;

  const [original, setOriginal] = useState<Vault | null>(null);
  const [load, setLoad] = useState<Load>(editing ? "loading" : "ready");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sessionClosed = useCallback(
    (err: unknown) => {
      if (!isSessionClosed(err)) return false;
      navigate("/login", { replace: true });
      return true;
    },
    [navigate],
  );

  /** Carga la versión vigente; sus valores sustituyen lo que hubiera en el formulario. */
  const fetchVault = useCallback(
    async (vaultId: string) => {
      try {
        const vault = await getVault(vaultId);
        setOriginal(vault);
        setName(vault.name);
        setDescription(vault.description ?? "");
        setTags(vault.tags.join(", "));
        setLoad("ready");
      } catch (err) {
        if (sessionClosed(err)) return;
        setLoad(err instanceof ApiError && err.type === VAULT_PROBLEM.notFound ? "missing" : "error");
      }
    },
    [sessionClosed],
  );

  useEffect(() => {
    if (id !== undefined) void fetchVault(id);
  }, [id, fetchVault]);

  function edit(field: Field, value: string) {
    ({ name: setName, description: setDescription, tags: setTags })[field](value);
    setFieldErrors(({ [field]: _cleared, ...rest }) => rest);
  }

  function showError(err: unknown) {
    if (sessionClosed(err)) return;
    if (err instanceof ApiError && err.type === PROBLEM.validationError) {
      const errors: FieldErrors = {};
      for (const entry of err.errors) {
        const field = fieldOf(entry.pointer);
        if (field) errors[field] = FIELD_MESSAGES[field];
      }
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) setFormError("Revisa los datos del formulario.");
    } else if (err instanceof ApiError && err.type === VAULT_PROBLEM.nameTaken) {
      setFieldErrors({ name: NAME_TAKEN });
    } else if (err instanceof ApiError && err.type === VAULT_PROBLEM.preconditionFailed && id !== undefined) {
      setFormError("La bóveda cambió mientras la editabas. Se cargaron sus datos actuales; repite tus cambios.");
      void fetchVault(id);
    } else if (err instanceof ApiError && err.type === VAULT_PROBLEM.notFound) {
      setLoad("missing");
    } else {
      setFormError("No se pudo guardar la bóveda. Inténtalo de nuevo.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const input: VaultInput = { name, description: description.trim() === "" ? null : description, tags: parseTags(tags) };
    setBusy(true);
    try {
      if (original === null) {
        await createVault(input);
      } else {
        const diff = changes(input, original);
        if (Object.keys(diff).length > 0) await updateVault(original.id, diff, original.etag);
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
  function errorProps(field: Field) {
    return fieldErrors[field] ? { "aria-invalid": true as const, "aria-describedby": `${field}-error` } : {};
  }

  function errorText(field: Field) {
    return fieldErrors[field] && <p id={`${field}-error`}>{fieldErrors[field]}</p>;
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
