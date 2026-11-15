/**
 * *Node view* de los contenedores del documento (`pdf_block`, ver `markdown/pdfBlocks.ts`): el comentario de revisión se dibuja como una ventana gris con la
 * foto y el nombre de quien lo dejó (la persona o un agente) y el día; el resto de contenedores (portada, alineación, columnas) se pintan exactamente como
 * los define el esquema (`toDOM`).
 *
 * El comentario guarda solo el id del autor (`data-autor`): foto y nombre salen del perfil vigente, así que si cambian se ven al día. La cabecera queda fuera
 * del contenido editable; el cuerpo es Markdown normal. Nunca entra al PDF (`pdfHtml.ts` lo quita y el servidor lo oculta).
 */
import { DOMSerializer, type Node as PMNode } from "@milkdown/prose/model";
import type { NodeView, NodeViewConstructor } from "@milkdown/prose/view";
import { agentName, peekAgentProfiles, subscribeAgentProfiles } from "../agents/agentProfiles";
import { initials } from "../vaults/vaultIcon";
import "../settings/UserAvatar.css";

/** La persona que usa Synapse (lo que `MeContext` expone de ella). */
export interface CommentPerson { name: string; photoUrl: string | null }

/** Autor que identifica a la persona en el Markdown; cualquier otro valor es el id de un agente. */
export const COMMENT_PERSON = "usuario";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2026-11-15» → «15 nov 2026»; lo que no tenga esa forma se muestra tal cual. */
export function commentDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : date;
}

/** Día de hoy en la zona de la persona (AAAA-MM-DD, CDMX), el que lleva un comentario nuevo. */
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function plain(node: PMNode): NodeView {
  const { dom, contentDOM } = DOMSerializer.renderSpec(document, node.type.spec.toDOM!(node));
  return {
    dom,
    contentDOM: contentDOM ?? undefined,
    update: (next) => next.type === node.type && JSON.stringify(next.attrs) === JSON.stringify(node.attrs),
  };
}

class CommentView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly head: HTMLElement;
  private readonly stop: () => void;

  constructor(private node: PMNode, private readonly person: () => CommentPerson | null) {
    this.dom = document.createElement("div");
    this.dom.className = "comentario";
    this.dom.setAttribute("role", "note");
    this.head = document.createElement("div");
    this.head.className = "comentario-head";
    this.head.setAttribute("contenteditable", "false");
    this.contentDOM = document.createElement("div");
    this.contentDOM.className = "comentario-body";
    this.dom.append(this.head, this.contentDOM);
    this.paint();
    this.stop = subscribeAgentProfiles(() => this.paint());
  }

  /** Foto (o iniciales), nombre y día del autor, con los perfiles vigentes. */
  private paint(): void {
    const author = String(this.node.attrs.value ?? "");
    const date = String(this.node.attrs.date ?? "");
    const isPerson = author === COMMENT_PERSON || author === "";
    const profile = isPerson ? null : peekAgentProfiles()[author] ?? null;
    const me = isPerson ? this.person() : null;
    const name = isPerson ? me?.name || "Yo" : agentName(author, peekAgentProfiles());
    const photo = isPerson ? me?.photoUrl ?? null : profile?.photo_url ?? null;

    const avatar = document.createElement("span");
    avatar.className = "settings-avatar-container comentario-avatar";
    avatar.style.cssText = "width:32px;height:32px;font-size:11px";
    avatar.setAttribute("aria-hidden", "true");
    if (photo) {
      const img = document.createElement("img");
      img.className = "settings-avatar";
      img.src = photo;
      img.alt = "";
      avatar.append(img);
    } else {
      const fallback = document.createElement("span");
      fallback.className = "settings-avatar-placeholder";
      fallback.textContent = initials(name);
      avatar.append(fallback);
    }
    const label = document.createElement("strong");
    label.className = "comentario-autor";
    label.textContent = name;
    const kind = document.createElement("span");
    kind.className = "comentario-tipo";
    kind.textContent = isPerson ? "comentario" : "comentario de agente";
    this.head.replaceChildren(avatar, label, kind);
    if (date) {
      const when = document.createElement("time");
      when.className = "comentario-fecha";
      when.dateTime = date;
      when.textContent = commentDate(date);
      this.head.append(when);
    }
    this.dom.setAttribute("aria-label", `Comentario de ${name}${date ? `, ${commentDate(date)}` : ""}`);
    this.dom.setAttribute("data-autor", author);
  }

  update(next: PMNode): boolean {
    if (next.type !== this.node.type || next.attrs.kind !== "comment") return false;
    this.node = next;
    this.paint();
    return true;
  }

  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
    return !this.contentDOM.contains(mutation.target);
  }

  stopEvent(event: Event): boolean {
    return event.target instanceof Node && this.head.contains(event.target);
  }

  destroy(): void {
    this.stop();
  }
}

/** Vista de `pdf_block`: el comentario con su cabecera; cualquier otro contenedor, como lo define el esquema. `person` da quién es «usuario» (se lee al pintar). */
export const commentViewFactory = (person: () => CommentPerson | null): NodeViewConstructor => (node) =>
  node.attrs.kind === "comment" ? new CommentView(node, person) : plain(node);
