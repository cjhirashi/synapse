/**
 * Registro único de lenguajes del resaltado (SPEC-0010 RF-027…RF-031; PLAN-0010 §2.1, D-T1).
 *
 * Lo comparten las tres vistas: lectura y Visual (decoraciones de ProseMirror, `proseHighlight.ts`) y
 * Código (`markdown({codeLanguages})` de CodeMirror). Cada gramática se pide con `import()` la primera vez
 * que un bloque la necesita; python, sql, yaml, json y shell salen en chunks propios (RNF-002) y las de
 * js/ts/tsx/css/html/markdown ya viajan con el editor por `@codemirror/lang-markdown`.
 */
import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";

type Loader = () => Promise<LanguageSupport>;

/** Una entrada del registro: nombre canónico (el de RF-030), alias y cargador diferido. */
const entry = (name: string, alias: string[], load: Loader) => LanguageDescription.of({ name, alias, load });

export const LANGUAGES: readonly LanguageDescription[] = [
  entry("typescript", ["ts"], async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true })),
  entry("javascript", ["js"], async () => (await import("@codemirror/lang-javascript")).javascript()),
  entry("tsx", [], async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true })),
  entry("python", ["py"], async () => (await import("@codemirror/lang-python")).python()),
  entry("json", [], async () => (await import("@codemirror/lang-json")).json()),
  entry("shell", ["bash", "sh"], async () => {
    const { shell } = await import("@codemirror/legacy-modes/mode/shell");
    return new LanguageSupport(StreamLanguage.define(shell));
  }),
  entry("css", [], async () => (await import("@codemirror/lang-css")).css()),
  entry("html", [], async () => (await import("@codemirror/lang-html")).html()),
  entry("sql", [], async () => (await import("@codemirror/lang-sql")).sql()),
  entry("yaml", ["yml"], async () => (await import("@codemirror/lang-yaml")).yaml()),
  entry("markdown", ["md"], async () => {
    const { markdown, markdownLanguage } = await import("@codemirror/lang-markdown");
    return markdown({ base: markdownLanguage });
  }),
];

/**
 * El lenguaje de un bloque cercado, o `null` si no está admitido (RF-031). Se mira sólo la primera palabra de
 * la información del bloque, sin mayúsculas, y el nombre debe coincidir **entero** (no por parte: `foo-shell`
 * no es `shell`).
 */
export function findLanguage(info: string | null | undefined): LanguageDescription | null {
  const word = info?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!word) return null;
  return LANGUAGES.find((language) => language.name === word || language.alias.includes(word)) ?? null;
}
