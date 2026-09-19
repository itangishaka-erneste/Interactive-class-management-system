import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Home from "./home.jsx";
import Register from "./register.jsx";
import Teacher from "./teacher.jsx";
import SchoolAdmin from "./school_admin.jsx";
import Student from "./student.jsx";

// The super admin page is STANDALONE. It has its own Google sign-in and its own
// "Continue to dashboard" button, and it does not use Home, Register or any
// other page. Save the file I gave you as  src/SuperAdminDashboard.jsx  and
// delete (or stop importing) the old  src/super_admin.jsx.
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
              // Super admin no longer signs in through Register.
              if (role === "student") navigate("/student");
              else if (role === "school_admin") navigate("/school_admin");
              else navigate("/teacher");
            }}
          />
        }
      />

      <Route path="/teacher" element={<Teacher onSignOut={() => navigate("/")} />} />
      <Route path="/student" element={<Student onSignOut={() => navigate("/")} />} />

      {/* School Admin */}
      <Route path="/school_admin" element={<SchoolAdmin onSignOut={() => navigate("/")} />} />
      <Route path="/sadmin" element={<SchoolAdmin onSignOut={() => navigate("/")} />} />

      {/* Super Admin: independent page, no props, no redirects */}
      <Route path="/superadmin/*" element={<SuperAdmin />} />
      <Route path="/super_admin/*" element={<SuperAdmin />} />

      {/* Fallback */}
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