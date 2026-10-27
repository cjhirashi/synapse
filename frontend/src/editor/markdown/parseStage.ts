/**
 * Etapa de parseo cacheable (SPEC-0010 RNF-001, PLAN-0010 §10.3).
 *
 * La parte cara de abrir una nota grande es el parseo de micromark (103,6 ms de mediana en la nota de
 * 181 KiB). `parseMarkdownToJson` hace EXACTAMENTE ese trabajo — `unified().use(remarkParse).use(remarkGfm)`
 * sobre el texto, con `position` — y devuelve el mdast serializado como cadena JSON, que se calcula
 * fuera del hilo principal (Worker, §10.5) y se cachea por `(id, rev)` (§10.4).
 *
 * En el hilo principal, `cachedParser.docFromMdastJson` re-hidrata esa cadena con el procesador real
 * del editor (`remarkCtx.runSync` + mdast→ProseMirror), ~5 ms. `createParseProcessor` existe también
 * para probar que las extensiones de **parseo** de esta etapa son las mismas que las del editor
 * (`micromark` + `remark-parse` + `remark-gfm`, sin los transformadores de la fase de `run`).
 */
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * El procesador de la etapa de parseo: las MISMAS extensiones de parseo que resuelve Milkdown.
 * `freeze()` aplica los plugins (poblando `micromarkExtensions`/`fromMarkdownExtensions`), así se
 * pueden comparar con las del editor; `parse()` sigue funcionando sobre un procesador congelado.
 */
export function createParseProcessor() {
  return unified().use(remarkParse).use(remarkGfm).freeze();
}

/** mdast de `text` (con `position`) serializado como cadena JSON para cachear. */
export function parseMarkdownToJson(text: string): string {
  const tree = createParseProcessor().parse(text);
  return JSON.stringify(tree);
}
