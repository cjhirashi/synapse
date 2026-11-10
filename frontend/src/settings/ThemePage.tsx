import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "../theme/useTheme";

const OPTIONS: { mode: ThemeMode; name: string; label: string; hint: string; Icon: typeof Sun }[] = [
  { mode: "light", name: "Claro", label: "Tema claro", hint: "Fondo claro, ideal de día", Icon: Sun },
  { mode: "dark", name: "Oscuro", label: "Tema oscuro", hint: "Fondo oscuro, menos brillo de noche", Icon: Moon },
  { mode: "system", name: "Sistema", label: "Tema del sistema", hint: "Sigue el modo de tu dispositivo", Icon: Monitor },
];

/** Sección Tema (H-028): tres tarjetas con vista previa; la elegida queda marcada. */
export default function ThemePage() {
  const { mode, setMode } = useTheme();

  return (
    <section className="theme-page">
      <h2>Tema</h2>
      <p className="settings-section-intro">Elige cómo se ve Synapse. El cambio se aplica al instante y se recuerda en este dispositivo.</p>

      <div className="theme-options" role="group" aria-label="Tema">
        {OPTIONS.map(({ mode: option, name, label, hint, Icon }) => (
          <button
            key={option}
            type="button"
            className={`theme-option theme-option--${option}`}
            aria-label={label}
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
          >
            <span className="theme-preview" aria-hidden="true">
              <span className="theme-preview-bar" />
              <span className="theme-preview-body">
                <span className="theme-preview-rail" />
                <span className="theme-preview-lines">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            </span>
            <span className="theme-option-text">
              <span className="theme-option-name">
                <Icon size={16} aria-hidden="true" />
                {name}
              </span>
              <span className="theme-option-hint">{hint}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
