import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Home from "./home.jsx";
import Register from "./register.jsx";
import Teacher from "./teacher.jsx";

/* ============================================================================
   APP — client-side routing.

     /           -> Home
     /register   -> Register
     /teacher    -> Teacher dashboard
     *           -> redirect to Home

   Frontend-only: nothing in this project calls a server. Sign-in and
   registration are simulated locally, and the teacher dashboard keeps its
   notes and quizzes in React state for the life of the page.
   ============================================================================ */

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