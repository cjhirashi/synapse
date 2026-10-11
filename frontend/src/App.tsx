import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import LoginPage from "./auth/LoginPage";
import RequireAuth from "./auth/RequireAuth";
import ChangePasswordPage from "./settings/ChangePasswordPage";

export default function App() {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLoggedIn={() => navigate("/")} />} />
      <Route
        path="/settings/password"
        element={
          <RequireAuth>
            <ChangePasswordPage onChanged={() => navigate("/")} />
          </RequireAuth>
        }
      />
      <Route path="/" element={<RequireAuth><p>Synapse</p></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
