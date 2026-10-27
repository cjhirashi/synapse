// RF-066 (SPEC-0010 enmienda 3, decisión de AIRA 2026-10-28): las tablas toleran líneas en blanco ENTRE sus filas.
// `joinLooseTableRows` es una normalización previa al parseo, pura y estricta: sólo actúa sobre una tabla GFM válida
// (cabecera, separadora con el mismo número de columnas y filas de datos) y deja todo lo demás byte a byte igual.
import { describe, expect, it } from "vitest";
import { joinLooseTableRows } from "./looseTables";

/** El contenido exacto de «Prueba» (producción, 2026-10-28). */
export const PRUEBA =
  "---\nvalor1: 1\nvalor2: Hola\n---\n\n# Titulo para hoy\n\nHola cómo estás\n\n> Hola amigos\n\n1. Lista\n\n* Hola amicos\n\n*Hola que tal*\n\n**Hola que tal**\n\n***Hola qué tal***\n\n***\n\nEstado bien con todos\n\n|Campo 1|Campo 2|Campo 3|\n\n|---|---|---|\n\n|12|Hola|56|\n";

describe("joinLooseTableRows · une las filas separadas por líneas en blanco", () => {
  it("«Prueba»: quita las líneas en blanco entre cabecera, separadora y datos, y nada más", () => {
    const out = joinLooseTableRows(PRUEBA);
    expect(out).toBe(PRUEBA.replace("|Campo 3|\n\n|---|---|---|\n\n|12|", "|Campo 3|\n|---|---|---|\n|12|"));
    expect(out).toContain("|Campo 1|Campo 2|Campo 3|\n|---|---|---|\n|12|Hola|56|\n");
  });

  it("varias líneas en blanco seguidas y varias filas de datos sueltas", () => {
    const md = "| A | B |\n\n\n|---|---|\n\n| 1 | 2 |\n\n\n| 3 | 4 |\n\nTexto\n";
    expect(joinLooseTableRows(md)).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\nTexto\n");
  });

  it("líneas con sólo espacios o tabulaciones también cuentan como en blanco", () => {
    expect(joinLooseTableRows("| A | B |\n  \n|---|---|\n\t\n| 1 | 2 |\n")).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n");
  });

  it("CRLF: conserva los fines de línea de las líneas que quedan", () => {
    const md = "| A | B |\r\n\r\n|---|---|\r\n\r\n| 1 | 2 |\r\n\r\nFin\r\n";
    expect(joinLooseTableRows(md)).toBe("| A | B |\r\n|---|---|\r\n| 1 | 2 |\r\n\r\nFin\r\n");
  });

  it("sin pipes exteriores y con alineaciones en la separadora", () => {
    expect(joinLooseTableRows("A | B\n\n:--- | ---:\n\n1 | 2\n")).toBe("A | B\n:--- | ---:\n1 | 2\n");
  });

  it("no hay línea en blanco tras la tabla que la pegue con el párrafo siguiente", () => {
    const out = joinLooseTableRows("| A | B |\n\n|---|---|\n\n| 1 | 2 |\n\nOtro párrafo\n");
    expect(out.endsWith("| 1 | 2 |\n\nOtro párrafo\n")).toBe(true);
  });

  it("es idempotente", () => {
    const once = joinLooseTableRows(PRUEBA);
    expect(joinLooseTableRows(once)).toBe(once);
  });
});

describe("joinLooseTableRows · lo que no es esa tabla queda byte a byte igual", () => {
  const same = (md: string) => expect(joinLooseTableRows(md)).toBe(md);

  it("una tabla correcta (compacta) no cambia", () => same("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n"));
  it("sin tablas: texto, listas, citas, encabezados y reglas", () => same("# T\n\nHola\n\n> cita\n\n1. a\n\n* b\n\n***\n\ntexto | con | pipes\n"));
  it("un párrafo con pipes y sin separadora no se toca", () => same("a | b\n\nc | d\n\ne | f\n"));
  it("una separadora con distinto número de columnas no se toca", () => same("| A | B | C |\n\n|---|---|\n\n| 1 | 2 | 3 |\n"));
  it("`---` suelto tras una línea con pipes es una regla, no una separadora", () => same("| A | B |\n\n---\n\n| 1 | 2 |\n"));
  it("sólo líneas en blanco y NADA más entre cabecera y separadora no inventa una tabla sin separadora", () => same("| A | B |\n\n\n| 1 | 2 |\n"));
  it("pipes dentro de un bloque de código cercado (``` y ~~~)", () => {
    same("```\n| A | B |\n\n|---|---|\n\n| 1 | 2 |\n```\n");
    same("~~~md\n| A | B |\n\n|---|---|\n\n| 1 | 2 |\n~~~\n");
    same("````\n```\n| A | B |\n\n|---|---|\n\n| 1 | 2 |\n````\n");
  });
  it("código indentado (4 espacios o tabulación)", () => {
    same("Texto\n\n    | A | B |\n\n    |---|---|\n\n    | 1 | 2 |\n");
    same("Texto\n\n\t| A | B |\n\n\t|---|---|\n\n\t| 1 | 2 |\n");
  });
  it("dentro de una cita", () => same("> | A | B |\n>\n> |---|---|\n>\n> | 1 | 2 |\n"));
  it("dentro del bloque YAML/frontmatter", () => same("---\ntabla: | A | B |\n\n|---|---|\n\n| 1 | 2 |\n---\n\nTexto\n"));
});

describe("joinLooseTableRows · tablas distintas no se fusionan", () => {
  it("dos tablas seguidas separadas por una línea en blanco siguen siendo dos", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |\n\n| C | D |\n|---|---|\n| 3 | 4 |\n";
    expect(joinLooseTableRows(md)).toBe(md);
  });
  it("dos tablas sueltas: cada una se une por separado y no entre sí", () => {
    const md = "| A | B |\n\n|---|---|\n\n| 1 | 2 |\n\n| C | D |\n\n|---|---|\n\n| 3 | 4 |\n";
    expect(joinLooseTableRows(md)).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n\n| C | D |\n|---|---|\n| 3 | 4 |\n");
  });
  it("una fila con otro número de columnas termina la tabla (no se absorbe)", () => {
    const md = "| A | B |\n\n|---|---|\n\n| 1 | 2 |\n\n| x | y | z |\n";
    expect(joinLooseTableRows(md)).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n\n| x | y | z |\n");
  });
  it("un párrafo sin pipes termina la tabla", () => {
    expect(joinLooseTableRows("| A | B |\n\n|---|---|\n\n| 1 | 2 |\n\nfin\n\n| 3 | 4 |\n")).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n\nfin\n\n| 3 | 4 |\n");
  });
});

describe("joinLooseTableRows · propiedad: sin separadora válida, salida === entrada", () => {
  // PRNG determinista (mulberry32): el mismo fuzz en cada corrida.
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Líneas variadas, SIN ninguna fila separadora GFM válida (la propiedad es sobre lo que no tiene separadora).
  const POOL = [
    "", "", "", "texto", "otro | texto", "| A | B |", "|a|b|c|", "1 | 2", "| 1 | 2 |", "# titulo", "> cita | x", "- item | y", "* z", "---",
    "***", "```", "~~~", "    | sangrado | x |", "|:|:|", "--- text", "| --- x |", "a\\|b", "\t| t |",
  ];
  it("2000 documentos aleatorios sin separadora válida quedan idénticos", () => {
    const next = rng(20261028);
    for (let n = 0; n < 2000; n += 1) {
      const lines = Array.from({ length: 1 + Math.floor(next() * 12) }, () => POOL[Math.floor(next() * POOL.length)]);
      const md = lines.join(next() < 0.3 ? "\r\n" : "\n");
      expect(joinLooseTableRows(md), JSON.stringify(md)).toBe(md);
    }
  });
});
