// Fidelidad visual del contenido Markdown (SPEC-0010; PLAN-0010 §5.2, §5.3, §5.4).
// Los títulos empiezan por `0010 V-n` (los de 0009 son `V-n` a secas). Cada prueba lleva el RF que
// cubre en el título (Art. 9). Las capturas van a $VISUAL_OUT_DIR (/tmp/s10/e2e) para compararlas
// con /tmp/s10/ref (mockup, Obsidian, career-admin).
import { CONTENT_NOTES } from "./content-notes";
import { expect, openWorkspace, test } from "./fixtures";

// V-0 · siembra (RNF-005): las notas de PLAN-0010 §5.2 llegan al árbol y el push no rechaza nada.
test("0010 V-0 siembra (RNF-005)", async ({ browser, content }) => {
  const { context, page } = await openWorkspace(browser, content, { theme: "dark" });
  const tree = page.getByRole("tree", { name: "Notas" });
  // Despliega todas las carpetas (cada clic puede revelar otras nuevas).
  for (let pass = 0; pass < 20; pass++) {
    const closed = tree.locator('[role="treeitem"][aria-expanded="false"]');
    if ((await closed.count()) === 0) break;
    await closed.first().click();
  }
  // Notas = filas de árbol sin `aria-expanded` (las carpetas lo llevan).
  await expect(tree.locator('[role="treeitem"]:not([aria-expanded])')).toHaveCount(CONTENT_NOTES.length);
  await expect(page.getByText(/cambios? rechazados?/)).toHaveCount(0);
  await context.close();
});
