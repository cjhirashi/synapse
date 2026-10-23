// Vista de cambios rechazados por el servidor (SPEC-0005 RF-006; PLAN-0005 §2.5).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { expect, test } from "vitest";
import { syncValue, WithSync } from "../test-utils/sync";
import type { Rejection } from "./rejections";
import { noteReasonText } from "../notes/messages";
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

// --- Notas (SPEC-0008 RF-004, RF-013, RF-014) ---

function Destination() {
  const location = useLocation();
  return <p data-testid="dest">{location.pathname}|{JSON.stringify(location.state)}</p>;
}

/** La página dentro de un router con destino visible, para comprobar adónde lleva «Corregir». */
async function renderNotesPage(build: (value: SyncContextValue) => Promise<Rejection[]>) {
  const { value } = syncValue();
  value.rejections = await build(value);
  render(
    <MemoryRouter initialEntries={["/rejections"]}>
      <WithSync value={value}>
        <Routes>
          <Route path="/rejections" element={<RejectionsPage />} />
          <Route path="*" element={<Destination />} />
        </Routes>
      </WithSync>
    </MemoryRouter>,
  );
  return value;
}

test.each([
  ["note-path-taken", "Ya hay una nota con esa ruta en esta bóveda."],
  ["vault-not-found", "La bóveda de esta nota no existe en el servidor o está en la papelera. Se reintentará sola cuando la bóveda esté activa."],
  ["validation-error:path", "La ruta debe tener entre 1 y 300 caracteres, sin caracteres de control ni carpetas sin nombre."],
  ["not-normalized:path", "La ruta debe tener entre 1 y 300 caracteres, sin caracteres de control ni carpetas sin nombre."],
  ["validation-error:content", "La nota supera los 2 MiB o tiene caracteres no válidos: no se guardó."],
  ["validation-error:frontmatter", "Los metadatos (frontmatter) de la nota no son válidos."],
  ["validation-error:_rev", "La nota tiene datos con un formato no válido."],
  ["otro-motivo", "El servidor rechazó el cambio (otro-motivo)."],
])("RF-013: motivo de nota %s en español", (code, text) => {
  expect(noteReasonText(code)).toBe(text);
});

test("RF-013: una nota rechazada se lista con su ruta y el motivo, y «Corregir» abre su bóveda con la nota en el estado de navegación", async () => {
  const value = await renderNotesPage(async ({ vaults, notes }) => {
    const vault = await vaults.create({ name: "Trabajo", description: null, tags: [] });
    const note = await notes.create(vault.id, "Ideas");
    return [{ id: note.id, rev: note.rev, reason: "note-path-taken" }];
  });
  const item = await screen.findByRole("listitem");
  expect(item).toHaveTextContent("«Ideas.md» (Trabajo): Ya hay una nota con esa ruta en esta bóveda.");
  await userEvent.click(within(item).getByRole("link", { name: "Corregir" }));
  const vault = (await value.vaults.list())[0];
  expect(screen.getByTestId("dest")).toHaveTextContent(`/vaults/${vault.id}|{"noteId":"${value.rejections[0].id}"}`);
});

test("RF-004: una nota con vault-not-found y su bóveda ausente se lista sin «Corregir»", async () => {
  await renderNotesPage(async () => [
    {
      id: "note:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
      rev: "1-a",
      reason: "vault-not-found",
    },
  ]);
  const item = await screen.findByRole("listitem");
  expect(item).toHaveTextContent("Se reintentará sola");
  expect(within(item).queryByRole("link", { name: "Corregir" })).toBeNull();
});

test("RF-014: los rechazos de notas de una bóveda en la papelera no se muestran", async () => {
  await renderNotesPage(async ({ vaults, notes }) => {
    const vault = await vaults.create({ name: "Vieja", description: null, tags: [] });
    const note = await notes.create(vault.id, "Oculta");
    await vaults.softDelete(vault.id, vault.rev);
    return [{ id: note.id, rev: note.rev, reason: "validation-error:content" }];
  });
  expect(await screen.findByText("No hay cambios rechazados.")).toBeInTheDocument();
  expect(screen.queryByText(/Oculta/)).toBeNull();
});
