/**
 * Contenido de la sección «Diseño del PDF» de la vista de plantilla (H-036): interruptor del botón PDF y, con él encendido, la página,
 * las tipografías, el encabezado y el pie, junto a una vista previa a escala. Formulario controlado sobre `PdfDraft` (ver `pdfStyle.ts`).
 */
import { useEffect, useState } from "react";
import { listVaultFiles } from "../files/uploadFile";
import { PDF_BAND_MM, PDF_FONTS, PDF_HEADING_LEVELS, PDF_LINE_PT, PDF_MARGINS, PDF_PAGE_PX, PDF_PAGE_SIZES } from "./metaRules";
import PdfPreview from "./PdfPreview";
import { headingColor, themeColors, type HeadingLevel, type PdfBand, type PdfDraft, type PdfFont, type PdfLine, type PdfMargin, type PdfType } from "./pdfStyle";

const SIZE_LABEL = { carta: "Carta", a4: "A4" } as const;
const MARGIN_LABEL: Record<PdfMargin, string> = { superior: "Superior", inferior: "Inferior", izquierdo: "Izquierdo", derecho: "Derecho" };
const SPECIALS: Array<{ token: string; label: string }> = [
  { token: "{{titulo}}", label: "Título" },
  { token: "{{fecha}}", label: "Fecha" },
  { token: "{{pagina}}", label: "N.º de página" },
  { token: "{{paginas}}", label: "Total de páginas" },
];
const HEADING_LABEL: Record<HeadingLevel, string> = {
  h1: "Encabezado 1 (H1)", h2: "Encabezado 2 (H2)", h3: "Encabezado 3 (H3)", h4: "Encabezado 4 (H4)",
};
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

function TypeFields({ label, ariaLabel, value, onChange, autoColor }: {
  label: string; ariaLabel?: string; value: PdfType; onChange: (next: PdfType) => void;
  /** Con tema de color: el color que da el tema a este nivel. `value.color === ""` significa «automático». */
  autoColor?: string;
}) {
  const auto = autoColor !== undefined && value.color === "";
  const shown = auto ? autoColor : value.color;
  return (
    <div className="tv-type" role="group" aria-label={ariaLabel ?? label}>
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
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(shown) ? shown : "#000000"} onChange={(event) => onChange({ ...value, color: event.target.value })} />
      </label>
      {autoColor !== undefined && (
        <span className="tv-auto">
          {auto ? <em>Color automático del tema</em> : (
            <button type="button" className="tv-chip-btn" aria-label={`${label}: volver al color automático`} onClick={() => onChange({ ...value, color: "" })}>Usar el del tema</button>
          )}
        </span>
      )}
    </div>
  );
}

function ThemeFields({ draft, onChange }: { draft: PdfDraft; onChange: (next: PdfDraft) => void }) {
  const colors = themeColors(draft);
  const toggle = (active: boolean) => {
    if (active) {
      // Al encender el tema los encabezados pasan a «automático».
      const encabezados = Object.fromEntries(PDF_HEADING_LEVELS.map((level) => [level, { ...draft.encabezados[level], color: "" }])) as PdfDraft["encabezados"];
      onChange({ ...draft, tema: { ...draft.tema, activo: true }, encabezados });
    } else {
      // Al apagarlo cada nivel conserva el color que se veía: nada «salta».
      const encabezados = Object.fromEntries(PDF_HEADING_LEVELS.map((level) => [level, { ...draft.encabezados[level], color: headingColor(draft, level) }])) as PdfDraft["encabezados"];
      onChange({ ...draft, tema: { ...draft.tema, activo: false }, encabezados });
    }
  };
  return (
    <Group title="Color del documento" hint="Elige un color primario y el sistema calcula el secundario y el terciario para encabezados, negrita, cursiva, enlaces, código, listas, citas y tablas, igual que en el Markdown de Synapse.">
      <label className="tv-check">
        <input type="checkbox" checked={draft.tema.activo} onChange={(event) => toggle(event.target.checked)} />
        Usar un color primario para todo el documento
      </label>
      {colors && (
        <div className="tv-theme">
          <label className="tv-field tv-field--color">
            <span>Color primario</span>
            <input type="color" value={draft.tema.primario} onChange={(event) => onChange({ ...draft, tema: { ...draft.tema, primario: event.target.value } })} />
          </label>
          <ul className="tv-swatches" aria-label="Colores calculados del tema">
            {([["Primario", colors.primario], ["Secundario", colors.secundario], ["Terciario", colors.terciario]] as const).map(([name, color]) => (
              <li key={name} title={`${name}: ${color}`}>
                <i style={{ background: color }} aria-hidden="true" />
                <span>{name}</span>
                <code>{color}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Group>
  );
}

function LineFields({ label, value, onChange }: { label: string; value: PdfLine; onChange: (next: PdfLine) => void }) {
  return (
    <div className="tv-line" role="group" aria-label={`${label}: línea`}>
      <label className="tv-check">
        <input type="checkbox" checked={value.activa} onChange={(event) => onChange({ ...value, activa: event.target.checked })} />
        Mostrar línea {label.toLowerCase().includes("pie") ? "sobre el pie" : "bajo el encabezado"}
      </label>
      <label className="tv-field tv-field--color">
        <span>Color</span>
        <input type="color" disabled={!value.activa} value={/^#[0-9a-fA-F]{6}$/.test(value.color) ? value.color : "#cbd5e1"} onChange={(event) => onChange({ ...value, color: event.target.value })} />
      </label>
      <label className="tv-field tv-field--narrow">
        <span>Grosor (pt)</span>
        <input type="number" disabled={!value.activa} min={PDF_LINE_PT[0]} max={PDF_LINE_PT[1]} step={0.25} value={value.grosor} onChange={(event) => onChange({ ...value, grosor: event.target.value })} />
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
      <TypeFields label="Tipografía del texto" ariaLabel={`${label}: tipografía`} value={value.fuente} onChange={(fuente) => onChange({ ...value, fuente })} />
      <div className="tv-pos" role="group" aria-label={`${label}: posición`}>
        <label className="tv-field">
          <span>Distancia al borde de la hoja (mm)</span>
          <input type="number" min={PDF_BAND_MM[0]} max={PDF_BAND_MM[1]} step={0.5} value={value.distancia} onChange={(event) => onChange({ ...value, distancia: event.target.value })} />
        </label>
        <label className="tv-field">
          <span>Sangría lateral (mm)</span>
          <input type="number" min={PDF_BAND_MM[0]} max={PDF_BAND_MM[1]} step={0.5} value={value.sangria} onChange={(event) => onChange({ ...value, sangria: event.target.value })} />
        </label>
      </div>
      <LineFields label={label} value={value.linea} onChange={(linea) => onChange({ ...value, linea })} />
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
          <ThemeFields draft={draft} onChange={onChange} />
          <Group title="Tipografía" ariaLabel="Tipografía y color">
            {PDF_HEADING_LEVELS.map((level) => (
              <TypeFields
                key={level} label={HEADING_LABEL[level]} value={draft.encabezados[level]} autoColor={themeColors(draft)?.[level]}
                onChange={(next) => set("encabezados", { ...draft.encabezados, [level]: next })}
              />
            ))}
            <TypeFields label="Texto" value={draft.texto} onChange={(next) => set("texto", next)} />
            <p className="tv-hint">Los encabezados H5 y H6 usan el estilo del H4.</p>
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
