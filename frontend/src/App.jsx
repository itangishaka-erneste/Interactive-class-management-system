import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Home from "./home.jsx";
import Register from "./register.jsx";
import Teacher from "./teacher.jsx";
import SchoolAdmin from "./school_admin.jsx";
import Student from "./student.jsx";
import SuperAdmin from "./super_admin.jsx";

function AppRoutes() {
  const navigate = useNavigate();
  const signOut = () => {
    localStorage.removeItem("ecw_admin_session");
    localStorage.removeItem("ecw_superadmin_session");
    localStorage.removeItem("ecw_user_session");
    navigate("/");
  };

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/register"
        element={<Register onBackHome={() => navigate("/")} onLogin={() => navigate("/")} />}
      />

      {/* Role Dashboards */}
      <Route path="/dashboard/student" element={<Student onSignOut={signOut} />} />
      <Route path="/dashboard/teacher" element={<Teacher onSignOut={signOut} />} />
      <Route path="/dashboard/schoolAdmin" element={<SchoolAdmin onSignOut={signOut} />} />
      <Route path="/dashboard/superAdmin" element={<SuperAdmin onSignOut={signOut} />} />

      {/* Legacy and direct route redirects */}
      <Route path="/student" element={<Student onSignOut={signOut} />} />
      <Route path="/teacher" element={<Teacher onSignOut={signOut} />} />
      <Route path="/school_admin" element={<SchoolAdmin onSignOut={signOut} />} />
      <Route path="/sadmin" element={<SchoolAdmin onSignOut={signOut} />} />
      <Route path="/superadmin/*" element={<SuperAdmin onSignOut={signOut} />} />
      <Route path="/super_admin/*" element={<SuperAdmin onSignOut={signOut} />} />

      {/* Catch-all Fallback */}
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