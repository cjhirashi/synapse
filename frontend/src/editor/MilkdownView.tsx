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
import { useEffect, useRef } from "react";
import { Editor, defaultValueCtx, editorStateOptionsCtx, editorViewCtx, editorViewOptionsCtx, nodeViewCtx, prosePluginsCtx, rootCtx, serializerCtx } from "@milkdown/core";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { commonmark, headingIdGenerator, imageAttr, imageSchema, linkAttr, linkSchema } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import type { Node as PMNode } from "@milkdown/prose/model";
import { Plugin } from "@milkdown/prose/state";
import type { EditorView, NodeViewConstructor } from "@milkdown/prose/view";
import { codeBlockViewFactory } from "./codeBlockView";
import { applyHeadingIds } from "./markdown/headingIds";
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

export function MilkdownView({ value, onChange, readOnly, label, onView, registerFlush, onDirty, autoFocus = false }: MilkdownViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const running = useRef<Running | null>(null);
  /** El markdown que tiene el editor ahora: el último recibido del padre o emitido por él. */
  const current = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  const onDirtyRef = useRef(onDirty);
  onDirtyRef.current = onDirty;
  /** Pendiente de enfocar al estar listo el primer editor (se consume una vez: recrearlo por un `value` nuevo no roba el foco). */
  const focusOnReady = useRef(autoFocus);
  // Lectura → edición reutiliza esta misma instancia (no se vuelve a montar): la petición llega por la prop.
  if (autoFocus) focusOnReady.current = true;

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
    onChangeRef.current(markdown);
  }

  /** Destruye el editor en marcha, esperando a que termine de crearse si aún no lo hizo. */
  function stop() {
    const previous = running.current;
    running.current = null;
    if (!previous) return;
    onViewRef.current?.(null);
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

    const editor = Editor.make()
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
          onChangeRef.current(markdown);
        });
      })
      .use(commonmark)
      .use(safeLink)
      .use(safeImage)
      .use(gfm)
      .use(history)
      .use(listener)
      .config((ctx) => {
        // *Node views* de SPEC-0010: bloque de código con cabecera y «Copiar» (RF-033…RF-036), casillas de tarea
        // (RF-039) y tabla con envoltorio de scroll (RF-026).
        ctx.update(nodeViewCtx, (views) => [
          ...views,
          ["code_block", codeBlockViewFactory()] as [string, NodeViewConstructor],
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
            new Plugin({
              view: () => ({
                update: (view) => {
                  const r = running.current;
                  if (!r || r.editor !== editor || !r.baseDoc || r.readOnly) return;
                  report(r, !view.state.doc.eq(r.baseDoc));
                },
              }),
            }),
          ),
        );
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
  return <div className="milkdown-view" data-mode={readOnly ? "read" : "edit"} ref={host} />;
}
