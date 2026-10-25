/**
 * Plugin que parsea desde la caché de mdast (SPEC-0010 RNF-001, PLAN-0010 §10.3, §10.9).
 *
 * Envuelve `parserCtx` entre `ParserReady` y `EditorStateReady` (añade su propio timer a
 * `editorStateTimerCtx`, así el estado del editor espera a que la envoltura esté puesta antes de
 * construir el documento). Al parsear:
 *  - si el que abre la nota dejó en `preparsedMdastCtx` el JSON mdast de esa revisión (cache-hit), se
 *    re-hidrata con el procesador real del editor (`remarkCtx.runSync` + mdast→ProseMirror) — sin
 *    volver a correr micromark en el hilo principal — y se marca `synapse:parse:cache-hit`;
 *  - si no hay JSON (o es incompatible), se parsea en frío como hoy y se marca `synapse:parse:cold`.
 *
 * No toca el DOM ni la serialización: usa la API pública de Milkdown (`parserCtx`, `remarkCtx`,
 * `schemaCtx`, `ParserState`). Los ids de encabezado se fijan aparte, sobre el documento ya construido
 * (`editorStateOptionsCtx` en `MilkdownView`, §10.1), así que esta ruta es idéntica en frío y caliente.
 */
import { ParserReady, editorStateTimerCtx, parserCtx, remarkCtx, schemaCtx } from "@milkdown/core";
import { createSlice, createTimer, type MilkdownPlugin } from "@milkdown/ctx";
import type { Node as PMNode, Schema } from "@milkdown/prose/model";
import { ParserState, type RemarkParser } from "@milkdown/transformer";

/** Marcas de rendimiento que leen las pruebas para demostrar qué ruta tomó cada apertura (§10.8). */
export const PARSE_MARK = {
  cacheHit: "synapse:parse:cache-hit",
  cold: "synapse:parse:cold",
  inflight: "synapse:parse:inflight",
} as const;

/** `performance.mark` sólo donde existe (jsdom/Chromium lo tienen; nunca rompe la apertura). */
function mark(name: string): void {
  if (typeof performance !== "undefined" && typeof performance.mark === "function") performance.mark(name);
}

/**
 * JSON del mdast que debe usar el PRÓXIMO parseo de este editor, o `null` para parsear en frío. Lo
 * pone quien abre la nota (sólo cuando el texto a abrir ES el `content` guardado de esa revisión).
 */
export const preparsedMdastCtx = createSlice<string | null, "synapsePreparsedMdast">(null, "synapsePreparsedMdast");

/**
 * Re-hidrata un documento de ProseMirror desde el mdast cacheado: aplica los transformadores reales
 * del editor (`remark.runSync`, que lee `position`) y construye el documento con el esquema real. Es
 * la etapa barata (~5 ms); la cara (micromark) ya se hizo al cachear.
 */
export function docFromMdastJson(remark: RemarkParser, schema: Schema, json: string, text: string): PMNode {
  const tree = remark.runSync(JSON.parse(json), text);
  const state = new ParserState(schema);
  state.next(tree as never);
  return state.toDoc();
}

const CachedParserReady = createTimer("SynapseCachedParserReady");

export const cachedParser: MilkdownPlugin = (ctx) => {
  ctx.inject(preparsedMdastCtx, null);
  ctx.record(CachedParserReady);
  // El estado del editor debe esperar a que `parserCtx` esté envuelto antes de construir el documento.
  ctx.update(editorStateTimerCtx, (timers) => (timers.includes(CachedParserReady) ? timers : [...timers, CachedParserReady]));
  return async () => {
    await ctx.wait(ParserReady);
    const base = ctx.get(parserCtx);
    const remark = ctx.get(remarkCtx);
    const schema = ctx.get(schemaCtx);
    ctx.set(parserCtx, (text: string) => {
      const json = ctx.get(preparsedMdastCtx);
      if (json) {
        try {
          const doc = docFromMdastJson(remark, schema, json, text);
          mark(PARSE_MARK.cacheHit);
          return doc;
        } catch {
          // JSON corrupto o de otra versión del esquema: nunca rompe la apertura, se parsea en frío.
        }
      }
      mark(PARSE_MARK.cold);
      return base(text);
    });
    ctx.done(CachedParserReady);
    return () => {
      ctx.clearTimer(CachedParserReady);
    };
  };
};
