/**
 * Selector de ícono y color de una bóveda (SPEC-0009 RF-011; PLAN-0009 §2.3 e).
 *
 * Dos `radiogroup`: «Ícono» (Iniciales + los 24 glifos del catálogo) y «Color» (Automático + los 5
 * colores de la paleta). Es controlado: recibe el texto «glifo[:color]» de `Vault.icon` y emite el
 * siguiente con `formatIcon`; no guarda nada (eso lo hace el formulario que lo monta). Teclado del
 * patrón WAI-ARIA de grupo de radios: las flechas mueven la selección (con vuelta) y el foco la
 * sigue, y sólo la opción marcada es tabulable.
 */
import { KeyboardEvent, ReactNode, useId, useRef } from "react";
import VaultChip from "./VaultChip";
import { COLOR_LABELS, colorVar, formatIcon, ICON_LABELS, ICON_SET, PALETTE, parseIcon, type PaletteKey } from "./vaultIcon";
import "./VaultChip.css";

/** Opción «sin elección»: iniciales en el grupo de glifos, color derivado en el de colores. */
const NONE = "none";

interface Option {
  id: string;
  label: string;
  content: ReactNode;
  /** Color de la muestra (sólo el grupo de colores): una variable de la paleta. */
  swatch?: string;
}

interface RadioGroupProps {
  labelId: string;
  options: Option[];
  selected: string;
  onSelect: (id: string) => void;
  className: string;
}

function RadioGroup({ labelId, options, selected, onSelect, className }: RadioGroupProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function move(index: number) {
    const target = (index + options.length) % options.length;
    onSelect(options[target].id);
    buttons.current[target]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: options.length - 1,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    move(target);
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} className={`icon-picker-group ${className}`}>
      {options.map((option, index) => (
        <button
          key={option.id}
          ref={(node) => (buttons.current[index] = node)}
          type="button"
          role="radio"
          aria-checked={option.id === selected}
          aria-label={option.label}
          tabIndex={option.id === selected ? 0 : -1}
          className="icon-picker-option"
          style={option.swatch ? ({ "--swatch": option.swatch } as React.CSSProperties) : undefined}
          onClick={() => onSelect(option.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {option.content}
        </button>
      ))}
    </div>
  );
}

const ICON_OPTIONS: Option[] = [
  { id: NONE, label: "Iniciales", content: <span aria-hidden="true">Aa</span> },
  ...Object.entries(ICON_SET).map(([id, Glyph]) => ({
    id,
    label: ICON_LABELS[id],
    content: <Glyph size={16} strokeWidth={2} aria-hidden="true" />,
  })),
];

const COLOR_OPTIONS: Option[] = [
  { id: NONE, label: "Automático", content: null },
  ...PALETTE.map((key) => ({ id: key, label: COLOR_LABELS[key], content: null, swatch: colorVar(key) })),
];

interface IconPickerProps {
  /** Id de la bóveda (sólo para el color automático de la vista previa); ausente en una bóveda nueva. */
  vaultId?: string;
  /** Nombre actual: las iniciales de la vista previa. */
  name: string;
  /** `Vault.icon` actual. */
  value: string | null;
  onChange: (next: string | null) => void;
}

export default function IconPicker({ vaultId = "", name, value, onChange }: IconPickerProps) {
  const ids = useId();
  const { glyph, color } = parseIcon(value);

  return (
    <div className="icon-picker">
      <div className="icon-picker-preview">
        <span className="icon-picker-label">Vista previa</span>
        <VaultChip id={vaultId} name={name} icon={value} />
      </div>
      <span id={`${ids}-icon`} className="icon-picker-label">
        Ícono
      </span>
      <RadioGroup
        labelId={`${ids}-icon`}
        options={ICON_OPTIONS}
        selected={glyph ?? NONE}
        onSelect={(id) => onChange(formatIcon(id === NONE ? null : id, color))}
        className="icon-picker-glyphs"
      />
      <span id={`${ids}-color`} className="icon-picker-label">
        Color
      </span>
      <RadioGroup
        labelId={`${ids}-color`}
        options={COLOR_OPTIONS}
        selected={color ?? NONE}
        onSelect={(id) => onChange(formatIcon(glyph, id === NONE ? null : (id as PaletteKey)))}
        className="icon-picker-colors"
      />
    </div>
  );
}
