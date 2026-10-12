import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import LoginPage from "./auth/LoginPage";
import RequireAuth from "./auth/RequireAuth";
import AppLayout from "./layout/AppLayout";
import ChangePasswordPage from "./settings/ChangePasswordPage";
import TrashPage from "./vaults/TrashPage";
import VaultForm from "./vaults/VaultForm";
import VaultListPage from "./vaults/VaultListPage";

export default function App() {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLoggedIn={() => navigate("/")} />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/settings/password" element={<ChangePasswordPage onChanged={() => navigate("/")} />} />
        {/* Bóvedas (SPEC-0003): la sección principal; `/` lleva a ella. */}
        <Route path="/vaults" element={<VaultListPage />} />
        <Route path="/vaults/new" element={<VaultForm />} />
        <Route path="/vaults/trash" element={<TrashPage />} />
        <Route path="/vaults/:id/edit" element={<VaultForm />} />
        <Route path="/" element={<Navigate to="/vaults" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
