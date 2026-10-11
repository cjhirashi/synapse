import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, changePassword } from "../api/auth";

const MIN_LENGTH = 10;

export default function ChangePasswordPage({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) return setError(`La nueva contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
    if (next !== confirm) return setError("Las contraseñas nuevas no coinciden.");
    if (next === current) return setError("La nueva contraseña debe ser distinta de la actual.");
    setBusy(true);
    try {
      await changePassword(current, next);
      onChanged();
    } catch (err) {
      // `request()` ya intentó renovar la sesión: un 401 aquí es una sesión cerrada (RF-023).
      if (err instanceof ApiError && err.status === 401) navigate("/login", { replace: true });
      else if (err instanceof ApiError && err.status === 400) setError("La contraseña actual es incorrecta.");
      else if (err instanceof ApiError && err.status === 422) setError("La nueva contraseña no cumple la política.");
      else setError("No se pudo cambiar la contraseña. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>Cambiar contraseña</h1>
      <label>
        Contraseña actual
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>
        Nueva contraseña
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label>
        Confirmar nueva contraseña
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>Cambiar contraseña</button>
    </form>
  );
}
