import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as api from "../notifications/notificationsApi";
import * as push from "../notifications/pushClient";
import NotificationsSettingsPage from "./NotificationsSettingsPage";

const prefs = (over: Partial<api.Preferences["quiet"]> = {}): api.Preferences => ({
  kinds: { task_assigned: true, task_status: true, task_due: true },
  quiet: { enabled: true, start: "22:00", end: "07:00", ...over },
});

beforeEach(() => {
  vi.spyOn(api, "getPreferences").mockResolvedValue(prefs());
  vi.spyOn(api, "pushStatus").mockResolvedValue({ enabled: true, public_key: "pub", devices: 0 });
  vi.spyOn(push, "supportState").mockResolvedValue("ready");
  vi.spyOn(push, "currentEndpoint").mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

test("activar pide el permiso con la clave del servidor y refleja el estado", async () => {
  const enable = vi.spyOn(push, "enablePush").mockResolvedValue(true);
  render(<NotificationsSettingsPage />);
  await userEvent.click(await screen.findByRole("button", { name: "Activar notificaciones" }));
  expect(enable).toHaveBeenCalledWith("pub");
  expect(await screen.findByText("Notificaciones activadas en este dispositivo.")).toBeInTheDocument();
});

test("si la persona niega el permiso lo dice y no activa nada", async () => {
  vi.spyOn(push, "enablePush").mockResolvedValue(false);
  render(<NotificationsSettingsPage />);
  await userEvent.click(await screen.findByRole("button", { name: "Activar notificaciones" }));
  expect(await screen.findByText(/No diste permiso/)).toBeInTheDocument();
});

test("con el dispositivo suscrito ofrece desactivar y probar", async () => {
  vi.spyOn(push, "currentEndpoint").mockResolvedValue("https://fcm.googleapis.com/x");
  vi.spyOn(api, "pushStatus").mockResolvedValue({ enabled: true, public_key: "pub", devices: 1 });
  const off = vi.spyOn(push, "disablePush").mockResolvedValue();
  const test_ = vi.spyOn(api, "sendTestPush").mockResolvedValue({ sent: 1, removed: 0, failed: 0 });
  render(<NotificationsSettingsPage />);
  await userEvent.click(await screen.findByRole("button", { name: "Enviar aviso de prueba" }));
  expect(test_).toHaveBeenCalled();
  expect(await screen.findByText(/Aviso de prueba enviado a 1 dispositivo\./)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Desactivar en este dispositivo" }));
  expect(off).toHaveBeenCalled();
});

test("sin soporte o con permiso bloqueado explica por qué y no ofrece activar", async () => {
  vi.spyOn(push, "supportState").mockResolvedValue("denied");
  render(<NotificationsSettingsPage />);
  expect(await screen.findByText(/bloqueado en este navegador/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Activar notificaciones" })).toBeNull();
});

test("sin claves en el servidor lo avisa", async () => {
  vi.spyOn(api, "pushStatus").mockResolvedValue({ enabled: false, public_key: null, devices: 0 });
  render(<NotificationsSettingsPage />);
  expect(await screen.findByText(/no tiene configuradas las notificaciones/)).toBeInTheDocument();
});

test("las horas silenciosas se guardan al cambiarlas y se pueden apagar", async () => {
  const save = vi.spyOn(api, "setQuietHours").mockResolvedValue(prefs({ enabled: false }));
  render(<NotificationsSettingsPage />);
  await userEvent.click(await screen.findByRole("checkbox", { name: /Activar horas silenciosas/ }));
  expect(save).toHaveBeenCalledWith({ enabled: false, start: "22:00", end: "07:00" });
  await waitFor(() => expect(screen.getByLabelText("Inicio de horas silenciosas")).toBeDisabled());
});

test("avisa cuando las horas silenciosas dejan menos de 12 h al día para recibir notificaciones", async () => {
  vi.spyOn(api, "getPreferences").mockResolvedValue(prefs({ start: "12:00", end: "08:00" }));
  render(<NotificationsSettingsPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Son 20 h al día sin notificaciones");
  expect(screen.getByRole("alert")).toHaveTextContent("entre las 08:00 y las 12:00");
});

test("con la ventana habitual (22:00 a 07:00) no hay advertencia, y apagada tampoco", async () => {
  const { unmount } = render(<NotificationsSettingsPage />);
  await screen.findByText(/de 22:00 a 07:00/);
  expect(screen.queryByRole("alert")).toBeNull();
  unmount();
  vi.spyOn(api, "getPreferences").mockResolvedValue(prefs({ enabled: false, start: "12:00", end: "08:00" }));
  render(<NotificationsSettingsPage />);
  await screen.findByText("Recibirás notificaciones a cualquier hora.");
  expect(screen.queryByRole("alert")).toBeNull();
});
