import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Home from "./home.jsx";
import Register from "./register.jsx";
import Teacher from "./teacher.jsx";
import SchoolAdmin from "./school_admin.jsx";
import Student from "./student.jsx";
import SuperAdmin from "./super_admin.jsx";

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
            onLogin={(role) => {
              if (role === "student") navigate("/student");
              else if (role === "school_admin") navigate("/school_admin");
              else if (role === "super_admin") navigate("/superadmin");
              else navigate("/teacher");
            }}
          />
        }
      />

      <Route
        path="/teacher"
        element={<Teacher onSignOut={() => navigate("/")} />}
      />

      <Route
        path="/student"
        element={<Student onSignOut={() => navigate("/")} />}
      />

      {/* School Admin Routes */}
      <Route
        path="/school_admin"
        element={<SchoolAdmin onSignOut={() => navigate("/")} />}
      />
      <Route
        path="/sadmin"
        element={<SchoolAdmin onSignOut={() => navigate("/")} />}
      />

      {/* Super Admin Control Panel Routes */}
      <Route
        path="/superadmin"
        element={<SuperAdmin onSignOut={() => navigate("/")} />}
      />
      <Route
        path="/super_admin"
        element={<SuperAdmin onSignOut={() => navigate("/")} />}
      />

      {/* Fallback Redirect */}
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