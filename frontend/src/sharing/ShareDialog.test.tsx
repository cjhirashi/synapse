import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ShareDialog from "./ShareDialog";
import * as api from "./sharingApi";

beforeEach(() => {
  vi.spyOn(api, "listMembers").mockClear();
  vi.spyOn(api, "inviteMember").mockClear();
  vi.spyOn(api, "updateMemberGrants").mockClear();
  vi.spyOn(api, "removeMember").mockClear();
});
afterEach(() => vi.restoreAllMocks());

const member = (over: Partial<api.Member> = {}): api.Member => ({
  id: "mem-1",
  vault_id: "v-1",
  user_id: "u-1",
  status: "activo",
  ended_reason: null,
  invited_by: "inviter",
  created_at: "2026-11-20T10:00:00Z",
  responded_at: null,
  ended_at: null,
  user: { id: "u-1", email: "user@example.com", display_name: "User Name" },
  grants: [{ folder: "*", level: "lectura" }],
  ...over,
});

test("lista solo pendientes y activos (no revocados)", async () => {
  vi.spyOn(api, "listMembers").mockResolvedValue({
    items: [
      member({ id: "m1", status: "activo", user: { id: "u1", email: "user1@example.com", display_name: "User One" } }),
      member({ id: "m2", status: "pendiente", user: { id: "u2", email: "user2@example.com", display_name: "User Two" } }),
      member({ id: "m3", status: "revocado", user: { id: "u3", email: "user3@example.com", display_name: "User Three" } }),
    ],
  });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  expect(await screen.findByText("User One")).toBeInTheDocument();
  expect(await screen.findByText("User Two")).toBeInTheDocument();
  // El revocado NO debe estar visible
  expect(screen.queryByText("User Three")).toBeNull();
});

test("invitar llama a inviteMember con correo y concesiones (por omisión Lector)", async () => {
  const invite = vi
    .spyOn(api, "inviteMember")
    .mockResolvedValue(member({ id: "m-new", status: "pendiente" }));
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [] });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  const input = await screen.findByPlaceholderText("correo@ejemplo.com");
  await userEvent.type(input, "new@example.com");
  const btn = screen.getByRole("button", { name: "Invitar" });
  await userEvent.click(btn);
  expect(invite).toHaveBeenCalledWith("v-1", "new@example.com", [
    { folder: "*", level: "lectura" },
  ]);
});

test("invitar con éxito agrega a la lista y muestra estado", async () => {
  vi.spyOn(api, "inviteMember").mockResolvedValue(
    member({ id: "m-new", status: "pendiente", user: { id: "u-new", email: "new@example.com", display_name: null } })
  );
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [] });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  const input = await screen.findByPlaceholderText("correo@ejemplo.com");
  await userEvent.type(input, "new@example.com");
  const btn = screen.getByRole("button", { name: "Invitar" });
  await userEvent.click(btn);
  await waitFor(() => {
    expect(screen.getByRole("status")).toHaveTextContent("Invitación enviada");
  });
});

test("error 404 muestra «No hay ninguna cuenta con ese correo»", async () => {
  vi.spyOn(api, "inviteMember").mockRejectedValue({
    status: 404,
    type: "urn:synapse:problem:invitee-not-found",
  });
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [] });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  const input = await screen.findByPlaceholderText("correo@ejemplo.com");
  await userEvent.type(input, "nope@example.com");
  const btn = screen.getByRole("button", { name: "Invitar" });
  await userEvent.click(btn);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No hay ninguna cuenta con ese correo."
  );
});

test("error 409 member-already-exists muestra su texto", async () => {
  vi.spyOn(api, "inviteMember").mockRejectedValue({
    status: 409,
    type: "urn:synapse:problem:member-already-exists",
  });
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [] });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  const input = await screen.findByPlaceholderText("correo@ejemplo.com");
  await userEvent.type(input, "existing@example.com");
  const btn = screen.getByRole("button", { name: "Invitar" });
  await userEvent.click(btn);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Esa persona ya tiene una invitación o acceso."
  );
});

test("error 409 member-limit-reached muestra su texto", async () => {
  vi.spyOn(api, "inviteMember").mockRejectedValue({
    status: 409,
    type: "urn:synapse:problem:member-limit-reached",
  });
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [] });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  const input = await screen.findByPlaceholderText("correo@ejemplo.com");
  await userEvent.type(input, "new@example.com");
  const btn = screen.getByRole("button", { name: "Invitar" });
  await userEvent.click(btn);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Esta bóveda ya tiene 50 personas."
  );
});

test("error 422 muestra «Revisa el correo y los permisos»", async () => {
  vi.spyOn(api, "inviteMember").mockRejectedValue({ status: 422 });
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [] });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  const input = await screen.findByPlaceholderText("correo@ejemplo.com");
  await userEvent.type(input, "invalid");
  const btn = screen.getByRole("button", { name: "Invitar" });
  await userEvent.click(btn);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Revisa el correo y los permisos"
  );
});

test("error genérico muestra «No se pudo completar»", async () => {
  vi.spyOn(api, "inviteMember").mockRejectedValue(new Error("Network error"));
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [] });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  const input = await screen.findByPlaceholderText("correo@ejemplo.com");
  await userEvent.type(input, "new@example.com");
  const btn = screen.getByRole("button", { name: "Invitar" });
  await userEvent.click(btn);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudo completar"
  );
});

test("editar permisos guarda las concesiones nuevas y la tarjeta cambia", async () => {
  const update = vi.spyOn(api, "updateMemberGrants").mockResolvedValue(member({ id: "m1", grants: [{ folder: "Docs", level: "escritura" }] }));
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [member({ id: "m1" })] });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  expect(await screen.findByText("Lectura en toda la bóveda")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Permisos" }));
  const editor = screen.getByRole("button", { name: "Guardar permisos" }).closest(".share-member-editor") as HTMLElement;
  await userEvent.click(within(editor).getByRole("radio", { name: "Editor" }));
  await userEvent.click(screen.getByRole("button", { name: "Guardar permisos" }));

  expect(update).toHaveBeenCalledWith("v-1", "m1", [{ folder: "*", level: "escritura" }]);
  expect(await screen.findByText("Escritura en Docs")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Guardar permisos" })).toBeNull();
});

test("reinvitar a quien tenía el acceso terminado reemplaza su fila, no la duplica", async () => {
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [member({ id: "m1", status: "revocado", ended_reason: "revocada" })] });
  vi.spyOn(api, "inviteMember").mockResolvedValue(member({ id: "m1", status: "pendiente", ended_reason: null }));
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={[]} onClose={() => {}} />);
  await userEvent.type(await screen.findByLabelText("Correo de la persona"), "user@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Invitar" }));
  expect(await screen.findByText("Pendiente")).toBeInTheDocument();
  expect(screen.getAllByText("User Name")).toHaveLength(1);
});

test("un fallo al quitar se avisa arriba de la lista, no junto a «Invitar»", async () => {
  vi.spyOn(api, "removeMember").mockRejectedValue(new Error("boom"));
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [member({ id: "m1" })] });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={[]} onClose={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: "Quitar acceso" }));
  await userEvent.click(screen.getByRole("button", { name: "Quitar" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("No se pudo completar");
  expect(alert.closest(".share-invite-form")).toBeNull();
  expect(screen.getByText("User Name")).toBeInTheDocument();
});

test("si el acceso ya cambió (409) se avisa y se recarga la lista", async () => {
  const list = vi.spyOn(api, "listMembers").mockResolvedValue({ items: [member({ id: "m1" })] });
  vi.spyOn(api, "updateMemberGrants").mockRejectedValue(Object.assign(new Error("x"), { status: 409, type: "urn:synapse:problem:invitation-not-pending" }));
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={[]} onClose={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: "Permisos" }));
  await userEvent.click(screen.getByRole("button", { name: "Guardar permisos" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Ese acceso ya cambió");
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
});

test("quitar pide confirmación, cancelar NO llama a la API", async () => {
  const remove = vi.spyOn(api, "removeMember").mockResolvedValue();
  vi.spyOn(api, "listMembers").mockResolvedValue({
    items: [member({ id: "m1", status: "activo" })],
  });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  const removeBtn = await screen.findByRole("button", { name: "Quitar acceso" });
  await userEvent.click(removeBtn);
  // Aparece el diálogo de confirmación
  const cancelBtn = screen.getByRole("button", { name: "Cancelar" });
  await userEvent.click(cancelBtn);
  expect(remove).not.toHaveBeenCalled();
});

test("confirmar quitar llama a removeMember y la tarjeta desaparece", async () => {
  const remove = vi.spyOn(api, "removeMember").mockResolvedValue();
  vi.spyOn(api, "listMembers").mockResolvedValue({
    items: [member({ id: "m1", status: "activo" })],
  });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  const removeBtn = await screen.findByRole("button", { name: "Quitar acceso" });
  await userEvent.click(removeBtn);
  const confirmBtn = screen.getByRole("button", { name: "Quitar" });
  await userEvent.click(confirmBtn);
  expect(remove).toHaveBeenCalledWith("v-1", "m1");
  await waitFor(() => {
    expect(screen.queryByText("User Name")).not.toBeInTheDocument();
  });
});

test("error de carga muestra «Reintentar»", async () => {
  const list = vi
    .spyOn(api, "listMembers")
    .mockRejectedValueOnce(new Error("fail"))
    .mockResolvedValueOnce({ items: [] });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudieron cargar"
  );
  const retryBtn = screen.getByRole("button", { name: "Reintentar" });
  await userEvent.click(retryBtn);
  expect(list).toHaveBeenCalledTimes(2);
});

test("botón «Invitar» deshabilitado con correo vacío", async () => {
  vi.spyOn(api, "listMembers").mockResolvedValue({ items: [] });
  render(<ShareDialog vaultId="v-1" vaultName="Test" folders={["Docs"]} onClose={() => {}} />);
  const btn = await screen.findByRole("button", { name: "Invitar" });
  expect(btn).toBeDisabled();
});
