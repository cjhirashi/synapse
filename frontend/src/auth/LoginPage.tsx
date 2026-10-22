import { FormEvent, useState } from "react";
import { ApiError, login } from "../api/auth";
import ThemeToggle from "../theme/ThemeToggle";
import "./AuthShell.css";

export default function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      onLoggedIn();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Correo o contraseña incorrectos."
          : "No se pudo iniciar sesión. Inténtalo de nuevo.",
      );
    }
  }

  return (
    <div className="auth-shell">
      <ThemeToggle />
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <div className="auth-logo-mark" />
          <div className="auth-logo-text">Synapse</div>
        </div>
        <h1>Iniciar sesión</h1>
        <p className="auth-subtitle">Accede a tu bóveda de conocimiento.</p>
        {error && <p role="alert">{error}</p>}
        <label>
          Correo
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit">Entrar</button>
        <p className="auth-footnote">¿Necesitas acceso? Pídeselo al administrador de tu instancia.</p>
      </form>
    </div>
  );
}
