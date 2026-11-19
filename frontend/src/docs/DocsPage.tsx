/**
 * Documentación dentro de la app (H-061): el Manual de Operación como si fuera una bóveda de solo lectura. Usa el mismo marco
 * que una bóveda (`WorkspaceShell`: franja superior con el botón de la barra, barra izquierda con los documentos, documento al
 * centro y barra derecha con el índice de encabezados) y el color de la app (cian) en lugar del de una bóveda. No hay editor,
 * crear, renombrar ni borrar: el texto sale de `manual/` y se lee con `MilkdownView` en Lectura.
 */
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { BookOpen, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import WorkspaceShell from "../layout/WorkspaceShell";
import { useCollapsibleSidebar } from "../layout/useCollapsibleSidebar";
import { AsideToggle, readAsidePreference, writeAsidePreference } from "../notes/AsideToggle";
import DocAside from "../notes/DocAside";
import { chapters, loadChapter } from "./manual";
import "../notes/notes.css";
import "../editor/editor.css";
import "./docs.css";

const MilkdownView = lazy(() => import("../editor/MilkdownView").then((module) => ({ default: module.MilkdownView })));

const ACCENT = "var(--accent)";

export default function DocsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const sidebar = useCollapsibleSidebar();
  const { isMobile, isDesktop, open: sidebarOpen, setOpen: setSidebarOpen } = sidebar;
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Barra derecha: como en una bóveda, fija y recordada en escritorio; oculta en tableta y flotante en móvil.
  const asideId = useId();
  const asideRef = useRef<HTMLDivElement>(null);
  const [asideOpen, setAsideOpen] = useState(() => isDesktop && readAsidePreference());
  useEffect(() => setAsideOpen(isDesktop && readAsidePreference()), [isDesktop, isMobile]);
  const toggleAside = () => {
    const next = !asideOpen;
    setAsideOpen(next);
    if (next && isMobile) setSidebarOpen(false);
    if (isDesktop) writeAsidePreference(next);
  };
  const toggleSidebar = () => {
    if (isMobile && !sidebarOpen) setAsideOpen(false); // en móvil las dos barras flotan en el mismo sitio: una a la vez
    setSidebarOpen((value) => !value);
  };
  useEffect(() => {
    if (!isMobile || !asideOpen) return;
    const onDown = (event: MouseEvent) => {
      const el = event.target as Element;
      if (el?.closest?.("[data-aside-toggle]")) return;
      if (asideRef.current && !asideRef.current.contains(event.target as Node)) setAsideOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAsideOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isMobile, asideOpen]);

  const index = chapters.findIndex((chapter) => chapter.slug === slug);
  const chapter = index >= 0 ? chapters[index] : null;

  // Cada capítulo se descarga al abrirlo; al cambiar, el documento vuelve arriba.
  useEffect(() => {
    setText(null);
    setFailed(false);
    scroller.current?.scrollTo?.({ top: 0 });
    if (!chapter) return;
    let alive = true;
    void loadChapter(chapter.slug)
      .then((body) => alive && (body === null ? setFailed(true) : setText(body)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [chapter]);

  const open = useCallback(
    (target: string) => {
      navigate(`/docs/${target}`);
      if (isMobile) setSidebarOpen(false);
    },
    [navigate, isMobile, setSidebarOpen],
  );

  // `/docs` o un capítulo que no existe llevan al primero.
  if (!chapter) return <Navigate to={`/docs/${chapters[0].slug}`} replace />;

  const previous = index > 0 ? chapters[index - 1] : null;
  const next = index < chapters.length - 1 ? chapters[index + 1] : null;

  return (
    <WorkspaceShell
      sidebar={sidebar}
      onToggle={toggleSidebar}
      noun="la lista de capítulos"
      accent={ACCENT}
      titleStart={
        <span className="vault-chip" style={{ "--chip-color": ACCENT } as CSSProperties} aria-hidden="true">
          <BookOpen size={18} strokeWidth={2} />
        </span>
      }
      title="Manual de Operación"
      titleEnd={<AsideToggle open={asideOpen} controls={asideId} onToggle={toggleAside} />}
      side={
        <aside className="note-sidebar" aria-label="Capítulos del manual" style={{ "--vault-icon-color": ACCENT } as CSSProperties}>
          <div className="vault-tabs" role="tablist" aria-label="Contenido de la documentación">
            <button type="button" role="tab" className="vault-tab" aria-selected="true" tabIndex={0} title="Documentos">
              <FileText size={14} aria-hidden="true" />
              <span>Documentos</span>
            </button>
          </div>
          <div className="note-tree-panel">
            <ul role="tree" aria-label="Capítulos" className="note-tree">
              {chapters.map((item) => (
                <li key={item.slug} role="none">
                  <div className="note-tree-line">
                    <button
                      type="button"
                      role="treeitem"
                      aria-selected={item.slug === chapter.slug}
                      className="note-tree-row note-tree-note"
                      style={{ "--depth": 0 } as CSSProperties}
                      onClick={() => open(item.slug)}
                    >
                      <FileText size={12} aria-hidden="true" className="note-tree-icon-note" />
                      <span className="note-tree-name" title={item.titulo}>{item.titulo}</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      }
    >
      <div className="vault-workspace-main">
        <div ref={setContentEl} className="vault-workspace-content">
          <section className="note-editor system-doc-view docs-doc" aria-label={chapter.titulo}>
            <header className="note-editor-header system-doc-view-header">
              <h2 className="system-doc-view-title">{chapter.titulo}</h2>
              <span className="system-doc-view-badge">Manual · solo lectura</span>
            </header>
            <div className="note-editor-body" ref={scroller}>
              <div className="note-editor-column">
                <p className="docs-description">{chapter.descripcion}</p>
                {failed && (
                  <p className="note-editor-notice" role="alert">
                    No se pudo cargar este capítulo. Revisa tu conexión y vuelve a intentarlo.
                  </p>
                )}
                <Suspense fallback={<p>Cargando el capítulo…</p>}>
                  {text !== null && <MilkdownView key={chapter.slug} value={text} onChange={() => undefined} readOnly label={chapter.titulo} vaultColor="accent" />}
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
              </div>
            </div>
          </section>
        </div>
      </div>
      <DocAside ref={asideRef} id={asideId} open={asideOpen} floating={isMobile} accent={ACCENT} content={contentEl} noteId={chapter.slug} onNavigated={() => setAsideOpen(false)} />
    </WorkspaceShell>
  );
}
