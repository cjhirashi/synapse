// H-059: capturas de los capítulos 13 (Agentes y API keys) y 14 (Papelera, sincronización y problemas) del Manual de Operación.
import { expect, test } from "@playwright/test";
import type { Browser } from "@playwright/test";
import { DESKTOP, makeCapture } from "./helpers";
import { seedDemo } from "./demo";

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";
let demo: Awaited<ReturnType<typeof seedDemo>>;

test.beforeAll(async () => {
  demo = await seedDemo();
  const raw = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${origin()}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: demo.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    expect(res.status, `${method} ${path}: ${text}`).toBeLessThan(300);
    return text ? JSON.parse(text) : {};
  };
  await raw("PUT", `/vaults/${demo.vaultId}/agent-access/aira`, { carpetas: ["*"], estado: "activo" });
  await raw("POST", "/auth/agent-keys", { label: "respaldo-general" });
  await raw("POST", "/auth/agent-keys", { label: "asistente-compras", agent_id: "aira" });
  const old = await raw("POST", "/auth/agent-keys", { label: "prueba-antigua" });
  await raw("DELETE", `/auth/agent-keys/${old.id}`);
  const viejo = await raw("POST", "/vaults", { name: "Recetas viejas", icon: "book", description: "Ya no la uso", tags: ["archivo"] });
  const got = await fetch(`${origin()}/vaults/${viejo.id}`, { headers: { Cookie: demo.cookie } });
  const del = await fetch(`${origin()}/vaults/${viejo.id}`, { method: "DELETE", headers: { Cookie: demo.cookie, "If-Match": got.headers.get("etag") ?? "" } });
  expect(del.status, await del.text()).toBeLessThan(300);
});

async function session(browser: Browser) {
  const context = await browser.newContext({ baseURL: origin(), viewport: DESKTOP, reducedMotion: "reduce" });
  for (const cookie of demo.cookie.split("; ")) {
    const [name, ...rest] = cookie.split("=");
    await context.addCookies([{ name, value: rest.join("="), url: origin() }]);
  }
  await context.addInitScript((theme) => localStorage.setItem("synapse-theme", theme), "light");
  return { context, page: await context.newPage() };
}

test("MANUAL cap 13", async ({ browser }) => {
  const capture = makeCapture(demo.email);
  const { context, page } = await session(browser);

  await page.goto("/settings/api-keys");
  const createBtn = page.getByRole("button", { name: "Crear API key" });
  await expect(createBtn).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "asistente-compras" })).toBeVisible({ timeout: 20_000 });
  await capture(page, "13-01-api-keys", {
    marks: [
      { target: createBtn, n: 1, dx: 0, dy: -30 },
      { target: page.getByRole("heading", { name: "asistente-compras" }), n: 2, dx: -34, dy: -2 },
      { target: page.getByRole("tab", { name: "Cómo conectar un agente" }), n: 3, dx: 0, dy: -30 },
    ],
  });

  // 13-02: crear una clave; el valor se muestra una sola vez
  await createBtn.click();
  await page.getByLabel(/Nombre de la key/).fill("asistente-ventas");
  await page.getByLabel(/Agente \(opcional/).fill("aira");
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  const secret = page.getByRole("group", { name: "Nueva API key" });
  await expect(secret).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await capture(page, "13-02-clave-nueva", { marks: [{ target: secret, n: 1, dx: -34, dy: -2 }, { target: secret.getByRole("button", { name: /Copiar|Copiado/ }), n: 2, dx: 0, dy: -30 }] });

  // 13-03: cómo conectar un agente
  await page.getByRole("tab", { name: "Cómo conectar un agente" }).click();
  const guide = page.getByText("Por plataforma").first();
  await expect(guide).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await capture(page, "13-03-conectar", { marks: [{ target: guide, n: 1, dx: -34, dy: -2 }, { target: page.getByText("Instrucción lista para pegar").last(), n: 2, dx: -34, dy: -2 }] });

  // 13-04: agentes por bóveda
  await page.goto("/settings/agent-access");
  await page.getByLabel("Bóveda a asignar").selectOption({ label: "Café Aurora" });
  const aira = page.getByRole("listitem", { name: "Agente aira" });
  await expect(aira).toBeVisible({ timeout: 20_000 });
  await capture(page, "13-04-agentes-boveda", {
    marks: [
      { target: page.getByLabel("Bóveda a asignar"), n: 1, dx: 150, dy: -30 },
      { target: aira, n: 2, dx: -34, dy: -2 },
      { target: page.getByLabel(/Registrar otro agente/), n: 3, dx: 200, dy: -30 },
    ],
  });

  // 13-05 y 13-06: carpetas del sistema y bitácora
  await page.goto(`/vaults/${demo.vaultId}`);
  const tree = page.getByRole("tree", { name: "Notas" });
  await expect(tree.getByRole("treeitem", { name: "BITACORA" })).toBeVisible({ timeout: 30_000 });
  await capture(page, "13-05-carpetas-sistema", { marks: [{ target: page.getByText("META", { exact: true }).first(), n: 1, dx: -34, dy: -2 }] });
  await tree.getByRole("treeitem", { name: "BITACORA" }).click();
  await page.waitForTimeout(1200);
  const month = tree.getByRole("treeitem", { name: /^2026-/ }).first();
  if (await month.isVisible().catch(() => false)) await month.click();
  await page.waitForTimeout(800);
  const day = tree.getByRole("treeitem", { name: /2026-11-/ }).last();
  await day.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  await capture(page, "13-06-bitacora", { marks: [{ target: page.locator(".milkdown-view").first(), n: 1, dx: -34, dy: -2 }] });
  await context.close();
});

test("MANUAL cap 14", async ({ browser }) => {
  const capture = makeCapture(demo.email);
  const { context, page } = await session(browser);

  await page.goto("/vaults/trash");
  const restore = page.getByRole("button", { name: /Restaurar/ }).first();
  await expect(restore).toBeVisible({ timeout: 30_000 });
  await capture(page, "14-01-papelera", { marks: [{ target: restore, n: 1, dx: 108, dy: 0 }] });

  await page.goto("/conflicts");
  await expect(page.getByText("No hay conflictos por resolver.")).toBeVisible({ timeout: 30_000 });
  await capture(page, "14-02-conflictos", { marks: [{ target: page.getByText("No hay conflictos por resolver."), n: 1, dx: -34, dy: -2 }] });

  await page.goto("/rejections");
  await expect(page.getByText("No hay cambios rechazados.")).toBeVisible({ timeout: 30_000 });
  await capture(page, "14-03-rechazos", { marks: [{ target: page.getByText("No hay cambios rechazados."), n: 1, dx: -34, dy: -2 }] });

  await page.goto("/vaults");
  const bar = page.getByLabel("Sincronización").first();
  await expect(bar).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await capture(page, "14-04-indicador", { clip: { x: 800, y: 56, width: 480, height: 40 }, marks: [{ target: bar.getByText(/Última sincronización/), n: 1, dx: -34, dy: -2 }] });
  await context.close();
});
