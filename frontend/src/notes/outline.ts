/** Índice de encabezados del documento abierto (barra derecha). Se lee del DOM del documento ya dibujado, así vale para el editor y para las vistas de solo lectura. */

/** El cuerpo del documento lo dibuja `MilkdownView` (editor y vistas de solo lectura); el resto de la pantalla no cuenta. */
export const HEADING_SELECTOR = ".milkdown-view :is(h1, h2, h3, h4, h5, h6)";

export interface OutlineItem {
  key: string;
  level: number;
  text: string;
  el: HTMLElement;
}

/** Los encabezados con texto, en orden de documento. */
export function readOutline(root: ParentNode): OutlineItem[] {
  const items: OutlineItem[] = [];
  root.querySelectorAll<HTMLElement>(HEADING_SELECTOR).forEach((el, index) => {
    const text = (el.textContent ?? "").trim();
    if (text) items.push({ key: `${index}:${el.id || text}`, level: Number(el.tagName[1]), text, el });
  });
  return items;
}

/** Sangría de cada encabezado respecto al más alto del documento (0 a 5): un documento que empieza en h2 no se muestra sangrado. */
export function indentOf(items: OutlineItem[], item: OutlineItem): number {
  return item.level - Math.min(...items.map((i) => i.level));
}

/** El encabezado vigente: el último que ya llegó a la parte alta del área visible (o el primero, si aún no se llega a ninguno). */
export function activeIndex(tops: number[], viewportTop: number, offset = 48): number {
  let active = 0;
  tops.forEach((top, index) => { if (top <= viewportTop + offset) active = index; });
  return active;
}

/** Notas ligadas: las tareas cuya ruta es la de este documento (la ruta de una tarea se guarda sin barras al borde). */
export function pathMatches(taskPath: string | null, notePath: string | null): boolean {
  if (!taskPath || !notePath) return false;
  const clean = (value: string) => value.replace(/^\/+|\/+$/g, "").toLowerCase();
  return clean(taskPath) === clean(notePath);
}

/** ¿Es el mismo índice (mismos encabezados y los mismos nodos del DOM)? Si un nodo se vuelve a dibujar, hay que quedarse con el nuevo para poder saltar a él. */
export function sameOutline(a: OutlineItem[], b: OutlineItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.el === b[i].el && item.key === b[i].key);
}
