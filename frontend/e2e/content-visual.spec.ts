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

/** Lenguajes de RF-030 (nombre declarado en el bloque) que deben llevar al menos un `sx-*`. */
const HIGHLIGHTED = CONTENT_NOTES.find((n) => n.key === "code") ? ["typescript", "javascript", "tsx", "python", "json", "bash", "css", "html", "sql", "yaml", "markdown"] : [];

// V-5 · bloque de código: chasis (RF-033, RF-034; R-8)
for (const { theme, size, key } of COMBOS) {
  test(`0010 V-5 bloque de código: chasis, ${key} (RF-033, RF-034, RF-035)`, async ({ browser, content }) => {
    const { context, page } = await openContent(browser, content, "code", { theme, size });
    const blocks = page.locator(".milkdown-view .ProseMirror .code-block");
    await expect(blocks).toHaveCount(13);

    // R-8: caja, cabecera de 36 px, «Copiar» de 28 × ≥ 84 y `pre` de 12/16 en mono 13/1,6.
    const box = await measure(page, ".code-block");
    expectExact(`R-8bg ${key}`, "fondo = --bg-tertiary", box.bg, tokenColor(theme, "--bg-tertiary"));
    expectExact(`R-8bd ${key}`, "borde = --border", box.borderTopColor, tokenColor(theme, "--border"));
    expectMeasure(`R-8r ${key}`, "radio", parseFloat(box.radius), 6, 1);
    const header = await measure(page, ".code-block-header");
    expectMeasure(`R-8h ${key}`, "alto de la cabecera", header.h, 36, 1);
    const copy = await measure(page, ".code-block-copy");
    expectMeasure(`R-8ch ${key}`, "alto de «Copiar»", copy.h, 28, 1);
    expect(copy.w, "«Copiar» ≥ 84 px").toBeGreaterThanOrEqual(84 - 1);
    const pre = await measure(page, ".code-block pre");
    expectMeasure(`R-8pl ${key}`, "padding horizontal del pre", parseFloat(pre.paddingLeft), 16, 1);
    expectMeasure(`R-8pf ${key}`, "tamaño del pre", parseFloat(pre.fontSize), 13, 0.5);
    expectMeasure(`R-8pi ${key}`, "interlineado del pre", parseFloat(pre.lineHeight), 13 * 1.6, 0.5);

    // Etiqueta = lenguaje declarado tal cual, o «texto» si no hay.
    const labels = await page.locator(".code-block-label").allTextContents();
    expect(labels.slice(0, 3)).toEqual(["typescript", "javascript", "tsx"]);
    expect(labels[labels.length - 1]).toBe("texto");
    const label = await measure(page, ".code-block-label");
    expectExact(`R-8lc ${key}`, "color de la etiqueta", label.color, tokenColor(theme, "--text-secondary"));
    expect(await page.locator(".code-block-label").first().evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
    // «Copiar»: nombre accesible fijo y siempre visible.
    await expect(page.getByRole("button", { name: "Copiar código" }).first()).toBeVisible();
    await expectNoPageScroll(page);

    await shot(page, `codeblock-${key}`);
    await context.close();
  });
}

// V-5 · resaltado real con los tokens del tema (RF-027, RF-030, RF-031, RF-032, RF-040; RNF-004)
for (const { theme, size, key } of DESKTOP_THEMES) {
  test(`0010 V-5 resaltado de sintaxis, ${key} (RF-027, RF-030, RF-031, RF-032)`, async ({ browser, content }) => {
    const { context, page } = await openContent(browser, content, "code", { theme, size });
    const errors = trackErrors(page);
    const blocks = page.locator(".milkdown-view .ProseMirror .code-block");
    await expect(blocks).toHaveCount(13);
    for (const lang of HIGHLIGHTED) {
      const block = blocks.filter({ has: page.locator(".code-block-label", { hasText: new RegExp(`^${lang}$`) }) });
      await expect(block.locator('span[class*="sx-"]').first(), `un sx-* en ${lang}`).toBeAttached();
    }
    // Lenguaje desconocido y sin lenguaje: mono sin decoraciones.
    for (const label of ["brainfuck", "texto"]) {
      const block = blocks.filter({ has: page.locator(".code-block-label", { hasText: new RegExp(`^${label}$`) }) });
      await expect(block.locator('span[class*="sx-"]'), `0 sx-* en ${label}`).toHaveCount(0);
    }
    // Colores computados = tokens, con contraste ≥ 4,5:1 sobre el fondo del bloque.
    const bg = (await measure(page, ".code-block")).bg;
    const expected: Record<string, string> = {
      "sx-keyword": "--accent-hover",
      "sx-string": "--success-text",
      "sx-number": "--warning-text",
      "sx-type": "--info-text",
      "sx-comment": "--text-secondary",
    };
    for (const [cls, token] of Object.entries(expected)) {
      const span = page.locator(`.code-block .${cls}`).first();
      await expect(span, `existe ${cls}`).toBeAttached();
      const color = await span.evaluate((el) => getComputedStyle(el).color);
      expectExact(`R-sx ${cls} ${key}`, `${cls} = ${token}`, color, tokenColor(theme, token));
      expect(contrast(color, bg), `${cls}: contraste ≥ 4,5`).toBeGreaterThanOrEqual(4.5);
    }
    expect(errors, "sin errores de consola").toEqual([]);
    await context.close();
  });
}

// V-6 · vista Código (RF-029, RF-040; R-9)
for (const { theme, size, key } of COMBOS) {
  test(`0010 V-6 vista Código, ${key} (RF-029, RF-040)`, async ({ browser, content }) => {
    const { context, page } = await openContent(browser, content, "prose", { theme, size, code: true });
    await expect(page.locator(".cm-lineNumbers")).toBeVisible();
    // R-9: mono 13 px, interlineado 1,8 y números de línea de 12 px en `--text-secondary`.
    const line = await measure(page, ".code-view .cm-line");
    expectExact(`R-9f ${key}`, "tamaño", line.fontSize, "13px");
    expectMeasure(`R-9l ${key}`, "interlineado", parseFloat(line.lineHeight), 13 * 1.8, 0.5);
    const num = await measure(page, ".cm-lineNumbers .cm-gutterElement:not([style*='height: 0'])");
    expectExact(`R-9n ${key}`, "tamaño del número", num.fontSize, "12px");
    expectExact(`R-9nc ${key}`, "color del número", num.color, tokenColor(theme, "--text-secondary"));
    // Línea activa con `--bg-secondary` (no el literal del mockup, C-3).
    await page.locator(".code-view .cm-content").click();
    await expect(page.locator(".cm-activeLine").first()).toBeVisible();
    expectExact(`R-9a ${key}`, "línea activa = --bg-secondary", (await measure(page, ".cm-activeLine")).bg, tokenColor(theme, "--bg-secondary"));
    // Colores del markdown (§2.3-h): h1 700, negrita `--accent-hover` 600, código `--warning-text`, enlace `--info-text`.
    const style = (selector: string) => page.locator(selector).first().evaluate((el) => ({ color: getComputedStyle(el).color, weight: getComputedStyle(el).fontWeight }));
    expect((await style(".code-view .sx-heading1")).weight).toBe("700");
    const strong = await style(".code-view .sx-strong");
    expect(strong.color).toBe(tokenColor(theme, "--accent-hover"));
    expect(strong.weight).toBe("600");
    expect((await style(".code-view .sx-code")).color).toBe(tokenColor(theme, "--warning-text"));
    expect((await style(".code-view .sx-link")).color).toBe(tokenColor(theme, "--info-text"));
    await expectNoPageScroll(page);
    await shot(page, `code-view-${key}`);
    await context.close();
  });
}

// V-6 · bloque YAML de propiedades en Código (RF-014, RF-029): depende de la lógica del frontmatter
test("0010 V-6 bloque YAML en Código, oscuro 1440 (RF-014, RF-029)", async ({ browser, content }) => {
  const { context, page } = await openContent(browser, content, "props-types", { theme: "dark", size: SIZES[0], code: true });
  const first = page.locator(".code-view .cm-line").first();
  await expect(first).toHaveText("---");
  expect((await measure(page, ".code-view .cm-line")).bg, "bloque YAML con fondo --bg-secondary").toBe(tokenColor("dark", "--bg-secondary"));
  await context.close();
});

const MERMAID_AREA = '.code-block[data-language="mermaid"] [role="img"]';

// V-7 · Mermaid (RF-046, RF-050, RF-051; RNF-003; R-11)
for (const { theme, size, key } of COMBOS) {
  test(`0010 V-7 diagrama Mermaid, ${key} (RF-046, RF-050, RNF-003)`, async ({ browser, content }) => {
    const { context, page } = await openContent(browser, content, "mermaid", { theme, size });
    const area = page.locator(MERMAID_AREA).first();
    await expect(area.locator("svg").first()).toBeVisible({ timeout: 20_000 });
    await expect(area).toHaveAccessibleName(/\S/);
    // R-11: alto entre 96 y 420; el SVG cabe en la columna.
    const m = await measure(page, MERMAID_AREA);
    expect(m.h).toBeGreaterThanOrEqual(96 - 2);
    expect(m.h).toBeLessThanOrEqual(420 + 2);
    const column = await measure(page, ".note-editor-column");
    const svg = await measure(page, `${MERMAID_AREA} svg`);
    expect(svg.w, "el SVG cabe en la columna").toBeLessThanOrEqual(column.w + 1);
    // Seguridad: el SVG no trae script, foreignObject, atributos on* ni enlaces navegables.
    const unsafe = await area.evaluate((el) => ({
      script: el.querySelectorAll("script").length,
      foreign: el.querySelectorAll("foreignObject").length,
      handlers: [...el.querySelectorAll("*")].filter((n) => [...n.attributes].some((a) => a.name.startsWith("on"))).length,
      links: el.querySelectorAll("a[href], [href], [xlink\\:href]").length,
    }));
    expect(unsafe).toEqual({ script: 0, foreign: 0, handlers: 0, links: 0 });
    await expectNoPageScroll(page);
    await shot(page, `mermaid-${key}`);
    await context.close();
  });
}

test("0010 V-7 el diagrama sigue el tema sin recargar (RF-050)", async ({ browser, content }) => {
  const { context, page } = await openContent(browser, content, "mermaid", { theme: "dark", size: SIZES[0] });
  const node = () => page.locator(`${MERMAID_AREA} svg .node rect, ${MERMAID_AREA} svg .node polygon`).first().evaluate((el) => getComputedStyle(el).fill);
  await expect(page.locator(`${MERMAID_AREA} svg`).first()).toBeVisible({ timeout: 20_000 });
  const before = await node();
  await page.getByRole("button", { name: /claro/i }).first().click();
  await expect.poll(node, { timeout: 10_000 }).not.toBe(before);
  await context.close();
});

// V-8 · fallos de Mermaid (RF-049, RF-053)
for (const theme of THEMES) {
  test(`0010 V-8 diagrama inválido, ${theme} (RF-049)`, async ({ browser, content }) => {
    const { context, page } = await openContent(browser, content, "mermaid-invalid", { theme, size: SIZES[0] });
    const errors = trackErrors(page);
    const group = page.getByRole("group", { name: "Error en el diagrama" });
    await expect(group).toBeVisible({ timeout: 20_000 });
    await expect(group).toContainText("No se pudo dibujar el diagrama");
    await expect(page.getByText("El resto de la nota se ve igual.")).toBeVisible();
    expect((await measure(page, '[aria-label="Error en el diagrama"]')).bg).toBe(tokenColor(theme, "--danger-bg"));
    expect(errors.filter((e) => !/mermaid|Parse error|Syntax/i.test(e)), "sin excepciones no capturadas").toEqual([]);
    await shot(page, `mermaid-error-${theme}`);
    await context.close();
  });

  test(`0010 V-8 fallo de carga del diagrama, ${theme} (RF-053)`, async ({ browser, content }) => {
    const { context, page } = await openWorkspace(browser, content, { theme, size: SIZES[0] });
    // El chunk de Mermaid se aborta: la nota se ve y el bloque ofrece reintentar.
    await page.route(/mermaid[^/]*\.js/i, (route) => route.abort());
    const errors = trackErrors(page);
    await openContentNote(page, note("mermaid"));
    await expect(page.getByText("No se pudo cargar el diagrama").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Reintentar" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Diagramas válidos" })).toBeVisible();
    expect(errors.filter((e) => /Uncaught|TypeError/.test(e)), "0 excepciones no capturadas").toEqual([]);
    await shot(page, `mermaid-loadfail-${theme}`);
    await context.close();
  });
}

// V-9 · zoom del diagrama ancho (RF-052)
for (const theme of THEMES) {
  test(`0010 V-9 zoom del diagrama, ${theme} (RF-052)`, async ({ browser, content }) => {
    const { context, page } = await openContent(browser, content, "mermaid-wide", { theme, size: SIZES[0] });
    const controls = page.getByRole("group", { name: "Controles del diagrama" });
    await expect(controls).toBeVisible({ timeout: 20_000 });
    await expect(controls.getByRole("button", { name: "Acercar" })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Alejar" })).toBeVisible();
    const fit = controls.getByRole("button", { name: "Reajustar vista" });
    await expect(fit).toBeDisabled();
    const transform = () => page.locator(`${MERMAID_AREA} .svg-pan-zoom_viewport`).first().getAttribute("transform");
    const before = await transform();
    await page.locator(MERMAID_AREA).first().focus();
    await page.keyboard.press("+");
    await expect.poll(transform).not.toBe(before);
    await expect(fit).toBeEnabled();
    await shot(page, `mermaid-zoom-${theme}`);
    // Un diagrama que cabe no muestra controles.
    await openContentNote(page, note("mermaid"));
    await expect(page.locator(`${MERMAID_AREA} svg`).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("group", { name: "Controles del diagrama" })).toHaveCount(0);
    await context.close();
  });
}

const HEADER = ".note-editor-header";

// V-10 · encabezado fiel a `reference/obsidian-breadcrumb.png` (RF-054, RF-056, RF-063, RF-064; P-17; R-1, R-2, R-12)
for (const { theme, size, key } of COMBOS) {
  for (const deep of [false, true]) {
    test(`0010 V-10 encabezado ${deep ? "con ruta profunda" : "con nota en la raíz"}, ${key} (RF-054, RF-056, RF-063, RF-064)`, async ({ browser, content }) => {
      const target = deep ? note("deep") : note("root");
      const { context, page } = await openContent(browser, content, target.key, { theme, size });
      const header = page.locator(HEADER);
      await expect(header).toBeVisible();
      // R-1: 43 px y una sola línea sin scroll horizontal, a los tres anchos.
      expectMeasure(`R-1 ${key}${deep ? " deep" : ""}`, "alto de la barra", (await measure(page, HEADER)).h, 43, 2);
      const bar = await measure(page, HEADER);
      expect(bar.scrollWidth, "la barra no desborda").toBeLessThanOrEqual(bar.clientWidth + 1);
      await expectNoPageScroll(page);

      // Orden y nombres: Atrás, Adelante, migas, lápiz, ⋮.
      const back = header.getByRole("button", { name: "Atrás" });
      const forward = header.getByRole("button", { name: "Adelante" });
      const pencil = header.getByRole("button", { name: "Editar", exact: true });
      const menu = header.getByRole("button", { name: "Opciones de la nota" });
      for (const control of [back, forward, pencil, menu]) await expect(control).toBeVisible();
      const nav = page.getByRole("navigation", { name: "Ruta" });
      await expect(nav.locator("ol")).toBeVisible();
      const name = nav.getByRole("heading", { level: 2 });
      await expect(name).toHaveAttribute("aria-current", "page");
      await expect(name).toHaveAttribute("title", target.path.replace(/\.md$/, ""));
      const order = await Promise.all([back, forward, nav, pencil, menu].map(async (l) => (await l.boundingBox())!.x));
      expect([...order].sort((a, b) => a - b), "orden visual = orden del DOM").toEqual(order);

      // Todos los controles centrados en la misma línea (± 1) y de 28 × 28 (R-2).
      const centers = await Promise.all([back, forward, pencil, menu, name].map(async (l) => { const b = (await l.boundingBox())!; return b.y + b.height / 2; }));
      expect(Math.max(...centers) - Math.min(...centers), "una sola línea").toBeLessThanOrEqual(1);
      for (const control of [back, forward, pencil, menu]) {
        const b = (await control.boundingBox())!;
        expectMeasure(`R-2w ${key}`, "ancho del control", b.width, 28, 1);
        expectMeasure(`R-2h ${key}`, "alto del control", b.height, 28, 1);
      }

      // «Adelante» sin historial: deshabilitada y atenuada frente a un control activo.
      await expect(forward).toBeDisabled();
      expect(await forward.evaluate((el) => getComputedStyle(el).opacity)).toBe("0.5");
      expect(await menu.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");

      // Migas (R-12): carpetas 13 px `--text-secondary` de 28 px; nombre 13 px/600 `--text-primary`; separador `/`.
      if (deep) {
        const folders = nav.getByRole("button");
        expect(await folders.count()).toBeGreaterThanOrEqual(1);
        const first = folders.first();
        expect(await first.evaluate((el) => getComputedStyle(el).textOverflow)).toBe("ellipsis");
        expectMeasure(`R-12h ${key}`, "alto de la carpeta", (await first.boundingBox())!.height, 28, 1);
        expectExact(`R-12c ${key}`, "color de la carpeta", await first.evaluate((el) => getComputedStyle(el).color), tokenColor(theme, "--text-secondary"));
        await expect(nav.locator("li > span[aria-hidden='true']").first()).toHaveText("/");
        await expect(nav.getByRole("button", { name: /^Proyectos/ })).toBeVisible();
        // La primera carpeta y el nombre nunca desaparecen; a 1440 la ruta cabe completa.
        const widths = await folders.evaluateAll((els) => els.map((el) => ({ clipped: el.scrollWidth > el.clientWidth })));
        if (size.width === 1440) expect(widths.every((w) => !w.clipped), "1440: ruta completa").toBe(true);
        else expect(widths.some((w) => w.clipped) || (await name.evaluate((el) => el.scrollWidth > el.clientWidth)), "estrecho: algún segmento truncado con «…»").toBe(true);
      } else {
        expect(await nav.getByRole("button").count(), "nota en la raíz: sólo el nombre").toBe(0);
      }
      expectExact(`R-12n ${key}`, "nombre 13 px", (await measure(page, `${HEADER} h2`)).fontSize, "13px");
      expect((await measure(page, `${HEADER} h2`)).color).toBe(tokenColor(theme, "--text-primary"));
      expect(await name.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("600");

      await shot(page, `header${deep ? "-collapsed" : ""}-${key}`, { clip: { x: 296, y: 0, width: size.width - 296, height: 60 } });
      await context.close();
    });
  }
}

test("0010 V-10 encabezado en edición cabe en una línea a 390 (RF-064)", async ({ browser, content }) => {
  const { context, page } = await openContent(browser, content, "deep", { theme: "dark", size: MOBILE, edit: true });
  const bar = await measure(page, HEADER);
  expectMeasure("R-1 edición 390", "alto de la barra", bar.h, 43, 2);
  expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth + 1);
  // Sólo iconos, con el mismo nombre accesible.
  for (const name of ["Visual", "Código", "Guardar", "Leer"]) await expect(page.locator(HEADER).getByRole("button", { name, exact: true })).toBeVisible();
  const save = (await page.locator(HEADER).getByRole("button", { name: "Guardar" }).boundingBox())!;
  expect(save.width, "Guardar sólo icono").toBeLessThanOrEqual(36);
  await expectNoPageScroll(page);
  await shot(page, "header-edit-dark-390", { clip: { x: 0, y: 0, width: 390, height: 120 } });
  await context.close();
});

// V-11 · menú ⋮ (RF-061; R-13)
for (const theme of THEMES) {
  test(`0010 V-11 menú de la nota, ${theme} (RF-061)`, async ({ browser, content }) => {
    const { context, page } = await openContent(browser, content, "deep", { theme, size: SIZES[1] });
    const button = page.getByRole("button", { name: "Opciones de la nota" });
    await expect(button).toHaveAttribute("aria-haspopup", "menu");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Orden de P-4 y la acción destructiva al final, separada.
    await expect(menu.getByRole("menuitem")).toHaveText(["Renombrar o mover", "Copiar ruta", "Ver en Código", "Borrar"]);
    // En un portal (hijo directo de <body>), dentro del viewport y no recortado.
    expect(await menu.evaluate((el) => el.parentElement === document.body)).toBe(true);
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(SIZES[1].width);
    expect(box.y + box.height).toBeLessThanOrEqual(SIZES[1].height);
    // R-13: ancho ≥ 200, ítem de 32, radio 10, `--bg-secondary`.
    expect(box.width).toBeGreaterThanOrEqual(200 - 1);
    expectMeasure(`R-13h ${theme}`, "alto del ítem", (await menu.getByRole("menuitem").first().boundingBox())!.height, 32, 1);
    const style = await measure(page, '[role="menu"]');
    expectExact(`R-13r ${theme}`, "radio", style.radius, "10px");
    expectExact(`R-13bg ${theme}`, "fondo = --bg-secondary", style.bg, tokenColor(theme, "--bg-secondary"));
    expectExact(`R-13d ${theme}`, "«Borrar» en --danger-text", await menu.getByRole("menuitem", { name: "Borrar" }).evaluate((el) => getComputedStyle(el).color), tokenColor(theme, "--danger-text"));
    await shot(page, `menu-${theme}`);
    // Esc cierra y devuelve el foco al botón.
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
    await context.close();
  });
}

// V-12 · barra lateral: «Raíz», carpeta activa, «Crear en», «Nueva carpeta», pista (RF-002, RF-006, RF-043; R-14)
for (const { theme, size, key } of COMBOS) {
  test(`0010 V-12 barra lateral de carpetas, ${key} (RF-002, RF-006, RF-043)`, async ({ browser, content }) => {
    const { context, page } = await openWorkspace(browser, content, { theme, size });
    const tree = page.getByRole("tree", { name: "Notas" });
    const items = tree.getByRole("treeitem");
    await expect(items.first()).toHaveAccessibleName(/Raíz/);
    expectMeasure(`R-14r ${key}`, "alto de «Raíz»", (await items.first().boundingBox())!.height, 27, 1);
    await expect(items.first()).toHaveAttribute("aria-current", "true");
    const create = page.locator("#note-create-in");
    await expect(create).toContainText("Crear en: Raíz");
    expect(await create.getAttribute("aria-live")).toBe("polite");
    expectMeasure(`R-14f ${key}`, "«Crear en» 12 px", parseFloat(await create.evaluate((el) => getComputedStyle(el).fontSize)), 12, 0);

    // Carpeta activa: se marca con `aria-current`, fondo `--bg-tertiary`, peso 600 y barra inset de 3 px.
    const folder = tree.getByRole("treeitem", { name: "Tablas", exact: true });
    await folder.click();
    await expect(folder).toHaveAttribute("aria-current", "true");
    await expect(items.first()).not.toHaveAttribute("aria-current", "true");
    await expect(create).toContainText("Crear en: Tablas");
    const active = await measure(page, '.note-tree-folder[aria-current="true"]');
    expectExact(`R-14bg ${key}`, "carpeta activa = --bg-tertiary", active.bg, tokenColor(theme, "--bg-tertiary"));
    expect(await page.locator('.note-tree-folder[aria-current="true"]').evaluate((el) => getComputedStyle(el).fontWeight)).toBe("600");
    expect(await page.locator('.note-tree-folder[aria-current="true"]').evaluate((el) => getComputedStyle(el).boxShadow)).toContain("3px");

    // Pista de `/` asociada a los campos y «Nueva carpeta».
    await expect(page.getByText("Usa / para crear subcarpetas")).toBeVisible();
    await expect(page.getByLabel("Título de la nota nueva (opcional)")).toHaveAttribute("aria-describedby", /\S/);
    await page.getByRole("button", { name: "Nueva carpeta" }).click();
    const nameInput = page.getByLabel("Nombre de la carpeta");
    await expect(nameInput).toBeFocused();
    await expect(nameInput).toHaveAttribute("aria-describedby", /\S/);
    await expect(page.getByRole("button", { name: "Crear carpeta" })).toBeVisible();
    await shot(page, `sidebar-folders-${key}`, { clip: { x: 0, y: 0, width: 300, height: size.height } });
    await page.keyboard.press("Escape");
    await expect(nameInput).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nueva carpeta" })).toBeFocused();
    await expectNoPageScroll(page);
    await context.close();
  });
}

// V-12 · crear carpeta de verdad y el error de duplicada: depende de la lógica (RF-001, RF-003…RF-005)
test("0010 V-12 crear una carpeta y rechazar una duplicada (RF-003, RF-004, RF-005)", async ({ browser, content }) => {
  const { context, page } = await openWorkspace(browser, content, { theme: "dark", size: SIZES[0] });
  await page.getByRole("button", { name: "Nueva carpeta" }).click();
  await page.getByLabel("Nombre de la carpeta").fill("Tablas");
  await page.getByRole("button", { name: "Crear carpeta" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Ya existe una carpeta con ese nombre" })).toBeVisible();
  await context.close();
});
