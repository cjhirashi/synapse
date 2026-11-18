// H-057: desde el diálogo de publicar se pueden hacer públicos los archivos privados del documento, uno por uno o todos, sin ir a Archivos.
import type { Page } from "@playwright/test";
import { expect, MOBILE, newSession, shot, test, waitForSynced, waitForVaults } from "./fixtures";

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function login(user: { email: string; password: string }) {
  const res = await fetch(`${origin()}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password }) });
  return res.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
}

async function openDoc(page: Page, folder: string, name: string) {
  const tree = page.getByRole("tree", { name: "Notas" });
  await expect(async () => {
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    await expect(tree.getByRole("treeitem", { name: folder, exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await tree.getByRole("treeitem", { name: folder, exact: true }).click();
  const row = tree.getByRole("treeitem", { name, exact: true });
  await expect(async () => {
    const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
    if (await show.isVisible()) await show.click();
    await expect(row).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await row.focus();
  await page.keyboard.press("Enter");
}

for (const { label, size } of [{ label: "390", size: MOBILE }, { label: "1280", size: { width: 1280, height: 900 } }]) {
  for (const theme of ["light", "dark"] as const) {
    test(`H-057: hacer públicos los archivos desde el diálogo de publicar a ${label} px (${theme})`, async ({ browser, content }) => {
      const vault = content.vaults[0];
      const cookie = await login(content);
      const api = async (method: string, path: string, body?: unknown) => {
        const res = await fetch(`${origin()}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await res.text();
        return { status: res.status, text, json: () => JSON.parse(text) as any };
      };
      const bytes = new Uint8Array(await (await fetch(`${origin()}/icons/icon-192.png`)).arrayBuffer());
      const upload = async (name: string, visibility: "private" | "public") => {
        const form = new FormData();
        form.set("vault_id", vault.id);
        form.set("visibility", visibility);
        form.set("file", new Blob([bytes], { type: "image/png" }), name);
        const res = await fetch(`${origin()}/files`, { method: "POST", headers: { Cookie: cookie }, body: form });
        expect(res.status, await res.clone().text()).toBe(201);
        return (await res.json()).id as string;
      };
      const isPublic = async (id: string) => (await fetch(`${origin()}/files/${id}`)).status === 200;

      const a = await upload(`uno-${label}-${theme}.png`, "private");
      const b = await upload(`dos-${label}-${theme}.png`, "private");
      const c = await upload(`tres-${label}-${theme}.png`, "private");
      const pub = await upload(`abierto-${label}-${theme}.png`, "public");
      expect([await isPublic(a), await isPublic(b), await isPublic(c), await isPublic(pub)]).toEqual([false, false, false, true]);

      const template = await api("POST", `/vaults/${vault.id}/notes`, {
        path: "PLANTILLAS/plantilla-pub.md", content: "# Estructura",
        frontmatter: { titulo: "Pub", descripcion: "Plantilla de prueba", alcance: ["*"], atributos: [], estados: [{ nombre: "borrador", color: "azul" }], estilo: { publicar: { activo: true }, pdf: {} } },
      });
      expect([201, 409]).toContain(template.status);
      const folder = `Arch${label}${theme}`;
      const own = (id: string) => `https://synapse.cjhirashi.com/files/${id}`;
      const note = await api("POST", `/vaults/${vault.id}/notes`, {
        path: `${folder}/Informe.md`, content: `# Informe\n\n![uno](${own(a)})\n\n![dos](${own(b)})\n\n![tres](${own(c)})\n\n![abierto](${own(pub)})\n`,
        frontmatter: { titulo: "Informe", descripcion: "Con archivos privados", tags: [], estado: "borrador", plantilla: "pub" },
      });
      expect(note.status, note.text).toBe(201);

      const context = await newSession(browser, content, { theme, size, touch: label === "390" });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/vaults/${vault.id}`);
      await waitForVaults(page, content.vaults.length);
      await waitForSynced(page);
      await openDoc(page, folder, "Informe");
      await page.getByRole("button", { name: "Publicar en la web" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Hay recursos que no se verán")).toBeVisible({ timeout: 15_000 });
      await expect(dialog.getByRole("button", { name: /^Hacer público «/ })).toHaveCount(3);
      await expect(dialog.getByRole("button", { name: "Hacer públicos todos (3)" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Publicar de todos modos" })).toBeVisible();
      for (const button of await dialog.locator(".publish-private-action, .publish-private-all").all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      }
      const overflow = await dialog.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(overflow.sw).toBeLessThanOrEqual(overflow.cw + 1);
      await shot(page, `h057-archivos-privados-${label}-${theme}`);

      // Uno solo: ese archivo pasa a público en el servidor y sale de la lista
      await dialog.getByRole("button", { name: `Hacer público «uno-${label}-${theme}.png»` }).click();
      await expect(dialog.getByText(`«uno-${label}-${theme}.png» · privado`)).toHaveCount(0);
      expect(await isPublic(a)).toBe(true);
      expect([await isPublic(b), await isPublic(c)]).toEqual([false, false]); // los demás no se tocan
      await expect(dialog.getByRole("button", { name: "Hacer públicos todos (2)" })).toBeVisible();

      // Todos los que quedan
      await dialog.getByRole("button", { name: "Hacer públicos todos (2)" }).click();
      await expect(dialog.getByText("Los archivos del documento ya son públicos.")).toBeVisible();
      expect([await isPublic(b), await isPublic(c)]).toEqual([true, true]);
      await expect(dialog.getByText("Hay recursos que no se verán")).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: "Publicar", exact: true })).toBeVisible();
      await shot(page, `h057-archivos-publicos-${label}-${theme}`);

      expect(errors, "sin errores de página").toEqual([]);
      for (const id of [a, b, c, pub]) await api("DELETE", `/files/${id}`);
      await api("DELETE", `/vaults/${vault.id}/notes/${note.json().id}`);
      await context.close();
    });
  }
}
