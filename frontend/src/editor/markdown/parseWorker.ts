/**
 * Worker de parseo (SPEC-0010 RNF-001, RNF-003; PLAN-0010 §10.5, §10.9).
 *
 * Módulo Worker del mismo origen, sin acceso al DOM: recibe el texto de una nota y devuelve su mdast
 * como cadena JSON (la etapa cara de micromark, fuera del hilo principal). No hay ruta nueva hacia el
 * DOM — el hilo principal re-hidrata el JSON con el mismo esquema y los mismos `toDOM` (`cachedParser`).
 * Se instancia con `new Worker(new URL("./parseWorker.ts", import.meta.url), { type: "module" })`, así
 * Vite lo emite en un chunk propio (fuera de la entrada y del editor, RNF-002).
 */
import { parseMarkdownToJson } from "./parseStage";

interface ParseRequest {
  key: string;
  text: string;
}

// `self` tipado a lo mínimo que usa el Worker (sin cargar la lib WebWorker en todo el proyecto).
const worker = self as unknown as {
  addEventListener(type: "message", listener: (event: { data: ParseRequest }) => void): void;
  postMessage(message: { key: string; json: string } | { key: string; error: string }): void;
};

worker.addEventListener("message", ({ data }) => {
  try {
    worker.postMessage({ key: data.key, json: parseMarkdownToJson(data.text) });
  } catch (error) {
    worker.postMessage({ key: data.key, error: error instanceof Error ? error.message : String(error) });
  }
});
