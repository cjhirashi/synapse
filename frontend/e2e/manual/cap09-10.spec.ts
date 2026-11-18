// H-059: capturas de los capítulos 09 (Tareas) y 10 (Avisos) del Manual de Operación.
import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { DESKTOP, PHONE, makeCapture } from "./helpers";
import { seedDemo } from "./demo";

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";
let demo: Awaited<ReturnType<typeof seedDemo>>;

const iso = (days: number, hour = 12) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

test.beforeAll(async () => {
  demo = await seedDemo();
  const cookie = demo.cookie;
  const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${origin()}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    expect(res.status, `${method} ${path}: ${text}`).toBeLessThan(300);
    return text ? JSON.parse(text) : {};
  };
  const v = demo.vaultId;

  // Proyecto y tareas variadas (la siembra base ya trae «Comprar la cafetera nueva» vencida y «Revisar promociones» en curso).
  const proyecto = await api("POST", `/vaults/${v}/projects`, { title: "Apertura de la sucursal", description: "Todo lo necesario para abrir la segunda sucursal.", color: "blue" });
  const madre = await api("POST", `/vaults/${v}/tasks`, { title: "Preparar el menú de Navidad", status: "in_progress", priority: "high", start_at: iso(-2), due_at: iso(9), project_id: proyecto.id, description: "Definir platillos, precios y fotos." });
  await api("POST", `/vaults/${v}/tasks/${madre.id}/subtasks`, { title: "Probar las recetas", status: "done", start_at: iso(-2), due_at: iso(1) });
  await api("POST", `/vaults/${v}/tasks/${madre.id}/subtasks`, { title: "Fotografiar los platillos", status: "pending", start_at: iso(2), due_at: iso(6) });
  const base = await api("POST", `/vaults/${v}/tasks`, { title: "Contratar al panadero", status: "pending", priority: "medium", start_at: iso(1), due_at: iso(7), project_id: proyecto.id });
  await api("POST", `/vaults/${v}/tasks`, { title: "Abrir la caja registradora", status: "pending", priority: "low", start_at: iso(8), due_at: iso(12), blocked_by: [base.id], project_id: proyecto.id });
  await api("POST", `/vaults/${v}/tasks`, { title: "Pagar el alquiler", status: "pending", priority: "high", due_at: iso(4), reminders: [1440, 60] });

  // Un agente registrado en la bóveda asigna una tarea a la persona: genera el aviso «Tarea asignada».
  await api("PUT", `/vaults/${v}/agent-access/aira`, { carpetas: ["*"], estado: "activo" });
  const key = await api("POST", "/auth/agent-keys", { label: "Asistente de compras", agent_id: "aira" });
  const asAgent = { Authorization: `Bearer ${key.key}`, Cookie: "" };
  await api("POST", `/vaults/${v}/tasks`, { title: "Revisar la cotización del proveedor", status: "pending", priority: "high", due_at: iso(2), assignee_type: "user" }, asAgent);
  await api("POST", `/vaults/${v}/tasks`, { title: "Confirmar la entrega de leche", status: "pending", priority: "medium", due_at: iso(3), assignee_type: "user" }, asAgent);
});

async function session(browser: Browser, size = DESKTOP, touch = false) {
  const context = await browser.newContext({ baseURL: origin(), viewport: size, reducedMotion: "reduce", hasTouch: touch });
  for (const cookie of demo.cookie.split("; ")) {
    const [name, ...rest] = cookie.split("=");
    await context.addCookies([{ name, value: rest.join("="), url: origin() }]);
  }
  await context.addInitScript((theme) => localStorage.setItem("synapse-theme", theme), "light");
  const page = await context.newPage();
  return { context, page };
}

async function openTasks(page: Page) {
  await page.goto(`/vaults/${demo.vaultId}?tab=tareas`);
  await expect(page.getByRole("tablist", { name: "Vista de tareas" })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
}

test("MANUAL cap 09", async ({ browser }) => {
  const capture = makeCapture(demo.email);
  const { context, page } = await session(browser);
  await openTasks(page);

  const views = page.getByRole("tablist", { name: "Vista de tareas" });
  const nueva = page.getByRole("button", { name: "Nueva tarea" }).first();
  await capture(page, "09-01-lista", {
    marks: [
      { target: page.locator(".tf-panel").first(), n: 1, dx: 0, dy: -2 },
      { target: views, n: 2, dx: 0, dy: -26 },
      { target: nueva, n: 3, dx: 0, dy: -26 },
    ],
  });

  // 09-02 a 09-04: las otras vistas
  await views.getByRole("tab", { name: "Kanban" }).click();
  await page.waitForTimeout(800);
  await capture(page, "09-02-kanban", { marks: [{ target: page.locator(".tasks-column-head").nth(0), n: 1, dx: 0, dy: -26 }, { target: page.locator(".tasks-column-head").nth(1), n: 2, dx: 0, dy: -26 }] });
  await views.getByRole("tab", { name: "Calendario" }).click();
  await page.waitForTimeout(800);
  await capture(page, "09-03-calendario", { marks: [{ target: page.getByText("Pagar el alquiler").first(), n: 1, dx: 0, dy: 24 }] });
  await views.getByRole("tab", { name: "Línea de tiempo" }).click();
  await page.waitForTimeout(800);
  await capture(page, "09-04-linea-de-tiempo", { marks: [{ target: page.getByRole("list", { name: "Línea de tiempo de tareas" }).getByText("Contratar al panadero").last(), n: 1, dx: -34, dy: -2 }, { target: page.locator("#tasks-panel").getByText("Semana", { exact: true }).first(), n: 2, dx: 0, dy: -26 }] });
  await views.getByRole("tab", { name: "Lista" }).click();
  await page.waitForTimeout(600);

  // 09-05: formulario de tarea nueva
  await nueva.click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel("Título").first().fill("Comprar vasos para llevar");
  await dialog.getByLabel(/^Vence/).fill("2026-11-25T10:00");
  await capture(page, "09-05-formulario", {
    marks: [
      { target: dialog.getByLabel("Título").first(), n: 1, dx: -34, dy: -2 },
      { target: dialog.getByText("Asignada a", { exact: true }).first(), n: 2, dx: -34, dy: -2 },
      { target: dialog.getByText(/^Inicia/).first(), n: 3, dx: -34, dy: -2 },
      { target: dialog.getByText(/^Notificaciones/).first(), n: 4, dx: -34, dy: -2 },
    ],
  });
  await page.keyboard.press("Escape");

  // 09-06 y 09-07: detalle con subtareas y tarea bloqueada
  await page.getByText("Preparar el menú de Navidad").first().click();
  const detail = page.getByRole("dialog").first();
  await expect(detail).toBeVisible({ timeout: 10_000 });
  const subs = detail.locator("h3", { hasText: "Subtareas" });
  await subs.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400);
  await capture(page, "09-06-detalle-subtareas", { marks: [{ target: subs, n: 1, dx: -34, dy: -2 }, { target: detail.getByText("Fotografiar los platillos").first(), n: 2, dx: -34, dy: -2 }] });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.getByText("Abrir la caja registradora").first().click();
  const blocked = page.getByRole("dialog").first();
  await expect(blocked).toBeVisible({ timeout: 10_000 });
  await capture(page, "09-07-bloqueada", { marks: [{ target: blocked.getByText("Dependencias").first(), n: 1, dx: -34, dy: -2 }, { target: blocked.getByText("Contratar al panadero").first(), n: 2, dx: -34, dy: -2 }] });
  await page.keyboard.press("Escape");

  // 09-08: ventana Proyectos
  await page.getByRole("button", { name: "Proyectos" }).first().click();
  const projects = page.getByRole("dialog").first();
  await expect(projects).toBeVisible({ timeout: 10_000 });
  await capture(page, "09-08-proyectos", { marks: [{ target: projects.getByText("Apertura de la sucursal").first(), n: 1, dx: -34, dy: -2 }] });
  await page.keyboard.press("Escape");
  await context.close();

  // 09-09: todas las bóvedas
  const all = await session(browser);
  await all.page.goto("/tareas");
  await expect(all.page.getByRole("list", { name: "Tareas de todas las bóvedas" }).or(all.page.getByRole("heading", { name: /Tareas/ })).first()).toBeVisible({ timeout: 30_000 });
  await all.page.waitForTimeout(1200);
  await capture(all.page, "09-09-todas-las-bovedas", { marks: [{ target: all.page.getByRole("combobox", { name: "Bóveda" }), n: 1, dx: 210, dy: -28 }] });
  await all.context.close();

  // 09-10: celular
  const phone = await session(browser, PHONE, true);
  await phone.page.goto(`/vaults/${demo.vaultId}?tab=tareas`);
  await phone.page.waitForTimeout(2500);
  const showTabs = phone.page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await showTabs.isVisible()) await showTabs.click();
  const closeFilters = phone.page.getByRole("button", { name: "Cerrar filtros" });
  if (await closeFilters.isVisible()) await closeFilters.click();
  await phone.page.waitForTimeout(1000);
  await capture(phone.page, "09-10-celular", {});
  await phone.context.close();
});

test("MANUAL cap 10", async ({ browser }) => {
  const capture = makeCapture(demo.email);
  const { context, page } = await session(browser);
  await page.goto("/avisos");
  const section = page.getByRole("region", { name: "Avisos" }).or(page.locator("section.notices-page")).first();
  await expect(section).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await capture(page, "10-01-avisos", {
    marks: [
      { target: page.locator(".notice, [class*=notice-card]").first(), n: 1, dx: -34, dy: -2 },
      { target: page.getByRole("button", { name: /Marcar todo como leído/ }).first(), n: 2, dx: 0, dy: -26 },
      { target: page.getByRole("group", { name: "Filtrar avisos" }), n: 3, dx: 175, dy: -30 },
    ],
  });
  await page.goto("/settings/notifications");
  await page.waitForTimeout(1500);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.waitForTimeout(500);
  await capture(page, "10-02-preferencias", {
    marks: [
      { target: page.getByText("Qué avisos recibo", { exact: true }), n: 1, dx: -34, dy: -2 },
      { target: page.getByText("Horas silenciosas", { exact: true }).first(), n: 2, dx: -34, dy: -2 },
    ],
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/vaults/${demo.vaultId}`);
  await page.waitForTimeout(1500);
  const bell = page.getByRole("link", { name: /Avisos/ }).or(page.getByRole("button", { name: /Avisos/ })).first();
  await capture(page, "10-03-campana", { clip: { x: 960, y: 0, width: 320, height: 100 }, marks: [{ target: bell, n: 1, dx: -34, dy: 0 }] });
  await context.close();
});
