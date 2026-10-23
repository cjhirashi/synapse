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
import { Editor, defaultValueCtx, editorViewCtx, editorViewOptionsCtx, rootCtx } from "@milkdown/core";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { commonmark, imageAttr, imageSchema, linkAttr, linkSchema } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import type { EditorView } from "@milkdown/prose/view";
import { safeImageUrl, safeLinkUrl } from "./safeUrl";

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
}

/** Un editor en marcha. `ready` termina cuando `Editor.create()` acaba (es asíncrono). */
interface Running {
  editor: Editor;
  ready: Promise<unknown>;
  readOnly: boolean;
}

export function MilkdownView({ value, onChange, readOnly, label, onView }: MilkdownViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const running = useRef<Running | null>(null);
  /** El markdown que tiene el editor ahora: el último recibido del padre o emitido por él. */
  const current = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onViewRef = useRef(onView);
  onViewRef.current = onView;

  /** Destruye el editor en marcha, esperando a que termine de crearse si aún no lo hizo. */
  function stop() {
    const previous = running.current;
    running.current = null;
    if (!previous) return;
    onViewRef.current?.(null);
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
      .use(listener);

    const ready = editor.create().then(() => {
      // Si mientras se creaba lo reemplazaron, `stop()` ya lo destruirá: no se anuncia.
      if (running.current?.editor !== editor) return;
      const view = editor.ctx.get(editorViewCtx);
      // `@milkdown/core` fuerza `role="textbox"` en el DOM de la vista al crearla (después de las
      // `attributes` de ProseMirror, VU-2): se reasigna el rol real. En lectura es un documento
      // de sólo lectura, no un cuadro de texto.
      view.dom.setAttribute("role", readOnly ? "document" : "textbox");
      if (readOnly) view.dom.setAttribute("aria-readonly", "true");
      onViewRef.current?.(view);
    });
    running.current = { editor, ready, readOnly };
  }, [value, readOnly, label]);

  // Al desmontar (y entre las dos pasadas de StrictMode) se destruye el editor.
  useEffect(() => stop, []);

  return <div className="milkdown-view" ref={host} />;
}
