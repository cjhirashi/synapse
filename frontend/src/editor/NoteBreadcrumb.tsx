/**
 * Migas de la nota abierta (SPEC-0010 RF-054, RF-055, RF-063, RF-065; PLAN-0010 §2.3-i, P-17), fieles a
 * la captura de Obsidian: carpetas separadas por «/», cada segmento truncado por sí mismo con «…» y el
 * nombre de la nota —el `h2` del editor— al final. Cada carpeta es un botón que la muestra en el árbol
 * (`onRevealFolder`); el nombre completo de cada segmento va en `title`, así que lo recortado no se pierde.
 *
 * El recorte lo reparte `breadcrumb.fit` con los anchos naturales medidos aquí (`ResizeObserver` sobre el
 * `nav`); lo que cabe no se limita. Sin medidas (ancho 0, jsdom) no se limita nada.
 */
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { crumbs, fit } from "./breadcrumb";

interface NoteBreadcrumbProps {
  /** Ruta completa de la nota (`a/b/c.md`). */
  path: string;
  /** Pedir que el árbol muestre esta carpeta (ruta completa, `a/b`). */
  onRevealFolder: (folderPath: string) => void;
}

export function NoteBreadcrumb({ path, onRevealFolder }: NoteBreadcrumbProps) {
  const { folders, name } = crumbs(path);
  const nav = useRef<HTMLElement>(null);
  /** Ancho máximo de cada segmento (`null` = sin límite): carpetas en orden y el nombre al final. */
  const [limits, setLimits] = useState<Array<number | null>>([]);
  /** Último ancho natural medido de cada segmento: uno oculto (`display: none`) mide 0 y no debe contar como «cabe». */
  const naturalWidths = useRef<{ path: string; widths: number[] }>({ path, widths: [] });

  const measure = useCallback(() => {
    const root = nav.current;
    if (!root || root.clientWidth <= 0) {
      setLimits([]);
      return;
    }
    // `scrollWidth` es el ancho natural aunque ya haya un `max-width` que lo recorte.
    if (naturalWidths.current.path !== path) naturalWidths.current = { path, widths: [] };
    const known = naturalWidths.current.widths;
    const natural = [...root.querySelectorAll<HTMLElement>("[data-crumb]")].map((el, i) => el.scrollWidth || known[i] || 0);
    naturalWidths.current.widths = natural;
    const granted = fit(natural, root.clientWidth);
    setLimits(granted.map((width, i) => (width < natural[i] ? width : null)));
  }, [path]);

  useLayoutEffect(() => {
    measure();
    const root = nav.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [measure, path]);

  /** Un ancho 0 oculta la carpeta y su separador (no cabe ni en su mínimo). */
  const isHidden = (index: number) => limits[index] === 0;
  const style = (index: number) => (limits[index] != null && limits[index] > 0 ? { maxWidth: `${limits[index]}px` } : undefined);

  return (
    <nav ref={nav} className="note-breadcrumb" aria-label="Ruta">
      <ol>
        {folders.map((folder, index) => (
          <li key={folder.path} hidden={isHidden(index)}>
            <button
              type="button"
              data-crumb
              className="note-crumb"
              style={style(index)}
              title={`Mostrar «${folder.name}» en el árbol`}
              onClick={() => onRevealFolder(folder.path)}
            >
              {folder.name}
            </button>
            <span aria-hidden="true" className="note-crumb-sep">
              /
            </span>
          </li>
        ))}
        <li>
          <h2 data-crumb className="note-crumb-name" style={style(folders.length)} aria-current="page" title={[...folders.map((f) => f.name), name].join("/")}>
            {name}
          </h2>
        </li>
      </ol>
    </nav>
  );
}
