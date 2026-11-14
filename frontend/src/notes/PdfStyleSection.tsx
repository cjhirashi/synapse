/**
 * Contenido de la sección «Diseño del PDF» de la vista de plantilla (H-036): interruptor del botón PDF y, con él encendido, la página,
 * las tipografías, el encabezado y el pie, junto a una vista previa a escala. Formulario controlado sobre `PdfDraft` (ver `pdfStyle.ts`).
 */
import { useEffect, useState } from "react";
import { listVaultFiles } from "../files/uploadFile";
import { PDF_FONTS, PDF_MARGINS, PDF_PAGE_PX, PDF_PAGE_SIZES } from "./metaRules";
import PdfPreview from "./PdfPreview";
import type { PdfBand, PdfDraft, PdfFont, PdfMargin, PdfType } from "./pdfStyle";

const SIZE_LABEL = { carta: "Carta", a4: "A4" } as const;
const MARGIN_LABEL: Record<PdfMargin, string> = { superior: "Superior", inferior: "Inferior", izquierdo: "Izquierdo", derecho: "Derecho" };
const SPECIALS: Array<{ token: string; label: string }> = [
  { token: "{{titulo}}", label: "Título" },
  { token: "{{fecha}}", label: "Fecha" },
  { token: "{{pagina}}", label: "N.º de página" },
  { token: "{{paginas}}", label: "Total de páginas" },
];
type Slot = "izquierda" | "centro" | "derecha";
const SLOT_LABEL: Record<Slot, string> = { izquierda: "Izquierda", centro: "Centro", derecha: "Derecha" };

interface ImageOption { id: string; name: string }

function Group({ title, hint, children, ariaLabel }: { title: string; hint?: string; children: React.ReactNode; ariaLabel?: string }) {
  return (
    <div className="tv-group" role="group" aria-label={ariaLabel ?? title}>
      <div className="tv-group-head">
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function TypeFields({ label, value, onChange }: { label: string; value: PdfType; onChange: (next: PdfType) => void }) {
  return (
    <div className="tv-type" role="group" aria-label={label}>
      <strong className="tv-type-name">{label}</strong>
      <label className="tv-field tv-field--grow">
        <span>Tipografía</span>
        <select value={value.familia} onChange={(event) => onChange({ ...value, familia: event.target.value as PdfFont })}>
          {PDF_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
        </select>
      </label>
      <label className="tv-field tv-field--narrow">
        <span>Tamaño (pt)</span>
        <input type="number" min={6} max={48} step={0.5} value={value.tamano} onChange={(event) => onChange({ ...value, tamano: event.target.value })} />
      </label>
      <label className="tv-field tv-field--color">
        <span>Color</span>
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value.color) ? value.color : "#000000"} onChange={(event) => onChange({ ...value, color: event.target.value })} />
      </label>
    </div>
  );
}

function BandFields({ label, imageLabel, imageHint, value, images, attributes, onChange }: {
  label: string; imageLabel?: string; imageHint?: string; value: PdfBand; images: ImageOption[]; attributes: string[]; onChange: (next: PdfBand) => void;
}) {
  const [slot, setSlot] = useState<Slot>("izquierda");
  const insert = (token: string) => onChange({ ...value, [slot]: value[slot] + token });
  const known = images.some((image) => image.id === value.imagen);
  return (
    <Group title={label}>
      {imageLabel !== undefined && (
        <label className="tv-field">
          <span>{imageLabel}</span>
          <select value={value.imagen} onChange={(event) => onChange({ ...value, imagen: event.target.value })}>
            <option value="">Sin imagen</option>
            {value.imagen !== "" && !known && <option value={value.imagen}>Archivo {value.imagen} (no encontrado)</option>}
            {images.map((image) => <option key={image.id} value={image.id}>{image.name}</option>)}
          </select>
        </label>
      )}
      {imageHint && <p className="tv-hint">{imageHint}</p>}
      <div className="tv-slots">
        {(Object.keys(SLOT_LABEL) as Slot[]).map((key) => (
          <label className="tv-field" key={key}>
            <span>{SLOT_LABEL[key]}</span>
            <input
              aria-label={`${label}, ${SLOT_LABEL[key].toLowerCase()}`}
              maxLength={200}
              value={value[key]}
              onFocus={() => setSlot(key)}
              onChange={(event) => onChange({ ...value, [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="tv-insert" role="group" aria-label={`Insertar campo en ${label.toLowerCase()} (${SLOT_LABEL[slot].toLowerCase()})`}>
        <span>Insertar en «{SLOT_LABEL[slot]}»:</span>
        {SPECIALS.map((special) => (
          <button key={special.token} type="button" className="tv-chip-btn" onClick={() => insert(special.token)}>{special.label}</button>
        ))}
        {attributes.length > 0 && (
          <select aria-label="Insertar un atributo" value="" onChange={(event) => event.target.value && insert(`{{atributo:${event.target.value}}}`)}>
            <option value="">Atributo…</option>
            {attributes.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
      </div>
    </Group>
  );
}

export interface PdfStyleSectionProps {
  vaultId: string;
  draft: PdfDraft;
  attributeNames: string[];
  onChange: (next: PdfDraft) => void;
}

export default function PdfStyleSection({ vaultId, draft, attributeNames, onChange }: PdfStyleSectionProps) {
  const [images, setImages] = useState<ImageOption[]>([]);
  useEffect(() => {
    let alive = true;
    listVaultFiles(vaultId)
      .then((files) => alive && setImages(files.filter((file) => file.content_type.startsWith("image/")).map((file) => ({ id: file.id, name: file.name }))))
      .catch(() => undefined);
    return () => { alive = false; };
  }, [vaultId]);

  const set = <K extends keyof PdfDraft>(key: K, value: PdfDraft[K]) => onChange({ ...draft, [key]: value });
  const names = attributeNames.filter((name) => name.trim() !== "");
  const [width, height] = PDF_PAGE_PX[draft.tamano];

  return (
    <div className="tv-pdf">
      <label className="tv-toggle">
        <input type="checkbox" className="tv-switch" checked={draft.activo} onChange={(event) => set("activo", event.target.checked)} />
        <span className="tv-toggle-text">
          <strong>Permitir descargar los documentos de esta plantilla como PDF</strong>
          <span>Los documentos muestran un botón «PDF» junto a «Editar» que los descarga con este formato.</span>
        </span>
      </label>
      <div className="tv-pdf-grid" data-active={draft.activo}>
        <fieldset className="tv-pdf-fields" disabled={!draft.activo}>
          <Group title="Página">
            <div className="tv-row">
              <label className="tv-field tv-field--grow">
                <span>Tamaño</span>
                <select value={draft.tamano} onChange={(event) => set("tamano", event.target.value as PdfDraft["tamano"])}>
                  {PDF_PAGE_SIZES.map((size) => <option key={size} value={size}>{SIZE_LABEL[size]}</option>)}
                </select>
              </label>
              <p className="tv-row-caption">Márgenes (mm)</p>
              {PDF_MARGINS.map((key) => (
                <label className="tv-field tv-field--narrow" key={key}>
                  <span>{MARGIN_LABEL[key]}</span>
                  <input type="number" min={0} max={60} value={draft.margenes[key]} onChange={(event) => set("margenes", { ...draft.margenes, [key]: event.target.value })} />
                </label>
              ))}
            </div>
          </Group>
          <Group title="Tipografía" ariaLabel="Tipografía y color">
            <TypeFields label="Encabezados" value={draft.encabezados} onChange={(next) => set("encabezados", next)} />
            <TypeFields label="Texto" value={draft.texto} onChange={(next) => set("texto", next)} />
          </Group>
          <BandFields
            label="Encabezado de página"
            imageLabel={`Imagen de fondo de la página (archivo de la bóveda) · tamaño: ${width} × ${height} px`}
            imageHint={`La imagen se pone como fondo de cada página, desde la esquina superior izquierda, con el ancho de la hoja (${width} px en ${SIZE_LABEL[draft.tamano]}) y la altura proporcional: no se deforma. Para cubrir toda la hoja, súbela de ${width} × ${height} px. Los textos de abajo se imprimen encima.`}
            value={draft.encabezado} images={images} attributes={names} onChange={(next) => set("encabezado", next)}
          />
          <BandFields label="Pie de página" value={draft.pie} images={images} attributes={names} onChange={(next) => set("pie", next)} />
          <label className="tv-check">
            <input type="checkbox" checked={draft.incluirAtributos} onChange={(event) => set("incluirAtributos", event.target.checked)} />
            Imprimir los atributos del documento al inicio
          </label>
        </fieldset>
        <aside className="tv-pdf-side" aria-label="Vista previa">
          <PdfPreview draft={draft} />
          <p className="tv-hint">Publicar en la web: próximamente (H-035).</p>
        </aside>
      </div>
    </div>
  );
}
