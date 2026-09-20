import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Home from "./home.jsx";
import Register from "./register.jsx";
import Teacher from "./teacher.jsx";
import SchoolAdmin from "./school_admin.jsx";
import Student from "./student.jsx";
import SuperAdmin from "./super_admin.jsx";

function AppRoutes() {
  const navigate = useNavigate();
  const signOut = () => navigate("/");

  return (
    <Routes>
      {/* Home handles its own navigation (it uses useNavigate internally). */}
      <Route path="/" element={<Home />} />

      {/* "Log in" on the register page goes back to Home, where the sign-in cards are. */}
      <Route
        path="/register"
        element={<Register onBackHome={() => navigate("/")} onLogin={() => navigate("/")} />}
      />

      {/* Home sends people to /dashboard/<role> after Google sign-in.
          These routes were missing, so every sign-in bounced back to "/". */}
      <Route path="/dashboard/student" element={<Student onSignOut={signOut} />} />
      <Route path="/dashboard/teacher" element={<Teacher onSignOut={signOut} />} />
      <Route path="/dashboard/schoolAdmin" element={<SchoolAdmin onSignOut={signOut} />} />
      <Route path="/dashboard/superAdmin" element={<SuperAdmin />} />

      {/* Shorter direct URLs (kept so old links still work). */}
      <Route path="/student" element={<Student onSignOut={signOut} />} />
      <Route path="/teacher" element={<Teacher onSignOut={signOut} />} />
      <Route path="/school_admin" element={<SchoolAdmin onSignOut={signOut} />} />
      <Route path="/sadmin" element={<SchoolAdmin onSignOut={signOut} />} />
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