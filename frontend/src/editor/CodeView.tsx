/**
 * Vista Código del editor: envoltorio de CodeMirror 6 sobre el markdown crudo (SPEC-0008
 * RF-008; PLAN-0008 §2.6).
 *
 * Contrato `{value, onChange}`, el mismo que `MilkdownView`: el padre es dueño del texto
 * (`draft`). `onChange` sólo se emite por ediciones del usuario; cuando el padre cambia
 * `value` (p. ej. tras editar en la vista Visual) el documento se reemplaza marcando la
 * transacción como externa, para no devolver al padre su propio texto.
 */
import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Annotation, EditorState } from "@codemirror/state";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { styleTags } from "@lezer/highlight";
import { synapseHighlighter, taskMarkerTag } from "./highlight/highlighter";

/** Marca las transacciones que vienen del padre (no son ediciones del usuario). */
const external = Annotation.define<boolean>();

interface CodeViewProps {
  value: string;
  onChange: (value: string) => void;
  /** Nombre accesible del área de texto. */
  label: string;
  /** Foco en el editor al montar la vista (U-6). */
  autoFocus?: boolean;
}

export function CodeView({ value, onChange, label, autoFocus = false }: CodeViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // La última `onChange`, para que el editor (creado una sola vez) no quede con una vieja.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Se crea una vez; `value` inicial entra por aquí y los posteriores por el efecto de abajo.
  useEffect(() => {
    const instance = new EditorView({
      parent: host.current as HTMLDivElement,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          // Markdown GFM (tablas, tareas, tachado) con la marca de tarea como etiqueta propia.
          markdown({ base: markdownLanguage, extensions: [{ props: [styleTags({ TaskMarker: taskMarkerTag })] }] }),
          // SPEC-0010 RF-029 (P-11): como el mockup, con números de línea, línea activa y el markdown coloreado
          // con las clases `sx-*` (los colores son tokens: ver `syntax.css` y la vista Código en `editor.css`).
          syntaxHighlighting(synapseHighlighter),
          lineNumbers(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(external))) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    view.current = instance;
    if (autoFocus) instance.focus();
    return () => {
      instance.destroy();
      view.current = null;
    };
    // `value` y `label` iniciales; los cambios de `value` los atiende el efecto siguiente.
  }, []);

  useEffect(() => {
    const instance = view.current;
    if (instance && instance.state.doc.toString() !== value) {
      instance.dispatch({
        changes: { from: 0, to: instance.state.doc.length, insert: value },
        annotations: external.of(true),
      });
    }
  }, [value]);

  return <div className="code-view" ref={host} />;
}
