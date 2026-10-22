import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "./useTheme";
import "./ThemeToggle.css";

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "light", label: "Tema claro", Icon: Sun },
  { mode: "system", label: "Tema del sistema", Icon: Monitor },
  { mode: "dark", label: "Tema oscuro", Icon: Moon },
];

/** Píldora de 3 segmentos (claro/sistema/oscuro), igual en todas las vistas privadas y en login. */
export default function ThemeToggle() {
  const { mode, setMode, order } = useTheme();
  const activeIndex = Math.max(order.indexOf(mode), 0);

  return (
    <div className="theme-toggle" role="group" aria-label="Tema">
      <span className="theme-toggle-thumb" style={{ transform: `translateX(${activeIndex * 32}px)` }} aria-hidden="true" />
      {OPTIONS.map(({ mode: optionMode, label, Icon }) => (
        <button
          key={optionMode}
          type="button"
          aria-label={label}
          aria-pressed={mode === optionMode}
          onClick={() => setMode(optionMode)}
        >
          <Icon size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
