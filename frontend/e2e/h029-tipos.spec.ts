// H-029 paso 8: atributos de la bóveda con editor tipado (fecha, select, multiselect).
import type { Page } from "@playwright/test";
import { CONTENT_NOTES, noteName } from "./content-notes";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults, type Size } from "./fixtures";

/** Declara el catálogo por la API REST desde la página (la cookie `Secure` solo viaja en el contexto del navegador). */
async function declareCatalog(page: Page, vaultId: string) {
  const status = await page.evaluate(async (id) => {
    const attributes = {
      prioridad: { type: "select", options: ["alta", "media", "baja"] },
      areas: { type: "multiselect", options: ["frontend", "backend", "datos"] },
      vence: { type: "date" },
    };
    // El `_rev` cambia si la réplica del navegador escribe la bóveda entre el GET y el PATCH (412): se repite.
    let last = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const got = await fetch(`/vaults/${id}`, { credentials: "include" });
      const res = await fetch(`/vaults/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "If-Match": got.headers.get("etag") ?? "" },
        body: JSON.stringify({ attributes }),
      });
      last = `${got.status}/${res.status}`;
      if (res.ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    return last;
  }, vaultId);
  expect(status, "GET/PATCH del catálogo").toBe("200/200");
}

async function openNote(page: Page, key: string) {
  const note = CONTENT_NOTES.find((n) => n.key === key)!;
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  const tree = page.getByRole("tree", { name: "Notas" });
  for (const folder of note.path.split("/").slice(0, -1)) {
    const row = tree.getByRole("treeitem", { name: folder, exact: true });
    if ((await row.getAttribute("aria-expanded")) === "false") await row.click();
  }
  await tree.getByRole("treeitem", { name: noteName(note), exact: true }).click();
  await expect(page.getByRole("heading", { name: noteName(note), level: 2 })).toBeVisible();
}

for (const { label, size } of [{ label: "1280", size: { width: 1280, height: 900 } as Size }, { label: "390", size: MOBILE }]) {
  test(`H-029 paso 8: editores tipados de fecha, select y multiselect a ${label} px`, async ({ browser, content }) => {
    const context = await newSession(browser, content, { theme: "dark", size });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));
    // PouchDB sondea su punto de control `_local/...` en la primera réplica: un 404 esperado, no un fallo. Cualquier otro 404 sí cuenta.
    const notFound: string[] = [];
    page.on("response", (r) => r.status() === 404 && !r.url().includes("/sync/db/_local/") && notFound.push(`${r.request().method()} ${r.url()}`));
    const vaultId = content.vaults[0].id;
    await page.goto(`/vaults/${vaultId}`);
    await declareCatalog(page, vaultId);
    await page.reload();
    await waitForVaults(page, content.vaults.length);
    await waitForSynced(page);
    // Los dos tamaños comparten la nota: valores distintos para que el segundo también cambie algo.
    const prioridad = label === "1280" ? "alta" : "baja";
    const fecha = label === "1280" ? "2026-12-24" : "2027-01-15";

    await openNote(page, "props-types");
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    const group = page.getByRole("group", { name: "Atributos de la bóveda" });
    await expect(group).toBeVisible();
    await expect(group.getByLabel("prioridad")).toBeVisible();
    await expect(group.getByRole("group", { name: "areas" })).toBeVisible();
    await expect(group.getByLabel("vence")).toHaveAttribute("type", "date");
    // Abrir en edición no la deja «sucia».
    await expect(page.getByText("Cambios sin guardar")).toHaveCount(0);

    await group.getByLabel("prioridad").selectOption(prioridad);
    await group.getByLabel("vence").fill(fecha);
    await group.getByRole("checkbox", { name: "frontend" }).check();
    await group.getByRole("checkbox", { name: "datos" }).check();
    await shot(page, `h029-tipos-${label}-1-edicion`);

    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Cambios sin guardar")).toHaveCount(0, { timeout: 10_000 });

    // Tras guardar y releer, los valores siguen y no hay campos duplicados entre el grupo tipado y las libres.
    await page.getByRole("button", { name: "Leer", exact: true }).click();
    const body = page.locator(".note-meta");
    await body.getByRole("button", { name: /Mostrar \d+ más/ }).click();
    await expect(body).toContainText(prioridad);
    await expect(body).toContainText(fecha);
    await expect(body).toContainText("frontend");
    await expect(body).toContainText("datos");
    await shot(page, `h029-tipos-${label}-2-lectura`);

    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(group.getByLabel("prioridad")).toHaveValue(prioridad);
    await expect(group.getByLabel("vence")).toHaveValue(fecha);
    await expect(group.getByRole("checkbox", { name: "frontend" })).toBeChecked();
    await expect(group.getByRole("checkbox", { name: "backend" })).not.toBeChecked();
    await expect(group.getByRole("checkbox", { name: "datos" })).toBeChecked();
    await expect(page.getByLabel("prioridad")).toHaveCount(1);
    await shot(page, `h029-tipos-${label}-3-reedicion`);

    expect(notFound, "sin 404 inesperados").toEqual([]);
    expect(errors.filter((e) => !/Failed to load resource.*(favicon|manifest|404)/.test(e)), "sin errores de consola").toEqual([]);
    await context.close();
  });
}
