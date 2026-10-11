import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import LoginPage from "./auth/LoginPage";
import RequireAuth from "./auth/RequireAuth";
import AppLayout from "./layout/AppLayout";
import ChangePasswordPage from "./settings/ChangePasswordPage";

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
        <Route path="/" element={<p>Synapse</p>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
