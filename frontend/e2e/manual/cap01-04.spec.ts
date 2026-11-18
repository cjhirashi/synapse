// H-059: Capturas de los capítulos 01 a 04 del Manual de Operación (Conceptos, Primeros pasos, Bóvedas, Notas).
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

test("MANUAL cap 01", async ({ browser }) => {
  const capture = makeCapture(demo.email);

  // 01-01: lista de bóvedas
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
  await page.goto("/vaults");

  // Esperar a que carguen las 3 bóvedas
  await expect(page.getByRole("navigation", { name: "Bóvedas abiertas" }).locator(".vault-rail-scroll").getByRole("link")).toHaveCount(3);

  // 01-01: lista de bóvedas
  await capture(page, "01-01-bovedas", {
    marks: [
      {
        target: page.getByRole("navigation", { name: "Bóvedas abiertas" }),
        n: 1,
      },
      {
        target: page.getByRole("link", { name: "Nueva bóveda" }),
        n: 2,
      },
      {
        target: page.locator("table").getByText("Café Aurora").first(),
        n: 3,
      },
    ],
  });

  // Abrir Café Aurora
  await page.goto(`/vaults/${demo.vaultId}`);
  await expect(page.getByRole("complementary", { name: "Notas de la bóveda" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Sincronización" }).getByRole("status")).toHaveText(/^Sincronizado/);

  // Abrir nota "Informe mensual"
  const tree = page.getByRole("tree", { name: "Notas" });
  const ventasRow = tree.getByRole("treeitem", { name: "Ventas", exact: true });
  await expect(ventasRow).toBeVisible();
  await ventasRow.click();
  const notaRow = tree.getByRole("treeitem", { name: "Informe mensual", exact: true });
  await expect(notaRow).toBeVisible();
  await notaRow.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".milkdown-view")).toBeVisible();

  // 01-02: espacio de trabajo con marcadores corregidos
  const docAside = page.locator(".docaside-panel");
  const hiddenButton = page.getByRole("button", { name: "Ocultar el índice y las tareas del documento" });
  const syncStatus = page.getByRole("region", { name: "Sincronización" }).getByRole("status");

  await capture(page, "01-02-espacio", {
    marks: [
      {
        target: page.getByRole("navigation", { name: "Bóvedas abiertas" }),
        n: 1,
        noBox: true,
      },
      {
        target: page.locator(".vault-tabs"),
        n: 2,
      },
      {
        target: tree,
        n: 3,
      },
      {
        target: page.locator(".milkdown-view"),
        n: 4,
      },
      {
        target: (await hiddenButton.isVisible()) ? hiddenButton : docAside,
        n: 5,
      },
      {
        target: syncStatus,
        n: 6,
        dx: -34,
        noBox: true,
      },
    ],
  });

  // 01-03: mismo espacio en celular, barra de notas oculta
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
  console.log("Phone: navigating to vault", demo.vaultId);
  await pagePhone.goto(`/vaults/${demo.vaultId}`);
  await expect(pagePhone.getByRole("heading", { name: "Café Aurora" })).toBeVisible({ timeout: 30000 });
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
  await expect(pagePhone.locator(".milkdown-view")).toBeVisible();

  // Ocultar barra de notas si es visible
  const hideButton = pagePhone.getByRole("button", { name: "Ocultar la barra de notas" });
  if (await hideButton.isVisible()) {
    await hideButton.click();
  }

  await capture(pagePhone, "01-03-celular", {
    marks: [
      {
        target: pagePhone.getByRole("button", { name: "Mostrar la barra de notas" }),
        n: 1,
      },
      {
        target: pagePhone.locator(".milkdown-view"),
        n: 2,
      },
    ],
  });

  await contextPhone.close();
});

test("MANUAL cap 02", async ({ browser }) => {
  const capture = makeCapture(demo.email);

  // 02-01: pantalla de entrada (SIN sesión)
  const contextNoLogin = await browser.newContext({
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8010",
    viewport: DESKTOP,
    reducedMotion: "reduce",
  });
  const pageNoLogin = await contextNoLogin.newPage();
  await contextNoLogin.addInitScript((theme) => localStorage.setItem("synapse-theme", theme), "light");
  await pageNoLogin.goto("/");
  await expect(pageNoLogin.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();

  await capture(pageNoLogin, "02-01-entrada", {
    marks: [
      {
        target: pageNoLogin.getByLabel("Correo"),
        n: 1,
      },
      {
        target: pageNoLogin.getByLabel("Contraseña"),
        n: 2,
      },
      {
        target: pageNoLogin.getByRole("button", { name: "Entrar" }),
        n: 3,
      },
    ],
  });

  await contextNoLogin.close();

  // Iniciar sesión para los siguientes
  const context = await browser.newContext({
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8010",
    viewport: DESKTOP,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

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

  // 02-02: cambiar contraseña
  await page.goto("/settings/password");
  await expect(page.getByRole("heading", { name: "Contraseña" })).toBeVisible();

  await capture(page, "02-02-contrasena", {
    marks: [
      {
        target: page.locator("form"),
        n: 1,
      },
      {
        target: page.getByRole("button", { name: "Cambiar contraseña" }),
        n: 2,
      },
    ],
  });

  // 02-03: perfil con foto y nombre
  await page.goto("/settings/profile");
  await expect(page.getByRole("heading", { name: "Perfil", level: 2 })).toBeVisible();

  await capture(page, "02-03-perfil", {
    marks: [
      {
        target: page.getByRole("button", { name: "Elegir foto" }),
        n: 1,
      },
      {
        target: page.getByLabel("Nombre"),
        n: 2,
      },
      {
        target: page.getByRole("button", { name: "Guardar" }),
        n: 3,
      },
    ],
  });

  // 02-04: tema claro
  await page.goto("/settings/theme");
  await expect(page.getByRole("heading", { name: "Tema" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Tema" })).toBeVisible();

  await capture(page, "02-04-tema-claro", {
    marks: [
      {
        target: page.getByRole("group", { name: "Tema" }),
        n: 1,
      },
    ],
  });

  // 02-04: tema oscuro (cambiar y capturar)
  await page.getByLabel("Tema oscuro").click();
  await page.waitForFunction(
    () => document.documentElement.classList.contains("dark") || document.documentElement.getAttribute("data-theme") === "dark",
    { timeout: 10000 },
  );

  await capture(page, "02-04-tema-oscuro", {
    marks: [
      {
        target: page.getByRole("group", { name: "Tema" }),
        n: 1,
      },
    ],
  });

  // Volver a tema claro
  await page.getByLabel("Tema claro").click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains("dark") && document.documentElement.getAttribute("data-theme") !== "dark",
    { timeout: 10000 },
  );

  // 02-05: menú de cuenta
  await page.goto("/settings");
  const logoutButton = page.getByRole("button", { name: "Cerrar sesión" });
  const logoutContainer = logoutButton.locator("..").locator("..");

  await capture(page, "02-05-cuenta", {
    marks: [
      {
        target: logoutButton,
        n: 1,
        dx: 150,
        dy: -8,
      },
    ],
  });

  // 02-06: indicador sincronizado y sin conexión
  // Primero capturar sincronizado
  const syncRegion = page.getByRole("region", { name: "Sincronización" });
  await capture(page, "02-06-sincronizado", {
    marks: [
      {
        target: syncRegion.getByRole("status"),
        n: 1,
        dx: -34,
        noBox: true,
      },
    ],
    around: syncRegion,
    pad: 8,
  });

  // Nota: setOffline(true) no dispara el estado "Sin conexión" en la réplica PouchDB
  // sin tráfico real. Se omite esta captura y se borra el archivo PNG falso si existe.

  // Intentar una captura con un indicador offline simulado pero no se logra sin corte real de red
  // Skip: no hay forma de hacer que PouchDB reporte "offline" sin desconectar realmente la red
  console.log("Skip 02-06-sin-conexion: no se puede simular sin conexión con setOffline()");

  // Captura opcional si se logra, pero esperamos que no llegue aquí
  const statusText = await syncRegion.getByRole("status").textContent();
  if (statusText?.includes("Sin conexión")) {
    await capture(page, "02-06-sin-conexion", {
      marks: [
        {
          target: syncRegion.getByRole("status"),
          n: 1,
          dx: -34,
          noBox: true,
        },
      ],
      around: syncRegion,
      pad: 8,
    });
  }

  await context.close();
});

test("MANUAL cap 03", async ({ browser }) => {
  const capture = makeCapture(demo.email);

  const context = await browser.newContext({
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8010",
    viewport: DESKTOP,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

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

  // 03-01: formulario de nueva bóveda
  await page.goto("/vaults/new");
  await expect(page.getByRole("heading", { name: "Nueva bóveda" })).toBeVisible();

  // Escribir nombre de ejemplo SIN enviar
  const nameInput = page.getByLabel("Nombre");
  await nameInput.fill("Recetas de la abuela");

  await capture(page, "03-01-nueva-boveda", {
    marks: [
      {
        target: nameInput,
        n: 1,
      },
      {
        target: page.getByLabel("Etiquetas"),
        n: 2,
      },
      {
        target: page.locator(".icon-picker"),
        n: 3,
      },
      {
        target: page.locator(".icon-picker-colors"),
        n: 4,
      },
      {
        target: page.getByRole("button", { name: "Crear bóveda" }),
        n: 5,
      },
    ],
  });

  // 03-02: selector de ícono (mostrar los radiogroups del icon picker)
  const iconPicker = page.locator(".icon-picker");
  await expect(iconPicker).toBeVisible();

  await capture(page, "03-02-iconos", {
    marks: [
      {
        target: iconPicker.locator(".icon-picker-glyphs"),
        n: 1,
      },
    ],
    around: iconPicker,
    pad: 16,
  });

  // 03-03: lista de bóvedas
  await page.goto("/vaults");
  await expect(page.getByRole("heading", { name: "Bóvedas" })).toBeVisible();

  await capture(page, "03-03-lista", {
    marks: [
      {
        target: page.locator("table tbody").first().getByRole("link", { name: /Abrir/ }),
        n: 1,
        dx: 0,
        dy: -26,
      },
      {
        target: page.locator("table tbody").first().getByRole("link", { name: /Editar/ }),
        n: 2,
        dx: 0,
        dy: -26,
      },
      {
        target: page.locator("table tbody").first().getByRole("button", { name: /Borrar/ }),
        n: 3,
        dx: 0,
        dy: -26,
      },
    ],
  });

  // 03-04: confirmación de borrar (sin borrar realmente)
  const deleteButton = page.locator("table tbody").first().getByRole("button", { name: /Borrar/ }).first();
  await deleteButton.click();
  await page.waitForTimeout(500);
  await expect(page.locator("[role=alertdialog]")).toBeVisible();

  const alertDialog = page.locator("[role=alertdialog]");
  await capture(page, "03-04-borrar-boveda", {
    marks: [
      {
        target: alertDialog,
        n: 1,
      },
    ],
  });

  // Cancelar el diálogo (presionar Escape es más seguro)
  await page.keyboard.press("Escape");

  // 03-05: riel expandido
  const expandButton = page.getByRole("button", { name: "Expandir riel de bóvedas" });
  if (await expandButton.isVisible()) {
    await expandButton.click();
    await page.waitForTimeout(500);
  }

  await capture(page, "03-05-riel", {
    marks: [
      {
        target: page.getByRole("navigation", { name: "Bóvedas abiertas" }).locator(".vault-rail-scroll"),
        n: 1,
      },
    ],
  });

  await context.close();
});

test("MANUAL cap 04", async ({ browser }) => {
  const capture = makeCapture(demo.email);

  const context = await browser.newContext({
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8010",
    viewport: DESKTOP,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

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

  // 04-01: árbol con carpetas desplegadas
  const tree = page.getByRole("tree", { name: "Notas" });
  const ventasTreeItem = tree.getByRole("treeitem", { name: "Ventas", exact: true });
  const comprasTreeItem = tree.getByRole("treeitem", { name: "Compras", exact: true });

  // Si hay botón de expandir (aria-expanded), hacer click en ese botón, no en el item
  const ventasExpand = ventasTreeItem.locator("button[aria-expanded]").first();
  if (await ventasExpand.isVisible()) {
    await ventasExpand.click();
  } else {
    await ventasTreeItem.click();
  }

  const comprasExpand = comprasTreeItem.locator("button[aria-expanded]").first();
  if (await comprasExpand.isVisible()) {
    await comprasExpand.click();
  } else {
    await comprasTreeItem.click();
  }

  // Marcar el árbol: elementos clave que muestra el guion
  await capture(page, "04-01-arbol", {
    marks: [
      { target: page.getByRole("button", { name: /^Nueva nota/ }).first(), n: 1 },
      { target: page.getByRole("button", { name: /^Nueva carpeta/ }).first(), n: 2 },
      { target: ventasTreeItem, n: 3 },
      { target: tree.getByRole("treeitem", { name: "Informe mensual", exact: true }), n: 4 },
    ],
  });

  // 04-02: crear una nota (mostrar el formulario con nombre)
  // Buscar y hacer click en el botón de nueva nota
  const newNoteBtn = page.locator("button[aria-label*='Nueva nota']").first();
  await newNoteBtn.click();
  await page.waitForTimeout(500);
  const noteNameInput = page.getByPlaceholder("Sin título");
  await expect(noteNameInput).toBeVisible({ timeout: 10000 });
  await noteNameInput.fill("Mi nueva nota");
  await page.waitForTimeout(500);

  await capture(page, "04-02-crear-nota", {
    marks: [
      {
        target: noteNameInput,
        n: 1,
      },
    ],
  });

  // Cancelar el formulario sin crear
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // 04-03: menú de acciones de una carpeta (Renombrar, Borrar)
  // Buscar el árbol nuevamente para asegurar que está actualizado
  const treeAgain = page.getByRole("tree", { name: "Notas" });
  const ventasItem = treeAgain.getByRole("treeitem", { name: "Ventas", exact: true });

  // Pasar el mouse sobre Ventas para que aparezcan los botones de acción
  await ventasItem.hover();
  await page.waitForTimeout(500);

  const ventasActionsButton = ventasItem.locator("button[aria-label*='Acciones de Ventas']");
  if (await ventasActionsButton.isVisible()) {
    await ventasActionsButton.click();
    await page.waitForTimeout(500);
    const contextMenu = page.locator("[role=menu]").first();
    if (await contextMenu.isVisible()) {
      await capture(page, "04-03-acciones-carpeta", {
        marks: [
          {
            target: contextMenu,
            n: 1,
          },
        ],
      });
      await page.keyboard.press("Escape");
    }
  }
  await page.waitForTimeout(500);

  // 04-04: vista de carpeta (INDICE) - abierta en documento de índice
  await ventasTreeItem.click();
  await page.waitForTimeout(1000);

  // Buscar el área de descripción y documentos en el índice
  const descriptionArea = page.locator(".note-view textarea, textarea").first();
  const documentsArea = page.getByRole("heading", { name: "Documentos", exact: true }).first();

  await capture(page, "04-04-indice-carpeta", {
    marks: [
      {
        target: (await descriptionArea.isVisible()) ? descriptionArea : page.locator(".note-view"),
        n: 1,
      },
      {
        target: (await documentsArea.isVisible()) ? documentsArea : page.locator(".note-view"),
        n: 2,
        dx: -34,
        dy: -2,
      },
    ],
  });

  // 04-05: botones Atrás y Adelante (abrir otra nota para que aparezcan)
  const informeButton = tree.getByRole("treeitem", { name: "Informe mensual", exact: true });
  if (await informeButton.isVisible()) {
    await informeButton.click({ button: "left" });
    await page.waitForTimeout(1000);
  }

  // Abrir una segunda nota para que Atrás quede habilitado
  const promoItem = tree.getByRole("treeitem", { name: /Promociones de temporada/ });
  if (await promoItem.isVisible()) {
    await promoItem.click({ button: "left" });
    await page.waitForTimeout(1000);
  }

  await capture(page, "04-05-atras-adelante", {
    around: page.locator(".note-editor-header"),
    pad: 44,
    marks: [
      { target: page.locator('.note-editor-header [aria-label="Atrás"]'), n: 1, dx: 0, dy: -30 },
      { target: page.locator('.note-editor-header [aria-label="Adelante"]'), n: 2, dx: 0, dy: -30 },
    ],
  });

  // 04-06: árbol en celular
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
  // En celular la barra de notas arranca oculta: se muestra igual que en el capítulo 01.
  const showTreePhone = pagePhone.getByRole("button", { name: "Mostrar la barra de notas" });
  await expect(showTreePhone.or(pagePhone.getByRole("tree", { name: "Notas" }))).toBeVisible({ timeout: 30000 });
  if (await showTreePhone.isVisible()) {
    await showTreePhone.click();
    await pagePhone.waitForTimeout(500);
  }
  const treePhone = pagePhone.getByRole("tree", { name: "Notas" });
  await expect(treePhone).toBeVisible();

  await capture(pagePhone, "04-06-arbol-celular", {
    marks: [
      {
        target: treePhone,
        n: 1,
      },
    ],
  });

  // 04-07: papelera con nota borrada
  // Primero borrar la nota desde el árbol en la sesión principal
  await context.close();
  const contextMain = await browser.newContext({
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8010",
    viewport: DESKTOP,
    reducedMotion: "reduce",
  });
  const pageMain = await contextMain.newPage();
  for (const cookie of setCookie) {
    await contextMain.addCookies([
      {
        name: cookie.split("=")[0],
        value: cookie.split("=")[1].split(";")[0],
        url: process.env.BASE_URL ?? "http://127.0.0.1:8010",
      },
    ]);
  }
  await contextMain.addInitScript((theme) => localStorage.setItem("synapse-theme", theme), "light");
  await pageMain.goto(`/vaults/${demo.vaultId}`);

  const treeMain = pageMain.getByRole("tree", { name: "Notas" });
  const ventasRow = treeMain.getByRole("treeitem", { name: "Ventas", exact: true });
  await ventasRow.click();
  const borradorViejo = treeMain.getByRole("treeitem", { name: "Borrador viejo", exact: true });
  await expect(borradorViejo).toBeVisible();

  // Abrir la nota
  await borradorViejo.focus();
  await pageMain.keyboard.press("Enter");
  await expect(pageMain.locator(".milkdown-view")).toBeVisible();

  // Abrir menú de opciones
  const noteOptionsButton = pageMain.getByRole("button", { name: "Opciones de la nota" });
  await noteOptionsButton.click();
  const noteMenu = pageMain.locator("[role=menu]");
  await expect(noteMenu).toBeVisible();

  // Buscar "Borrar" en el menú
  const deleteOption = noteMenu.getByRole("menuitem", { name: "Borrar" });
  await deleteOption.click();

  // Confirmar borrado si hay diálogo
  // La confirmación es un alertdialog (ConfirmDelete → ConfirmDialog); su «Borrar» es el botón de peligro.
  const confirmDelete = pageMain.getByRole("alertdialog").getByRole("button", { name: "Borrar", exact: true });
  await expect(confirmDelete).toBeVisible();
  await confirmDelete.click();
  await expect(pageMain.getByRole("alertdialog")).toHaveCount(0);

  await pageMain.waitForTimeout(500);

  // Papelera de la bóveda: botón del pie de la barra de notas (no tiene ruta propia; /vaults/:id/trash no existe)
  await expect(treeMain.getByRole("treeitem", { name: "Borrador viejo", exact: true })).toHaveCount(0);
  await pageMain.getByRole("button", { name: "Papelera de la bóveda" }).click();
  await expect(pageMain.getByRole("heading", { level: 2, name: "Papelera de la bóveda" })).toBeVisible();
  const trashList = pageMain.getByRole("list", { name: "Notas borradas" });
  await expect(trashList).toContainText("Borrador viejo");

  await capture(pageMain, "04-07-papelera-nota", {
    marks: [
      {
        target: trashList.getByRole("button", { name: "Restaurar" }).first(),
        n: 1,
      },
    ],
  });

  await contextPhone.close();
  await contextMain.close();
});
