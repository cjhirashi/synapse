/**
 * *Parser* de `prosemirror-highlight` con gramáticas de Lezer cargadas bajo demanda
 * (SPEC-0010 RF-027, RF-028, RF-031, RF-032; PLAN-0010 §2.1, D-T1).
 *
 * Convierte el texto de un bloque de código en decoraciones en línea con las clases `sx-*` de
 * `synapseHighlighter`: son decoraciones de ProseMirror (nodos de texto, nunca HTML crudo, RNF-003) y el
 * color sale de `syntax.css`. El plugin pide el resaltado en cada cambio del documento, así que editar un
 * bloque lo recalcula y los bloques intactos salen de su caché.
 *
 * Carga diferida (RF-032): si la gramática aún no está, el *parser* devuelve una promesa; el plugin la
 * espera y vuelve a pedir el resaltado cuando se resuelve. Esa promesa **nunca rechaza** (el plugin hace
 * `console.error` de los rechazos): un fallo de carga se recuerda y el bloque queda legible sin clases.
 */
import type { LanguageDescription } from "@codemirror/language";
import type { Parser } from "prosemirror-highlight";
import { createParser } from "prosemirror-highlight/lezer";
import { synapseHighlighter } from "./highlighter";
import { findLanguage } from "./languages";

interface HighlightParserOptions {
  /** Resolución de la información del bloque a un lenguaje (por defecto, el registro de RF-030). */
  find?: (info: string | null | undefined) => LanguageDescription | null;
}

export function createHighlightParser({ find = findLanguage }: HighlightParserOptions = {}): Parser {
  /** Lenguajes cuya carga falló en esta vista: no se reintenta en bucle; reabrir la nota crea otro *parser*. */
  const failed = new WeakSet<LanguageDescription>();
  /** Carga en curso por lenguaje (`LanguageDescription.load` ya la comparte, pero así la promesa es una sola). */
  const loading = new WeakMap<LanguageDescription, Promise<void>>();

  const lezer = createParser({
    // Sólo se llega aquí con la gramática cargada (`support` presente).
    parse: ({ content, language }) => find(language)?.support?.language.parser.parse(content),
    highlighter: synapseHighlighter,
  });

  const load = (description: LanguageDescription): Promise<void> => {
    let pending = loading.get(description);
    if (!pending) {
      pending = description.load().then(
        () => undefined,
        () => {
          failed.add(description);
        },
      );
      loading.set(description, pending);
    }
    return pending;
  };

  return (options) => {
    const description = find(options.language);
    // Sin lenguaje o no admitido (RF-031), o con la carga fallida (RF-032): monoespaciado sin decoraciones.
    if (!description || failed.has(description)) return [];
    return description.support ? lezer(options) : load(description);
  };
}
