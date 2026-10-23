// Fidelidad visual del workspace contra el mockup 1.1.4.4 (SPEC-0009; PLAN-0009 §5.3, §5.4).
// Cada prueba lleva en el título la comprobación V-n y el RF que cubre (Art. 9). Las medidas R-n
// salen de la tabla congelada de §5.4; las capturas van a /tmp/s9/e2e para la comparación humana
// con /tmp/s9/ref/mockup-{tema}-{ancho}.png.
import { expect, expectMeasure, measure, MOBILE, newSession, openNote, openVault, openWorkspace, shot, SIZES, test, themeColors, THEMES, tokenColor, tokens } from "./fixtures";

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

// V-4 · editor: barra superior y columna centrada (RF-005, RF-006; R-12…R-15)
type EditorView = "read" | "visual" | "code";

for (const theme of THEMES) {
  for (const size of SIZES) {
    for (const view of ["read", "visual", "code"] as const satisfies readonly EditorView[]) {
      test(`V-4 editor en ${view}, ${theme} ${size.width} (RF-005)`, async ({ browser, seeded }) => {
        const { context, page } = await openWorkspace(browser, seeded, { theme, size });
        const key = `${theme}-${size.width}-${view}`;

        await openNote(page, "Bienvenida");
        await expect(page.getByRole("heading", { level: 2, name: "Bienvenida" })).toBeVisible();
        if (view !== "read") await page.getByRole("button", { name: "Editar" }).click();
        if (view === "code") await page.getByRole("button", { name: "Código" }).click();
        const body = view === "code" ? ".code-view .cm-editor" : ".milkdown-view .ProseMirror";
        await expect(page.locator(body).first()).toBeVisible();
        await expect(page.locator(view === "code" ? ".cm-line" : ".milkdown-view .ProseMirror p").first()).toBeVisible();

        const panel = await measure(page, ".vault-workspace-main");
        expectMeasure(`R-15 ${key}`, "x del panel del editor", panel.x, 296, 1);

        const top = await measure(page, ".note-editor-header");
        expectMeasure(`R-12 ${key}`, "alto de la barra superior", top.h, 43, 2);
        expect(top.bg, "barra superior en --bg-secondary").toBe(tokenColor(theme, "--bg-secondary"));
        expect(top.borderBottomColor, "borde inferior en --border").toBe(tokenColor(theme, "--border"));

        // Columna: min(780, ancho del área de scroll) y centrada dentro de ella.
        const area = await measure(page, ".note-editor-body");
        const column = await measure(page, ".note-editor-column");
        expectMeasure(`R-13 ${key}`, "ancho de la columna", column.w, Math.min(780, area.clientWidth), 2);
        const left = column.x - area.x;
        const right = area.x + area.clientWidth - (column.x + column.w);
        expectMeasure(`R-13c ${key}`, "descentrado de la columna", Math.abs(left - right), 0, 2);

        if (view !== "code") {
          const paragraph = await measure(page, ".milkdown-view .ProseMirror p");
          expect(paragraph.fontSize, "R-14 cuerpo a 14 px").toBe("14px");
          expect(paragraph.lineHeight, "R-14 interlineado 1,8").toBe("25.2px");
        }

        await shot(page, `editor-${view}-${theme}-${size.width}`);
        await context.close();
      });
    }
  }
}

// V-5 · estado vacío centrado (RF-008)
for (const theme of THEMES) {
  for (const size of SIZES) {
    test(`V-5 estado vacío, ${theme} ${size.width} (RF-008)`, async ({ browser, seeded }) => {
      const { context, page } = await openWorkspace(browser, seeded, { theme, size });
      const key = `${theme}-${size.width}`;

      await expect(page.getByText("Abre o crea una nota para empezar.")).toBeVisible();
      await expect(page.locator(".vault-workspace-empty svg[data-icon]")).toBeVisible();
      const panel = await measure(page, ".vault-workspace-main");
      const icon = await measure(page, ".vault-workspace-empty svg");
      const text = await measure(page, ".vault-workspace-empty p");
      // Centro del bloque (ícono + texto) frente al del panel, en ambos ejes.
      const blockMiddle = (icon.y + text.y + text.h) / 2;
      const blockCenter = text.x + text.w / 2;
      expectMeasure(`V5x ${key}`, "descentrado horizontal del vacío", Math.abs(blockCenter - (panel.x + panel.w / 2)), 0, 4);
      expectMeasure(`V5y ${key}`, "descentrado vertical del vacío", Math.abs(blockMiddle - (panel.y + panel.h / 2)), 0, 4);

      await shot(page, `empty-${key}`);
      await context.close();
    });
  }
}

// V-6 · riel con scroll propio y documento sin scroll (RF-009)
for (const theme of THEMES) {
  test(`V-6 40 bóvedas: el riel hace scroll y el documento no, ${theme} (RF-009)`, async ({ browser, crowded }) => {
    const { context, page } = await openWorkspace(browser, crowded, { theme, icons: false });

    const rail = await measure(page, ".vault-rail");
    expect(rail.scrollHeight, "el riel desborda su alto").toBeGreaterThan(rail.clientHeight);
    const document_ = await page.evaluate(() => ({
      scroll: document.scrollingElement!.scrollHeight,
      viewport: window.innerHeight,
    }));
    expect(document_.scroll, "el documento no hace scroll").toBe(document_.viewport);

    // La última bóveda se alcanza con el scroll del riel (no con el de la página).
    await page.locator(".vault-rail").evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    const last = page.locator(".vault-rail a").last();
    const box = (await last.boundingBox())!;
    expect(box.y + box.height, "la última bóveda queda dentro del viewport").toBeLessThanOrEqual(document_.viewport);
    expect(box.y).toBeGreaterThanOrEqual(0);

    await shot(page, `rail-overflow-${theme}`, { clip: { x: 0, y: 0, width: 420, height: document_.viewport } });
    await context.close();
  });
}

// V-8 · tema oscuro por defecto sin preferencia guardada (RF-006a)
test("V-8 tema oscuro por defecto, sin localStorage (RF-006a)", async ({ browser, seeded }) => {
  // `colorScheme: light`: el modo "sistema" resolvería claro, así que sólo un defecto oscuro pasa.
  const context = await newSession(browser, seeded, { theme: null, colorScheme: "light" });
  // Historial de `data-theme` desde antes de que el documento exista: nunca debe aparecer otro valor.
  await context.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __themes: string[] }).__themes = seen;
    new MutationObserver(() => seen.push(document.documentElement.getAttribute("data-theme") ?? "")).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  });
  const page = await context.newPage();
  await openVault(page, seeded.vaults[0].id);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const seen = await page.evaluate(() => (window as unknown as { __themes: string[] }).__themes);
  expect(seen.length, "el script previo al pintado fijó el tema").toBeGreaterThan(0);
  expect(new Set(seen), "sin parpadeo a otro tema").toEqual(new Set(["dark"]));
  await expect(page.getByRole("button", { name: "Tema oscuro" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("synapse-theme")), "el defecto no se guarda").toBeNull();

  await shot(page, "theme-default");
  await context.close();
});

// V-9 · sólo colores de tokens del tema activo (RF-006)
for (const theme of THEMES) {
  test(`V-9 colores computados dentro de tokens.css, ${theme} (RF-006)`, async ({ browser, seeded }) => {
    const { context, page } = await openWorkspace(browser, seeded, { theme });
    const tree = page.getByRole("tree", { name: "Notas" });
    await tree.getByRole("treeitem", { name: "Guías" }).click();
    await tree.getByRole("treeitem", { name: "Diseño" }).click();
    await openNote(page, "Sistema de tokens");
    await expect(page.locator(".note-editor-body")).toBeVisible();

    const allowed = themeColors(theme);
    const selectors = [
      ".vault-rail",
      ".vault-workspace-side",
      ".vault-workspace-header",
      ".note-sidebar-new",
      ".note-tree-panel",
      ".note-tree-folder",
      '.note-tree-row[aria-selected="true"]',
      ".note-editor-header",
      ".note-editor-body",
    ];
    for (const selector of selectors) {
      // Fondo, texto y bordes con grosor: ningún color puede venir de fuera de los tokens.
      const found = await page.locator(selector).first().evaluate((el) => {
        const c = getComputedStyle(el);
        const colors = [c.backgroundColor, c.color];
        for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
          if (parseFloat(c[`border${side}Width`]) > 0) colors.push(c[`border${side}Color`]);
        }
        return colors;
      });
      for (const color of found) expect(allowed.has(color), `${selector}: ${color} no es un token de ${theme}`).toBe(true);
    }
    await context.close();
  });
}

// V-10 · humo a 390 px: nada se desborda (RF-005, RF-007 de 0008: apilado ≤ 800 px)
for (const theme of THEMES) {
  test(`V-10 móvil 390 px sin scroll horizontal, ${theme} (RF-005)`, async ({ browser, seeded }) => {
    const { context, page } = await openWorkspace(browser, seeded, { theme, size: MOBILE });
    await openNote(page, "Bienvenida");
    await expect(page.locator(".note-editor-body")).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.scroll, "el documento no hace scroll horizontal").toBeLessThanOrEqual(overflow.viewport);
    expect(overflow.body).toBeLessThanOrEqual(overflow.viewport);
    await expect(page.locator(".vault-rail")).toBeVisible();
    await expect(page.locator(".note-tree-panel")).toBeVisible();

    await shot(page, `mobile-390-${theme}`);
    await context.close();
  });
}

// V-7 · selector de ícono en el formulario de bóveda (RF-011, RF-012)
for (const theme of THEMES) {
  test(`V-7 selector de ícono y color, ${theme} (RF-011, RF-012)`, async ({ browser, seeded }) => {
    const { context, page } = await openWorkspace(browser, seeded, { theme, icons: false });
    // Marca de documento: si alguna navegación recargara la página, desaparecería.
    await page.evaluate(() => ((window as unknown as { __document: boolean }).__document = true));

    // Desde el propio SPA: Bóvedas → Editar (la "configuración" de la bóveda).
    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Bóvedas" }).click();
    const target = seeded.vaults[1];
    await page.getByRole("listitem", { name: target.name }).getByRole("link", { name: "Editar" }).click();

    const icons = page.getByRole("radiogroup", { name: "Ícono" });
    const colors = page.getByRole("radiogroup", { name: "Color" });
    await expect(icons.getByRole("radio")).toHaveCount(25);
    await expect(colors.getByRole("radio")).toHaveCount(6);

    await icons.getByRole("radio", { name: "Estrella" }).click();
    await colors.getByRole("radio", { name: "Verde" }).click();
    await shot(page, `picker-${theme}`);
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    // El chip del riel cambia sin recargar el documento.
    await expect(page.getByRole("navigation", { name: "Bóvedas abiertas" }).getByRole("link", { name: target.name }).locator('svg[data-icon="star"]')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __document?: boolean }).__document), "sin navegación de documento").toBe(true);
    await context.close();
  });
}
