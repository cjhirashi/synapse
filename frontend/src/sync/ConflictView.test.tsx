// Vista de conflictos manuales (SPEC-0005 RF-013, RF-015; ADR-003; PLAN-0005 §2.5).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { syncValue, WithSync } from "../test-utils/sync";
import type { VaultConflict } from "./conflicts";
import ConflictView from "./ConflictView";
import type { MergeBody } from "./merge";
import type { SyncContextValue } from "./useSync";
import { VaultChangedError, VaultValidationError } from "./vaultStore";

const VAULT_ID = "vault:11111111-1111-4111-8111-111111111111";

function body(overrides: Partial<MergeBody>): MergeBody {
  return {
    name: "Notas",
    description: null,
    tags: [],
    owner_id: "u1",
    created_at: "2026-10-01T10:00:00.000000Z",
    updated_at: "2026-10-02T10:00:00.000000Z",
    deleted_at: null,
    ...overrides,
  };
}

function conflict(overrides: Partial<VaultConflict> = {}): VaultConflict {
  return {
    kind: "vault",
    id: VAULT_ID,
    reason: "clash",
    fields: ["name"],
    winner: { rev: "2-w", doc: body({ name: "Trabajo", description: "Común", tags: ["a"] }) },
    loser: { rev: "2-l", doc: body({ name: "Oficina", description: "Común", tags: ["b"] }) },
    ...overrides,
  };
}

function renderView(overrides: Partial<SyncContextValue>) {
  const { value } = syncValue(overrides);
  render(
    <MemoryRouter>
      <WithSync value={value}>
        <ConflictView />
      </WithSync>
    </MemoryRouter>,
  );
  return value;
}

test("RF-013: muestra ambas versiones campo a campo y por qué no se combinaron", () => {
  renderView({ conflicts: [conflict()] });
  const form = screen.getByRole("form", { name: "Conflicto en «Trabajo»" });
  expect(form).toHaveTextContent("Las dos versiones cambiaron el nombre: elige o combina los datos.");
  const name = within(form).getByRole("group", { name: "Nombre" });
  expect(name).toHaveTextContent("Versión A: Trabajo");
  expect(name).toHaveTextContent("Versión B: Oficina");
  expect(within(form).getByRole("group", { name: "Descripción" })).toHaveTextContent("Igual en las dos versiones");
  expect(within(form).getByRole("group", { name: "Etiquetas" })).toHaveTextContent("Versión B: b");
  // El resultado parte de la versión A (la ganadora).
  expect(within(form).getByLabelText("Nombre resultante")).toHaveValue("Trabajo");
});

test.each([
  [conflict({ reason: "no-ancestor", fields: [] }), "No se puede saber qué cambió en cada versión: elige o combina los datos."],
  [conflict({ reason: "invalid", fields: ["tags", "description"] }), "La combinación automática no cumple las reglas en las etiquetas y la descripción: elige o combina los datos."],
])("explica el motivo %#", (item, text) => {
  renderView({ conflicts: [item] });
  expect(screen.getByRole("form")).toHaveTextContent(text);
});

test("RF-013/RF-015: elegir y combinar guarda la elección del usuario", async () => {
  const resolveConflict = vi.fn(async () => undefined);
  renderView({ conflicts: [conflict()], resolveConflict });
  const form = screen.getByRole("form");
  await userEvent.click(within(within(form).getByRole("group", { name: "Nombre" })).getByRole("button", { name: "Usar versión B" }));
  const tags = within(form).getByLabelText("Etiquetas resultantes");
  await userEvent.clear(tags);
  await userEvent.type(tags, "a, b");
  await userEvent.click(within(form).getByRole("button", { name: "Guardar resolución" }));
  expect(resolveConflict).toHaveBeenCalledWith(VAULT_ID, "2-l", {
    name: "Oficina",
    description: "Común",
    tags: ["a", "b"],
    deleted_at: null,
  });
  expect(await screen.findByRole("status")).toHaveTextContent("Se guardó la resolución de «Oficina».");
});

test("el estado (papelera) también se elige", async () => {
  const resolveConflict = vi.fn(async () => undefined);
  const deletedAt = "2026-10-03T10:00:00.000000Z";
  renderView({
    conflicts: [conflict({ reason: "no-ancestor", fields: [], loser: { rev: "2-l", doc: body({ name: "Oficina", deleted_at: deletedAt }) } })],
    resolveConflict,
  });
  const state = screen.getByRole("group", { name: "Estado" });
  expect(state).toHaveTextContent("Versión A: Activa");
  expect(state).toHaveTextContent("Versión B: En la papelera");
  await userEvent.click(within(state).getByRole("button", { name: "Usar versión B" }));
  expect(within(state).getByLabelText("En la papelera")).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Guardar resolución" }));
  expect(resolveConflict).toHaveBeenCalledWith(VAULT_ID, "2-l", expect.objectContaining({ deleted_at: deletedAt }));
});

test("RF-015: una elección que no cumple las reglas muestra el error del campo y no sale", async () => {
  const resolveConflict = vi.fn(async () => {
    throw new VaultValidationError(["name"]);
  });
  renderView({ conflicts: [conflict()], resolveConflict });
  await userEvent.clear(screen.getByLabelText("Nombre resultante"));
  await userEvent.click(screen.getByRole("button", { name: "Guardar resolución" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("El nombre debe tener entre 1 y 100 caracteres, sin caracteres de control.");
  expect(screen.getByLabelText("Nombre resultante")).toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("si el conflicto cambió mientras se resolvía lo avisa", async () => {
  const resolveConflict = vi.fn(async () => {
    throw new VaultChangedError();
  });
  renderView({ conflicts: [conflict()], resolveConflict });
  await userEvent.click(screen.getByRole("button", { name: "Guardar resolución" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Este conflicto cambió mientras lo resolvías. Se muestran sus datos actuales.");
});

test("sin conflictos lo dice", () => {
  renderView({ conflicts: [] });
  expect(screen.getByText("No hay conflictos por resolver.")).toBeInTheDocument();
});
