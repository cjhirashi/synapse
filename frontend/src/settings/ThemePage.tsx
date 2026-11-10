import ThemeToggle from "../theme/ThemeToggle";

/**
 * Sección Tema (H-028 B3).
 * Muestra el selector de tema y una línea explicativa.
 */
export default function ThemePage() {
  return (
    <section className="theme-page">
      <h1>Tema</h1>
      <p className="theme-description">
        Elige entre tema claro y oscuro para personalizar tu experiencia.
      </p>
      <ThemeToggle />
    </section>
  );
}
