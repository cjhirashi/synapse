/**
 * Documentación dentro de la app (H-061): el Manual de Operación, capítulo por capítulo, de solo lectura.
 * Reutiliza el marco de la pantalla de usuario (`settings-*`: barra lateral + contenido, flotante en móvil) y el
 * lector de notas (`MilkdownView` en Lectura), así que el texto y las imágenes con zoom se ven igual que en una nota
 * (los campos de atributo ya vienen resueltos en el texto). El riel de bóvedas se queda a la izquierda: se llega desde su botón «Documentación».
 */
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, PanelLeft, PanelLeftClose } from "lucide-react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import { useMediaQuery } from "../layout/useMediaQuery";
import { chapters, loadChapter } from "./manual";
import "../settings/settings.css";
import "./docs.css";

const MilkdownView = lazy(() => import("../editor/MilkdownView").then((module) => ({ default: module.MilkdownView })));

export default function DocsPage() {
  const { slug } = useParams();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const sideId = useId();
  const sideRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLElement>(null);

  const index = chapters.findIndex((chapter) => chapter.slug === slug);
  const chapter = index >= 0 ? chapters[index] : null;

  // Cada capítulo se descarga al abrirlo; al cambiar, el lector vuelve arriba y el menú móvil se cierra.
  useEffect(() => {
    setOpen(false);
    setText(null);
    setFailed(false);
    contentRef.current?.scrollTo({ top: 0 });
    if (!chapter) return;
    let alive = true;
    void loadChapter(chapter.slug)
      .then((body) => alive && (body === null ? setFailed(true) : setText(body)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [chapter]);

  useEffect(() => setOpen(false), [isMobile]);

  useEffect(() => {
    if (!isMobile || !open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!sideRef.current?.contains(target) && !toggleRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isMobile, open]);

  // `/docs` o un capítulo que no existe llevan al primero.
  if (!chapter) return <Navigate to={`/docs/${chapters[0].slug}`} replace />;

  const previous = index > 0 ? chapters[index - 1] : null;
  const next = index < chapters.length - 1 ? chapters[index + 1] : null;
  const toggleLabel = open ? "Ocultar la lista de capítulos" : "Mostrar la lista de capítulos";

  return (
    <div className="settings-page docs-page">
      <div className="settings-titlebar">
        <button ref={toggleRef} type="button" className="settings-toggle" aria-expanded={open} aria-controls={sideId} aria-label={toggleLabel} title={toggleLabel} onClick={() => setOpen((value) => !value)}>
          {open ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeft size={18} aria-hidden="true" />}
        </button>
        <span className="settings-titlebar-name">{chapter.titulo}</span>
      </div>

      <div className="settings-body">
        <aside ref={sideRef} id={sideId} className="settings-side" data-floating={isMobile ? "" : undefined} data-open={open ? "" : undefined}>
          <header className="docs-side-header">
            <BookOpen size={20} aria-hidden="true" />
            <div>
              <h1>Manual de Operación</h1>
              <p>{chapter.programa}</p>
            </div>
          </header>
          <nav className="settings-nav" aria-label="Capítulos del manual">
            {chapters.map((item) => (
              <NavLink key={item.slug} to={`/docs/${item.slug}`} className={({ isActive }) => (isActive ? "active" : "")}>
                <span>{item.titulo}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main ref={contentRef} className="settings-content docs-content">
          <p className="docs-description">{chapter.descripcion}</p>
          {failed && (
            <p className="note-editor-notice" role="alert">
              No se pudo cargar este capítulo. Revisa tu conexión y vuelve a intentarlo.
            </p>
          )}
          <Suspense fallback={<p>Cargando el capítulo…</p>}>
            {text !== null && (
              <MilkdownView key={chapter.slug} value={text} onChange={() => undefined} readOnly label={chapter.titulo} />
            )}
          </Suspense>
          <nav className="docs-pager" aria-label="Capítulo anterior y siguiente">
            {previous ? (
              <Link to={`/docs/${previous.slug}`} className="docs-pager-link" rel="prev">
                <ChevronLeft size={18} aria-hidden="true" />
                <span>
                  <small>Anterior</small>
                  {previous.titulo}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={`/docs/${next.slug}`} className="docs-pager-link docs-pager-next" rel="next">
                <span>
                  <small>Siguiente</small>
                  {next.titulo}
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            )}
          </nav>
        </main>
      </div>
    </div>
  );
}
