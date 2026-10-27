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
import { highlightTree } from "@lezer/highlight";
import { Decoration } from "@milkdown/prose/view";
import type { Parser } from "prosemirror-highlight";
import { whenIdle } from "../deferred/idle";
import { createHighlightScheduler, type HighlightScheduler } from "./highlightScheduler";
import { synapseHighlighter } from "./highlighter";
import { findLanguage } from "./languages";

/** Tramo coloreado, relativo al inicio del texto del bloque: `[desde, hasta, clases]`. */
type Range = [number, number, string];
type Ranges = Range[];

/** Por encima de esto un bloque no se resalta: una sola tarea larga no cabe en el presupuesto (RF-031: queda legible). */
const MAX_BLOCK_CHARS = 100 * 1024;
/** Un bloque a menos de esta distancia (px) del viewport se resalta ya, sin esperar a su tanda. */
const NEAR_PX = 600;

interface HighlightParserOptions {
  /** Resolución de la información del bloque a un lenguaje (por defecto, el registro de RF-030). */
  find?: (info: string | null | undefined) => LanguageDescription | null;
  /**
   * Distancia en px del bloque al viewport (0 si está dentro; `null` si aún no hay vista). Sin esta opción todo se
   * resalta ya (sin diferir); con ella, lo lejano o sin vista pasa por el planificador (PLAN-0010 §11.2).
   */
  distance?: (pos: number) => number | null;
  scheduler?: HighlightScheduler<Ranges>;
}

export function createHighlightParser({ find = findLanguage, distance, scheduler = createHighlightScheduler<Ranges>() }: HighlightParserOptions = {}): Parser {
  /** Lenguajes cuya carga falló en esta vista: no se reintenta en bucle; reabrir la nota crea otro *parser*. */
  const failed = new WeakSet<LanguageDescription>();
  /** Carga en curso por lenguaje (`LanguageDescription.load` ya la comparte, pero así la promesa es una sola). */
  const loading = new WeakMap<LanguageDescription, Promise<void>>();

  /** Tramos de Lezer del texto con la gramática ya cargada. */
  const rangesOf = (description: LanguageDescription, content: string): Ranges => {
    const ranges: Ranges = [];
    const tree = description.support?.language.parser.parse(content);
    if (tree) highlightTree(tree, synapseHighlighter, (from, to, classes) => from < to && classes && ranges.push([from, to, classes]));
    return ranges;
  };

  /** Los tramos anclados al bloque que empieza en `pos` (+1: se entra al nodo). */
  const decorate = (ranges: Ranges, pos: number) => ranges.map(([from, to, classes]) => Decoration.inline(pos + 1 + from, pos + 1 + to, { class: classes }));

  const load = (description: LanguageDescription): Promise<void> => {
    let pending = loading.get(description);
    if (!pending) {
      // La carga (descarga + construir la gramática, que no es gratis) espera a idle: no compite con «clic → legible».
      pending = new Promise<void>((resolve) => {
        whenIdle(() => {
          description.load().then(
            () => resolve(),
            () => {
              failed.add(description);
              resolve();
            },
          );
        });
      });
      loading.set(description, pending);
    }
    return pending;
  };

  return ({ content, language, pos }) => {
    const description = find(language);
    // Sin lenguaje o no admitido (RF-031), con la carga fallida (RF-032) o demasiado grande: mono sin decoraciones.
    if (!description || failed.has(description) || content.length > MAX_BLOCK_CHARS) return [];
    if (!description.support) return load(description);

    const key = `${description.name}\u0000${content}`;
    const known = scheduler.get(key);
    if (known !== undefined) return known ? decorate(known, pos) : [];
    if (!distance) return decorate(rangesOf(description, content), pos);
    // Cerca del viewport (p. ej. el bloque que se está editando) se resalta ya; lo demás, por tandas en idle.
    const away = distance(pos);
    if (away !== null && away <= NEAR_PX) {
      const ranges = rangesOf(description, content);
      return decorate(ranges, pos);
    }
    return scheduler.request(key, () => distance(pos) ?? Infinity, () => rangesOf(description, content));
  };
}
