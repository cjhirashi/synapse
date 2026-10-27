/**
 * Pegado desde VS Code como markdown (SPEC-0010 RF-023, PLAN-0010 P-8).
 *
 * `@milkdown/plugin-clipboard` convierte TODO pegado que trae `vscode-editor-data` en un bloque de
 * código del lenguaje de VS Code: una tabla copiada de un `.md` llegaría como bloque `markdown`,
 * contra RF-023. Este plugin va ANTES del de Milkdown (ProseMirror consulta `handlePaste` en orden de
 * plugin) y sólo atiende el modo `markdown`: interpreta el `text/plain` con el parser del editor. Con
 * cualquier otro modo (o sin él) devuelve `false` y el plugin oficial sigue igual que siempre.
 */
import type { Ctx } from "@milkdown/ctx";
import { parserCtx } from "@milkdown/core";
import { Slice } from "@milkdown/prose/model";
import { Plugin, PluginKey } from "@milkdown/prose/state";

/** Modo (lenguaje) que VS Code declara en `vscode-editor-data`, o `null` si falta o no es JSON válido. */
function vscodeMode(raw: string): string | null {
  if (!raw) return null;
  try {
    const mode: unknown = JSON.parse(raw)?.mode;
    return typeof mode === "string" ? mode : null;
  } catch {
    return null;
  }
}

export function vscodeMarkdownPaste(ctx: Ctx): Plugin {
  return new Plugin({
    key: new PluginKey("SYNAPSE_VSCODE_MARKDOWN_PASTE"),
    props: {
      handlePaste: (view, event) => {
        const { clipboardData } = event;
        if (!clipboardData || !view.props.editable?.(view.state)) return false;
        // En un bloque de código se pega el texto tal cual (como hace el plugin oficial).
        if (view.state.selection.$from.node().type.spec.code) return false;
        const text = clipboardData.getData("text/plain");
        if (!text || vscodeMode(clipboardData.getData("vscode-editor-data")) !== "markdown") return false;

        const doc = ctx.get(parserCtx)(text.replace(/\r\n?/g, "\n"));
        if (!doc || typeof doc === "string") return false;
        // Un único párrafo se pega «abierto» (se funde con el texto de alrededor); el resto, como bloques
        // enteros: abrirlos más metería una tabla dentro de la celda donde esté el cursor.
        const single = doc.childCount === 1 && doc.firstChild?.isTextblock;
        view.dispatch(view.state.tr.replaceSelection(new Slice(doc.content, single ? 1 : 0, single ? 1 : 0)).scrollIntoView());
        return true;
      },
    },
  });
}
