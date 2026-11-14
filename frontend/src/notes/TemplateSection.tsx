/** Tarjeta de una sección de la vista de plantilla: número, título y descripción; el cuerpo y un control opcional a la derecha (H-036 rediseño). */
import type { ReactNode } from "react";

export interface TemplateSectionProps {
  step: number;
  title: string;
  description?: string;
  /** Control del encabezado de la tarjeta (a la derecha). */
  aside?: ReactNode;
  children: ReactNode;
}

export default function TemplateSection({ step, title, description, aside, children }: TemplateSectionProps) {
  const id = `tv-sec-${step}`;
  return (
    <section className="tv-card" aria-labelledby={id}>
      <header className="tv-card-head">
        <span className="tv-step" aria-hidden="true">{step}</span>
        <div className="tv-card-title">
          <h3 id={id}>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {aside && <div className="tv-card-aside">{aside}</div>}
      </header>
      <div className="tv-card-body">{children}</div>
    </section>
  );
}
