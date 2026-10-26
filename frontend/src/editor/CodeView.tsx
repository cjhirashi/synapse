/**
 * Vista Código del editor: envoltorio de CodeMirror 6 sobre el markdown crudo con el bloque YAML del
 * frontmatter resaltado (SPEC-0008 RF-008; SPEC-0010 RF-015, RF-017, RF-029; PLAN-0010 §2.1, §6).
 *
 * Contrato `{value, onChange}`, el mismo que `MilkdownView`: el padre es dueño del texto. `onChange`
 * sólo se emite por ediciones del usuario; cuando el padre cambia `value` el documento se reemplaza
 * marcando la transacción como externa, para no devolver al padre su propio texto.
 *
 * El lenguaje es markdown GFM con los bloques cercados coloreados por su gramática (`codeLanguages`, RF-029,
 * RF-030) y, en cuanto carga su chunk (RNF-002), `yamlFrontmatter`: el bloque inicial `---\n…\n---` se
 * colorea como YAML y el resto como markdown. Una línea con error de YAML (`errorLine`, 1-based) se marca con `.cm-error-line`, y el padre
 * puede saltar a ella con el `reveal` que esta vista registra (como `registerFlush`).
 */
import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Annotation, Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import { syntaxHighlighting } from "@codemirror/language";
import { Decoration, type DecorationSet, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { styleTags } from "@lezer/highlight";
import { synapseHighlighter, taskMarkerTag } from "./highlight/highlighter";
import { findLanguage } from "./highlight/languages";

/** Marca las transacciones que vienen del padre (no son ediciones del usuario). */
const external = Annotation.define<boolean>();

/** Fija (o limpia con `null`) la línea 1-based a resaltar como error de YAML. */
const setErrorLineEffect = StateEffect.define<number | null>();

/** Campo que mantiene la decoración de la línea de error y la provee a la vista. */
const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setErrorLineEffect)) continue;
      const line = effect.value;
      next =
        line === null || line < 1 || line > tr.state.doc.lines
          ? Decoration.none
          : Decoration.set([Decoration.line({ class: "cm-error-line" }).range(tr.state.doc.line(line).from)]);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Markdown GFM de la vista Código: tareas con etiqueta propia y cercados con gramática del registro único. */
const markdownSupport = () =>
  markdown({
    base: markdownLanguage,
    // Función (no la lista): la lista casa también por parte del nombre (`foo-shell` ≠ `shell`).
    codeLanguages: (info) => findLanguage(info),
    extensions: [{ props: [styleTags({ TaskMarker: taskMarkerTag })] }],
  });

interface CodeViewProps {
  value: string;
  onChange: (value: string) => void;
  /** Nombre accesible del área de texto. */
  label: string;
  /** Foco en el editor al montar la vista (U-6). */
  autoFocus?: boolean;
  /** Línea (1-based) a resaltar por un error de YAML, o `null`. */
  errorLine?: number | null;
  /** Registra una función que salta a una línea («Ir a la línea N»); `null` al desmontar. */
  registerReveal?: (reveal: ((line: number) => void) | null) => void;
}

export function CodeView({ value, onChange, label, autoFocus = false, errorLine = null, registerReveal }: CodeViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Lenguaje del documento en un compartimento: arranca en markdown y gana el frontmatter YAML al cargar.
  const language = useRef(new Compartment());
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
          // Markdown GFM (tablas, tareas, tachado) con la marca de tarea como etiqueta propia y los cercados coloreados.
          language.current.of(markdownSupport()),
          // SPEC-0010 RF-029 (P-11): como el mockup, con números de línea, línea activa y el markdown coloreado
          // con las clases `sx-*` (los colores son tokens: ver `syntax.css` y la vista Código en `editor.css`).
          syntaxHighlighting(synapseHighlighter),
          errorLineField,
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
    // La gramática de YAML va en su propio chunk (RNF-002): al llegar, el bloque inicial `---…---` pasa a ser YAML.
    void import("@codemirror/lang-yaml").then(({ yamlFrontmatter }) => {
      if (view.current === instance) instance.dispatch({ effects: language.current.reconfigure(yamlFrontmatter({ content: markdownSupport() })) });
    }, () => {
      // Sin la gramática el bloque YAML se queda como markdown: legible, sin bloquear la edición (RF-032).
    });
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

  // Pinta (o limpia) la línea de error cuando el padre la cambia.
  useEffect(() => {
    view.current?.dispatch({ effects: setErrorLineEffect.of(errorLine) });
  }, [errorLine]);

  // Registra «Ir a la línea N»: lleva el cursor a esa línea, la centra y enfoca el editor.
  useEffect(() => {
    registerReveal?.((line: number) => {
      const instance = view.current;
      if (!instance) return;
      const target = instance.state.doc.line(Math.min(Math.max(line, 1), instance.state.doc.lines));
      instance.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: "center" }) });
      instance.focus();
    });
    return () => registerReveal?.(null);
  }, [registerReveal]);

  return <div className="code-view" ref={host} />;
}
