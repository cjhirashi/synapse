import { ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import LoginPage from "./auth/LoginPage";
import RequireAuth, { useMe, useRefreshMe } from "./auth/RequireAuth";
import AppLayout from "./layout/AppLayout";
import VaultWorkspacePage from "./notes/VaultWorkspacePage";
import ApiKeysPage from "./settings/ApiKeysPage";
import ChangePasswordPage from "./settings/ChangePasswordPage";
import ConflictView from "./sync/ConflictView";
import RejectionsPage from "./sync/RejectionsPage";
import LocalCopyNotice from "./sync/LocalCopyNotice";
import SyncProvider from "./sync/SyncProvider";
import type { SyncEnv } from "./sync/resources";
import TrashPage from "./vaults/TrashPage";
import VaultForm from "./vaults/VaultForm";
import VaultListPage from "./vaults/VaultListPage";

interface Props {
  /** Réplica, remota y replicador sustituibles en las pruebas (por defecto, los reales). */
  syncEnv?: SyncEnv;
}

/**
 * Sincronización del usuario de la sesión (SPEC-0005 RF-009, RF-018). Con otro usuario es
 * otra instancia (`key`): la anterior se cierra antes de abrir la réplica nueva. No replica
 * mientras deba cambiar la contraseña (RF-002).
 */
function SyncScope({ env, children }: { env?: SyncEnv; children: ReactNode }) {
  const me = useMe();
  return (
    <SyncProvider key={me.user_id} sub={me.user_id} paused={me.must_change_password} env={env}>
      {children}
    </SyncProvider>
  );
}

/**
 * Pantalla de cambio de contraseña. Al terminar, la sesión en caché se renueva antes de
 * navegar: con `must_change_password` obsoleto, `RequireAuth` devolvería aquí (VU-5).
 */
function ChangePasswordRoute() {
  const navigate = useNavigate();
  const refreshMe = useRefreshMe();
  return (
    <ChangePasswordPage
      onChanged={async () => {
        // Si la renovación falla (sin red) se navega igual: `RequireAuth` revalida al cambiar de ruta.
        await refreshMe().catch(() => undefined);
        navigate("/");
      }}
    />
  );
}

export default function App({ syncEnv }: Props) {
  const navigate = useNavigate();
  return (
    <Routes>
      {/* Si al cerrar sesión la réplica no se pudo borrar, el login lo avisa (SPEC-0005 RF-017). */}
      <Route
        path="/login"
        element={
          <>
            <LocalCopyNotice />
            <LoginPage onLoggedIn={() => navigate("/")} />
          </>
        }
      />
      <Route
        element={
          <RequireAuth>
            <SyncScope env={syncEnv}>
              <AppLayout />
            </SyncScope>
          </RequireAuth>
        }
      >
        <Route path="/settings/password" element={<ChangePasswordRoute />} />
        {/* Gestión de API keys de agente (SPEC-0013 / H-002.5): sólo la UI sobre `/auth/agent-keys`. */}
        <Route path="/settings/api-keys" element={<ApiKeysPage />} />
        {/* Bóvedas (SPEC-0003) sobre la réplica local: la sección principal; `/` lleva a ella. */}
        <Route path="/vaults" element={<VaultListPage />} />
        <Route path="/vaults/new" element={<VaultForm />} />
        <Route path="/vaults/trash" element={<TrashPage />} />
        <Route path="/vaults/:id/edit" element={<VaultForm />} />
        {/* Bóveda abierta: sidebar de notas + editor (SPEC-0008). `new` y `trash` ganan por ser estáticas. */}
        <Route path="/vaults/:id" element={<VaultWorkspacePage />} />
        {/* Lo que la sincronización deja al usuario (SPEC-0005 RF-006, RF-013). */}
        <Route path="/rejections" element={<RejectionsPage />} />
        <Route path="/conflicts" element={<ConflictView />} />
        <Route path="/" element={<Navigate to="/vaults" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
