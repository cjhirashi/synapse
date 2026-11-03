// H-025 PASO 4: pegado de un enlace de YouTube o imagen con conversión reversible

import type { Ctx } from "@milkdown/ctx";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { closeHistory } from "@milkdown/prose/history";
import { classifyUrl, youtubeEmbedUrl } from "../classifyUrl";

const MAX_URL_LENGTH = 2048;

export function linkPastePlugin(
  onConverted: (info: { kind: "youtube" | "image" }) => void
): Plugin {
  return new Plugin({
    key: new PluginKey("SYNAPSE_LINK_PASTE"),
    props: {
      handlePaste: (view, event) => {
        const { clipboardData } = event;

        // Validaciones previas
        if (!clipboardData || !view.props.editable?.(view.state)) return false;

        // No en bloque de código
        if (view.state.selection.$from.node().type.spec.code) return false;

        // No con archivos en el portapapeles
        if (clipboardData.files?.length) return false;
        if (clipboardData.items?.length) {
          for (let i = 0; i < clipboardData.items.length; i++) {
            if (clipboardData.items[i].kind === "file") return false;
          }
        }

        // No con selección no vacía
        if (!view.state.selection.empty) return false;
        const { $from } = view.state.selection;

        // El textblock debe estar vacío o el contenido ser vacío
        const textblock = $from.parent;
        if (textblock.content.size > 0) return false;

        // No en bloque de código
        if (textblock.type.spec.code) return false;

        // Obtener texto/plain
        // Muchas fuentes copian el enlace con un salto de línea o espacios al final: se recortan.
        const text = clipboardData.getData("text/plain").trim();
        if (!text) return false;

        // Rechazar si tiene saltos de línea internos o es muy largo
        if (text.includes("\n") || text.length > MAX_URL_LENGTH) return false;

        // Clasificar URL
        const classification = classifyUrl(text);

        // Solo procesar YouTube e imagen
        if (classification.kind !== "youtube" && classification.kind !== "image") {
          return false;
        }

        // Dos transacciones separadas
        const { state } = view;
        const { from, to } = state.selection;

        // TR1: inserta el texto como enlace
        const linkUrl = text.trim();
        const tr1 = state.tr.insertText(linkUrl, from, to);
        const linkMark = state.schema.marks.link;
        tr1.addMark(from, from + linkUrl.length, linkMark.create({ href: linkUrl }));

        // Despachamos tr1
        view.dispatch(tr1);

        // TR2: crea una nueva transacción a partir del nuevo estado
        const newState = view.state;
        const tr2 = newState.tr;

        if (classification.kind === "youtube") {
          const embedUrl = youtubeEmbedUrl(classification.id, classification.start);
          const htmlNode = newState.schema.nodes.html.create({
            value: `<iframe src="${embedUrl}"></iframe>`,
          });
          tr2.replaceRangeWith(from, from + linkUrl.length, htmlNode);
        } else if (classification.kind === "image") {
          const imageNode = newState.schema.nodes.image.create({
            src: linkUrl,
            alt: "",
          });
          tr2.replaceRangeWith(from, from + linkUrl.length, imageNode);
        }

        // closeHistory en tr2 para separar el historial
        closeHistory(tr2);

        // Dispatch tr2
        view.dispatch(tr2);

        onConverted({ kind: classification.kind });
        view.focus();

        return true;
      },
    },
  });
}
