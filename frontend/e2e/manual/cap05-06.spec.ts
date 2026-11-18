// H-059: Capturas de los capítulos 05 (El editor) y 06 (Propiedades, etiquetas y filtro) del Manual de Operación.
import { expect, test } from "@playwright/test";
import { DESKTOP, MASKED_EMAIL, MANUAL_DIR, PHONE, makeCapture } from "./helpers";
import { seedDemo } from "./demo";
import type { Browser } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

let demo: Awaited<ReturnType<typeof seedDemo>>;

test.beforeAll(async () => {
  demo = await seedDemo();
});

test("MANUAL cap 05", async ({ browser }) => {
  const capture = makeCapture(demo.email);

  const context = await browser.newContext({
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8010",
    viewport: DESKTOP,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  // Iniciar sesión
  const login = await fetch(`${process.env.BASE_URL ?? "http://127.0.0.1:8010"}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: demo.email, password: demo.password }),
  });
  expect(login.ok).toBeTruthy();
  const setCookie = login.headers.getSetCookie();
  for (const cookie of setCookie) {
    await context.addCookies([
      {
        name: cookie.split("=")[0],
        value: cookie.split("=")[1].split(";")[0],
        url: process.env.BASE_URL ?? "http://127.0.0.1:8010",
      },
    ]);
  }

  await context.addInitScript((theme) => localStorage.setItem("synapse-theme", theme), "light");
  await page.goto(`/vaults/${demo.vaultId}`);
  await expect(page.getByRole("tree", { name: "Notas" })).toBeVisible();

  // Abrir nota "Informe mensual"
  const tree = page.getByRole("tree", { name: "Notas" });
  const ventasRow = tree.getByRole("treeitem", { name: "Ventas", exact: true });
  await ventasRow.click();
  const informeRow = tree.getByRole("treeitem", { name: "Informe mensual", exact: true });
  await informeRow.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown-view")).toBeVisible({ timeout: 15000 });

  // 05-01: Nota en Lectura
  const editButton = page.getByRole("button", { name: "Editar" });
  const optionsButton = page.getByRole("button", { name: "Opciones de la nota" });

  await capture(page, "05-01-lectura", {
    marks: [
      {
        target: editButton,
        n: 1,
      },
      {
        target: optionsButton,
        n: 2,
      },
    ],
  });

  // 05-02: Modo Visual
  await editButton.click();
  await page.waitForTimeout(500);
  await expect(page.getByRole("button", { name: "Visual" })).toBeVisible({ timeout: 15000 });

  const visualButton = page.getByRole("button", { name: "Visual" });
  const leerButton = page.getByRole("button", { name: "Leer" });
  const guardarButton = page.getByRole("button", { name: "Guardar" });
  const formatBar = page.locator(".note-tool-group").first();

  await capture(page, "05-02-visual", {
    marks: [
      {
        target: leerButton,
        n: 1,
      },
      {
        target: visualButton,
        n: 2,
      },
      {
        target: guardarButton,
        n: 3,
      },
      {
        target: formatBar,
        n: 4,
      },
    ],
  });

  // 05-03: Modo Código
  const codigoButton = page.getByRole("button", { name: "Código", exact: true });
  await codigoButton.click();
  await page.waitForTimeout(500);

  await capture(page, "05-03-codigo", {
    marks: [
      {
        target: codigoButton,
        n: 1,
      },
      {
        target: page.locator(".cm-editor, textarea").first(),
        n: 2,
      },
    ],
  });

  // Volver a Visual
  await visualButton.click();
  await page.waitForTimeout(500);

  // 05-04: Tabla
  const tableButtons = page.locator("button[aria-label*='tabla'], button[aria-label*='Tabla']");
  if (await tableButtons.first().isVisible()) {
    await tableButtons.first().click();
    await page.waitForTimeout(300);
  }

  const table = page.locator("table").first();
  if (await table.isVisible()) {
    await capture(page, "05-04-tabla", {
      marks: [
        {
          target: table,
          n: 1,
        },
      ],
    });
  }

  // 05-11: Editor en celular
  await context.close();
  const contextPhone = await browser.newContext({
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8010",
    viewport: PHONE,
    reducedMotion: "reduce",
    hasTouch: true,
  });
  const pagePhone = await contextPhone.newPage();
  for (const cookie of setCookie) {
    await contextPhone.addCookies([
      {
        name: cookie.split("=")[0],
        value: cookie.split("=")[1].split(";")[0],
        url: process.env.BASE_URL ?? "http://127.0.0.1:8010",
      },
    ]);
  }
  await contextPhone.addInitScript((theme) => localStorage.setItem("synapse-theme", theme), "light");
  await pagePhone.goto(`/vaults/${demo.vaultId}`);
  await expect(pagePhone.getByRole("heading", { name: "Café Aurora" })).toBeVisible();

  const showTreeButton = pagePhone.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await showTreeButton.isVisible()) {
    await showTreeButton.click();
    await pagePhone.waitForTimeout(500);
  }

  const treePhone = pagePhone.getByRole("tree", { name: "Notas" });
  const ventasRowPhone = treePhone.getByRole("treeitem", { name: "Ventas", exact: true });
  await ventasRowPhone.click();
  await pagePhone.waitForTimeout(500);

  const informeButton = pagePhone.getByRole("button", { name: "Informe mensual" }).first();
  await informeButton.click();
  await expect(pagePhone.locator(".milkdown-view")).toBeVisible({ timeout: 15000 });

  const editButtonPhone = pagePhone.getByRole("button", { name: "Editar" });
  await editButtonPhone.click();
  await pagePhone.waitForTimeout(500);
  await expect(pagePhone.getByRole("button", { name: "Visual" })).toBeVisible({ timeout: 10000 });

  // 05-11: Editor en celular
  await capture(pagePhone, "05-11-editor-celular", {
    marks: [
      {
        target: pagePhone.getByRole("button", { name: "Visual" }),
        n: 1,
      },
    ],
  });

  await contextPhone.close();
  await context.close();
});

test("MANUAL cap 06", async ({ browser }) => {
  const capture = makeCapture(demo.email);

  const context = await browser.newContext({
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8010",
    viewport: DESKTOP,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  // Iniciar sesión
  const login = await fetch(`${process.env.BASE_URL ?? "http://127.0.0.1:8010"}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: demo.email, password: demo.password }),
  });
  expect(login.ok).toBeTruthy();
  const setCookie = login.headers.getSetCookie();
  for (const cookie of setCookie) {
    await context.addCookies([
      {
        name: cookie.split("=")[0],
        value: cookie.split("=")[1].split(";")[0],
        url: process.env.BASE_URL ?? "http://127.0.0.1:8010",
      },
    ]);
  }

  await context.addInitScript((theme) => localStorage.setItem("synapse-theme", theme), "light");
  await page.goto(`/vaults/${demo.vaultId}`);
  await expect(page.getByRole("tree", { name: "Notas" })).toBeVisible();

  // Abrir nota
  const tree = page.getByRole("tree", { name: "Notas" });
  const ventasRow = tree.getByRole("treeitem", { name: "Ventas", exact: true });
  await ventasRow.click();
  const informeRow = tree.getByRole("treeitem", { name: "Informe mensual", exact: true });
  await informeRow.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown-view")).toBeVisible({ timeout: 15000 });

  // 06-01: Panel de propiedades (lado izquierdo en lectura; es la tabla de metadatos)
  // Buscar la tabla/forma que muestra Título, Descripción, Etiquetas, Estado, etc.
  const metaTable = page.locator("table").first();
  if (await metaTable.isVisible()) {
    await capture(page, "06-01-propiedades", {
      marks: [
        {
          target: metaTable,
          n: 1,
        },
      ],
    });
  }

  // Para 06-02 y 06-03: necesitamos estar en edición
  const editButton = page.getByRole("button", { name: "Editar" });
  if (await editButton.isVisible()) {
    await editButton.click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: "Visual" })).toBeVisible({ timeout: 10000 });

    // 06-02: Buscar botón "Añadir propiedad"
    // En el formulario de propiedades en edición
    const addPropBtn = page.locator("button:has-text('Añadir'), button[aria-label*='Añadir'], .add-property-btn").first();
    if (await addPropBtn.isVisible()) {
      await addPropBtn.click();
      await page.waitForTimeout(300);
      const menu = page.locator("[role=menu]:visible, [role=listbox]:visible, .dropdown-menu").first();
      if (await menu.isVisible()) {
        await capture(page, "06-02-tipos-propiedad", {
          marks: [
            {
              target: menu,
              n: 1,
            },
          ],
        });
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // 06-03: Filtro por tags
    const filterBtn = page.locator("button:has-text('Filtro'), button[aria-label*='Filtro'], .filter-tags-btn").first();
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
      await page.waitForTimeout(300);
      const filterPanel = page.locator("[role=dialog]:visible, .filter-panel, .tags-panel").first();
      if (await filterPanel.isVisible()) {
        await capture(page, "06-03-filtro-tags", {
          marks: [
            {
              target: filterPanel,
              n: 1,
            },
            {
              target: page.locator("[role=list], .tags-results").first(),
              n: 2,
            },
          ],
        });
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  }

  // 06-04: Barra derecha
  const rightBar = page.locator(".docaside-panel, .document-aside, .sidebar-right").first();
  if (await rightBar.isVisible()) {
    await capture(page, "06-04-barra-derecha", {
      marks: [
        {
          target: rightBar,
          n: 1,
        },
      ],
    });
  }

  await context.close();
});
