/**
 * Ids de encabezado al parsear (SPEC-0010 RNF-001, PLAN-0010 §10.1).
 *
 * `syncHeadingIdPlugin` de `@milkdown/preset-commonmark` rellena los ids de los encabezados
 * **después** de montar la vista (su `view:` hace `view.dispatch` si algún id falta), lo que fuerza
 * un relayout de todo el documento (medido: ~57 ms en la nota de 181 KiB). La raíz: el documento
 * nace con `heading.attrs.id = ""`.
 *
 * `applyHeadingIds` fija los ids sobre el documento **recién parseado**, con el MISMO generador
 * (`headingIdGenerator` del contexto de Milkdown) y la MISMA regla de duplicados (`-#n`), omitiendo
 * los encabezados vacíos. Así el plugin no encuentra nada que cambiar al montar y no despacha. Es una
 * función pura sobre el `Node` de ProseMirror (inmutable): reconstruye sólo la rama que cambia y
 * devuelve el mismo documento si no hubo ningún id que poner.
 */
import { Fragment, type Node as PMNode } from "@milkdown/prose/model";

/** Recorre el documento en orden y fija el `id` de cada encabezado con `getId` y la regla `-#n`. */
export function applyHeadingIds(doc: PMNode, getId: (node: PMNode) => string): PMNode {
  // `-#n` sobre el id generado: la misma cuenta por id que `syncHeadingIdPlugin`, en orden de documento.
  const seen: Record<string, number> = {};
  let anyChange = false;

  function rewrite(node: PMNode): PMNode {
    let next = node;
    if (node.type.name === "heading" && node.textContent.trim().length > 0) {
      let id = getId(node);
      if (seen[id]) {
        seen[id] += 1;
        id += `-#${seen[id]}`;
      } else {
        seen[id] = 1;
      }
      if (node.attrs.id !== id) {
        next = node.type.create({ ...node.attrs, id }, node.content, node.marks);
        anyChange = true;
      }
    }
    // Encabezados anidados (p. ej. dentro de una cita) también se recorren, en orden de documento.
    if (next.childCount > 0) {
      const children: PMNode[] = [];
      let childChanged = false;
      next.forEach((child) => {
        const rewritten = rewrite(child);
        if (rewritten !== child) childChanged = true;
        children.push(rewritten);
      });
      if (childChanged) {
        next = next.copy(Fragment.fromArray(children));
        anyChange = true;
      }
    }
    return next;
  }

  const result = rewrite(doc);
  return anyChange ? result : doc;
}
