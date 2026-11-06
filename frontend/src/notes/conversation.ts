/**
 * Formato de las rutas de `AG - MENSAJES` (H-042): una conversación es la carpeta `<de> → <para> - <asunto> - <AAAA-MM-DD>`
 * y cada documento es `000-cabecera.md` o `NNN-de-<id>.md`. Espejo de `backend/app/core/conversation_rules.py::parse_mensaje_path`
 * (los mismos casos, `backend/tests/fixtures/conversaciones_reglas.json`, los recorren las dos pruebas). Solo sirve para
 * mostrar: quien decide es el servidor.
 */
import { pathKey } from "./noteRules";

const ID = "[a-z0-9][a-z0-9-]{0,31}";
const FOLDER = new RegExp(`^(${ID}) → (${ID}) - (.+) - (\\d{4}-\\d{2}-\\d{2})$`, "s");
const MESSAGE = new RegExp(`^(\\d{3})-de-(${ID})\\.md$`);
const ASUNTO_MAX = 100;
const NUMBER_MAX = 999;

export interface Conversation {
  de: string;
  para: string;
  asunto: string;
  inicio: string;
}

export interface MensajePath extends Partial<Conversation> {
  kind: "indice" | "cabecera" | "mensaje";
  sender?: string;
  number?: number;
}

function realDate(text: string): boolean {
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** La conversación que describe el nombre de una carpeta, o `null` si no cabe en el formato. */
export function parseConversation(name: string): Conversation | null {
  const match = FOLDER.exec(name);
  if (!match) return null;
  const [, de, para, asunto, inicio] = match;
  if (de === para || asunto.trim() === "" || [...asunto].length > ASUNTO_MAX || !realDate(inicio)) return null;
  return { de, para, asunto, inicio };
}

/** La estructura de una ruta bajo `AG - MENSAJES/`, o `null` si no cabe en el formato. */
export function parseMensajePath(path: string): MensajePath | null {
  const parts = path.split("/");
  if (parts.length < 2 || pathKey(parts[0]) !== pathKey("AG - MENSAJES")) return null;
  const rest = parts.slice(1);
  const isIndex = pathKey(parts[parts.length - 1]) === pathKey("INDICE.md");
  if (isIndex && rest.length === 1) return { kind: "indice" };
  if (rest.length !== 2) return null;
  const conversation = parseConversation(rest[0]);
  if (!conversation) return null;
  if (isIndex) return { kind: "indice", ...conversation };
  if (rest[1] === "000-cabecera.md") return { kind: "cabecera", ...conversation };
  const match = MESSAGE.exec(rest[1]);
  if (match && Number(match[1]) >= 1 && Number(match[1]) <= NUMBER_MAX) {
    return { kind: "mensaje", ...conversation, sender: match[2], number: Number(match[1]) };
  }
  return null;
}
