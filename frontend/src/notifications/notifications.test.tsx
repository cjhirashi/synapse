import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import NotificationsPage from "./NotificationsPage";
import NotificationsBell from "./NotificationsBell";
import * as api from "./notificationsApi";

beforeEach(() => {
  vi.spyOn(api, "listNoticeVaults").mockResolvedValue([{ id: "v1", name: "Proyectos", icon: null }]);
});
afterEach(() => vi.restoreAllMocks());

const notice = (over: Partial<api.Notice> = {}): api.Notice => ({
  id: "n1", kind: "task_assigned", title: "aira te asignó una tarea", body: "Revisar el plan", vault_id: "v1",
  resource_type: "task", resource_id: "t1", url: "/vaults/v1?tab=tareas&task=t1", read_at: null,
  created_at: "2026-11-12T18:00:00Z",
  task: { id: "t1", title: "Revisar el plan", description: "Con los números de octubre", status: "in_progress", priority: "medium", due_at: null, assignee_type: "agent", assignee_agent_id: "aira" },
  ...over,
});

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/avisos"]}>
      <Routes>
        <Route path="/avisos" element={<NotificationsPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

test("la bandeja lista los avisos y avisa cuando está vacía", async () => {
  vi.spyOn(api, "listNotices").mockResolvedValue({ items: [], unread: 0 });
  renderPage();
  expect(await screen.findByText("No tienes avisos.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Marcar todo como leído/ })).toBeDisabled();
});

test("cada aviso muestra el título y la descripción de la tarea, su estado, su responsable y su bóveda", async () => {
  vi.spyOn(api, "listNotices").mockResolvedValue({ items: [notice()], unread: 1 });
  renderPage();
  const card = await screen.findByRole("button", { name: /^(?!Marcar).*Revisar el plan/ });
  expect(card).toHaveTextContent("Revisar el plan");
  expect(card).toHaveTextContent("Con los números de octubre");
  expect(card).toHaveTextContent("En progreso");
  expect(card).toHaveTextContent("aira");
  await waitFor(() => expect(card).toHaveTextContent("Proyectos"));
});

test("sin la tarea (eliminada) el aviso lo dice y conserva su texto; el encabezado no repite el título", async () => {
  vi.spyOn(api, "listNotices").mockResolvedValue({ items: [
    notice({ task: null }),
    notice({ id: "n2", kind: "task_due", title: "«Revisar el plan» (de aira) vence en 1 h", body: "Vence el 13 nov 2026, 18:30" }),
  ], unread: 2 });
  renderPage();
  expect(await screen.findByText("Tarea eliminada")).toBeInTheDocument();
  expect(await screen.findByText("Vence en 1 h")).toBeInTheDocument();
});

test("el filtro «Sin leer» oculta los avisos leídos", async () => {
  vi.spyOn(api, "listNotices").mockResolvedValue({ items: [notice(), notice({ id: "n2", read_at: "2026-11-12T19:00:00Z", task: { ...notice().task!, title: "Ya leída" } })], unread: 1 });
  renderPage();
  await screen.findByRole("button", { name: /^(?!Marcar).*Ya leída/ });
  await userEvent.click(screen.getByRole("button", { name: "Sin leer (1)" }));
  expect(screen.queryByRole("button", { name: /^(?!Marcar).*Ya leída/ })).toBeNull();
  expect(screen.getByRole("button", { name: /^(?!Marcar).*Revisar el plan/ })).toBeInTheDocument();
});

test("el botón de la tarjeta marca el aviso como leído sin abrir la tarea", async () => {
  vi.spyOn(api, "listNotices").mockResolvedValue({ items: [notice()], unread: 1 });
  const mark = vi.spyOn(api, "markRead").mockResolvedValue();
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "Marcar como leído: Revisar el plan" }));
  expect(mark).toHaveBeenCalledWith("n1");
  expect(screen.queryByTestId("where")).toBeNull();
});

test("un aviso ya leído no ofrece el botón de marcar como leído", async () => {
  vi.spyOn(api, "listNotices").mockResolvedValue({ items: [notice({ read_at: "2026-11-12T19:00:00Z" })], unread: 0 });
  renderPage();
  await screen.findByRole("button", { name: /^(?!Marcar).*Revisar el plan/ });
  expect(screen.queryByRole("button", { name: /Marcar como leído:/ })).toBeNull();
});

test("abrir un aviso lo marca como leído y lleva a la tarea", async () => {
  vi.spyOn(api, "listNotices").mockResolvedValue({ items: [notice()], unread: 1 });
  const mark = vi.spyOn(api, "markRead").mockResolvedValue();
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: /^(?!Marcar).*Revisar el plan/ }));
  expect(mark).toHaveBeenCalledWith("n1");
  expect(await screen.findByTestId("where")).toHaveTextContent("/vaults/v1?tab=tareas&task=t1");
});

test("un aviso ya leído no se vuelve a marcar y una URL externa no navega", async () => {
  vi.spyOn(api, "listNotices").mockResolvedValue({ items: [notice({ read_at: "2026-11-12T19:00:00Z", url: "https://x.test" })], unread: 0 });
  const mark = vi.spyOn(api, "markRead").mockResolvedValue();
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: /^(?!Marcar).*Revisar el plan/ }));
  expect(mark).not.toHaveBeenCalled();
  expect(screen.queryByTestId("where")).toBeNull();
});

test("«Marcar todo» llama a la API y recarga", async () => {
  const list = vi.spyOn(api, "listNotices").mockResolvedValue({ items: [notice()], unread: 1 });
  const all = vi.spyOn(api, "markAllRead").mockResolvedValue();
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: /Marcar todo como leído/ }));
  expect(all).toHaveBeenCalled();
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
});

test("si falla la lectura muestra el error y permite reintentar", async () => {
  const list = vi.spyOn(api, "listNotices").mockRejectedValueOnce(new Error("x")).mockResolvedValue({ items: [], unread: 0 });
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron leer los avisos");
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText("No tienes avisos.")).toBeInTheDocument();
  expect(list).toHaveBeenCalledTimes(2);
});

test("la campana de la navbar muestra el contador, lo relee al leer y oculta el 0", async () => {
  const count = vi.spyOn(api, "unreadCount").mockResolvedValue(3);
  render(<MemoryRouter><NotificationsBell /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Avisos (3 sin leer)" })).toHaveAttribute("href", "/avisos");
  count.mockResolvedValue(0);
  window.dispatchEvent(new Event(api.NOTICES_CHANGED));
  expect(await screen.findByRole("link", { name: "Avisos" })).toBeInTheDocument();
});

test("un push recibido por el service worker actualiza el contador al instante", async () => {
  const listeners: Array<(event: MessageEvent) => void> = [];
  vi.stubGlobal("navigator", { ...navigator, serviceWorker: {
    addEventListener: (_: string, fn: (event: MessageEvent) => void) => listeners.push(fn), removeEventListener: vi.fn(),
  } });
  try {
    const count = vi.spyOn(api, "unreadCount").mockResolvedValue(0);
    render(<MemoryRouter><NotificationsBell /></MemoryRouter>);
    await screen.findByRole("link", { name: "Avisos" });
    count.mockResolvedValue(1);
    listeners.forEach((fn) => fn({ data: { type: "NOTICES_CHANGED" } } as MessageEvent));
    expect(await screen.findByRole("link", { name: "Avisos (1 sin leer)" })).toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});
