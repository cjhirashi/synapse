/**
 * Vista Visual del editor: envoltorio de Milkdown (WYSIWYG sobre ProseMirror) sin
 * `@milkdown/react` (SPEC-0008 RF-007, RF-008; PLAN-0008 §2.6, P-3).
 *
 * Contrato `{value, onChange, readOnly}`, como `CodeView`: el padre es dueño del markdown.
 *
 * - `readOnly` es el modo lectura: ProseMirror `editable: () => false` (sin cursor ni
 *   `contenteditable="true"`).
 * - `onChange` sólo se emite por ediciones: `listener.markdownUpdated` salta cuando cambia el
 *   documento, no al montar. Abrir o alternar de vista sin editar nunca reescribe el markdown
 *   (Milkdown reserializa con `remark-stringify`, que reformatea: sólo hay que pagarlo al editar).
 * - Un `value` distinto del que tiene el editor (p. ej. tras editar en la vista Código)
 *   recrea el editor con ese texto, sin emitir.
 * - Seguridad (Art. 5): el contenido viene de la réplica. Los enlaces y las imágenes pasan por
 *   `safeUrl`; el nodo `html` de commonmark ya se pinta como texto (nunca como HTML).
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { colorVar, SECONDARY, type PaletteKey } from "../vaults/vaultIcon";
import { type CmdKey, Editor, commandsCtx, defaultValueCtx, editorStateOptionsCtx, editorViewCtx, editorViewOptionsCtx, nodeViewCtx, prosePluginsCtx, rootCtx, serializerCtx } from "@milkdown/core";
import { clipboard } from "@milkdown/plugin-clipboard";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import {
  commonmark,
  headingIdGenerator,
  imageAttr,
  imageSchema,
  insertHrCommand,
  linkAttr,
  linkSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/preset-commonmark";
import { addColAfterCommand, addRowAfterCommand, gfm, insertTableCommand, toggleStrikethroughCommand } from "@milkdown/preset-gfm";
import { $markSchema, $remark } from "@milkdown/utils";
import { createSlice, type MilkdownPlugin } from "@milkdown/ctx";
import type { Processor } from "unified";
import type { Node as PMNode } from "@milkdown/prose/model";
import { Plugin, Selection } from "@milkdown/prose/state";
import type { EditorView, NodeViewConstructor } from "@milkdown/prose/view";
import { resolveWikiLink, splitWikiLinks, type NoteRef } from "./wikilink";
import { createHighlightPlugin } from "prosemirror-highlight";
import { codeBlockViewFactory } from "./codeBlockView";
import { createHighlightParser } from "./highlight/proseHighlight";
import { mermaidRenderer } from "./mermaid/renderMermaid";
import { cachedParser, preparsedMdastCtx } from "./markdown/cachedParser";
import { applyHeadingIds } from "./markdown/headingIds";
import { vscodeMarkdownPaste } from "./markdown/vscodePaste";
import { tableViewFactory } from "./tableView";
import { taskItemViewFactory } from "./taskItemView";
import { safeImageUrl, safeLinkUrl } from "./safeUrl";
// Hoja base de ProseMirror (`white-space: pre-wrap`, etc.): viaja en el chunk del editor (VU-3).
import "prosemirror-view/style/prosemirror.css";

/**
 * Los esquemas de enlace e imagen con la URL filtrada por `safeUrl`. Reemplazan a los de
 * commonmark (mismo id) y conservan su `toMarkdown`/`parseMarkdown`: sólo cambia el DOM.
 * Una URL no admitida deja el elemento sin `href`/`src` (un `<a>` inerte, una `<img>` rota).
 */
const safeLink = linkSchema.extendSchema((prev) => (ctx) => ({
  ...prev(ctx),
  toDOM: (mark) => [
    "a",
    { ...ctx.get(linkAttr.key)(mark), ...mark.attrs, href: safeLinkUrl(mark.attrs.href as string) || undefined },
  ],
}));

const safeImage = imageSchema.extendSchema((prev) => (ctx) => ({
  ...prev(ctx),
  toDOM: (node) => [
    "img",
    { ...ctx.get(imageAttr.key)(node), ...node.attrs, src: safeImageUrl(node.attrs.src as string) || undefined },
  ],
}));

/**
 * Wikilinks de Obsidian (H-011). Commonmark no define `[[Destino]]`/`[[Destino|Alias]]`, así que la
 * vista Visual en EDICIÓN añade: (1) un transformador remark que reconoce la sintaxis dentro del texto
 * (`wikilinkRemark`), (2) una marca `$MarkSchema` propia con su `parseMarkdown`/`toMarkdown` —mismo patrón
 * que `linkSchema`— que la pinta como enlace y serializa de vuelta sin escapar (`wikilinkMark`), y (3) la
 * resolución del destino contra las notas de la bóveda (`wikilink.ts`, vía la rebanada `wikilinkResolverCtx`).
 * En lectura y en Código NO se añaden: el texto sigue literal (`[[...]]`), que es lo que piden C-6.
 */

/** Resuelve un destino al `id` de su nota (o `null` si está roto). Por defecto, todo roto (sin bóveda). */
export const wikilinkResolverCtx = createSlice<(target: string) => string | null, "synapseWikilinkResolver">(() => null, "synapseWikilinkResolver");

/** Inyecta la rebanada del resolvedor; `MilkdownView` fija el real con `ctx.set` en un `.config` posterior. */
const wikilinkResolverPlugin: MilkdownPlugin = (ctx) => {
  ctx.inject(wikilinkResolverCtx, () => null);
  return () => {};
};

/** El tipo de nodo mdast propio que produce el transformador y consume el serializador. */
const WIKILINK_MDAST = "wikiLink";

interface WikiLinkMdastNode {
  type: typeof WIKILINK_MDAST;
  target: string;
  alias: string | null;
  children: { type: "text"; value: string }[];
}

/**
 * Transformador remark (fase «run», corre igual en frío y en cache-hit vía `remark.runSync`): parte cada
 * nodo `text` con `[[...]]` en texto + nodos `wikiLink`. Reconoce la sintaxis (C-1); no resuelve (eso es
 * la marca, que lee la bóveda). Añade además el handler de `remark-stringify` para volver a `[[...]]`.
 */
const wikilinkRemark = $remark("synapseWikilink", () =>
  function wikilinkAttacher(this: Processor) {
    const data = this.data() as { toMarkdownExtensions?: unknown[] };
    const extensions = (data.toMarkdownExtensions ??= []);
    extensions.push({
      handlers: {
        [WIKILINK_MDAST]: (node: WikiLinkMdastNode) => (node.alias ? `[[${node.target}|${node.alias}]]` : `[[${node.target}]]`),
      },
    });
    const transform = (tree: { type: string; children?: unknown[]; value?: string }): void => {
      if (!Array.isArray(tree.children)) return;
      const next: unknown[] = [];
      for (const child of tree.children as { type: string; value?: string; children?: unknown[] }[]) {
        if (child.type === "text" && typeof child.value === "string" && child.value.includes("[[")) {
          for (const seg of splitWikiLinks(child.value)) {
            if (seg.type === "text") next.push({ type: "text", value: seg.value });
            else next.push({ type: WIKILINK_MDAST, target: seg.target, alias: seg.alias, children: [{ type: "text", value: seg.alias ?? seg.target }] } satisfies WikiLinkMdastNode);
          }
        } else {
          transform(child);
          next.push(child);
        }
      }
      tree.children = next;
    };
    return (tree: unknown) => transform(tree as { type: string; children?: unknown[] });
  },
);

/**
 * La marca propia del wikilink. Atributos internos: `target` (lo que viaja en el markdown), `alias`
 * (si hay `|Alias`) y `resolvedId` (el `id` de la nota resuelta, C-7 — recalculado al parsear, NUNCA
 * serializado). `toDOM` la pinta como `<a class="wikilink">` SIN `href` (no navegable aún, C-5) y con
 * `data-broken` cuando no resuelve (C-4); el texto visible es el alias o el destino (C-3).
 */
const wikilinkMark = $markSchema("wikilink", (ctx) => ({
  attrs: {
    target: {},
    alias: { default: null },
    resolvedId: { default: null },
  },
  parseDOM: [
    {
      tag: "a.wikilink",
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        const target = dom.getAttribute("data-target") ?? dom.textContent ?? "";
        return { target, alias: dom.getAttribute("data-alias"), resolvedId: ctx.get(wikilinkResolverCtx)(target) };
      },
    },
  ],
  toDOM: (mark) => {
    const alias = mark.attrs.alias as string | null;
    const resolvedId = mark.attrs.resolvedId as string | null;
    return [
      "a",
      {
        class: "wikilink",
        "data-target": mark.attrs.target as string,
        ...(alias ? { "data-alias": alias } : {}),
        // Enlace roto (C-4): atributo que gobierna el estilo por CSS. No se pone `href` (C-5: sin navegación).
        ...(resolvedId ? {} : { "data-broken": "" }),
      },
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === WIKILINK_MDAST,
    runner: (state, node, markType) => {
      const target = (node as unknown as WikiLinkMdastNode).target;
      const alias = (node as unknown as WikiLinkMdastNode).alias ?? null;
      state.openMark(markType, { target, alias, resolvedId: ctx.get(wikilinkResolverCtx)(target) });
      state.addText(alias ?? target);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "wikilink",
    runner: (state, mark) => {
      // Un nodo mdast `wikiLink` con los atributos de la marca; `wikilinkRemark` lo vuelve a `[[...]]`.
      // `resolvedId` NO viaja: el markdown sólo lleva el nombre (C-2).
      state.withMark(mark, WIKILINK_MDAST, undefined, { target: mark.attrs.target, alias: mark.attrs.alias });
    },
  },
}));

/**
 * Comandos del editor que `MilkdownView` entrega al padre para su barra de formato (RF-025, P-7; H-010).
 * Cada uno ejecuta el comando Milkdown correspondiente sobre la selección/posición actual y devuelve el
 * foco al editor; no hay lógica de editor nueva, sólo se exponen comandos ya existentes en los presets.
 */
export interface EditorCommands {
  /** Inserta en el cursor una tabla con cabecera, 1 fila de cuerpo y 2 columnas. */
  insertTable: () => void;
  /** Añade una fila bajo la del cursor (sólo con el cursor en una tabla). */
  addRowAfter: () => void;
  /** Añade una columna a la derecha de la del cursor (sólo con el cursor en una tabla). */
  addColAfter: () => void;
  /** Alterna negritas (`**`) en la selección. */
  toggleBold: () => void;
  /** Alterna cursivas (`_`) en la selección. */
  toggleItalic: () => void;
  /** Alterna tachado (`~~`, gfm) en la selección. */
  toggleStrikethrough: () => void;
  /** Alterna código en línea (`` ` ``) en la selección. */
  toggleInlineCode: () => void;
  /** Envuelve el bloque del cursor en un encabezado del nivel dado (1–4); al mismo nivel, lo deshace. */
  setHeading: (level: number) => void;
  /** Envuelve el bloque del cursor en una cita (blockquote). */
  toggleBlockquote: () => void;
  /** Inserta una línea horizontal en la posición del cursor. */
  insertHr: () => void;
  /** Convierte el bloque del cursor en una lista con viñetas. */
  wrapBulletList: () => void;
  /** Convierte el bloque del cursor en una lista numerada. */
  wrapOrderedList: () => void;
}

interface MilkdownViewProps {
  value: string;
  onChange: (markdown: string) => void;
  readOnly: boolean;
  /** Nombre accesible del documento. */
  label: string;
  /** Entrega la `EditorView` de ProseMirror al estar lista (`null` al destruirla). */
  onView?: (view: EditorView | null) => void;
  /**
   * Entrega el vaciado síncrono (`flush`) del editor (`null` al desmontar): emite YA, por `onChange`,
   * lo escrito que el listener de Milkdown aún tiene pendiente en su debounce de 200 ms (E-6).
   */
  registerFlush?: (flush: (() => void) | null) => void;
  /**
   * Estado «sucio» SÍNCRONO (E-7): `true` en la misma transacción que cambia el documento (sin el
   * debounce de 200 ms del listener) y `false` cuando lo escrito ya se emitió o el documento volvió
   * al emitido. Sólo informa de los cambios de estado.
   */
  onDirty?: (dirty: boolean) => void;
  /** Foco en el editor en cuanto termina de crearse el que sigue a esta petición (U-6). */
  autoFocus?: boolean;
  /**
   * mdast precalculado (cadena JSON) de ESTE `value`, si la caché lo tenía (RNF-001, §10.3): el editor
   * lo re-hidrata en vez de reparsear con micromark en el hilo principal. Sólo se pasa cuando `value`
   * ES el `content` guardado de la nota; `null`/ausente → parseo en frío como siempre.
   */
  preparsedMdast?: string | null;
  /**
   * Bloque heredado protegido (SPEC-0010 RF-045, P-6): texto que NO se entrega a Milkdown (no se parsea
   * ni se puede corromper al editar) y que se re-antepone byte a byte a cada markdown emitido. Por
   * defecto `""` (sin bloque protegido).
   */
  prefix?: string;
  /** Entrega los comandos del editor al estar listo (`null` al destruirlo), como `registerFlush` (H-010). */
  registerCommands?: (commands: EditorCommands | null) => void;
  /** Informa de si el cursor está dentro de una tabla; sólo cuando cambia (para mostrar fila/columna, P-7). */
  onTableContext?: (inTable: boolean) => void;
  /**
   * Notas vivas de la bóveda para resolver wikilinks (H-011): se usan en Lectura y en edición Visual (no en
   * Código, que es un componente de texto plano aparte, C-6 corregido). Resolver un `[[Destino]]` compara
   * su nombre contra estas notas (ver `wikilink.ts`).
   */
  notes?: readonly NoteRef[];
  /**
   * Clic sobre un wikilink, SÓLO en Lectura (H-012 C-1/C-3): entrega el `resolvedId` de la nota destino (o
   * `null` si está roto) y el `target` tal cual, para que el padre navegue o decida crear. En edición (Visual
   * o Código) el handler ni se registra, así que un clic ahí nunca navega (C-4/C-5).
   */
  onWikilinkClick?: (link: { resolvedId: string | null; target: string }) => void;
  /**
   * Color de la bóveda abierta (H-014): el contenedor `.milkdown-view` lo publica como `--vault-accent`
   * y su secundario (vía `SECONDARY`) como `--vault-secondary`, para que `editor.css` pinte con
   * `color-mix` los encabezados, la negrita, la cursiva, los enlaces, la cabecera de tabla y los
   * marcadores de lista del markdown renderizado. Por defecto `accent` (el cian de siempre).
   */
  vaultColor?: PaletteKey;
}

/** Un editor en marcha. `ready` termina cuando `Editor.create()` acaba (es asíncrono). */
interface Running {
  editor: Editor;
  ready: Promise<unknown>;
  readOnly: boolean;
  /** La vista, una vez creado el editor. */
  view: EditorView | null;
  /** Documento que ya se emitió (o con el que se creó): lo distinto de él es una edición pendiente. */
  baseDoc: PMNode | null;
  /** Último estado «sucio» informado por `onDirty`. */
  reported: boolean;
}

export function MilkdownView({ value, onChange, readOnly, label, onView, registerFlush, onDirty, autoFocus = false, preparsedMdast = null, prefix = "", registerCommands, onTableContext, notes, onWikilinkClick, vaultColor = "accent" }: MilkdownViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const running = useRef<Running | null>(null);
  /** Lista de notas vigente para resolver wikilinks (H-011); por ref, la lee el resolvedor al parsear. */
  const notesRef = useRef<readonly NoteRef[]>(notes ?? []);
  notesRef.current = notes ?? [];
  /** El markdown que tiene el editor ahora (SIN el `prefix`): el último recibido del padre o emitido por él. */
  const current = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  /** `prefix` vigente para re-anteponerlo al emitir (P-6); por ref, lo leen los cierres de emisión. */
  const prefixRef = useRef(prefix);
  prefixRef.current = prefix;
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  const onDirtyRef = useRef(onDirty);
  onDirtyRef.current = onDirty;
  const registerCommandsRef = useRef(registerCommands);
  registerCommandsRef.current = registerCommands;
  const onTableContextRef = useRef(onTableContext);
  onTableContextRef.current = onTableContext;
  const onWikilinkClickRef = useRef(onWikilinkClick);
  onWikilinkClickRef.current = onWikilinkClick;
  /** Último valor informado por `onTableContext` (sólo se informan los cambios). */
  const inTableRef = useRef(false);
  /** Pendiente de enfocar al estar listo el primer editor (se consume una vez: recrearlo por un `value` nuevo no roba el foco). */
  const focusOnReady = useRef(autoFocus);
  // Lectura → edición reutiliza esta misma instancia (no se vuelve a montar): la petición llega por la prop.
  if (autoFocus) focusOnReady.current = true;

  /** Informa de «cursor en una tabla» sólo si cambió respecto de lo último informado. */
  function reportTable(inTable: boolean) {
    if (inTableRef.current === inTable) return;
    inTableRef.current = inTable;
    onTableContextRef.current?.(inTable);
  }

  /** Informa de `dirty` sólo si cambió respecto de lo último informado. */
  function report(target: Running, dirty: boolean) {
    if (target.reported === dirty) return;
    target.reported = dirty;
    onDirtyRef.current?.(dirty);
  }

  /** Lo emitido cubre ya el documento `doc`: deja de haber nada pendiente. */
  function settle(target: Running, doc: PMNode) {
    target.baseDoc = doc;
    report(target, false);
  }

  /**
   * Emite ya lo que el usuario escribió y el listener aún no entregó (E-6). `@milkdown/plugin-listener`
   * emite con un debounce de 200 ms y su `destroy` descarta lo pendiente: sin esto, cambiar de vista,
   * guardar o desmontar dentro de esa ventana perdía el último cambio (o guardaba el texto anterior).
   * Sólo emite si el documento difiere del último emitido: abrir sin editar nunca reserializa.
   */
  function flushRunning(target: Running | null) {
    if (!target || !target.view || !target.baseDoc || target.readOnly) return;
    const doc = target.view.state.doc;
    if (doc.eq(target.baseDoc)) return;
    settle(target, doc);
    const markdown = target.editor.ctx.get(serializerCtx)(doc);
    if (markdown === current.current) return;
    current.current = markdown;
    onChangeRef.current(prefixRef.current + markdown);
  }

  /** Destruye el editor en marcha, esperando a que termine de crearse si aún no lo hizo. */
  function stop() {
    const previous = running.current;
    running.current = null;
    if (!previous) return;
    onViewRef.current?.(null);
    registerCommandsRef.current?.(null);
    reportTable(false);
    // Antes de destruirlo: su `destroy` cancela el debounce del listener (E-6).
    flushRunning(previous);
    void previous.ready.then(() => previous.editor.destroy());
  }

  useEffect(() => {
    // Ya hay un editor con este modo y este texto: nada que hacer (lo escrito por el usuario
    // vuelve del padre como `value` igual a `current`).
    if (running.current && running.current.readOnly === readOnly && current.current === value) return;
    stop();
    current.current = value;

    let editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host.current as HTMLDivElement);
        ctx.set(defaultValueCtx, value);
        ctx.update(editorViewOptionsCtx, (options) => ({
          ...options,
          editable: () => !readOnly,
          attributes: {
            ...options.attributes,
            role: readOnly ? "document" : "textbox",
            "aria-label": label,
            ...(readOnly ? {} : { "aria-multiline": "true" }),
          },
        }));
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          // La emisión del listener cubre el documento actual: nada pendiente para `flush`.
          if (running.current?.editor === editor && running.current.view) settle(running.current, running.current.view.state.doc);
          if (markdown === current.current) return;
          current.current = markdown;
          onChangeRef.current(prefixRef.current + markdown);
        });
      })
      .use(commonmark)
      .use(safeLink)
      .use(safeImage)
      .use(gfm)
      .use(history)
      // Pegar (RF-023, RF-024): el plugin oficial interpreta el `text/plain` como markdown con el parser del
      // editor; lo que no es una tabla GFM válida queda como texto. El ajuste de VS Code (P-8) va antes.
      .use(clipboard)
      .use(listener)
      .use(cachedParser)
      .config((ctx) => {
        // RNF-001 (§10.3): si el padre entregó el mdast precalculado de este `value`, `cachedParser`
        // lo re-hidrata en vez de reparsear con micromark en el hilo principal.
        ctx.set(preparsedMdastCtx, preparsedMdast);
      })
      .config((ctx) => {
        // *Node views* de SPEC-0010: bloque de código con cabecera y «Copiar» (RF-033…RF-036), casillas de tarea
        // (RF-039) y tabla con envoltorio de scroll (RF-026).
        ctx.update(nodeViewCtx, (views) => [
          ...views,
          ["code_block", codeBlockViewFactory({ mermaid: mermaidRenderer })] as [string, NodeViewConstructor],
          ["list_item", taskItemViewFactory()] as [string, NodeViewConstructor],
          ["table", tableViewFactory()] as [string, NodeViewConstructor],
        ]);
        // RNF-001 (PLAN-0010 §10.1): el documento nace con los ids de encabezado ya puestos. El
        // `editorStateOptionsCtx` recibe el documento recién parseado (por `parserCtx`) justo antes de
        // `EditorState.create`: le aplicamos `applyHeadingIds` con el MISMO generador y regla `-#n` que
        // `syncHeadingIdPlugin`, así el plugin no despacha ninguna transacción al montar (sin relayout).
        ctx.update(editorStateOptionsCtx, (prev) => (options) => {
          const base = prev(options);
          if (!base.doc) return base;
          return { ...base, doc: applyHeadingIds(base.doc, ctx.get(headingIdGenerator.key)) };
        });
        // «Sucio» síncrono (E-7): cada actualización de la vista compara su documento con el último emitido.
        ctx.update(prosePluginsCtx, (plugins) =>
          plugins.concat(
            // Antes que el `handlePaste` del plugin oficial (se registra después de `config`): ver P-8.
            vscodeMarkdownPaste(ctx),
            // Resaltado de los bloques de código en lectura y Visual (RF-027, RF-028): decoraciones `sx-*`; un
            // *parser* por vista, así reabrir la nota reintenta una gramática que falló (RF-032).
            createHighlightPlugin({
              parser: createHighlightParser({
                // Distancia del bloque al viewport: lo cercano se resalta ya y lo lejano por tandas en idle (RNF-001).
                distance: (pos) => {
                  const view = running.current?.editor === editor ? running.current.view : null;
                  const dom = view?.nodeDOM(pos);
                  if (!(dom instanceof HTMLElement)) return null;
                  const box = dom.getBoundingClientRect();
                  return box.bottom < 0 ? -box.bottom : Math.max(0, box.top - window.innerHeight);
                },
              }),
            }),
            new Plugin({
              view: () => ({
                update: (view) => {
                  const r = running.current;
                  if (!r || r.editor !== editor) return;
                  // El cursor está en una tabla si alguno de sus ancestros lo es (la celda es `table_cell`/`table_header`).
                  const { $from } = view.state.selection;
                  let inTable = false;
                  for (let depth = $from.depth; depth > 0 && !inTable; depth--) inTable = $from.node(depth).type.name === "table";
                  if (!r.readOnly) reportTable(inTable);
                  if (!r.baseDoc || r.readOnly) return;
                  report(r, !view.state.doc.eq(r.baseDoc));
                },
              }),
            }),
            // H-012 C-1/C-3 (corregido — ver nota de bug abajo): clic en un wikilink, SÓLO en Lectura. El
            // handler lee la marca `wikilink` activa EN LA POSICIÓN exacta del clic (`resolvedId`/`target`,
            // sin viaje por el DOM) y avisa al padre para navegar o crear. En edición ni se añade (C-4/C-5):
            // un clic ahí coloca el cursor como siempre.
            //
            // BUG real encontrado por Carlos (2026-10-30, el clic no hacía nada) y reproducido por AIRA con
            // un usuario/bóveda desechables + clic real en navegador (no sólo unit test con jsdom, que nunca
            // ejerce `posAtCoords`): el 3er argumento de `handleClickOn` (`node`) es el NODO ANCESTRO de
            // bloque alrededor del clic (la documentación de ProseMirror dice "para cada nodo alrededor del
            // clic, de adentro hacia afuera") — aquí siempre era el `<p>`, que no carga la marca inline. Un
            // párrafo nunca tiene `.marks` con el wikilink; `node.marks.find(...)` daba `undefined` siempre,
            // así que el handler devolvía `false` en silencio, sin error y sin navegar. Arreglo: resolver las
            // marcas activas EN LA POSICIÓN del clic (`doc.resolve(pos).marks()`), no en el nodo ancestro.
            ...(readOnly
              ? [
                  new Plugin({
                    props: {
                      handleClickOn: (view, pos) => {
                        // `$pos.marks()` sola no basta: en el límite exacto donde empieza la marca (click en su
                        // primer carácter) mira el texto ANTERIOR, sin marca, y no la encuentra. Unir las marcas
                        // de `nodeBefore`/`nodeAfter` cubre el clic en cualquier punto del wikilink, borde incluido.
                        const $pos = view.state.doc.resolve(pos);
                        const marks = [...($pos.nodeBefore?.marks ?? []), ...($pos.nodeAfter?.marks ?? [])];
                        const mark = marks.find((m) => m.type.name === "wikilink");
                        if (!mark) return false;
                        onWikilinkClickRef.current?.({ resolvedId: (mark.attrs.resolvedId as string | null) ?? null, target: mark.attrs.target as string });
                        return true; // consume el clic: no coloca selección ni sigue propagando
                      },
                    },
                  }),
                ]
              : []),
          ),
        );
      });

    // H-011 (corregido): los wikilinks se reconocen tanto en Lectura como en edición Visual — ambas pasan
    // por este componente (`MilkdownView`/`Visual`, sólo cambia `readOnly`); es justo en Lectura donde más
    // se usan para navegar (Carlos, 2026-10-30). Sólo Código queda literal, porque usa `CodeView`, un
    // componente de texto plano aparte que nunca llega a este código (C-6 corregido).
    editor = editor
      .use(wikilinkResolverPlugin)
      .use(wikilinkMark)
      .use(wikilinkRemark)
      .config((ctx) => {
        // El resolvedor lee la lista de notas vigente por ref: así resolver no obliga a recrear el editor.
        ctx.set(wikilinkResolverCtx, (target: string) => resolveWikiLink(target, notesRef.current));
      });

    const ready = editor.create().then(() => {
      // Si mientras se creaba lo reemplazaron, `stop()` ya lo destruirá: no se anuncia.
      if (running.current?.editor !== editor) return;
      const view = editor.ctx.get(editorViewCtx);
      running.current.view = view;
      running.current.baseDoc = view.state.doc;
      if (focusOnReady.current && !readOnly) {
        focusOnReady.current = false;
        view.focus();
      }
      // `@milkdown/core` fuerza `role="textbox"` en el DOM de la vista al crearla (después de las
      // `attributes` de ProseMirror, VU-2): se reasigna el rol real. En lectura es un documento,
      // no un cuadro de texto (`aria-readonly` no es válido en `document`, C-3).
      view.dom.setAttribute("role", readOnly ? "document" : "textbox");
      onViewRef.current?.(view);
      if (!readOnly) {
        // Los comandos (RF-025, P-7; H-010) operan sobre la selección vigente de la vista; el botón de la
        // barra ya le quitó el foco, así que se le devuelve tras ejecutarlos para seguir escribiendo.
        const run = <T,>(key: CmdKey<T>, payload?: T) => {
          editor.ctx.get(commandsCtx).call(key, payload);
          view.focus();
        };
        registerCommandsRef.current?.({
          insertTable: () => {
            const { from } = view.state.selection;
            run(insertTableCommand.key, { row: 2, col: 2 });
            // `insertTableCommand` deja el cursor donde estaba: a mitad de un párrafo (que parte en dos) queda
            // FUERA de la tabla y no se ofrecerían fila/columna. Se lleva a la primera celda de la tabla nueva
            // (la primera a partir de `from - 1`: con el párrafo vacío la tabla lo sustituye y empieza ahí).
            let tablePos = -1;
            view.state.doc.descendants((node, pos) => {
              if (tablePos >= 0 || pos < from - 1) return tablePos < 0;
              if (node.type.name === "table") tablePos = pos;
              return tablePos < 0;
            });
            const cell = tablePos >= 0 ? Selection.findFrom(view.state.doc.resolve(tablePos), 1, true) : null;
            if (cell) view.dispatch(view.state.tr.setSelection(cell));
          },
          addRowAfter: () => run(addRowAfterCommand.key),
          addColAfter: () => run(addColAfterCommand.key),
          // H-010: controles de formato Markdown — cada uno es el comando ya expuesto por el preset.
          toggleBold: () => run(toggleStrongCommand.key),
          toggleItalic: () => run(toggleEmphasisCommand.key),
          toggleStrikethrough: () => run(toggleStrikethroughCommand.key),
          toggleInlineCode: () => run(toggleInlineCodeCommand.key),
          setHeading: (level: number) => run(wrapInHeadingCommand.key, level),
          toggleBlockquote: () => run(wrapInBlockquoteCommand.key),
          insertHr: () => run(insertHrCommand.key),
          wrapBulletList: () => run(wrapInBulletListCommand.key),
          wrapOrderedList: () => run(wrapInOrderedListCommand.key),
        });
      }
    });
    running.current = { editor, ready, readOnly, view: null, baseDoc: null, reported: false };
  }, [value, readOnly, label]);

  // El padre puede pedir el vaciado síncrono antes de alternar vista o modo y antes de guardar (E-6).
  useEffect(() => {
    registerFlush?.(() => flushRunning(running.current));
    return () => registerFlush?.(null);
    // `flushRunning` sólo usa refs: no hace falta como dependencia.
  }, [registerFlush]);

  // Al desmontar (y entre las dos pasadas de StrictMode) se destruye el editor.
  useEffect(() => stop, []);

  // `data-mode` activa `content-visibility: auto` en los bloques del documento SÓLO en lectura
  // (RNF-001, PLAN-0010 §10.2): en Visual no se aplica (riesgo con caret/selección sin beneficio).
  // H-014: el color de la bóveda y su secundario viajan como variables CSS en este contenedor; las
  // reglas de `editor.css` (`.milkdown-view .ProseMirror …`) las heredan y mezclan con `color-mix`.
  const vaultVars = {
    "--vault-accent": colorVar(vaultColor),
    "--vault-secondary": colorVar(SECONDARY[vaultColor]),
  } as CSSProperties;
  return <div className="milkdown-view" data-mode={readOnly ? "read" : "edit"} style={vaultVars} ref={host} />;
}
