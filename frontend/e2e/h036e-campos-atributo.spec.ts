// H-036e: `{{atributo:x}}` en el cuerpo muestra en Lectura el valor vigente del atributo y se actualiza al cambiarlo; el código no se toca.
import { expect, newSession, test, waitForSynced, waitForVaults } from "./fixtures";

test("H-036e: los campos de atributo del cuerpo se resuelven en Lectura y siguen al valor", async ({ browser, seeded }) => {
  const context = await newSession(browser, seeded, { theme: "light", size: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/vaults/${seeded.vaults[0].id}`);
  await waitForVaults(page, seeded.vaults.length);
  await waitForSynced(page);
  const show = page.getByRole("button", { name: "Mostrar la barra de notas" });
  if (await show.isVisible()) await show.click();
  const row = page.getByRole("tree", { name: "Notas" }).getByRole("treeitem", { name: "Bienvenida" });
  await row.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Editar", exact: true }).click();

  // Cuerpo con el campo, uno inexistente y uno dentro de código; y la descripción del documento.
  await page.getByLabel("Descripción", { exact: true }).fill("Valor uno");
  const editor = page.locator(".milkdown-view .ProseMirror");
  await editor.locator("> p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("CAMPO {{atributo:descripcion}} FIN. FALTA {{atributo:noexiste}}. Código `{{atributo:descripcion}}`.");
  await page.getByRole("button", { name: "Leer", exact: true }).click();
  await waitForSynced(page);
  const reading = page.locator('.milkdown-view[data-mode="read"] .ProseMirror');
  await expect(reading).toContainText("CAMPO Valor uno FIN.");
  await expect(reading).toContainText("FALTA {{atributo:noexiste}}.");
  await expect(reading.locator("code", { hasText: "{{atributo:descripcion}}" })).toHaveCount(1);

  // Cambiar el atributo actualiza el cuerpo sin tocar el texto.
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Descripción", { exact: true }).fill("Valor dos");
  await page.getByRole("button", { name: "Leer", exact: true }).click();
  await waitForSynced(page);
  await expect(reading).toContainText("CAMPO Valor dos FIN.");
  await expect(reading).not.toContainText("Valor uno");
  expect(errors, "sin errores de página").toEqual([]);
  await context.close();
});
