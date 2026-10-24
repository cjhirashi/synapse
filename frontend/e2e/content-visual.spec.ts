// Fidelidad visual del contenido Markdown (SPEC-0010; PLAN-0010 §5.2, §5.3, §5.4).
// Los títulos empiezan por `0010 V-n` (los de 0009 son `V-n` a secas). Cada prueba lleva el RF que
// cubre en el título (Art. 9). Las capturas van a $VISUAL_OUT_DIR (/tmp/s10/e2e) para compararlas
// con /tmp/s10/ref (mockup, Obsidian, career-admin).
import type { Browser, Page } from "@playwright/test";
import { CONTENT_NOTES, type ContentNote } from "./content-notes";
import {
  expect,
  expectExact,
  expectMeasure,
  measure,
  MOBILE,
  openContentNote,
  openWorkspace,
  shot,
  SIZES,
  test,
  themeColors,
  THEMES,
  tokenColor,
  type Seeded,
  type Size,
  type Theme,
} from "./fixtures";

/** Los tres anchos de PLAN-0010 §5.3. */
const WIDTHS: Size[] = [...SIZES, MOBILE];
/** Combinaciones tema × ancho de cada V-n. */
const COMBOS = THEMES.flatMap((theme) => WIDTHS.map((size) => ({ theme, size, key: `${theme}-${size.width}` })));
/** Sólo escritorio (las medidas de color no dependen del ancho). */
const DESKTOP_THEMES = THEMES.map((theme) => ({ theme, size: SIZES[0], key: `${theme}-${SIZES[0].width}` }));

const note = (key: string): ContentNote => {
  const found = CONTENT_NOTES.find((n) => n.key === key);
  if (!found) throw new Error(`sin la nota sembrada ${key}`);
  return found;
};

interface OpenOptions {
  theme: Theme;
  size: Size;
  /** Pasa a edición (botón «Editar») y, si se pide, a la vista Código. */
  edit?: boolean;
  code?: boolean;
}

/** Espacio de trabajo con la nota sembrada `key` abierta (lectura, o edición si se pide). */
async function openContent(browser: Browser, seeded: Seeded, key: string, options: OpenOptions): Promise<{ context: Awaited<ReturnType<Browser["newContext"]>>; page: Page }> {
  const { context, page } = await openWorkspace(browser, seeded, { theme: options.theme, size: options.size });
  await openContentNote(page, note(key));
  await expect(page.locator(".milkdown-view .ProseMirror")).toBeVisible();
  if (options.edit || options.code) await page.getByRole("button", { name: "Editar", exact: true }).click();
  if (options.code) await page.getByRole("button", { name: "Código", exact: true }).click();
  return { context, page };
}

/** Errores de consola y excepciones de la página (RF-031/RF-032: ninguno al colorear). */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** Componentes `r, g, b` de un color computado (`rgb(…)`/`rgba(…)`). */
const channels = (color: string): [number, number, number] => {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`color no reconocido: ${color}`);
  const [r, g, b] = m[1].split(",").map((x) => Number(x.trim()));
  return [r, g, b];
};
const luminance = (color: string): number => {
  const [r, g, b] = channels(color).map((c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Contraste WCAG 2.x entre dos colores opacos. */
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** El documento no hace scroll horizontal (Art. de RNF de maquetación en 390). */
async function expectNoPageScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "sin scroll horizontal del documento").toBeLessThanOrEqual(0);
}

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

// V-1 · panel de propiedades en lectura (RF-009, RF-010, RF-013; R-3, R-4)
for (const { theme, size, key } of COMBOS) {
  test(`0010 V-1 panel de propiedades en lectura, ${key} (RF-009, RF-010, RF-013)`, async ({ browser, content }) => {
    const { context, page } = await openContent(browser, content, "props-types", { theme, size });
    const panel = page.getByRole("group", { name: "Propiedades" });
    await expect(panel).toBeVisible();

    // R-3: caja del mockup `.frontmatter` con los tokens del tema.
    const box = await measure(page, ".note-properties");
    expectExact(`R-3 ${key}`, "fondo = --bg-tertiary", box.bg, tokenColor(theme, "--bg-tertiary"));
    expectExact(`R-3b ${key}`, "borde = --border", box.borderTopColor, tokenColor(theme, "--border"));
    expectExact(`R-3r ${key}`, "radio = --radius-sm", box.radius, "6px");
    expectMeasure(`R-3p ${key}`, "padding horizontal", parseFloat(box.paddingLeft), size.width === 390 ? 12 : 16, 1);

    // Una pareja dt/dd por clave y en el orden de las claves; ningún YAML crudo.
    const keys = Object.keys(note("props-types").frontmatter);
    await expect(panel.locator("dt")).toHaveText(keys);
    const text = (await panel.innerText()).replace(/\s+/g, " ");
    expect(text, "sin delimitadores YAML").not.toContain("---");
    expect(text, "sin `clave:` crudo").not.toMatch(/\w:\s/);
    await expect(panel.locator("dd", { hasText: /^Sí$/ })).toHaveCount(1);
    await expect(panel.locator("dd", { hasText: /^No$/ })).toHaveCount(1);
    await expect(panel.locator(".note-chip")).toHaveCount(3); // las 3 etiquetas; `config` (complejo) va en código
    await expect(panel.locator("code")).not.toHaveCount(0);
    await expect(panel.locator("dd", { hasText: "(vacío)" })).toHaveCount(1);
    expect(await panel.locator("[tabindex], a, input, button").count(), "nada enfocable (9 propiedades: sin «Mostrar más»)").toBe(0);

    // R-4: clave mono 12 px `--text-secondary`; valor 13 px `--text-primary`.
    const dt = await measure(page, ".note-properties dt");
    const dd = await measure(page, ".note-properties dd");
    expectExact(`R-4k ${key}`, "tamaño de la clave", dt.fontSize, "12px");
    expectExact(`R-4kc ${key}`, "color de la clave", dt.color, tokenColor(theme, "--text-secondary"));
    expectExact(`R-4v ${key}`, "tamaño del valor", dd.fontSize, "13px");
    expectExact(`R-4vc ${key}`, "color del valor", dd.color, tokenColor(theme, "--text-primary"));
    if (size.width === 390) expect(dd.y, "390: valor bajo su clave").toBeGreaterThan(dt.y + dt.h - 1);
    else expect(Math.abs(dd.y - dt.y), "clave y valor en la misma fila").toBeLessThanOrEqual(8);

    await expectNoPageScroll(page);
    await shot(page, `props-read-${key}`);
    await context.close();
  });
}

test("0010 V-1 sin panel con frontmatter vacío y colapso con muchas propiedades (RF-009, RF-013)", async ({ browser, content }) => {
  const { context, page } = await openContent(browser, content, "plain", { theme: "dark", size: SIZES[0] });
  await expect(page.getByRole("group", { name: "Propiedades" })).toHaveCount(0);
  await openContentNote(page, note("props-twelve"));
  const panel = page.getByRole("group", { name: "Propiedades" });
  await expect(panel.locator("dt")).toHaveCount(6);
  await panel.getByRole("button", { name: /Mostrar 6 más/ }).click();
  await expect(panel.locator("dt")).toHaveCount(12);
  await context.close();
});

// V-2 · formulario de propiedades en Visual (RF-010, RF-011, RF-013; R-16)
for (const { theme, size, key } of COMBOS) {
  test(`0010 V-2 formulario de propiedades, ${key} (RF-010, RF-011, RF-013)`, async ({ browser, content }) => {
    const { context, page } = await openContent(browser, content, "props-types", { theme, size, edit: true });
    const form = page.getByRole("group", { name: "Propiedades" });
    await expect(form).toBeVisible();

    const rows = form.getByRole("group", { name: /^Propiedad: / });
    await expect(rows).toHaveCount(Object.keys(note("props-types").frontmatter).length);
    // Nombres accesibles de cada control de la primera fila.
    const first = rows.first();
    await expect(first.getByRole("textbox", { name: "Clave de la propiedad 1" })).toBeVisible();
    await expect(first.getByRole("combobox", { name: /^Tipo de «/ })).toBeVisible();
    await expect(first.getByRole("button", { name: /^Quitar propiedad / })).toBeVisible();
    await expect(form.getByRole("button", { name: "Añadir propiedad" })).toBeVisible();

    // R-16: columnas 160 / 96 / 1fr / 28, controles de 28 y separación 8 (en escritorio; en 390 las filas se apilan).
    const keyBox = (await first.getByRole("textbox", { name: "Clave de la propiedad 1" }).boundingBox())!;
    const typeBox = (await first.getByRole("combobox").boundingBox())!;
    const removeBox = (await first.getByRole("button", { name: /^Quitar propiedad / }).boundingBox())!;
    if (size.width === 390) {
      expect(typeBox.y, "390: el tipo va bajo la clave (fila apilada)").toBeGreaterThan(keyBox.y + keyBox.height - 1);
    } else {
      expectMeasure(`R-16c1 ${key}`, "ancho de la clave", keyBox.width, 160, 1);
      expectMeasure(`R-16c2 ${key}`, "ancho del tipo", typeBox.width, 96, 1);
      expectMeasure(`R-16c4 ${key}`, "ancho de «Quitar»", removeBox.width, 28, 1);
      expectMeasure(`R-16h ${key}`, "alto de los controles", keyBox.height, 28, 1);
      expectMeasure(`R-16g ${key}`, "separación clave → tipo", typeBox.x - (keyBox.x + keyBox.width), 8, 1);
    }

    // Foco visible al tabular: anillo de 2 px en `--accent`.
    await first.getByRole("textbox", { name: "Clave de la propiedad 1" }).focus();
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const c = getComputedStyle(document.activeElement as Element);
      return { width: c.outlineWidth, color: c.outlineColor, style: c.outlineStyle, border: c.borderTopColor };
    });
    expect(ring.style === "solid" || ring.border === tokenColor(theme, "--accent"), "foco visible").toBe(true);

    await expectNoPageScroll(page);
    await shot(page, `props-form-${key}`);
    await context.close();
  });
}

// V-3 · cita, código en línea y tareas (RF-026, RF-037, RF-038, RF-039; R-5, R-6, R-10)
for (const { theme, size, key } of COMBOS) {
  test(`0010 V-3 cita, código en línea y tareas, ${key} (RF-037, RF-038, RF-039)`, async ({ browser, content }) => {
    const { context, page } = await openContent(browser, content, "prose", { theme, size });

    // R-5: cita del mockup (barra de 3 px en `--accent`, relleno `--accent-soft`, cursiva `--text-secondary`).
    const quote = await measure(page, ".milkdown-view .ProseMirror blockquote");
    const quoteStyle = await page.locator(".milkdown-view .ProseMirror blockquote").first().evaluate((el) => {
      const c = getComputedStyle(el);
      return { bar: c.borderLeftWidth, barColor: c.borderLeftColor, pad: [c.paddingTop, c.paddingRight, c.paddingLeft], margin: c.marginTop, style: c.fontStyle };
    });
    expect(quoteStyle.bar).toBe("3px");
    expect(quoteStyle.barColor).toBe(tokenColor(theme, "--accent"));
    expect(quoteStyle.style).toBe("italic");
    expectMeasure(`R-5pv ${key}`, "padding vertical de la cita", parseFloat(quoteStyle.pad[0]), 8, 1);
    expectMeasure(`R-5ph ${key}`, "padding horizontal de la cita", parseFloat(quoteStyle.pad[2]), size.width === 390 ? 12 : 16, 1);
    expectMeasure(`R-5m ${key}`, "margen de la cita", parseFloat(quoteStyle.margin), 16, 1);
    expectExact(`R-5bg ${key}`, "fondo = --accent-soft", quote.bg, tokenColor(theme, "--accent-soft"));
    expectExact(`R-5c ${key}`, "color = --text-secondary", quote.color, tokenColor(theme, "--text-secondary"));
    expect(quote.radius).toBe("0px 6px 6px 0px");

    // R-6: código en línea (el de un párrafo, no el de un bloque).
    const code = await measure(page, ".milkdown-view .ProseMirror p code");
    const codePad = await page.locator(".milkdown-view .ProseMirror p code").first().evaluate((el) => [getComputedStyle(el).paddingTop, getComputedStyle(el).paddingLeft]);
    expectMeasure(`R-6f ${key}`, "tamaño de fuente", parseFloat(code.fontSize), 12, 1);
    expectMeasure(`R-6pv ${key}`, "padding vertical", parseFloat(codePad[0]), 2, 1);
    expectMeasure(`R-6ph ${key}`, "padding horizontal", parseFloat(codePad[1]), 6, 1);
    expectExact(`R-6bg ${key}`, "fondo = --bg-tertiary", code.bg, tokenColor(theme, "--bg-tertiary"));
    expectExact(`R-6c ${key}`, "color = --accent-hover", code.color, tokenColor(theme, "--accent-hover"));
    expectMeasure(`R-6r ${key}`, "radio", parseFloat(code.radius), 4, 1);

    // R-10: una casilla por tarea (4 en la nota), de 16 × 16, sin foco en lectura.
    const marks = page.locator('.milkdown-view .ProseMirror [role="img"][aria-label="Pendiente"], .milkdown-view .ProseMirror [role="img"][aria-label="Completada"]');
    await expect(marks).toHaveCount(4);
    const mark = await measure(page, '.milkdown-view .ProseMirror [role="img"][aria-label="Pendiente"]');
    expectMeasure(`R-10w ${key}`, "ancho de la casilla", mark.w, 16, 1);
    expectMeasure(`R-10h ${key}`, "alto de la casilla", mark.h, 16, 1);
    expect(await marks.evaluateAll((els) => els.filter((el) => el.hasAttribute("tabindex")).length), "sin tabindex en lectura").toBe(0);

    await shot(page, `prose-${key}`);
    await context.close();
  });
}

test("0010 V-3 casillas operables en Visual (RF-039)", async ({ browser, content }) => {
  const { context, page } = await openContent(browser, content, "prose", { theme: "dark", size: SIZES[0], edit: true });
  const boxes = page.locator('.milkdown-view .ProseMirror input[type="checkbox"]');
  await expect(boxes).toHaveCount(4);
  await expect(boxes.first()).toHaveAccessibleName("Escribir la especificación");
  await context.close();
});

// V-4 · tabla (RF-026; R-7)
for (const { theme, size, key } of COMBOS) {
  test(`0010 V-4 tabla, ${key} (RF-026)`, async ({ browser, content }) => {
    const { context, page } = await openContent(browser, content, "table", { theme, size });
    const table = page.locator(".milkdown-view .ProseMirror table").first();
    const rows = await table.locator("tr").evaluateAll((trs) => trs.map((tr) => tr.getBoundingClientRect().height));
    expect(rows.length).toBe(4);
    for (const [i, height] of rows.entries()) {
      expect(height, `fila ${i + 1} de una línea ≤ 40 px`).toBeLessThanOrEqual(40);
      expectMeasure(`R-7 ${key} fila ${i + 1}`, "alto de fila", height, 31.4, 2);
    }
    const th = await measure(page, ".milkdown-view .ProseMirror th");
    expectExact(`R-7th ${key}`, "fondo de th = --bg-tertiary", th.bg, tokenColor(theme, "--bg-tertiary"));
    expect(th.fontSize).toBe("13px");

    // Tabla ancha: el envoltorio hace scroll y el documento no.
    const wide = page.locator(".milkdown-view .ProseMirror table").nth(1);
    const scroller = wide.locator("xpath=ancestor::*[contains(@class,'note-table-scroll')][1]");
    await expect(scroller).toHaveCount(1);
    expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth), "scroll dentro del envoltorio").toBe(true);
    await expectNoPageScroll(page);

    await shot(page, `table-${key}`);
    await context.close();
  });
}
