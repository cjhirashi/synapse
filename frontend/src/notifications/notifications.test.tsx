import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import NotificationsPage from "./NotificationsPage";
import NotificationsRailLink from "./NotificationsRailLink";
import * as api from "./notificationsApi";

afterEach(() => vi.restoreAllMocks());

const notice = (over: Partial<api.Notice> = {}): api.Notice => ({
  id: "n1", kind: "task_assigned", title: "Te asignaron: Revisar", body: "aira", vault_id: "v1",
  resource_type: "task", resource_id: "t1", url: "/vaults/v1?tab=tareas&task=t1", read_at: null,
  created_at: "2026-11-12T18:00:00Z", ...over,
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

test("abrir un aviso lo marca como leído y lleva a la tarea", async () => {
  vi.spyOn(api, "listNotices").mockResolvedValue({ items: [notice()], unread: 1 });
  const mark = vi.spyOn(api, "markRead").mockResolvedValue();
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: /Te asignaron: Revisar/ }));
  expect(mark).toHaveBeenCalledWith("n1");
  expect(await screen.findByTestId("where")).toHaveTextContent("/vaults/v1?tab=tareas&task=t1");
});

test("un aviso ya leído no se vuelve a marcar y una URL externa no navega", async () => {
  vi.spyOn(api, "listNotices").mockResolvedValue({ items: [notice({ read_at: "2026-11-12T19:00:00Z", url: "https://x.test" })], unread: 0 });
  const mark = vi.spyOn(api, "markRead").mockResolvedValue();
  renderPage();
  await userEvent.click(await screen.findByRole("button", { name: /Te asignaron/ }));
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

test("el riel muestra el contador, lo relee al leer y oculta el 0", async () => {
  const count = vi.spyOn(api, "unreadCount").mockResolvedValue(3);
  render(<MemoryRouter><NotificationsRailLink expanded={false} /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Avisos (3 sin leer)" })).toHaveAttribute("href", "/avisos");
  count.mockResolvedValue(0);
  window.dispatchEvent(new Event(api.NOTICES_CHANGED));
  expect(await screen.findByRole("link", { name: "Avisos" })).toBeInTheDocument();
});
