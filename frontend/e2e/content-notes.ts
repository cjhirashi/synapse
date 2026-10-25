// Notas sembradas de la verificación visual de SPEC-0010 (PLAN-0010 §5.2): cubren todo lo que la
// maquetación debe pintar (propiedades de todos los tipos, YAML heredado, tabla, código en 11
// lenguajes, cita, tareas, Mermaid, ruta profunda y una nota de ~200 KiB).
// Datos puros: `seedContent()` (fixtures.ts) los escribe en la base CouchDB del usuario.

export interface ContentNote {
  /** Clave estable que usan las pruebas. */
  key: string;
  /** Ruta con `/` = carpetas; el último segmento lleva `.md`. */
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

/** Nombre visible en el árbol (último segmento sin `.md`). */
export const noteName = (note: ContentNote): string => (note.path.split("/").pop() ?? note.path).replace(/\.md$/i, "");

const PARAGRAPH =
  "Este párrafo es lo bastante largo para ocupar varias líneas dentro de la columna de lectura y así " +
  "poder medir su tipografía y su interlineado en un navegador real, igual que en el mockup del editor.";

/** Un fragmento por lenguaje de RF-030 (11) + uno desconocido + uno sin lenguaje. */
export const CODE_SAMPLES: Array<{ lang: string; code: string }> = [
  { lang: "typescript", code: 'interface User { id: number; name: string }\nconst greet = (u: User): string => `Hola ${u.name}`; // saludo' },
  { lang: "javascript", code: 'const total = [1, 2, 3].map((n) => n * 2).reduce((a, b) => a + b, 0);\nconsole.log("total", total);' },
  { lang: "tsx", code: 'export function Card({ title }: { title: string }) {\n  return <section className="card"><h2>{title}</h2></section>;\n}' },
  { lang: "python", code: 'def fib(n: int) -> int:\n    """Fibonacci."""\n    return n if n < 2 else fib(n - 1) + fib(n - 2)\n\nprint(fib(10))  # 55' },
  { lang: "json", code: '{\n  "nombre": "synapse",\n  "version": 3,\n  "activo": true,\n  "etiquetas": ["a", "b"]\n}' },
  { lang: "bash", code: '#!/usr/bin/env bash\nset -euo pipefail\nfor f in *.md; do echo "nota: $f"; done  # lista' },
  { lang: "css", code: '.card {\n  padding: 12px 16px;\n  color: var(--text-primary);\n  border: 1px solid #2e2e3d;\n}' },
  { lang: "html", code: '<section class="card">\n  <h2 id="t">Título</h2>\n  <!-- comentario -->\n</section>' },
  { lang: "sql", code: "SELECT id, name\n  FROM notes\n WHERE deleted_at IS NULL AND length(name) > 3\n ORDER BY name; -- orden" },
  { lang: "yaml", code: "titulo: Plan\nactivo: true\nversion: 3\netiquetas:\n  - a\n  - b" },
  { lang: "markdown", code: "# Título\n\nUn **párrafo** con `código` y [enlace](https://example.com)." },
  { lang: "brainfuck", code: "+++++[>+++++<-]>." },
  { lang: "", code: "texto plano sin lenguaje\nsegunda línea" },
];

const fence = (lang: string, code: string): string => `\`\`\`${lang}\n${code}\n\`\`\``;

const FLOW = "flowchart TD\n  A[Inicio] --> B{¿Válido?}\n  B -- Sí --> C[Guardar]\n  B -- No --> D[Corregir]\n  D --> B";
const SEQ = "sequenceDiagram\n  participant U as Usuario\n  participant E as Editor\n  U->>E: Escribe\n  E-->>U: Guarda";
// Diagrama ancho: una cadena horizontal larga que excede la columna (controles de zoom, RF-052).
const WIDE = "flowchart LR\n" + Array.from({ length: 14 }, (_, i) => `  N${i}[Paso número ${i + 1} del proceso] --> N${i + 1}[Paso número ${i + 2} del proceso]`).join("\n");

/** Nota de ~200 KiB con 50 bloques de código (los 13 ejemplos en rotación) y 5 Mermaid (RNF-001). */
function bigNote(): string {
  const filler = "lorem ipsum dolor sit amet ".repeat(125); // ~3,4 KiB
  const parts = ["# Nota grande", ""];
  for (let i = 0; i < 50; i++) {
    const sample = CODE_SAMPLES[i % CODE_SAMPLES.length];
    parts.push(`## Sección ${i + 1}`, "", `${PARAGRAPH} ${filler}`, "", fence(sample.lang, sample.code), "");
    if (i % 10 === 4) parts.push(fence("mermaid", i % 20 === 4 ? FLOW : SEQ), "");
  }
  return parts.join("\n");
}

export const DEEP_PATH = "Proyectos/Clientes/2026/Trimestre 4/Acuerdos/Plan de entregas.md";

/**
 * Casos de encabezados con duplicados y encabezados vacíos para las pruebas de ids precalculados
 * (RNF-001, PLAN-0010 §10.1): el documento debe nacer con los mismos ids que pondría
 * `syncHeadingIdPlugin` (generador `textContent` en minúsculas con espacios a guiones, regla de
 * duplicados `-#n`, los vacíos no reciben id ni cuentan para los duplicados). `ids` es el id que
 * `toDOM` debe pintar en cada encabezado, en orden.
 */
export const HEADING_CASES: Array<{ key: string; md: string; ids: string[] }> = [
  { key: "duplicados", md: "# Alpha\n\n## Beta\n\n## Beta\n\n## Beta\n", ids: ["alpha", "beta", "beta-#2", "beta-#3"] },
  { key: "vacío-entre-duplicados", md: "# Uno\n\n#\n\n# Uno\n", ids: ["uno", "", "uno-#2"] },
  { key: "espacios-y-mayúsculas", md: "#   Título  Con   Espacios  \n\n## Título Con Espacios\n", ids: ["título-con-espacios", "título-con-espacios-#2"] },
];

/** Longitud en bytes UTF-8 (lo mismo que cuenta el navegador y la siembra). */
const byteLen = (s: string): number => new TextEncoder().encode(s).length;

/** Una nota grande del banco de rendimiento (§10.8): nombre visible, ruta, contenido y su encabezado final único. */
export interface PerfNote {
  key: string;
  path: string;
  name: string;
  content: string;
  /** Texto del último encabezado (marcador de «cuerpo legible completo» para las pruebas). */
  lastHeading: string;
}

/**
 * Nota grande de ~`targetKiB` KiB con la misma mezcla de bloques que `bigNote` (código en rotación y
 * Mermaid cada 10 secciones) pero de tamaño parametrizable y con un encabezado final único por nombre,
 * para que la prueba sepa cuándo el cuerpo está completo en el DOM. No reabre la misma nota: cada
 * nombre es distinto (§10.8).
 */
function perfBigNote(name: string, targetKiB: number): string {
  const target = targetKiB * 1024;
  const filler = "lorem ipsum dolor sit amet ".repeat(125); // ~3,4 KiB
  const lastHeading = `Fin de ${name}`;
  const tail = [`## ${lastHeading}`, "", PARAGRAPH, ""];
  const parts = [`# ${name}`, ""];
  for (let i = 0; byteLen([...parts, ...tail].join("\n")) < target; i++) {
    const sample = CODE_SAMPLES[i % CODE_SAMPLES.length];
    parts.push(`## Sección ${i + 1}`, "", `${PARAGRAPH} ${filler}`, "", fence(sample.lang, sample.code), "");
    if (i % 10 === 4) parts.push(fence("mermaid", i % 20 === 4 ? FLOW : SEQ), "");
  }
  parts.push(...tail);
  return parts.join("\n");
}

/** Las 3 notas grandes del banco (§10.8a): ~181/120/64 KiB, en la raíz para poder abrirlas con un clic. */
export const PERF_BIG_NOTES: PerfNote[] = [
  { key: "perf-181", kib: 181 },
  { key: "perf-120", kib: 120 },
  { key: "perf-64", kib: 64 },
].map(({ key, kib }) => {
  const name = `Nota de ${kib} KiB`;
  return { key, path: `${name}.md`, name, content: perfBigNote(name, kib), lastHeading: `Fin de ${name}` };
});

/**
 * Banco de 200 notas para medir RNF-001 con parseo precalculado (§10.8): las 3 grandes
 * (181/120/64 KiB, en la raíz) más 197 pequeñas de ~4 KiB repartidas en carpetas (ninguna llega al
 * umbral de 32 KiB, así que sólo las 3 grandes se precalculan).
 */
export function perfVaultNotes(): ContentNote[] {
  const big: ContentNote[] = PERF_BIG_NOTES.map((n) => ({ key: n.key, path: n.path, frontmatter: {}, content: n.content }));
  const smallBody = `${"lorem ipsum dolor sit amet ".repeat(150)}`; // ~4 KiB
  const small: ContentNote[] = Array.from({ length: 197 }, (_, i) => ({
    key: `perf-small-${i}`,
    path: `Notas/carpeta-${i % 20}/nota-${i}.md`,
    frontmatter: {},
    content: `# Nota pequeña ${i}\n\n${smallBody}\n`,
  }));
  return [...big, ...small];
}

export const CONTENT_NOTES: ContentNote[] = [
  {
    key: "props-types",
    path: "Propiedades/Tipos de propiedad.md",
    frontmatter: {
      version: 3.5,
      activo: true,
      borrador: false,
      etiquetas: ["diseño", "editor", "markdown"],
      resumen: "Primera línea\nSegunda línea",
      vacio: "",
      enlace: "https://example.com/ruta?x=1",
      html: "<script>alert(1)</script>",
      config: { nivel: 2, opciones: ["a", "b"] },
    },
    content: `# Tipos de propiedad\n\n${PARAGRAPH}\n`,
  },
  {
    key: "props-twelve",
    path: "Propiedades/Doce propiedades.md",
    frontmatter: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`clave-${String(i + 1).padStart(2, "0")}`, i % 3 === 0 ? i : i % 3 === 1 ? `valor ${i + 1}` : i % 2 === 0]) ),
    content: `# Doce propiedades\n\n${PARAGRAPH}\n`,
  },
  {
    key: "legacy-valid",
    path: "Heredadas/YAML heredado válido.md",
    frontmatter: {},
    content: `---\ntítulo: Nota antigua\nproyecto: Synapse\netiquetas: [a, b]\n---\n\n# Nota antigua\n\n${PARAGRAPH}\n`,
  },
  {
    key: "legacy-corrupt",
    path: "Heredadas/YAML corrompido.md",
    frontmatter: {},
    content: `***\n\ntítulo: Nota antigua\n\nproyecto: Synapse\n\netiquetas: \\[a, b]\n\n***\n\n# Nota antigua\n\n${PARAGRAPH}\n`,
  },
  {
    key: "table",
    path: "Tablas/Tabla de ejemplo.md",
    frontmatter: {},
    content: [
      "# Tablas",
      "",
      "| Nombre | Rol | Estado |",
      "| :--- | :---: | ---: |",
      "| Ana | Diseño | Activa |",
      "| Luis | Backend | Pendiente |",
      "| Marta | Producto | Activa |",
      "",
      PARAGRAPH,
      "",
      "| Identificador | Descripción larga de la columna | Responsable asignado | Fecha de inicio | Fecha de entrega | Prioridad | Estado actual | Observaciones adicionales |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| T-001 | Maquetar el panel de propiedades del editor | Ana García | 2026-10-24 | 2026-10-31 | Alta | En curso | Depende de los tokens nuevos |",
      "| T-002 | Medir el bloque de código frente a la referencia | Luis Pérez | 2026-10-25 | 2026-11-02 | Media | Pendiente | Necesita capturas reales |",
      "",
    ].join("\n"),
  },
  {
    key: "code",
    path: "Código/Bloques de código.md",
    frontmatter: {},
    content: ["# Bloques de código", "", ...CODE_SAMPLES.flatMap((s) => [fence(s.lang, s.code), ""])].join("\n"),
  },
  {
    key: "prose",
    path: "Prosa/Cita, código en línea y tareas.md",
    frontmatter: {},
    content: [
      "# Cita, código en línea y tareas",
      "",
      PARAGRAPH,
      "",
      "> Cualquier usuario puede editar documentos de su propia bóveda — no es una capacidad exclusiva del administrador.",
      "",
      "El botón `Editar` activa el modo edición y el atajo `Ctrl+S` guarda la nota. Consulta [la guía](https://example.com/guia) y **no olvides** guardar.",
      "",
      "- [ ] Escribir la especificación",
      "- [x] Revisar el plan",
      "- [ ] Maquetar los componentes",
      "- [x] Medir contra el mockup",
      "",
    ].join("\n"),
  },
  {
    key: "plain",
    path: "Prosa/Sin propiedades.md",
    frontmatter: {},
    content: `# Sin propiedades\n\n${PARAGRAPH}\n\n${PARAGRAPH}\n`,
  },
  {
    key: "mermaid",
    path: "Mermaid/Diagramas válidos.md",
    frontmatter: {},
    content: `# Diagramas válidos\n\n${PARAGRAPH}\n\n${fence("mermaid", FLOW)}\n\n${fence("mermaid", SEQ)}\n`,
  },
  {
    key: "mermaid-invalid",
    path: "Mermaid/Diagrama inválido.md",
    frontmatter: {},
    content: `# Diagrama inválido\n\n${PARAGRAPH}\n\n${fence("mermaid", "flowchart TD\n  A[Inicio --> B(\n  ???")}\n\nEl resto de la nota se ve igual.\n`,
  },
  {
    key: "mermaid-wide",
    path: "Mermaid/Diagrama ancho.md",
    frontmatter: {},
    content: `# Diagrama ancho\n\n${fence("mermaid", WIDE)}\n`,
  },
  {
    key: "deep",
    path: DEEP_PATH,
    frontmatter: { cliente: "Acuerdos", trimestre: "T4" },
    content: `# Plan de entregas\n\n${PARAGRAPH}\n`,
  },
  {
    key: "root",
    path: "Nota en la raíz.md",
    frontmatter: {},
    content: `# Nota en la raíz\n\n${PARAGRAPH}\n`,
  },
  {
    key: "big",
    path: "Rendimiento/Nota grande.md",
    frontmatter: {},
    content: bigNote(),
  },
];
