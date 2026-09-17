import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Home from "./home.jsx";
import Register from "./register.jsx";
import Teacher from "./teacher.jsx";

function AppRoutes() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Home
            onGetStarted={() => navigate("/register")}
            onLogin={() => navigate("/register")}
          />
        }
      />

      <Route
        path="/register"
        element={
          <Register
            onBackHome={() => navigate("/")}
            onLogin={() => navigate("/teacher")}
          />
        }
      />

      <Route
        path="/teacher"
        element={<Teacher onSignOut={() => navigate("/")} />}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}