// H-035 fase 4: la página pública `/p/<token>` en navegador real, celular (390) y escritorio (1280), tema claro y oscuro del sistema: estructura, índice plegable o
// lateral, sin desbordes horizontales, contenido con tabla, código, columnas, imagen, incrustado y wikilink, y pie con el crédito.
import { expect, MOBILE, newSession, shot, test } from "./fixtures";

const origin = () => process.env.BASE_URL ?? "http://127.0.0.1:8010";

async function session(user: { email: string; password: string }) {
  const login = await fetch(`${origin()}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const cookie = login.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${origin()}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, json: () => JSON.parse(text) as any };
  };
}

const LONG = "https://ejemplo.test/" + "segmento-muy-largo-sin-espacios/".repeat(8);
const BODY = `
<h1>Informe de resultados</h1>
<p>Texto de introducción con <strong>negrita</strong>, <em>cursiva</em>, <code>código en línea</code> y un enlace a <a href="https://cjhirashi.com">un sitio</a>.
Una referencia a <a class="wikilink">Otra nota</a> que no se puede abrir desde aquí.</p>
<p>${LONG}</p>
<h2>Datos</h2>
<table><thead><tr><th>Columna uno</th><th>Columna dos</th><th>Columna tres</th><th>Columna cuatro</th><th>Columna cinco</th></tr></thead>
<tbody><tr><td>Un valor bastante largo para ensanchar</td><td>Otro valor igualmente largo</td><td>Tercero largo largo largo</td><td>Cuarto largo largo largo</td><td>Quinto largo largo largo</td></tr></tbody></table>
<h3>Código</h3>
<div class="code-block"><div class="code-block-header">python</div><pre><code><span class="sx-keyword">def</span> <span class="sx-function">suma</span>(a, b):
    <span class="sx-keyword">return</span> a + b  <span class="sx-comment"># una línea de código bastante larga para que haga falta desplazarse horizontalmente en el celular</span></code></pre></div>
<blockquote><p>Una cita con su propio color de apoyo.</p></blockquote>
<ul><li>Primer punto</li><li>Segundo punto<ul><li>Subpunto</li></ul></li></ul>
<div class="cols-2 cols-cells"><div class="col"><h3>Izquierda</h3><p>Texto de la primera columna.</p></div><div class="col"><h3>Derecha</h3><p>Texto de la segunda columna, algo más largo.</p></div></div>
<h2>Imagen</h2>
<p><span class="md-img" style="max-width: 50%"><img src="${origin()}/icons/icon-512.png" alt="Logo" style="max-height: 200px"></span></p>
<h2>Incrustado</h2>
<a class="pub-embed" href="https://synapse.cjhirashi.com/files/00000000-0000-4000-8000-000000000000">Gráfica de ejemplo</a>
<h4>Cuarto nivel</h4><p>Cierre del documento.</p>`;

for (const { label, size } of [{ label: "390", size: MOBILE }, { label: "1280", size: { width: 1280, height: 900 } }]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`H-035 página pública a ${label} px (${scheme})`, async ({ browser, content }) => {
      const vault = content.vaults[0];
      const api = await session(content);
      const base = `/vaults/${vault.id}`;
      const template = await api("POST", `${base}/notes`, {
        path: "PLANTILLAS/plantilla-pub.md", content: "# Estructura",
        frontmatter: { titulo: "Pub", descripcion: "Plantilla de prueba", alcance: ["*"], atributos: [], estados: [{ nombre: "borrador", color: "azul" }], estilo: { publicar: { activo: true }, pdf: {} } },
      });
      expect([201, 409]).toContain(template.status);
      const note = await api("POST", `${base}/notes`, {
        path: `Publica${label}${scheme}/Informe.md`, content: "# Informe",
        frontmatter: { titulo: `Informe de resultados ${label} ${scheme}`, descripcion: "Una descripción de prueba que explica de qué trata el documento publicado.", tags: [], estado: "borrador", plantilla: "pub", fecha_creacion: "2026-11-15", fecha_actualizacion: "2026-11-17" },
      });
      expect(note.status, note.text).toBe(201);
      const published = await api("POST", `${base}/notes/${note.json().id}/publication`, { html: BODY });
      expect(published.status, published.text).toBe(201);
      const path = published.json().path as string;

      const context = await newSession(browser, content, { theme: null, size, colorScheme: scheme, touch: label === "390" });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const response = await page.goto(`${origin()}${path}`);
      expect(response?.status()).toBe(200);

      // Tarjeta del documento
      await expect(page.locator("h1.doc-title")).toHaveText(`Informe de resultados ${label} ${scheme}`);
      await expect(page.locator(".doc-desc")).toContainText("Una descripción de prueba");
      await expect(page.locator(".doc-meta")).toContainText("15 nov 2026");
      await expect(page.locator(".doc-meta")).toContainText("17 nov 2026");
      await expect(page.locator(".estado.estado--azul")).toHaveText("borrador");
      await expect(page).toHaveTitle(/Informe de resultados/);

      // Tema del sistema
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe(scheme === "dark" ? "rgb(18, 18, 26)" : "rgb(255, 255, 255)");

      // Índice: en celular, botón arriba a la derecha que abre una barra lateral desde la derecha (sin scripts); en escritorio, lateral y fijo
      const mobile = label === "390";
      const sheet = page.locator(".toc-sheet");
      const panel = page.locator(".toc-panel");
      const side = page.locator("aside.toc-side");
      if (mobile) {
        const open = page.getByRole("link", { name: "Abrir el índice" });
        const close = page.getByRole("link", { name: "Cerrar el índice" });
        await expect(open).toBeVisible();
        await expect(side).toBeHidden();
        await expect(sheet).toBeHidden();
        await expect(close).toBeHidden();
        const fab = (await open.boundingBox())!;
        expect(fab.width).toBeGreaterThanOrEqual(44);
        expect(fab.height).toBeGreaterThanOrEqual(44);
        expect(fab.y).toBeLessThan(24); // arriba
        expect(size.width - (fab.x + fab.width)).toBeLessThan(24); // a la derecha
        // No tapa la tarjeta del documento (hay una franja libre arriba)
        const card = (await page.locator(".doc-head").boundingBox())!;
        expect(card.y).toBeGreaterThanOrEqual(fab.y + fab.height);
        // Sigue ahí al bajar por el documento
        await page.evaluate(() => window.scrollTo(0, 700));
        const y = await page.evaluate(() => window.scrollY);
        expect(y).toBeGreaterThan(300);
        await expect(open).toBeInViewport();
        // Abrir: barra lateral pegada a la derecha, a toda la altura; no mueve la página; el mismo botón pasa a «cerrar»
        await open.click();
        await expect(sheet).toBeVisible();
        await expect(close).toBeVisible();
        await expect(open).toBeHidden();
        expect(await page.evaluate(() => window.scrollY)).toBe(y);
        await page.waitForTimeout(400); // fin de la animación (en pruebas va reducida, pero por si acaso)
        const bar = (await panel.boundingBox())!;
        expect(Math.round(bar.x + bar.width)).toBe(size.width); // pegada al borde derecho
        expect(Math.round(bar.y)).toBe(0);
        expect(Math.round(bar.height)).toBe(size.height); // de arriba abajo, no un panel inferior
        expect(bar.width).toBeLessThanOrEqual(size.width * 0.87);
        expect(bar.x).toBeGreaterThan(30); // deja un borde para tocar fuera
        expect(await sheet.locator("a[href^='#h-']").count()).toBeGreaterThanOrEqual(6);
        for (const link of await sheet.locator("a[href^='#h-']").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        const closeBox = (await close.boundingBox())!;
        expect(closeBox.x).toBe(fab.x); // el botón de cerrar está en el mismo sitio
        expect(closeBox.y).toBe(fab.y);
        await shot(page, `h035-pagina-indice-${label}-${scheme}`);
        // Cerrar con el botón no mueve la página
        await close.click();
        await expect(sheet).toBeHidden();
        expect(await page.evaluate(() => window.scrollY)).toBe(y);
        // Tocar fuera de la barra la cierra
        await open.click();
        await expect(sheet).toBeVisible();
        await page.mouse.click(12, size.height / 2);
        await expect(sheet).toBeHidden();
        // Elegir un apartado lleva ahí y cierra la barra
        await open.click();
        await sheet.getByRole("link", { name: "Código" }).click();
        await expect(sheet).toBeHidden();
        expect(new URL(page.url()).hash).toMatch(/^#h-\d+$/);
        await expect(page.locator("h3", { hasText: "Código" })).toBeInViewport();
        await page.evaluate(() => window.scrollTo(0, 0));
      } else {
        await expect(side).toBeVisible();
        await expect(sheet).toBeHidden();
        await expect(page.locator(".toc-fab")).toHaveCount(2);
        await expect(page.locator(".toc-fab").first()).toBeHidden();
        expect(await side.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
        const link = side.getByRole("link", { name: "Código" });
        await link.click();
        expect(new URL(page.url()).hash).toMatch(/^#h-\d+$/);
      }

      // Nada se sale del ancho de la pantalla: lo ancho se desplaza dentro de su caja
      const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: window.innerWidth }));
      expect(overflow.doc, `ancho del documento ${overflow.doc} contra ${overflow.view}`).toBeLessThanOrEqual(overflow.view + 1);
      expect(await page.locator(".content table").evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
      expect(await page.locator(".content pre").evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");

      // Contenido
      await expect(page.locator(".content h2", { hasText: "Datos" })).toBeVisible();
      expect(await page.locator("a.wikilink").evaluate((el) => el.getAttribute("href"))).toBeNull(); // no navegable: es solo texto
      const [a, b] = await Promise.all([page.locator(".col").nth(0).boundingBox(), page.locator(".col").nth(1).boundingBox()]);
      if (mobile) expect(b!.y).toBeGreaterThan(a!.y + a!.height - 2); // se apilan
      else expect(Math.abs(a!.y - b!.y)).toBeLessThan(2); // lado a lado
      const img = await page.locator(".content img").boundingBox();
      expect(img!.height).toBeLessThanOrEqual(201); // el límite de alto de la imagen se respeta
      const frame = page.locator(".pub-embed-frame iframe");
      await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
      expect((await frame.boundingBox())!.width).toBeGreaterThan(200);
      await expect(page.locator(".site-foot a")).toHaveAttribute("href", "https://cjhirashi.com");

      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `h035-pagina-${label}-${scheme}`);
      await page.screenshot({ path: `${process.env.VISUAL_OUT_DIR ?? "/tmp/s9/e2e"}/h035-pagina-completa-${label}-${scheme}.png`, fullPage: true });

      // Limpieza
      expect((await api("DELETE", `${base}/notes/${note.json().id}/publication`)).status).toBe(204);
      expect(errors, "sin errores de página").toEqual([]);
      await context.close();
    });
  }
}
