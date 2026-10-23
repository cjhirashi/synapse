// Fidelidad visual del workspace contra el mockup 1.1.4.4 (SPEC-0009; PLAN-0009 §5.3, §5.4).
// Cada prueba lleva en el título la comprobación V-n y el RF que cubre (Art. 9). Las medidas R-n
// salen de la tabla congelada de §5.4; las capturas van a /tmp/s9/e2e para la comparación humana
// con /tmp/s9/ref/mockup-{tema}-{ancho}.png.
import { expect, expectMeasure, measure, MOBILE, newSession, openVault, openWorkspace, shot, SIZES, test, themeColors, THEMES, tokenColor, tokens } from "./fixtures";

// V-1 · riel (RF-001, RF-006; R-1…R-5)
for (const theme of THEMES) {
  for (const size of SIZES) {
    test(`V-1 riel de bóvedas, ${theme} ${size.width} (RF-001, RF-006)`, async ({ browser, seeded }) => {
      const { context, page } = await openWorkspace(browser, seeded, { theme, size });
      const key = `${theme}-${size.width}`;

      const rail = await measure(page, ".vault-rail");
      expectMeasure(`R-1 ${key}`, "ancho del riel", rail.w, 56, 0);
      expect(rail.bg, "R-10 fondo del riel = --bg-secondary").toBe(tokenColor(theme, "--bg-secondary"));

      // El enlace de cada bóveda mide lo mismo que su chip (lo envuelve sin margen): la geometría se
      // mide en el enlace y la forma (radio) en el chip.
      const links = page.locator(".vault-rail a");
      await expect(links).toHaveCount(seeded.vaults.length);
      const first = await measure(page, ".vault-rail a >> nth=0");
      const second = await measure(page, ".vault-rail a >> nth=1");
      expectMeasure(`R-2 ${key}`, "ancho del chip", first.w, 34, 0);
      expectMeasure(`R-2h ${key}`, "alto del chip", first.h, 34, 0);
      expectMeasure(`R-3 ${key}`, "x del chip (centrado)", first.x, (56 - 34) / 2, 1);
      expectMeasure(`R-4 ${key}`, "separación entre chips", second.y - (first.y + first.h), 8, 2);

      // Inactivo = círculo; activo (la bóveda abierta) = --radius-md.
      const inactive = await measure(page, ".vault-rail a:not([aria-current]) .vault-chip");
      expect(inactive.radius, "chip inactivo circular").toBe("50%");
      const active = await measure(page, '.vault-rail a[aria-current="page"] .vault-chip');
      expect(active.radius, "chip activo con --radius-md").toBe(tokens(theme)["--radius-md"]);

      // Barra de la bóveda activa: 3 × 20 px en --accent, pegada al borde izquierdo del riel.
      const bar = await page.locator('.vault-rail a[aria-current="page"]').first().evaluate((el) => {
        const c = getComputedStyle(el, "::before");
        return { w: c.width, h: c.height, bg: c.backgroundColor, left: c.left, linkX: el.getBoundingClientRect().x };
      });
      expectMeasure(`R-5w ${key}`, "ancho de la barra activa", parseFloat(bar.w), 3, 1);
      expectMeasure(`R-5h ${key}`, "alto de la barra activa", parseFloat(bar.h), 20, 1);
      expect(bar.bg, "barra activa en --accent").toBe(tokenColor(theme, "--accent"));
      expect(bar.linkX + parseFloat(bar.left), "barra pegada al borde del riel").toBeCloseTo(0, 0);

      await shot(page, `rail-${key}`, { selector: ".vault-rail" });
      await context.close();
    });
  }
}

// V-2 · tooltip del riel (RF-002)
for (const theme of THEMES) {
  for (const size of SIZES) {
    test(`V-2 tooltip del riel, ${theme} ${size.width} (RF-002)`, async ({ browser, seeded }) => {
      const { context, page } = await openWorkspace(browser, seeded, { theme, size });
      const target = seeded.vaults[1];

      await page.locator(".vault-rail a").nth(1).hover();
      const tip = page.locator(".rail-tooltip");
      await expect(tip).toBeVisible();
      await expect(tip).toHaveText(target.name);
      const box = (await tip.boundingBox())!;
      expect(box.x, "a la derecha del riel").toBeGreaterThanOrEqual(56);
      expect(box.x + box.width, "cabe en el viewport").toBeLessThanOrEqual(size.width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      const colors = themeColors(theme);
      const style = await measure(page, ".rail-tooltip");
      expect(colors.has(style.bg), `fondo del tooltip ${style.bg} es un token`).toBe(true);

      await shot(page, `rail-tooltip-${theme}-${size.width}`, { clip: { x: 0, y: 0, width: 420, height: 320 } });
      await context.close();
    });
  }
}

// V-3 · barra lateral (RF-003, RF-004, RF-010, RF-006; R-6…R-11)
for (const theme of THEMES) {
  for (const size of SIZES) {
    test(`V-3 barra lateral, ${theme} ${size.width} (RF-003, RF-004, RF-010)`, async ({ browser, seeded }) => {
      const { context, page } = await openWorkspace(browser, seeded, { theme, size });
      const key = `${theme}-${size.width}`;
      const tree = page.getByRole("tree", { name: "Notas" });

      // Despliega Guías > Diseño.
      await tree.getByRole("treeitem", { name: "Guías" }).click();
      await tree.getByRole("treeitem", { name: "Diseño" }).click();

      const side = await measure(page, ".vault-workspace-side");
      expectMeasure(`R-6 ${key}`, "ancho de la barra lateral", side.w, 240, 1);
      expectMeasure(`R-15s ${key}`, "x de la barra lateral (junto al riel)", side.x, 56, 1);
      expect(side.bg, "R-10 fondo de la barra = --bg-secondary").toBe(tokenColor(theme, "--bg-secondary"));

      const header = await measure(page, ".vault-workspace-header");
      expectMeasure(`R-7 ${key}`, "alto de la cabecera de la barra", header.h, 51, 2);
      await expect(page.locator(".vault-workspace-header h1")).toHaveText(seeded.vaults[0].name);

      // RF-003: el formulario es un bloque propio, de fondo distinto al del panel del árbol.
      const form = await measure(page, ".note-sidebar-new");
      const panel = await measure(page, ".note-tree-panel");
      expect(form.bg, "formulario en --bg-tertiary").toBe(tokenColor(theme, "--bg-tertiary"));
      expect(panel.bg, "panel del árbol en --bg-secondary").toBe(tokenColor(theme, "--bg-secondary"));
      expect(form.bg).not.toBe(panel.bg);

      // RF-004: ícono de carpeta o de nota en cada fila; alto y tipografía de R-8; sangría de R-9.
      await expect(page.locator(".note-tree-row")).not.toHaveCount(0);
      const withoutIcon = await page.locator(".note-tree-row").evaluateAll((rows) => rows.filter((row) => !row.querySelector("svg[data-icon]")).length);
      expect(withoutIcon, "filas sin ícono").toBe(0);
      const folderRow = await measure(page, ".note-tree-folder >> nth=0");
      const noteRow = await measure(page, ".note-tree-item .note-tree-row >> nth=0");
      expectMeasure(`R-8f ${key}`, "alto de la fila de carpeta", folderRow.h, 27, 1);
      expectMeasure(`R-8n ${key}`, "alto de la fila de nota", noteRow.h, 25, 1);
      expect(folderRow.fontSize).toBe("12px");
      expect(noteRow.fontSize).toBe("12px");
      const level0 = await measure(page, '.note-tree-folder:has(.note-tree-name[title="Guías"]) svg[data-icon^="folder"]');
      const level1 = await measure(page, '.note-tree-folder:has(.note-tree-name[title="Diseño"]) svg[data-icon^="folder"]');
      expectMeasure(`R-9 ${key}`, "sangría por nivel", level1.x - level0.x, 24, 1);

      // Un solo clic abre la nota (la fila no se desplaza al enfocarla) y la deja seleccionada.
      await tree.getByRole("treeitem", { name: "Sistema de tokens" }).click();
      await expect(tree.getByRole("treeitem", { name: "Sistema de tokens" })).toHaveAttribute("aria-selected", "true");

      // R-11: fila seleccionada con --accent-soft, barra de 3 px en --accent y texto primario.
      const selected = await measure(page, '.note-tree-row[aria-selected="true"]');
      expect(selected.bg, "fila seleccionada en --accent-soft").toBe(tokenColor(theme, "--accent-soft"));
      expect(selected.color, "texto de la fila seleccionada").toBe(tokenColor(theme, "--text-primary"));
      const barShadow = await page.locator('.note-tree-row[aria-selected="true"]').evaluate((el) => getComputedStyle(el).boxShadow);
      expect(barShadow).toContain(tokenColor(theme, "--accent"));
      expect(barShadow).toContain("3px");

      // RF-010: la fila de 120 caracteres se recorta con elipsis dentro del panel y conserva el nombre en `title`.
      const long = page.locator(`.note-tree-name[title="${seeded.longNoteName}"]`);
      await expect(long).toHaveCount(1);
      const longName = await measure(page, `.note-tree-name[title="${seeded.longNoteName}"]`);
      expect(longName.scrollWidth, "el nombre largo no cabe: se recorta").toBeGreaterThan(longName.clientWidth);
      expect(await long.evaluate((el) => getComputedStyle(el).textOverflow)).toBe("ellipsis");
      const treeBox = await measure(page, ".note-tree");
      expect(treeBox.scrollWidth, "el árbol no hace scroll horizontal").toBe(treeBox.clientWidth);
      expect(longName.x + longName.w).toBeLessThanOrEqual(panel.x + panel.w);

      await shot(page, `sidebar-${key}`, { clip: { x: 0, y: 0, width: 300, height: size.height } });
      await context.close();
    });
  }
}
