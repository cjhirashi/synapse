/**
 * Tarjeta flotante de vista previa de un wikilink en Lectura (H-021, estilo Obsidian).
 *
 * `MilkdownView` detecta el hover sobre un wikilink y lo entrega por `onWikilinkHover`; el padre
 * (`NoteEditor`) guarda ese `hover` y lo pasa aquí. Esta tarjeta:
 *  - aparece tras un retardo (~400 ms, P-3/C-1) y se cierra al salir del enlace Y de la tarjeta, con un
 *    breve periodo de gracia para poder pasar el puntero del enlace a la tarjeta sin que se cierre (C-3);
 *  - se pinta por portal en `document.body`, con `position: fixed` (coordenadas de `getBoundingClientRect`,
 *    que ya son del viewport): así queda sobre el editor y se reposiciona arriba si no cabe debajo, sin
 *    provocar scroll (C-3);
 *  - resuelto: muestra el título (nombre de archivo sin `.md`) y el inicio del cuerpo RENDERIZADO con una
 *    instancia de la vista de sólo lectura (hereda los colores de la bóveda, H-014), sin el bloque de
 *    propiedades YAML del inicio (P-1) y con los wikilinks internos INERTES (sin hover ni clic, C-4);
 *  - nota vacía (o sin cuerpo tras el bloque): título + «Nota vacía» (C-8);
 *  - roto sin extensión de archivo ajena: tarjeta pequeña «Esta nota no existe. Clic para crearla» (C-6);
 *    con extensión ajena (`hasUnmanagedExtension`) no se muestra tarjeta (C-6);
 *  - RNF-003: no hay HTML crudo; todo el DOM lo crea React o la vista reutilizada.
 *
 * El gate de «sólo con puntero» (C-5) y de modo Lectura vive en `NoteEditor`: si el dispositivo no tiene
 * puntero fino, o la nota está en edición, no se monta esta tarjeta.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { splitLegacyBlock } from "./legacyBlock";
import { hasUnmanagedExtension, type NoteRef } from "./wikilink";
import type { ViewProps } from "./NoteEditor";
import type { Note } from "../notes/noteStore";
import type { PaletteKey } from "../vaults/vaultIcon";

/** Lo que `MilkdownView.onWikilinkHover` emite: el enlace bajo el puntero y su rectángulo en el viewport. */
export interface WikilinkHoverTarget {
  resolvedId: string | null;
  target: string;
  rect: DOMRect;
}

interface WikilinkPreviewProps {
  /** Enlace bajo el puntero ahora (`null` = ninguno). Lo entrega `MilkdownView` vía `NoteEditor`. */
  hover: WikilinkHoverTarget | null;
  /** Lectura de la nota destino desde la réplica local (sin red). */
  notes: { get(id: string): Promise<Note> };
  /** Vista de sólo lectura para renderizar el cuerpo (el `MilkdownView` real; inyectable en pruebas). */
  View: ComponentType<ViewProps>;
  /** Notas vivas para resolver los wikilinks DENTRO de la tarjeta (se pasan a la vista, que no los hace navegables). */
  vaultNotes?: readonly NoteRef[];
  /** Color de la bóveda (H-014) para el cuerpo renderizado. */
  vaultColor?: PaletteKey;
  /** El usuario quiere crear la nota rota (clic en la tarjeta): el padre crea y abre (C-7). */
  onCreate: (target: string) => void;
  /** Retardo antes de mostrar (ms); por defecto 400 (P-3). Parametrizable para pruebas. */
  delayMs?: number;
}

/** Periodo de gracia para pasar el puntero del enlace a la tarjeta sin que se cierre (C-3). */
const CLOSE_GRACE_MS = 140;
/** Ancho de la tarjeta (P-2) y margen mínimo con el borde de la ventana. */
const CARD_WIDTH = 320;
const EDGE_GAP = 8;
/** Líneas que se renderizan como máximo: la tarjeta recorta a ~12 con desvanecido (P-2), esto acota el trabajo. */
const PREVIEW_LINES = 24;

/** Nombre de archivo sin `.md` (P-1: el título de la tarjeta). */
function titleOf(path: string): string {
  return (path.split("/").at(-1) ?? path).replace(/\.md$/i, "");
}

/** El cuerpo mostrado: sin el bloque YAML heredado del inicio (P-1) y acotado a `PREVIEW_LINES`. */
function previewBody(content: string): string {
  const legacy = splitLegacyBlock(content);
  const body = (legacy ? legacy.rest : content).replace(/^\n+/, "");
  const lines = body.split("\n");
  return lines.length > PREVIEW_LINES ? lines.slice(0, PREVIEW_LINES).join("\n") : body;
}

/** ¿Hay más contenido del que entra en ~12 líneas? Gobierna el desvanecido del final (P-2). */
function hasMore(content: string): boolean {
  const legacy = splitLegacyBlock(content);
  const body = (legacy ? legacy.rest : content).replace(/^\n+/, "");
  return body.split("\n").length > 12 || body.length > 480;
}

interface Loaded {
  title: string;
  body: string;
  more: boolean;
}

export function WikilinkPreview({ hover, notes, View, vaultNotes, vaultColor, onCreate, delayMs = 400 }: WikilinkPreviewProps) {
  /** Enlace cuya tarjeta está programada o visible. */
  const [active, setActive] = useState<WikilinkHoverTarget | null>(null);
  /** La tarjeta ya pasó el retardo y puede pintarse. */
  const [visible, setVisible] = useState(false);
  /** Contenido resuelto de la nota destino (`null` mientras carga o si está roto). */
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** Posición calculada de la tarjeta (arriba/abajo del enlace, dentro de la ventana). */
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  /** El puntero está sobre la tarjeta: entonces salir del enlace no la cierra (C-3). */
  const overCard = useRef(false);
  const cardEl = useRef<HTMLDivElement | null>(null);

  /** Cierra tras el periodo de gracia, salvo que el puntero haya entrado a la tarjeta. */
  const scheduleClose = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (!overCard.current) {
        setActive(null);
        setVisible(false);
      }
    }, CLOSE_GRACE_MS);
  }, []);

  // El enlace bajo el puntero cambió: programa mostrar (tras el retardo) o cerrar (tras la gracia).
  useEffect(() => {
    if (hover) {
      clearTimeout(closeTimer.current);
      clearTimeout(openTimer.current);
      setActive(hover);
      setVisible(false);
      openTimer.current = setTimeout(() => setVisible(true), delayMs);
    } else {
      clearTimeout(openTimer.current);
      scheduleClose();
    }
  }, [hover, delayMs, scheduleClose]);

  // Al desmontar, cancela los temporizadores pendientes.
  useEffect(() => () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  }, []);

  // Carga la nota destino resuelta desde la réplica (sin red). Un enlace roto no carga nada.
  useEffect(() => {
    if (!active || active.resolvedId === null) {
      setLoaded(null);
      return;
    }
    let alive = true;
    notes.get(active.resolvedId).then(
      (note) => {
        if (alive) setLoaded({ title: titleOf(note.path), body: previewBody(note.content), more: hasMore(note.content) });
      },
      () => {
        if (alive) setLoaded(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [active, notes]);

  /** Entrar/salir de la tarjeta por listeners DOM nativos (no se pierden al pasar el puntero del enlace a ella). */
  const onCardEnter = useCallback(() => {
    overCard.current = true;
    clearTimeout(closeTimer.current);
  }, []);
  const onCardLeave = useCallback(() => {
    overCard.current = false;
    scheduleClose();
  }, [scheduleClose]);

  // Ref de la tarjeta: adjunta los listeners de entrada/salida al nodo real (mouseenter no burbujea).
  const attachCard = useCallback(
    (el: HTMLDivElement | null) => {
      const prev = cardEl.current;
      if (prev) {
        prev.removeEventListener("mouseenter", onCardEnter);
        prev.removeEventListener("mouseleave", onCardLeave);
      }
      cardEl.current = el;
      if (el) {
        el.addEventListener("mouseenter", onCardEnter);
        el.addEventListener("mouseleave", onCardLeave);
      }
    },
    [onCardEnter, onCardLeave],
  );

  // Reposiciona la tarjeta junto al enlace: debajo si cabe, si no arriba; y dentro de la ventana (C-3).
  useLayoutEffect(() => {
    if (!active || !visible) return;
    const el = cardEl.current;
    if (!el) return;
    const rect = active.rect;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const height = el.offsetHeight;
    const below = rect.bottom + EDGE_GAP;
    const fitsBelow = below + height <= vh - EDGE_GAP;
    const top = fitsBelow ? below : Math.max(EDGE_GAP, rect.top - EDGE_GAP - height);
    const left = Math.min(Math.max(EDGE_GAP, rect.left), Math.max(EDGE_GAP, vw - CARD_WIDTH - EDGE_GAP));
    setCoords({ top, left });
  }, [active, visible, loaded]);

  if (!active || !visible) return null;

  // Estilo base: `fixed` con las coordenadas calculadas; antes de medir, cae debajo del enlace.
  const style: CSSProperties = {
    position: "fixed",
    top: coords?.top ?? active.rect.bottom + EDGE_GAP,
    left: coords?.left ?? active.rect.left,
    width: CARD_WIDTH,
  };

  // Enlace roto: con extensión de archivo ajena no hay tarjeta (C-6); si no, aviso clickeable para crearla.
  if (active.resolvedId === null) {
    if (hasUnmanagedExtension(active.target)) return null;
    return createPortal(
      <div ref={attachCard} data-wikilink-preview className="wikilink-preview wikilink-preview--broken" style={style}>
        <button type="button" className="wikilink-preview-create" onClick={() => onCreate(active.target)}>
          Esta nota no existe. Clic para crearla
        </button>
      </div>,
      document.body,
    );
  }

  // Resuelto pero aún cargando: no se pinta nada hasta tener el contenido (la réplica es local, es inmediato).
  if (!loaded) return null;

  const empty = loaded.body.trim() === "";
  return createPortal(
    <div ref={attachCard} data-wikilink-preview className="wikilink-preview" style={style}>
      <p className="wikilink-preview-title">{loaded.title}</p>
      {empty ? (
        <p className="wikilink-preview-empty">Nota vacía</p>
      ) : (
        <div className="wikilink-preview-body" data-more={loaded.more ? "" : undefined}>
          <View value={loaded.body} onChange={noop} label="Vista previa del documento" readOnly notes={vaultNotes} vaultColor={vaultColor} />
        </div>
      )}
    </div>,
    document.body,
  );
}

/** La vista de sólo lectura nunca emite cambios; su `onChange` es obligatorio pero inerte aquí. */
function noop() {}
