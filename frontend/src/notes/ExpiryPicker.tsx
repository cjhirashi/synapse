import { useId } from "react";
import "./publish-control.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
  id: string;
}

export default function ExpiryPicker({ value, onChange, disabled = false, error = null, id }: Props) {
  const helpId = useId();

  return (
    <div className="expiry-picker">
      <label htmlFor={id}>Fecha y hora de despublicación</label>
      <input
        type="datetime-local"
        id={id}
        step={60}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={helpId}
        className="expiry-input"
      />
      <p id={helpId} className="expiry-help">
        Hora de la Ciudad de México.
      </p>
      {error && (
        <div role="alert" className="expiry-error">
          {error}
        </div>
      )}
    </div>
  );
}
