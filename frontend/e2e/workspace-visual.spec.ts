// Fidelidad visual del workspace contra el mockup 1.1.4.4 (SPEC-0009; PLAN-0009 §5.3, §5.4).
// Cada prueba lleva en el título la comprobación V-n y el RF que cubre (Art. 9). Las medidas R-n
// salen de la tabla congelada de §5.4; las capturas van a /tmp/s9/e2e para la comparación humana
// con /tmp/s9/ref/mockup-{tema}-{ancho}.png.
import { expect, expectMeasure, measure, openWorkspace, shot, SIZES, test, themeColors, tokenColor, tokens, THEMES } from "./fixtures";

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
