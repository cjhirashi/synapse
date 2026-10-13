// Vista de cambios rechazados por el servidor (SPEC-0005 RF-006; PLAN-0005 §2.5).
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { syncValue, WithSync } from "../test-utils/sync";
import type { Rejection } from "./rejections";
import RejectionsPage, { reasonText } from "./RejectionsPage";
import type { SyncContextValue } from "./useSync";
import { ID_PREFIX } from "./vaultStore";

async function renderPage(build: (value: SyncContextValue) => Promise<Rejection[]>) {
  const { value } = syncValue();
  value.rejections = await build(value);
  render(
    <MemoryRouter>
      <WithSync value={value}>
        <RejectionsPage />
      </WithSync>
    </MemoryRouter>,
  );
  return value;
}

test.each([
  ["vault-name-taken", "Ya tienes una bóveda con ese nombre."],
  ["validation-error:name", "El nombre debe tener entre 1 y 100 caracteres, sin caracteres de control."],
  ["validation-error:tags", "Hasta 20 etiquetas de 1 a 32 caracteres cada una."],
  ["validation-error:_rev", "La bóveda tiene datos con un formato no válido."],
  ["not-normalized:description", "La bóveda tiene datos con un formato no válido."],
  ["owner-mismatch", "La bóveda pertenece a otro usuario."],
  ["immutable-field:created_at", "La fecha de creación de la bóveda no se puede cambiar."],
  ["delete-not-allowed", "El servidor no admite eliminar la bóveda de forma definitiva."],
  ["invalid-id", "El identificador de la bóveda no es válido."],
  ["otro-motivo", "El servidor rechazó el cambio (otro-motivo)."],
  ["toString", "El servidor rechazó el cambio (toString)."],
])("motivo %s en español", (code, text) => {
  expect(reasonText(code)).toBe(text);
});

test("RF-006: lista cada rechazo con el nombre, el motivo y «Corregir» hacia su formulario", async () => {
  const value = await renderPage(async ({ vaults }) => {
    const vault = await vaults.create({ name: "Notas", description: null, tags: [] });
    return [{ id: ID_PREFIX + vault.id, rev: vault.rev, reason: "vault-name-taken" }];
  });
  const item = await screen.findByRole("listitem");
  expect(item).toHaveTextContent("«Notas»: Ya tienes una bóveda con ese nombre.");
  const id = (await value.vaults.list())[0].id;
  expect(within(item).getByRole("link", { name: "Corregir" })).toHaveAttribute("href", `/vaults/${id}/edit`);
});

test("una bóveda rechazada que está en la papelera se corrige desde la papelera", async () => {
  await renderPage(async ({ vaults }) => {
    const created = await vaults.create({ name: "Vieja", description: null, tags: [] });
    const deleted = await vaults.softDelete(created.id, created.rev);
    return [{ id: ID_PREFIX + deleted.id, rev: deleted.rev, reason: "validation-error:name" }];
  });
  const item = await screen.findByRole("listitem");
  expect(item).toHaveTextContent("«Vieja» (en la papelera)");
  expect(within(item).getByRole("link", { name: "Corregir" })).toHaveAttribute("href", "/vaults/trash");
});

test("un rechazo de un documento que no está en la réplica se lista sin «Corregir»", async () => {
  await renderPage(async () => [{ id: "vault:no-canonico", rev: null, reason: "invalid-id" }]);
  const item = await screen.findByRole("listitem");
  expect(item).toHaveTextContent("vault:no-canonico: El identificador de la bóveda no es válido.");
  expect(within(item).queryByRole("link")).not.toBeInTheDocument();
});

test("sin rechazos lo dice", async () => {
  await renderPage(async () => []);
  expect(await screen.findByText("No hay cambios rechazados.")).toBeInTheDocument();
});
