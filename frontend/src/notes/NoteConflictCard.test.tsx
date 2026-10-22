// Conflicto de una nota: ambas versiones en texto plano (SPEC-0008 RF-009).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { NoteConflict } from "../sync/conflicts";
import { VaultChangedError } from "../sync/vaultStore";
import { NoteValidationError } from "./errors";
import { CONTENT_INVALID } from "./messages";
import NoteConflictCard from "./NoteConflictCard";
import type { NoteBody } from "./mergeNote";

const ID = "note:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222";

function body(overrides: Partial<NoteBody>): NoteBody {
  return {
    vault_id: "11111111-1111-4111-8111-111111111111",
    path: "Ideas.md",
    content: "texto base",
    frontmatter: {},
    created_at: "2026-10-22T10:00:00.000000Z",
    updated_at: "2026-10-22T10:05:00.000000Z",
    deleted_at: null,
    ...overrides,
  };
}

function conflict(overrides: Partial<NoteConflict> = {}): NoteConflict {
  return {
    kind: "note",
    id: ID,
    winner: { rev: "3-w", doc: body({ content: "# Versión A\n<b>no es HTML</b>" }) },
    loser: { rev: "3-l", doc: body({ path: "Otras/Ideas B.md", content: "versión B", deleted_at: "2026-10-22T11:00:00.000000Z" }) },
    ...overrides,
  };
}

function renderCard(item: NoteConflict, resolve = vi.fn(async () => undefined)) {
  const onResolved = vi.fn();
  const onChanged = vi.fn();
  render(<NoteConflictCard conflict={item} resolve={resolve} onResolved={onResolved} onChanged={onChanged} />);
  return { resolve, onResolved, onChanged, user: userEvent.setup() };
}

test("RF-009: muestra ambas versiones en texto plano con ruta, contenido y estado", () => {
  renderCard(conflict());
  const a = screen.getByRole("region", { name: "Versión A" });
  const b = screen.getByRole("region", { name: "Versión B" });
  expect(a).toHaveTextContent("Ideas.md");
  expect(a).toHaveTextContent("Activa");
  expect(b).toHaveTextContent("Otras/Ideas B.md");
  expect(b).toHaveTextContent("En la papelera");
  expect(b).toHaveTextContent("versión B");
  // Texto plano: el markdown y el «HTML» se ven tal cual, sin interpretarse.
  expect(a.querySelectorAll("pre")[1]).toHaveTextContent("# Versión A <b>no es HTML</b>");
  expect(a.querySelector("b")).toBeNull();
  expect(screen.getByRole("article", { name: "Conflicto en «Ideas.md»" })).toBeInTheDocument();
});

test("RF-009: «Quedarme con esta» de la versión B resuelve con los datos de B", async () => {
  const { resolve, onResolved, user } = renderCard(conflict());
  await user.click(within(screen.getByRole("region", { name: "Versión B" })).getByRole("button", { name: "Quedarme con esta" }));
  expect(resolve).toHaveBeenCalledWith(ID, "3-l", {
    path: "Otras/Ideas B.md",
    content: "versión B",
    frontmatter: {},
    deleted_at: "2026-10-22T11:00:00.000000Z",
  });
  expect(onResolved).toHaveBeenCalledWith("Otras/Ideas B.md");
});

test("RF-009: «Quedarme con esta» de la versión A resuelve con los datos de A", async () => {
  const { resolve, user } = renderCard(conflict());
  await user.click(within(screen.getByRole("region", { name: "Versión A" })).getByRole("button", { name: "Quedarme con esta" }));
  expect(resolve).toHaveBeenCalledWith(ID, "3-l", {
    path: "Ideas.md",
    content: "# Versión A\n<b>no es HTML</b>",
    frontmatter: {},
    deleted_at: null,
  });
});

test("RF-009: si la resolución no es válida muestra el mensaje y no avisa de éxito", async () => {
  const { onResolved, user } = renderCard(conflict(), vi.fn(async () => Promise.reject(new NoteValidationError(["content"]))));
  await user.click(within(screen.getByRole("region", { name: "Versión A" })).getByRole("button", { name: "Quedarme con esta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(CONTENT_INVALID);
  expect(onResolved).not.toHaveBeenCalled();
});

test("RF-009: si el conflicto cambió mientras tanto avisa al padre", async () => {
  const { onChanged, user } = renderCard(conflict(), vi.fn(async () => Promise.reject(new VaultChangedError())));
  await user.click(within(screen.getByRole("region", { name: "Versión A" })).getByRole("button", { name: "Quedarme con esta" }));
  expect(onChanged).toHaveBeenCalledOnce();
});

test("RF-009: un fallo inesperado se muestra y se puede reintentar", async () => {
  const { user } = renderCard(conflict(), vi.fn(async () => Promise.reject(new Error("boom"))));
  const keep = within(screen.getByRole("region", { name: "Versión A" })).getByRole("button", { name: "Quedarme con esta" });
  await user.click(keep);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar la resolución");
  expect(keep).toBeEnabled();
});
