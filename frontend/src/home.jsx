import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import dashboard from './assets/dashboard.png';
import esms from './assets/esms.jpg';
import ceo from './assets/logo.png';
import trends from './assets/trends.jpg';
import nesa from './assets/nesa.jpg';
import reb from './assets/reb.jpg';
import minedic from './assets/minedic.jpg';
import asyv from './assets/asyv.webp';
import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  CalendarCheck,
  FileText,
  Wallet,
  ShieldCheck,
  School,
  LayoutDashboard,
  Smartphone,
  Landmark,
  UserCircle2,
  Building2,
  ScrollText,
  HeartHandshake,
  Star,
  Trophy,
  Handshake,
  Mail,
  Clock3,
  CheckCircle2,
} from "lucide-react";

/* ============================================================================
   CONFIG
   Add these to your frontend .env:

     VITE_GOOGLE_CLIENT_ID=your-real-client-id.apps.googleusercontent.com
     VITE_API_BASE=http://localhost:5000

   HOW SIGN-IN WORKS NOW
   - Every "Continue with Google" button is the real Google Identity Services
     button.
   - School admin and super admin: the Google token is sent to the server,
     which verifies it with Google and decides who gets in.
       * School admin -> must be the Google email the school registered with,
         and the school must be approved by the super admin.
       * Super admin  -> must be the single email set as SUPERADMIN_EMAIL on
         the server.
   - Students and teachers are now ALSO checked against the real server
     (POST /api/teacher/login|register and /api/student/login|register).
     There is no more local/fake account table and no more client-minted
     tokens: the token used everywhere afterwards (including by
     Teacher.jsx's /api/teacher/* calls) is the real session token the
     server issues. A class/subject the teacher adds at sign-in is saved
     through POST /api/teacher/assignments, the same endpoint the teacher
     dashboard's Settings page uses.
   ============================================================================ */

const GOOGLE_CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID || "";
const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:5000";

// Backend mount point for each member role. Both are expected to expose the
// same shape as teacher.js: POST /register, POST /login (both open), and a
// GET /me that requires "Authorization: Bearer <token>" and returns
// { success, teacher|student, assignments?, classes? }.
const MEMBER_API_PATH = { teacher: "teacher", student: "student" };

// localStorage keys the various session tokens are kept under, so a page
// refresh on any dashboard doesn't lose the sign-in.
const ADMIN_SESSION_KEY = "ecw_admin_session";
const SUPERADMIN_SESSION_KEY = "ecw_superadmin_session";
const USER_SESSION_KEY = "ecw_user_session";

// Steps shown in the "connecting" loading overlay.
const LOADING_STEPS = [
  "Verifying your details",
  "Preparing your workspace",
  "Almost there",
];

// Placeholder shown in the school code input hints.
const DEFAULT_SCHOOL_CODE = "ECR-123456";

// Icons cycled through in the featured partners ad carousel.
const AD_CIRCLE_ICONS = [Star, Trophy, Handshake];

// Every subject a teacher can pick from when choosing what they teach.
const SUBJECT_OPTIONS = [
  "Mathematics", "English", "Kinyarwanda", "French", "Physics", "Chemistry",
  "Biology", "Geography", "History", "Economics", "Entrepreneurship",
  "Computer Science / ICT", "General Studies",
  "Religion & Values Education", "Physical Education", "Fine Art",
  "Literature in English", "Kiswahili",
];

// Every sign-in role the system supports. All of them use Google.
//   - student / teacher -> register with a school code, then sign in with Google.
//   - schoolAdmin -> Google only. The school itself is registered on /register.
//   - superAdmin  -> Google only, allowed only for the server's SUPERADMIN_EMAIL.
const ROLE_CONFIG = {
  student: { label: "Student", icon: BookOpen, canRegister: true, authField: "google" },
  teacher: { label: "Teacher", icon: GraduationCap, canRegister: true, authField: "google" },
  schoolAdmin: { label: "School admin", icon: Wallet, canRegister: false, authField: "google" },
  superAdmin: { label: "Super admin", icon: ShieldCheck, canRegister: false, authField: "google" },
};

const isAdminRole = (role) => role === "schoolAdmin" || role === "superAdmin";

/* ============================================================================
   REAL GOOGLE SIGN-IN (Google Identity Services)
   ============================================================================ */

function decodeGoogleJwt(token) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  return JSON.parse(jsonPayload);
}

let gsiScriptPromise = null;
let gsiInitialized = false;
let gsiHandler = null;

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => { gsiScriptPromise = null; reject(new Error("Google script failed to load")); };
      document.body.appendChild(script);
    });
  }
  return gsiScriptPromise;
}

// { name, email, picture, credential } where `credential` is the Google ID token
function GoogleSignInButton({ text = "signin_with", onSignedIn }) {
  const containerRef = useRef(null);
  const handlerRef = useRef(onSignedIn);
  handlerRef.current = onSignedIn;
  const [status, setStatus] = useState(GOOGLE_CLIENT_ID ? "loading" : "missing");

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;

        gsiHandler = (response) => {
          try {
            const payload = decodeGoogleJwt(response.credential);
            if (payload?.email) {
              handlerRef.current({
                name: payload.name || "",
                email: payload.email,
                picture: payload.picture || "",
                googleSub: payload.sub,
                credential: response.credential,
              });
            }
          } catch {
            setStatus("error");
          }
        };

        if (!gsiInitialized) {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => gsiHandler?.(response),
          });
          gsiInitialized = true;
        }

        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text,
          width: 280,
        });
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });

    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div ref={containerRef} className="flex justify-center min-h-[44px]" />
      {status === "loading" && (
        <p className="text-[11px] text-neutral-400 text-center">Loading Google sign-in…</p>
      )}
      {status === "missing" && (
        <p className="text-[11px] font-semibold text-red-600 text-center">
          Google sign-in isn't configured. Set VITE_GOOGLE_CLIENT_ID in your .env file.
        </p>
      )}
      {status === "error" && (
        <p className="text-[11px] font-semibold text-red-600 text-center">
          Couldn't load Google sign-in. Check your connection and try again.
        </p>
      )}
    </div>
  );
}

// Dropdown for picking a school. Only schools the super admin has approved are
// listed (they come from the server).
function SchoolDropdown({ value, onChange, error, schools, loading }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selected = schools.find((s) => s.id === value);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between text-xs px-3 py-2.5 rounded-lg border bg-white text-left focus:outline-none ${error ? "border-red-400" : "border-neutral-200 focus:border-green-400"}`}
      >
        <span className={selected ? "text-neutral-800" : "text-neutral-400"}>
          {loading ? "Loading schools…" : selected ? selected.name : "Select your school"}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {schools.length === 0 && !loading && (
            <p className="px-3 py-3 text-[11px] text-neutral-400">
              No approved schools yet. Your school must be registered and approved first.
            </p>
          )}
          {schools.map((school) => {
            const checked = value === school.id;
            return (
              <label
                key={school.id}
                className="flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-neutral-50 cursor-pointer border-b border-neutral-50 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => { onChange(school.id); setOpen(false); }}
                  className="w-3.5 h-3.5 accent-[#178754] shrink-0"
                />
                <span className="flex-1 text-neutral-700">{school.name}</span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-[#178754] shrink-0">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Verified
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Shown once a Google account is attached to the registration/login form.
function GoogleAccountChip({ account, onSwitch }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-[#178754]/25 bg-[#EAF6EF] px-3 py-2.5">
      {account.picture ? (
        <img src={account.picture} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full shrink-0 ring-1 ring-[#178754]/20" />
      ) : (
        <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 ring-1 ring-[#178754]/20">
          <Mail size={14} className="text-[#178754]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-neutral-800 truncate">{account.name}</p>
        <p className="text-[10px] text-neutral-500 truncate">{account.email}</p>
      </div>
      <button type="button" onClick={onSwitch} className="text-[10px] font-bold text-[#178754] hover:underline shrink-0">
        Switch
      </button>
    </div>
  );
}

// Shared modal for login + registration, used by the student, teacher,
// school-admin and super-admin flows.
function AuthModal({
  role, mode, onClose, onSwitchMode, onRegisterSchool,
  registerForm, setRegisterForm,
  formError, authSubmitting, onSubmitRegister, onSubmitLogin,
  googleAccount, onGoogleSignedIn, onGoogleSwitch, schools, schoolsLoading,
}) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.student;
  const RoleIcon = config.icon;
  const roleLabel = config.label;
  const canRegister = config.canRegister;
  // Admins are signed in as soon as Google confirms the account.
  const autoSignIn = isAdminRole(role);

  const loginHint =
    role === "superAdmin"
      ? "Sign in with the Google account authorized for platform administration."
      : role === "schoolAdmin"
        ? "Sign in with the Google account you registered your school with. Your school must be approved first — we email your school code as soon as it is."
        : "Sign in with the Google account you registered with. We only ever use it to confirm your email — no password to remember.";

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 px-4 py-6"
      role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ecw-body bg-white w-full max-w-md rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white flex items-center gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-neutral-100">
          <span className="w-11 h-11 shrink-0 rounded-full bg-[#EAF6EF] flex items-center justify-center overflow-hidden ring-1 ring-[#178754]/20">
            <RoleIcon className="w-5 h-5 text-[#178754]" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-green-700">{roleLabel} account</p>
            <h3 className="ecw-heading text-base font-extrabold text-neutral-900 mt-0.5 truncate">
              {mode === "login" ? `Sign in as ${roleLabel.toLowerCase()}` : `Create your ${roleLabel.toLowerCase()} account`}
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5">
          {formError && (
            <div className="mb-4 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              {formError}
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={onSubmitLogin} className="flex flex-col gap-3">
              <p className="text-[11px] text-neutral-500 -mt-1">{loginHint}</p>

              {googleAccount ? (
                <GoogleAccountChip account={googleAccount} onSwitch={onGoogleSwitch} />
              ) : (
                <GoogleSignInButton onSignedIn={onGoogleSignedIn} />
              )}

              {autoSignIn ? (
                authSubmitting && (
                  <p className="text-center text-[11px] font-semibold text-[#178754]">Signing you in…</p>
                )
              ) : (
                <button
                  type="submit"
                  disabled={!googleAccount || authSubmitting}
                  className="w-full mt-1 py-2.5 text-white font-bold text-xs rounded-lg transition-opacity hover:opacity-90 bg-[rgb(22,32,111)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {authSubmitting ? "Signing in…" : "Continue to dashboard"}
                </button>
              )}

              {canRegister && (
                <p className="text-center text-[11px] text-neutral-500 mt-1">
                  Don't have an account?{" "}
                  <button type="button" onClick={() => onSwitchMode("register")} className="font-bold text-[#178754] hover:underline">
                    Register as {roleLabel.toLowerCase()}
                  </button>
                </p>
              )}

              {role === "schoolAdmin" && (
                <p className="text-center text-[11px] text-neutral-500 mt-1">
                  New school?{" "}
                  <button type="button" onClick={onRegisterSchool} className="font-bold text-[#178754] hover:underline">
                    Register your school
                  </button>
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={onSubmitRegister} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Your Google account</label>
                {googleAccount ? (
                  <GoogleAccountChip account={googleAccount} onSwitch={onGoogleSwitch} />
                ) : (
                  <GoogleSignInButton onSignedIn={onGoogleSignedIn} text="signup_with" />
                )}
                <p className="text-[10px] text-neutral-400 mt-1">
                  We only take your name and email from Google — nothing else, and no password is stored.
                </p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">Full name</label>
                <input
                  type="text" required disabled={!googleAccount} value={registerForm.fullName}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="Full name"
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400 disabled:bg-neutral-50 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">School</label>
                <SchoolDropdown
                  value={registerForm.school}
                  onChange={(school) => setRegisterForm((f) => ({ ...f, school }))}
                  schools={schools} loading={schoolsLoading}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-neutral-600 mb-1 block">School code</label>
                <input
                  type="text" required disabled={!googleAccount} value={registerForm.schoolCode}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, schoolCode: e.target.value }))}
                  placeholder={`Given by your school (e.g. ${DEFAULT_SCHOOL_CODE})`}
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400 disabled:bg-neutral-50 disabled:cursor-not-allowed"
                />
              </div>
              <button
                type="submit" disabled={!googleAccount || authSubmitting}
                className="w-full mt-2 py-2.5 text-white font-bold text-xs rounded-lg transition-opacity hover:opacity-90 bg-[#178754] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authSubmitting ? "Checking code…" : "Submit for school approval"}
              </button>
              <p className="text-center text-[11px] text-neutral-500 mt-1">
                Already have an account?{" "}
                <button type="button" onClick={() => onSwitchMode("login")} className="font-bold text-[rgb(22,32,111)] hover:underline">
                  Sign in
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// Shown right after a student/teacher submits registration.
function PendingApprovalModal({ roleLabel, schoolName, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 px-4 py-6"
      role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ecw-body bg-white w-full max-w-sm rounded-2xl shadow-2xl px-6 py-7 text-center">
        <span className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3 ring-1 ring-amber-200">
          <Clock3 className="w-5 h-5 text-amber-600" />
        </span>
        <h3 className="ecw-heading text-base font-extrabold text-neutral-900 mb-1.5">Registration submitted</h3>
        <p className="text-xs text-neutral-500 leading-relaxed mb-5">
          Your {roleLabel.toLowerCase()} account has been sent to {schoolName || "your school"} for approval.
          Once approved, sign in with the same Google account to continue.
        </p>
        <button
          type="button" onClick={onClose}
          className="w-full py-2.5 text-white font-bold text-xs rounded-lg hover:opacity-90 transition-opacity bg-[rgb(22,32,111)]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Teacher classes/subjects step — shown right after a teacher's Google
// sign-in succeeds, before anything navigates to the dashboard.
// Classes come from the real server (returned by GET /api/teacher/me as
// part of the login flow), and any class/subject the teacher adds is saved
// through the real POST /api/teacher/assignments endpoint.
// ------------------------------------------------------------------
function TeacherClassStepModal({
  step, setStep, onPickExisting, onSwitchToAdd, onBackToPick, onSubmitAdd, onClose,
  onToggleClass, onToggleAllClasses, onAddCustomClass,
  onToggleSubject, onToggleAllSubjects, onAddCustomSubject,
}) {
  const { mode, assignments, classes, form, submitting, error } = step;
  const allSubjectChoices = [...new Set([...SUBJECT_OPTIONS, ...form.subjects])];
  const allClassesSelected = classes.length > 0 && classes.every((c) => form.classIds.has(c.id));
  const allSubjectsSelected = allSubjectChoices.length > 0 && allSubjectChoices.every((s) => form.subjects.has(s));
  const comboCount = form.classIds.size * form.subjects.size;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 px-4 py-6"
      role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ecw-body bg-white w-full max-w-md rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white flex items-center gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-neutral-100">
          <span className="w-11 h-11 shrink-0 rounded-full bg-[#EAF6EF] flex items-center justify-center ring-1 ring-[#178754]/20">
            <GraduationCap className="w-5 h-5 text-[#178754]" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-green-700">Teacher sign-in</p>
            <h3 className="ecw-heading text-base font-extrabold text-neutral-900 mt-0.5 truncate">
              {mode === "pick" ? "Your classes" : "Which classes & subjects?"}
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5">
          {error && (
            <div className="mb-4 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
              {error}
            </div>
          )}

          {mode === "pick" ? (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] text-neutral-500 -mt-1">
                These are the classes and subjects linked to your account. Continue to your
                dashboard, or add more if something's missing.
              </p>
              <div className="flex flex-col gap-2">
                {assignments.map((a) => (
                  <div key={a.id} className="w-full flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3.5 py-2.5">
                    <span>
                      <span className="block text-xs font-bold text-neutral-800">{a.className}</span>
                      <span className="block text-[11px] text-neutral-500">{a.subject}</span>
                    </span>
                  </div>
                ))}
              </div>
              <button
                type="button" onClick={() => onPickExisting(assignments)}
                className="w-full mt-1 py-2.5 text-white font-bold text-xs rounded-lg transition-opacity hover:opacity-90 bg-[rgb(22,32,111)]"
              >
                Continue to dashboard
              </button>
              <button type="button" onClick={onSwitchToAdd} className="text-center text-[11px] font-bold text-[#178754] hover:underline mt-1">
                + Add another class or subject
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-[11px] text-neutral-500 -mt-1">
                Tick every class you teach, and every subject you teach — we'll link you to each
                class/subject pair. You can always add more later at sign-in.
              </p>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-neutral-600">Classes you teach</label>
                  {classes.length > 0 && (
                    <button type="button" onClick={onToggleAllClasses} className="text-[10px] font-bold text-[#178754] hover:underline">
                      {allClassesSelected ? "Clear all" : "Select all"}
                    </button>
                  )}
                </div>
                <div className="max-h-36 overflow-y-auto border border-neutral-200 rounded-lg p-2.5 flex flex-col gap-1.5">
                  {classes.length === 0 ? (
                    <p className="text-[11px] text-neutral-400 px-1 py-1">No classes yet — add one below.</p>
                  ) : classes.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox" checked={form.classIds.has(c.id)}
                        onChange={() => onToggleClass(c.id)}
                        className="w-3.5 h-3.5 accent-[#178754] shrink-0"
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    value={form.customClass}
                    onChange={(e) => setStep((s) => (s ? { ...s, form: { ...s.form, customClass: e.target.value } } : s))}
                    placeholder="e.g. S4 MCB"
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddCustomClass(); } }}
                  />
                  <button type="button" onClick={onAddCustomClass} className="text-[11px] font-bold text-[#178754] hover:underline shrink-0">
                    Add
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-neutral-600">Subjects you teach</label>
                  <button type="button" onClick={onToggleAllSubjects} className="text-[10px] font-bold text-[#178754] hover:underline">
                    {allSubjectsSelected ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto border border-neutral-200 rounded-lg p-2.5 flex flex-col gap-1.5">
                  {allSubjectChoices.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox" checked={form.subjects.has(s)}
                        onChange={() => onToggleSubject(s)}
                        className="w-3.5 h-3.5 accent-[#178754] shrink-0"
                      />
                      {s}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    value={form.customSubject}
                    onChange={(e) => setStep((s) => (s ? { ...s, form: { ...s.form, customSubject: e.target.value } } : s))}
                    placeholder="Other subject not listed"
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddCustomSubject(); } }}
                  />
                  <button type="button" onClick={onAddCustomSubject} className="text-[11px] font-bold text-[#178754] hover:underline shrink-0">
                    Add
                  </button>
                </div>
              </div>

              <button
                type="button" disabled={submitting || form.classIds.size === 0 || form.subjects.size === 0}
                onClick={onSubmitAdd}
                className="w-full mt-1 py-2.5 text-white font-bold text-xs rounded-lg transition-opacity hover:opacity-90 bg-[#178754] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? "Saving…"
                  : comboCount > 0
                    ? `Save ${comboCount} assignment${comboCount === 1 ? "" : "s"} & continue`
                    : "Pick at least one class and subject"}
              </button>

              {assignments.length > 0 && (
                <button type="button" onClick={onBackToPick} className="text-center text-[11px] font-bold text-[rgb(22,32,111)] hover:underline">
                  Back to my classes
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EasyClassWork() {
  const navigate = useNavigate();

  const [isRegisterLoading, setIsRegisterLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [adCarouselIndex, setAdCarouselIndex] = useState(0);

  // Approved schools come from the server (no codes, no contact details).
  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadSchools() {
      setSchoolsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/schools/public`);
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setSchools(res.ok && data.success ? data.schools : []);
      } catch {
        if (!cancelled) setSchools([]);
      } finally {
        if (!cancelled) setSchoolsLoading(false);
      }
    }
    loadSchools();
    return () => { cancelled = true; };
  }, []);

  // Login / registration modal state.
  const [authView, setAuthView] = useState(null);
  const [formError, setFormError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [registerForm, setRegisterForm] = useState({ fullName: "", email: "", school: "", schoolCode: "" });

  const [googleAccount, setGoogleAccount] = useState(null);
  const [pendingApproval, setPendingApproval] = useState(null); // { roleLabel, schoolName } | null

  const [teacherStep, setTeacherStep] = useState(null);

  const isOverlayActive = isRegisterLoading || Boolean(authView) || Boolean(pendingApproval) || Boolean(teacherStep);

  useEffect(() => {
    if (!isRegisterLoading) { setLoadingStep(0); return; }
    const interval = setInterval(() => {
      setLoadingStep((prev) => {
        if (prev + 1 >= LOADING_STEPS.length) { clearInterval(interval); return prev; }
        return prev + 1;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [isRegisterLoading]);

  useEffect(() => {
    const interval = setInterval(() => {
      setAdCarouselIndex((prev) => (prev + 1) % AD_CIRCLE_ICONS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  const handleNavigate = (path, state) => {
    setIsRegisterLoading(true);
    setTimeout(() => {
      navigate(path, state ? { state } : undefined);
    }, 1600);
  };

  const openAuth = (role, mode) => {
    setFormError("");
    setAuthSubmitting(false);
    setGoogleAccount(null);
    setRegisterForm({ fullName: "", email: "", school: "", schoolCode: "" });
    setAuthView({ role, mode });
  };

  const closeAuth = () => { setAuthView(null); setFormError(""); setGoogleAccount(null); };

  const switchAuthMode = (mode) => {
    setFormError("");
    setGoogleAccount(null);
    setAuthView((prev) => (prev ? { ...prev, mode } : prev));
  };

  // ------------------------------------------------------------------
  // School admin + super admin sign-in.
  // The Google token goes to the server, which verifies it with Google and
  // decides whether this account is allowed in.
  // ------------------------------------------------------------------
  async function signInAdmin(role, account) {
    setFormError("");
    setAuthSubmitting(true);
    const isSuper = role === "superAdmin";

    try {
      const res = await fetch(`${API_BASE}${isSuper ? "/api/superadmin/login" : "/api/schools/login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: account.credential }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setFormError(data.error || data.message || "Sign-in failed. Please try again.");
        setGoogleAccount(null);
        return;
      }

      if (isSuper) {
        localStorage.setItem(SUPERADMIN_SESSION_KEY, JSON.stringify({ token: data.token, email: data.email }));
        setAuthView(null);
        handleNavigate("/dashboard/superAdmin", { token: data.token, email: data.email });
      } else {
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token: data.token, school: data.school }));
        setAuthView(null);
        handleNavigate("/dashboard/schoolAdmin", { token: data.token, school: data.school });
      }
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
      setGoogleAccount(null);
    } finally {
      setAuthSubmitting(false);
    }
  }

  // ------------------------------------------------------------------
  // Student / teacher sign-in.
  // Hits the REAL backend (mounted at /api/teacher and /api/student), the
  // same server Teacher.jsx talks to. The token stored afterwards is the
  // server's real session token, so every later /api/teacher/* call
  // succeeds instead of bouncing back to "/" with a 401.
  // ------------------------------------------------------------------
  async function signInMember(role, account) {
    setFormError("");
    setAuthSubmitting(true);
    const base = MEMBER_API_PATH[role];

    try {
      const res = await fetch(`${API_BASE}/api/${base}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: account.credential }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setFormError(
          data.message || data.error ||
          "No approved account found for this email. Register first, or wait for your school to approve you."
        );
        return;
      }

      const token = data.token;
      if (!token) {
        setFormError("The server did not return a session token. Please try again.");
        return;
      }

      // Hydrate the full profile with the real, server-issued token — this
      // is exactly what Teacher.jsx does on every load, so doing it here
      // too confirms the token actually works before we navigate anywhere.
      const meRes = await fetch(`${API_BASE}/api/${base}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const me = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !me.success) {
        setFormError(me.message || "Signed in, but your profile could not be loaded. Please try again.");
        return;
      }

      localStorage.setItem(USER_SESSION_KEY, JSON.stringify({ token }));
      setAuthView(null);

      if (role === "teacher") {
        startTeacherClassStep(token, me.teacher, me.assignments || [], me.classes || []);
      } else {
        handleNavigate(`/dashboard/${role}`, { token, email: me.student?.email, name: me.student?.fullName });
      }
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  const handleGoogleSignedIn = (account) => {
    setFormError("");
    setGoogleAccount(account);
    setRegisterForm((f) => ({ ...f, fullName: f.fullName || account.name, email: account.email }));

    // Admins don't need a second click: sign in as soon as Google confirms them.
    if (authView?.mode === "login" && isAdminRole(authView.role)) {
      signInAdmin(authView.role, account);
    }
  };

  const handleGoogleSwitch = () => {
    setFormError("");
    setGoogleAccount(null);
    window.google?.accounts?.id?.disableAutoSelect?.();
  };

  // ------------------------------------------------------------------
  // Teacher classes/subjects step
  // `classes` comes straight from GET /api/teacher/me (the same list the
  // dashboard's Settings page shows), so nothing here is invented client-side.
  // ------------------------------------------------------------------

  const blankAddForm = () => ({ classIds: new Set(), subjects: new Set(), customSubject: "", customClass: "" });

  const startTeacherClassStep = (token, teacher, assignments, classes) => {
    if (assignments.length === 0) {
      setTeacherStep({ token, teacher, mode: "add", assignments, classes, form: blankAddForm(), submitting: false, error: "" });
    } else {
      setTeacherStep({ token, teacher, mode: "pick", assignments, classes, form: blankAddForm(), submitting: false, error: "" });
    }
  };

  const completeTeacherLogin = (token, teacher, assignments) => {
    setTeacherStep(null);
    handleNavigate("/dashboard/teacher", {
      token,
      email: teacher?.email,
      name: teacher?.fullName,
      assignments,
    });
  };

  const handlePickExisting = (assignments) => {
    if (!teacherStep) return;
    completeTeacherLogin(teacherStep.token, teacherStep.teacher, assignments);
  };

  const handleSwitchTeacherStepToAdd = () => {
    setTeacherStep((s) => (s ? { ...s, mode: "add", error: "", form: blankAddForm() } : s));
  };

  const handleBackToPickAssignment = () => setTeacherStep((s) => (s ? { ...s, mode: "pick", error: "" } : s));

  const handleToggleClass = (classId) => {
    setTeacherStep((s) => {
      if (!s) return s;
      const next = new Set(s.form.classIds);
      next.has(classId) ? next.delete(classId) : next.add(classId);
      return { ...s, form: { ...s.form, classIds: next } };
    });
  };

  const handleToggleAllClasses = () => {
    setTeacherStep((s) => {
      if (!s) return s;
      const allSelected = s.classes.length > 0 && s.classes.every((c) => s.form.classIds.has(c.id));
      const next = allSelected ? new Set() : new Set(s.classes.map((c) => c.id));
      return { ...s, form: { ...s.form, classIds: next } };
    });
  };

  // A teacher can type a class name that doesn't exist yet — the server's
  // POST /api/teacher/assignments creates it automatically, so we only need
  // a local placeholder to check it in the UI before saving.
  const handleAddCustomClass = () => {
    setTeacherStep((s) => {
      if (!s) return s;
      const label = s.form.customClass.trim();
      if (!label) return s;
      const existing = s.classes.find((c) => c.name.toLowerCase() === label.toLowerCase());
      const cls = existing || { id: `new:${label}`, name: label };
      const classes = existing ? s.classes : [...s.classes, cls];
      const classIds = new Set(s.form.classIds);
      classIds.add(cls.id);
      return { ...s, classes, form: { ...s.form, classIds, customClass: "" } };
    });
  };

  const handleToggleSubject = (subject) => {
    setTeacherStep((s) => {
      if (!s) return s;
      const next = new Set(s.form.subjects);
      next.has(subject) ? next.delete(subject) : next.add(subject);
      return { ...s, form: { ...s.form, subjects: next } };
    });
  };

  const handleToggleAllSubjects = () => {
    setTeacherStep((s) => {
      if (!s) return s;
      const allChoices = [...new Set([...SUBJECT_OPTIONS, ...s.form.subjects])];
      const allSelected = allChoices.length > 0 && allChoices.every((sub) => s.form.subjects.has(sub));
      const next = allSelected ? new Set() : new Set(allChoices);
      return { ...s, form: { ...s.form, subjects: next } };
    });
  };

  const handleAddCustomSubject = () => {
    setTeacherStep((s) => {
      if (!s) return s;
      const label = s.form.customSubject.trim();
      if (!label) return s;
      const next = new Set(s.form.subjects);
      next.add(label);
      return { ...s, form: { ...s.form, subjects: next, customSubject: "" } };
    });
  };

  // Saves every chosen class/subject pair through the REAL
  // POST /api/teacher/assignments endpoint (the same one Settings uses),
  // authenticated with the real session token, then continues to the
  // dashboard.
  const handleSubmitNewAssignment = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!teacherStep) return;
    const { classIds, subjects } = teacherStep.form;
    if (classIds.size === 0 || subjects.size === 0) {
      setTeacherStep((s) => (s ? { ...s, error: "Pick at least one class and one subject." } : s));
      return;
    }

    const classNames = [...classIds]
      .map((id) => teacherStep.classes.find((c) => c.id === id)?.name)
      .filter(Boolean);
    const pairs = classNames.flatMap((className) => [...subjects].map((subject) => ({ className, subject })));

    setTeacherStep((s) => (s ? { ...s, submitting: true, error: "" } : s));

    try {
      let latestAssignments = teacherStep.assignments;
      for (const pair of pairs) {
        const res = await fetch(`${API_BASE}/api/teacher/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${teacherStep.token}` },
          body: JSON.stringify(pair),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.message || `Could not add ${pair.className} · ${pair.subject}.`);
        }
        latestAssignments = data.assignments;
      }
      completeTeacherLogin(teacherStep.token, teacherStep.teacher, latestAssignments);
    } catch (err) {
      setTeacherStep((s) => (s ? { ...s, submitting: false, error: err.message } : s));
    }
  };

  const closeTeacherStep = () => {
    setTeacherStep(null);
    localStorage.removeItem(USER_SESSION_KEY);
  };

  // ------------------------------------------------------------------
  // Login submit
  // ------------------------------------------------------------------
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setFormError("");
    const role = authView?.role;

    if (!googleAccount) { setFormError("Continue with Google first."); return; }

    if (isAdminRole(role)) {
      signInAdmin(role, googleAccount);
    } else {
      signInMember(role, googleAccount);
    }
  };

  // ------------------------------------------------------------------
  // Student / teacher registration
  // The school code is checked by the server, then the account itself is
  // created server-side (pending the school's approval) via
  // POST /api/{role}/register. There is no more client-side auto-approve:
  // approval must come from the school admin, same as school approval does.
  // ------------------------------------------------------------------
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const role = authView?.role;

    if (!googleAccount) { setFormError("Continue with Google first."); return; }
    const { fullName, school, schoolCode } = registerForm;
    if (!fullName || !school || !schoolCode) { setFormError("Please fill in every field."); return; }

    const chosenSchool = schools.find((s) => s.id === school);
    if (!chosenSchool) { setFormError("Please choose your school."); return; }

    setAuthSubmitting(true);

    try {
      const verifyRes = await fetch(`${API_BASE}/api/schools/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId: school, schoolCode: schoolCode.trim() }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !verifyData.success) {
        setFormError(verifyData.error || verifyData.message || "That school code doesn't match the selected school.");
        setAuthSubmitting(false);
        return;
      }

      const res = await fetch(`${API_BASE}/api/${MEMBER_API_PATH[role]}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: googleAccount.credential,
          fullName,
          schoolId: school,
          schoolCode: schoolCode.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setFormError(data.message || data.error || "Could not register. Please check your details and try again.");
        setAuthSubmitting(false);
        return;
      }

      setAuthSubmitting(false);
      setAuthView(null);
      setPendingApproval({ roleLabel: ROLE_CONFIG[role].label, schoolName: chosenSchool.name });
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
      setAuthSubmitting(false);
    }
  };

  return (
    <>
      {/* Loading overlay — redesigned as an animated checklist instead of a bare spinner. */}
      {isRegisterLoading && (
        <div className="ecw-magic-overlay" role="status" aria-live="polite">
          <div className="ecw-magic-card">
            <div className="ecw-magic-title">Setting things up</div>
            <div className="flex flex-col gap-2.5 w-full mt-3">
              {LOADING_STEPS.map((label, i) => {
                const done = i < loadingStep;
                const active = i === loadingStep;
                return (
                  <div key={label} className="flex items-center gap-2.5">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors"
                      style={{
                        background: done ? "#178754" : active ? "#FF4500" : "rgba(255,255,255,0.12)",
                      }}
                    >
                      {done ? (
                        <CheckCircle2 size={13} color="white" strokeWidth={3} />
                      ) : (
                        <span className={`w-1.5 h-1.5 rounded-full bg-white ${active ? "animate-pulse" : "opacity-40"}`} />
                      )}
                    </span>
                    <span className={`text-xs ${done ? "text-white" : active ? "text-white font-semibold" : "text-white/50"}`}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="ecw-progress-track">
              <div className="ecw-progress-fill" style={{ width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {authView && (
        <AuthModal
          role={authView.role} mode={authView.mode}
          onClose={closeAuth} onSwitchMode={switchAuthMode}
          onRegisterSchool={() => { closeAuth(); handleNavigate("/register"); }}
          registerForm={registerForm} setRegisterForm={setRegisterForm}
          formError={formError} authSubmitting={authSubmitting}
          onSubmitRegister={handleRegisterSubmit} onSubmitLogin={handleLoginSubmit}
          googleAccount={googleAccount} onGoogleSignedIn={handleGoogleSignedIn} onGoogleSwitch={handleGoogleSwitch}
          schools={schools} schoolsLoading={schoolsLoading}
        />
      )}

      {pendingApproval && (
        <PendingApprovalModal
          roleLabel={pendingApproval.roleLabel}
          schoolName={pendingApproval.schoolName}
          onClose={() => setPendingApproval(null)}
        />
      )}

      {teacherStep && (
        <TeacherClassStepModal
          step={teacherStep} setStep={setTeacherStep}
          onPickExisting={handlePickExisting}
          onSwitchToAdd={handleSwitchTeacherStepToAdd}
          onBackToPick={handleBackToPickAssignment}
          onSubmitAdd={handleSubmitNewAssignment}
          onClose={closeTeacherStep}
          onToggleClass={handleToggleClass}
          onToggleAllClasses={handleToggleAllClasses}
          onAddCustomClass={handleAddCustomClass}
          onToggleSubject={handleToggleSubject}
          onToggleAllSubjects={handleToggleAllSubjects}
          onAddCustomSubject={handleAddCustomSubject}
        />
      )}

    <div className={`min-h-screen bg-white text-neutral-900 font-sans antialiased ${isOverlayActive ? "ecw-blur-active" : ""}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
        .ecw-heading { font-family: 'Poppins', sans-serif; }
        .ecw-body { font-family: 'Inter', sans-serif; }

        @keyframes ecw-walk {
          0%   { transform: translateX(-6%); }
          50%  { transform: translateX(96%); }
          51%  { transform: translateX(96%) scaleX(-1); }
          99%  { transform: translateX(-6%) scaleX(-1); }
          100% { transform: translateX(-6%) scaleX(1); }
        }
        .ecw-walker { animation: ecw-walk 9s ease-in-out infinite; }
        .ecw-walker2 { animation: ecw-walk 9s ease-in-out infinite; animation-delay: 1.2s; }
        .ecw-walker3 { animation: ecw-walk 9s ease-in-out infinite; animation-delay: 2.4s; }

        @keyframes ecw-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .ecw-float { animation: ecw-float 4s ease-in-out infinite; }
        .ecw-float-slow { animation: ecw-float 6s ease-in-out infinite; }
        @keyframes icon-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .icon-spin { animation: icon-spin 3s linear infinite; }

        .ecw-blur-active { filter: blur(6px) saturate(0.9) brightness(0.9); transform-origin:center; }
        .ecw-magic-overlay {
          position: fixed; inset: 0; display:flex; align-items:center; justify-content:center;
          background: rgba(6,10,30,0.65); z-index:9999;
        }
        .ecw-magic-card {
          width:300px; max-width:88%;
          background: rgb(22,32,111);
          border:1px solid rgba(255,255,255,0.1);
          padding:28px 26px; border-radius:18px;
          display:flex; flex-direction:column; align-items:center;
          box-shadow:0 20px 60px rgba(2,6,23,0.55);
        }
        .ecw-magic-title { color:#fff; font-weight:700; font-size:15px; letter-spacing:0.2px; }
        .ecw-progress-track {
          width: 100%; height: 5px; border-radius: 999px;
          background: rgba(255,255,255,0.12); overflow: hidden; margin-top: 14px;
        }
        .ecw-progress-fill {
          height: 100%; border-radius: 999px;
          background: linear-gradient(90deg, #FF4500, #178754);
          transition: width 0.4s ease;
        }

        .ecw-ad-panel {
          position: absolute; top: -10%; left: 50%; transform: translateX(-50%);
          height: min(100%, 13rem); width: min(100%, 13rem);
          padding: 1.5rem 1.2rem; background: transparent;
          border: 1px solid rgba(23,119,84,0.14); border-radius: 50%;
          box-shadow: 0 18px 40px rgba(23,119,84,0.14);
          backdrop-filter: blur(12px); z-index: 1;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          transition: width 0.2s ease, height 0.2s ease, padding 0.2s ease;
        }
        @media (max-width: 1024px) {
          .ecw-ad-panel { top: 0.85rem; width: min(100%, 10rem); height: min(100%, 10rem); padding: 1rem 0.85rem; }
          .ecw-ad-circle { width: 7.5rem; height: 7.5rem; }
        }
        @media (max-width: 768px) {
          .ecw-ad-panel { top: 0.6rem; width: min(100%, 7.5rem); height: min(100%, 7.5rem); padding: 0.6rem 0.5rem; border-width: 1px; }
          .ecw-ad-circle { width: 5.5rem; height: 5.5rem; border-width: 2px; }
          .ecw-ad-panel-title { font-size: 0.55rem; margin-bottom: 0.5rem; }
        }
        @media (max-width: 480px) {
          .ecw-ad-panel { top: 0.4rem; width: min(100%, 5.75rem); height: min(100%, 5.75rem); padding: 0.4rem; }
          .ecw-ad-circle { width: 4.25rem; height: 4.25rem; border-width: 2px; }
        }
        .ecw-ad-circles { display: flex; justify-content: center; align-items: center; gap: 0; position: relative; width: 100%; height: 100%; }
        .ecw-ad-circle {
          width: 10rem; height: 10rem; border-radius: 50%; border: 3px solid #178754;
          display: grid; place-items: center;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95), rgba(228,252,239,0.85) 55%, rgba(255,255,255,0.65));
          box-shadow: 0 14px 36px rgba(23,119,84,0.16);
          animation: ecw-ad-pop 4s ease-in-out infinite; position: relative;
          transition: width 0.2s ease, height 0.2s ease;
        }
        .ecw-ad-button {
          text-decoration: none; position: static; border-radius: 999px;
          display: inline-flex; align-items: center; justify-content: center; color: white;
          background: #178754; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(23,119,84,0.3);
          margin-top: 0.75rem; width: 2.5rem; height: 2.5rem;
        }
        .ecw-ad-button:hover { background: #136040; transform: scale(1.05); box-shadow: 0 6px 16px rgba(23,119,84,0.4); }
        @media (max-width: 768px) { .ecw-ad-button { width: 1.9rem; height: 1.9rem; margin-top: 0.4rem; } .ecw-ad-button svg { width: 12px; height: 12px; } }
        @media (max-width: 480px) { .ecw-ad-button { width: 1.6rem; height: 1.6rem; margin-top: 0.3rem; } .ecw-ad-button svg { width: 10px; height: 10px; } }
        @keyframes ecw-ad-pop {
          0%, 100% { transform: translateY(0) scale(1); }
          20% { transform: translateY(-12px) scale(1.05); }
          40% { transform: translateY(-6px) scale(0.98); }
          60% { transform: translateY(-10px) scale(1.02); }
          80% { transform: translateY(-4px) scale(0.99); }
        }
      `}</style>

      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-neutral-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between">
          <a href="#home" className="flex items-center gap-2.5 shrink-0">
            <span className="w-12 h-12 rounded-full bg-[#EAF6EF] flex items-center justify-center ring-1 ring-[#178754]/20 shrink-0">
              <img src={esms} alt="ESMS logo" className="w-full h-full" />
            </span>
            <span className="ecw-heading font-bold text-[15px] text-neutral-900 leading-none">
              ESMS
            </span>
          </a>

          <nav className="hidden lg:flex items-center gap-6 text-[13px] font-semibold text-neutral-600 ecw-body">
            <a href="#home" className="relative py-1 hover:text-[#178754] transition-colors after:absolute after:left-0 after:-bottom-0.5 after:h-[2px] after:w-0 after:bg-[#178754] after:transition-all hover:after:w-full">Home</a>
            <a href="#services" className="relative py-1 hover:text-[#178754] transition-colors after:absolute after:left-0 after:-bottom-0.5 after:h-[2px] after:w-0 after:bg-[#178754] after:transition-all hover:after:w-full">Our services</a>
            <a href="#how-it-works" className="relative py-1 hover:text-[#178754] transition-colors after:absolute after:left-0 after:-bottom-0.5 after:h-[2px] after:w-0 after:bg-[#178754] after:transition-all hover:after:w-full">How to get started</a>
            <a href="#register" className="relative py-1 hover:text-[#178754] transition-colors after:absolute after:left-0 after:-bottom-0.5 after:h-[2px] after:w-0 after:bg-[#178754] after:transition-all hover:after:w-full">Register</a>
            <a href="#dashboard" className="relative py-1 hover:text-[#178754] transition-colors after:absolute after:left-0 after:-bottom-0.5 after:h-[2px] after:w-0 after:bg-[#178754] after:transition-all hover:after:w-full">Dashboard</a>
            <a href="#team" className="relative py-1 hover:text-[#178754] transition-colors after:absolute after:left-0 after:-bottom-0.5 after:h-[2px] after:w-0 after:bg-[#178754] after:transition-all hover:after:w-full">Our team</a>
            <a href="#contact" className="relative py-1 hover:text-[#178754] transition-colors after:absolute after:left-0 after:-bottom-0.5 after:h-[2px] after:w-0 after:bg-[#178754] after:transition-all hover:after:w-full">Contact</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button" onClick={() => handleNavigate("/register")} disabled={isRegisterLoading}
              className="hidden sm:inline-flex items-center justify-center gap-2 text-[13px] font-bold text-white px-4 py-2 rounded-lg transition-opacity hover:opacity-90 bg-[rgb(22,32,111)] disabled:opacity-90 disabled:cursor-not-allowed"
            >
              {isRegisterLoading ? (
                <>
                  <svg className="w-4 h-4 icon-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  <span>Loading...</span>
                </>
              ) : "Get started"}
            </button>

            <input type="checkbox" id="nav-toggle" className="peer hidden" />
            <label htmlFor="nav-toggle" className="lg:hidden flex flex-col justify-center items-center gap-1.5 w-9 h-9 rounded-lg border border-neutral-200 cursor-pointer">
              <span className="block w-4 h-0.5 bg-neutral-700"></span>
              <span className="block w-4 h-0.5 bg-neutral-700"></span>
              <span className="block w-4 h-0.5 bg-neutral-700"></span>
            </label>

            <div className="hidden peer-checked:flex lg:hidden flex-col absolute top-20 right-5 w-56 bg-white/95 shadow-xl rounded-2xl ring-1 ring-black/5 px-4 py-4 gap-2 text-[13px] font-semibold text-neutral-700 ecw-body">
              <a href="#home" className="py-2 hover:text-[#178754] transition-colors">Home</a>
              <a href="#services" className="py-2 hover:text-[#178754] transition-colors">Our services</a>
              <a href="#how-it-works" className="py-2 hover:text-[#178754] transition-colors">How to get started</a>
              <button type="button" onClick={() => handleNavigate("/register")} disabled={isRegisterLoading} className="py-2 text-left w-full hover:text-[#178754] transition-colors disabled:opacity-70">
                {isRegisterLoading ? "Loading..." : "Register"}
              </button>
              <a href="#dashboard" className="py-2 hover:text-[#178754] transition-colors">Dashboard</a>
              <a href="#team" className="py-2 hover:text-[#178754] transition-colors">Our team</a>
              <a href="#contact" className="py-2 hover:text-[#178754] transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="home" className="bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-12 pb-14 flex flex-col lg:flex-row items-center gap-10">
          <div className="flex flex-col items-start text-left w-full lg:w-1/2">
            <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-white bg-gradient-to-r from-[#FF4500] to-[#c93500] px-4 py-2 rounded mb-4 shadow-sm hover:shadow-md transition-shadow">
              No more spending lot of time
            </span>
            <h1 className="ecw-heading text-2xl sm:text-3xl font-extrabold leading-tight text-neutral-900 mb-3">
              Easy way to manage students in the classroom
            </h1>
            <p className="ecw-body text-sm text-neutral-600 leading-relaxed max-w-md">
              Easy ClassWork Records gives every school a single system for teachers, students
              and administrators, built for the curriculum and designed for Rwanda.
            </p>
            <div className="flex flex-wrap gap-3 pt-6">
              <button
                type="button" onClick={() => handleNavigate("/register")} disabled={isRegisterLoading}
                className="inline-flex items-center justify-center gap-2 text-[13px] font-bold text-white px-5 py-2.5 rounded-lg transition-opacity hover:opacity-90 bg-[#178754] disabled:opacity-90 disabled:cursor-not-allowed"
              >
                {isRegisterLoading ? (
                  <>
                    <svg className="w-4 h-4 icon-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    <span>Loading...</span>
                  </>
                ) : "Register your school"}
              </button>
              <a href="#services" className="text-[13px] font-bold text-[rgb(22,32,111)] border border-[rgb(22,32,111)]/20 hover:bg-[rgb(22,32,111)]/5 px-5 py-2.5 rounded-lg transition-colors">
                See what it does
              </a>
            </div>
          </div>

          <div className="w-full lg:w-1/2">
            <div className="relative bg-gradient-to-b from-[rgb(11,22,111)] to-[#EAF6EF] rounded-2xl p-6 overflow-hidden">
              <span className="absolute top-5 right-8 text-[#6EE7A8] animate-[ecw-float_6s_ease-in-out_infinite]">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 15c3-4 6 4 9 0s6 4 7-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </span>
              <span className="absolute top-14 left-10 text-[#93C5FD] animate-[ecw-float_4s_ease-in-out_infinite]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 15c3-4 6 4 9 0s6 4 7-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </span>

              <div className="ecw-ad-panel relative">
                <div className="ecw-ad-circles">
                  <div className="ecw-ad-circle rounded-full w-full h-full overflow-hidden">
                    <img src={trends} alt="ESMS logo" className="w-full rounded-full h-full" />
                  </div>
                </div>
                <a href="#services" className="ecw-ad-button absolute right-0 bottom-6 translate-x-1/2 shadow-lg transition-transform hover:-translate-y-0.5 hover:shadow-xl">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </a>
              </div>

              <svg viewBox="0 0 480 220" className="w-full h-auto">
                <g>
                  <rect x="18" y="120" width="70" height="55" rx="3" fill="#DBEAFE" />
                  <polygon points="15,120 53,95 91,120" fill="rgb(22,32,111)" />
                  <rect x="45" y="145" width="16" height="30" fill="rgb(22,32,111)" />
                  <rect x="26" y="132" width="12" height="12" fill="#93C5FD" />
                  <rect x="68" y="132" width="12" height="12" fill="#93C5FD" />
                </g>
                <g>
                  <line x1="53" y1="95" x2="53" y2="60" stroke="#C7D2FE" strokeWidth="2" />
                  <g className="ecw-float">
                    <rect x="53" y="60" width="34" height="8" fill="#20A5DE" />
                    <rect x="53" y="68" width="34" height="8" fill="#FAD201" />
                    <rect x="53" y="76" width="34" height="6" fill="#178754" />
                    <circle cx="76" cy="66" r="3.2" fill="#E5BE01" />
                  </g>
                </g>
                <path d="M95 175 Q 240 110 385 175" stroke="#178754" strokeWidth="6" fill="none" strokeLinecap="round" />
                <path d="M95 175 Q 240 130 385 175" stroke="#A7F3D0" strokeWidth="14" fill="none" strokeLinecap="round" opacity="0.6" />
                <g>
                  <rect x="392" y="140" width="66" height="42" rx="4" fill="#178754" />
                  <rect x="398" y="146" width="54" height="30" rx="2" fill="#ECFDF5" />
                  <rect x="386" y="182" width="78" height="7" rx="2" fill="#0F6B41" />
                </g>
                <g className="ecw-walker">
                  <circle cx="0" cy="150" r="7" fill="rgb(22,32,111)" />
                  <rect x="-4" y="157" width="8" height="14" rx="3" fill="rgb(22,32,111)" />
                </g>
                <g className="ecw-walker2">
                  <circle cx="0" cy="150" r="6" fill="#178754" />
                  <rect x="-3.5" y="156" width="7" height="12" rx="3" fill="#178754" />
                </g>
                <g className="ecw-walker3">
                  <circle cx="0" cy="150" r="6.5" fill="#FAD201" />
                  <rect x="-4" y="156.5" width="8" height="13" rx="3" fill="#FAD201" />
                </g>
              </svg>
              <p className="text-center text-[0.9rem] text-[#178737] ecw-body -mt-1">
                Teacher no longer takes time to pass through papers
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* OUR SERVICES */}
      <section id="services" className="bg-white py-14">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-xl mb-10">
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">Our services</span>
            <h2 className="ecw-heading text-2xl font-extrabold text-neutral-900 mt-2">
              Everything a school needs to run its academic year
            </h2>
          </div>
          <div className="flex flex-wrap gap-5">
            {[
              { icon: BookOpen, bg: "#E6F1FB", tint: "#1D6FE0", title: "Class notes", text: "Teachers publish notes by subject and class, students open them anytime." },
              { icon: ClipboardCheck, bg: "#EAF6EF", tint: "#178754", title: "Quizzes", text: "Auto-graded assessments aligned with the competence-based curriculum." },
              { icon: GraduationCap, bg: "#E6F1FB", tint: "#1D6FE0", title: "Gradebook", text: "Record marks once, and let report cards build themselves." },
              { icon: CalendarCheck, bg: "#EAF6EF", tint: "#178754", title: "Attendance", text: "Mark attendance from a phone or a laptop in under a minute." },
              { icon: FileText, bg: "#E6F1FB", tint: "#1D6FE0", title: "Term reports", text: "Generate report cards for a class, or the whole school, in one click." },
              { icon: Wallet, bg: "#EAF6EF", tint: "#178754", title: "Fees and payments", text: "Accept MTN Mobile Money, Airtel Money and bank transfers." },
            ].map(({ icon: Icon, bg, tint, title, text }) => (
              <div key={title} className="flex flex-col bg-white rounded-xl p-5 border border-neutral-100 hover:border-green-200 transition-colors w-full sm:w-[47%] lg:w-[31%]">
                <span className="inline-flex w-9 h-9 rounded-lg items-center justify-center mb-3" style={{ background: bg }}>
                  <Icon className="w-5 h-5 icon-spin" style={{ color: tint }} aria-hidden="true" />
                </span>
                <h3 className="ecw-heading font-bold text-sm text-neutral-900 mb-1">{title}</h3>
                <p className="ecw-body text-xs text-neutral-600 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW TO GET STARTED */}
      <section id="how-it-works" className="py-14 border-y border-neutral-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-xl mb-10">
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">How to get started</span>
            <h2 className="ecw-heading text-2xl font-extrabold text-neutral-900 mt-2">
              Six steps, and your school is online
            </h2>
          </div>
          <div className="relative">
            <div className="hidden sm:block absolute left-8 top-6 bottom-6 w-0.5 bg-[#178754] opacity-80 rounded" />
            <div className="flex flex-col gap-6">
              {[
                { i: 1, title: "Register your school", text: "Verify your email with Google and submit your school details and phone number." },
                { i: 2, title: "Get approved", text: "Our team calls you to confirm payment, approves your school, and emails you your school code." },
                { i: 3, title: "Add staff and students", text: "Teachers and students sign up with Google using your school code." },
                { i: 4, title: "Confirm sign-in", text: "Every account is verified through Google — no passwords to manage or forget." },
                { i: 5, title: "Publish notes and quizzes", text: "Teachers start uploading materials the same day." },
                { i: 6, title: "Track progress", text: "Watch attendance, grades and quiz results as the term goes on." },
              ].map((step) => (
                <div key={step.i} className="relative flex flex-col sm:block sm:pl-14">
                  <div className="flex items-center gap-3 sm:hidden">
                    <div className="w-9 h-9 rounded-full bg-white border-2 border-[#178754] flex items-center justify-center text-sm font-bold text-[rgb(22,32,111)] shadow">{step.i}</div>
                    <div>
                      <h3 className="ecw-heading font-bold text-sm text-neutral-900">{step.title}</h3>
                      <p className="ecw-body text-xs text-neutral-600 mt-1">{step.text}</p>
                    </div>
                  </div>
                  <div className="hidden sm:block absolute left-0 sm:left-6 top-0">
                    <div className="w-10 h-10 rounded-full bg-white border-2 border-[#178754] flex items-center justify-center text-sm font-bold text-[rgb(22,32,111)] shadow">{step.i}</div>
                  </div>
                  <div className="ml-0 sm:ml-12 bg-white p-4 sm:p-0 rounded-md hidden sm:block">
                    <h3 className="ecw-heading font-bold text-sm text-neutral-900">{step.title}</h3>
                    <p className="ecw-body text-xs text-neutral-600 mt-1">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* REGISTER / DASHBOARDS */}
      <section id="register" className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-xl mb-10">
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#FF4500" }}>Register</span>
            <h2 className="ecw-heading text-2xl font-extrabold text-neutral-900 mt-2">Choose your dashboard</h2>
            <p className="ecw-body text-xs text-neutral-600 mt-2">
              Students and teachers verify their email and sign in with Google — teachers also pick every
              class and subject they teach at sign-in. School admins sign in with the same Google account
              they registered their school with, once the school has been approved.
            </p>
          </div>

          <div className="flex flex-wrap gap-5 mb-8">
            {[
              { role: "student", bg: "#EAF6EF", tint: "#178754", title: "Student dashboard", text: "Read class notes, take quizzes and check your report card, signed in with Google." },
              { role: "teacher", bg: "#E6F1FB", tint: "#1D6FE0", title: "Teacher dashboard", text: "Upload lesson materials, grade work and record attendance — choose every class and subject you teach when you sign in with Google." },
              { role: "schoolAdmin", bg: "#EAF6EF", tint: "#178754", title: "School admin", text: "Manage staff accounts, student codes and fees for your own school — sign in with the Google account you registered with." },
              { role: "superAdmin", bg: "#E6F1FB", tint: "#1D6FE0", title: "Super admin", text: "Oversee every school on the platform — sign in with the authorized Google account." },
            ].map(({ role, bg, tint, title, text }) => {
              const RoleIcon = ROLE_CONFIG[role].icon;
              return (
                <div key={role} className="flex flex-col bg-white rounded-xl p-5 border border-neutral-100 w-full sm:w-[47%] lg:w-[23%]">
                  <span className="inline-flex w-9 h-9 rounded-lg items-center justify-center mb-3" style={{ background: bg }}>
                    <RoleIcon className="w-5 h-5" style={{ color: tint }} aria-hidden="true" />
                  </span>
                  <h3 className="ecw-heading font-bold text-sm text-neutral-900 mb-1">{title}</h3>
                  <p className="ecw-body text-xs text-neutral-600 leading-relaxed mb-4">{text}</p>
                  <button
                    type="button" onClick={() => openAuth(role, "login")}
                    className="w-full py-2.5 text-white font-bold text-xs rounded-lg transition-opacity hover:opacity-90 bg-[rgb(22,32,111)] mt-auto"
                  >
                    Sign in as {ROLE_CONFIG[role].label.toLowerCase()}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="bg-neutral-50 rounded-xl p-6 border border-neutral-100">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 mb-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">School registration</span>
                <p className="ecw-heading text-xl font-extrabold text-neutral-900 mt-1">150,000 RWF <span className="ecw-body text-xs font-medium text-neutral-500">/ term</span></p>
                <p className="ecw-body text-xs text-neutral-600 mt-1">Includes notes, quiz, report cards and a school code to add your staff and students. Your code is emailed to you once your school is approved.</p>
              </div>
              <button
                type="button" onClick={() => handleNavigate("/register")} disabled={isRegisterLoading}
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 py-2.5 px-5 text-white font-bold text-xs rounded-lg transition-opacity hover:opacity-90 bg-[#178754] disabled:opacity-90 disabled:cursor-not-allowed"
              >
                {isRegisterLoading ? "Loading..." : "Register my school"}
              </button>
            </div>
            <div className="flex flex-wrap gap-3 pt-4 border-t border-neutral-200 items-center">
              <span className="text-[11px] font-bold text-neutral-500">Pay with</span>
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center justify-center min-w-[130px] sm:min-w-[160px] gap-2 text-[11px] sm:text-[12px] font-bold px-4 py-2 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-200">
                  <Smartphone className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" /> MTN Money
                </span>
                <span className="flex items-center justify-center min-w-[130px] sm:min-w-[160px] gap-2 text-[11px] sm:text-[12px] font-bold px-4 py-2 rounded-md bg-red-50 text-red-700 border border-red-200">
                  <Smartphone className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" /> Airtel Money
                </span>
                <span className="flex items-center justify-center min-w-[130px] sm:min-w-[160px] gap-2 text-[11px] sm:text-[12px] font-bold px-4 py-2 rounded-md bg-blue-50 border border-blue-200 text-[rgb(22,32,111)]">
                  <Landmark className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" /> Bank transfer
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD */}
      <section id="dashboard" className="py-14 bg-neutral-50 border-y border-neutral-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-xl mb-8">
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">Live dashboard</span>
            <h2 className="ecw-heading text-2xl font-extrabold text-neutral-900 mt-2">
              See the school's whole term at a glance
            </h2>
          </div>

          <div className="rounded-2xl border border-neutral-200 overflow-hidden bg-white shadow-sm">
            <div className="bg-neutral-50 px-4 py-2.5 flex items-center gap-1.5 border-b border-neutral-200">
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-300"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-300"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-300"></span>
              <span className="ecw-body text-[11px] text-neutral-400 ml-3">app.easyclasswork.rw/dashboard</span>
            </div>
            <div className="w-full aspect-[16/9] flex items-center justify-center bg-gradient-to-br from-[#EAF6EF] to-white">
              <img src={dashboard} alt="Dashboard preview" className="w-full h-full" />
            </div>
          </div>

          <div className="flex flex-wrap gap-5 mt-8">
            {[
              { pct: 71, color: "rgb(22,32,111)", value: "142+", label: "Partner schools" },
              { pct: 85, color: "#178754", value: "48,500+", label: "Active students" },
              { pct: 98, color: "rgb(22,32,111)", value: "98%", label: "Teacher approval" },
              { pct: 99, color: "#178754", value: "99.9%", label: "System uptime" },
            ].map(({ pct, color, value, label }) => (
              <div key={label} className="flex flex-col items-center text-center flex-1 min-w-[120px]">
                <svg width="76" height="76" viewBox="0 0 76 76">
                  <circle cx="38" cy="38" r="30" fill="none" stroke="#E5F0FF" strokeWidth="7" />
                  <circle cx="38" cy="38" r="30" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
                    strokeDasharray="188.5" strokeDashoffset={188.5 - (188.5 * pct) / 100} transform="rotate(-90 38 38)" />
                </svg>
                <p className="ecw-heading text-sm font-extrabold text-neutral-900 mt-2">{value}</p>
                <p className="ecw-body text-[11px] text-neutral-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OUR TEAM */}
      <section id="team" className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-xl mb-10">
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">Our team</span>
            <h2 className="ecw-heading text-1xl font-extrabold text-neutral-900 mt-2">
              The people who built ESMS
            </h2>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { name: "Erneste Itangishaka", role: "Founder and lead engineer", ring: "ring-emerald-100", tint: "#178754" },
              { name: "Aline Umurerwa", role: "Product designer", ring: "ring-blue-100", tint: "rgb(22,32,111)" },
              { name: "Mukunzi Joseph", role: "Backend Developer", ring: "ring-emerald-100", tint: "#178754" },
              { name: "Ngendahimana Joseph", role: "Curriculum lead", ring: "ring-blue-100", tint: "rgb(22,32,111)" },
            ].map((m) => (
              <div key={m.name} className="flex flex-col items-center text-center bg-neutral-50 rounded-2xl border border-neutral-100 p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 w-full sm:w-[45%] lg:w-[22%]">
                <span className={`w-24 h-24 rounded-full bg-white flex items-center justify-center mx-auto mb-4 ring-4 ${m.ring} shadow-sm`}>
                  <img src={ceo} alt={m.name} className="w-20 h-20 rounded-full" />
                </span>
                <p className="ecw-heading font-bold text-sm text-neutral-900">{m.name}</p>
                <p className="ecw-body text-xs mt-0.5" style={{ color: m.tint }}>{m.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-14 bg-neutral-50 border-y border-neutral-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="max-w-xl mb-10">
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">In their words</span>
            <h2 className="ecw-heading text-2xl font-extrabold text-neutral-900 mt-2">Teachers who use it every day</h2>
          </div>
          <div className="flex flex-wrap gap-5">
            {[
              { quote: "I used to spend a whole weekend marking. Now the quizzes grade themselves and I mark the harder work by hand.", name: "Abayo Albertine", role: "Geo Teacher, LFHS", tint: "#178754" },
              { quote: "Report cards that took two weeks at the end of term now take an afternoon.", name: "Dushime Benjamin", role: "Head teacher, GS Nyamirambo", tint: "rgb(22,32,111)" },
              { quote: "My students open the notes from their phones on the bus home, and that changed how much they read.", name: "Shyaka Jules", role: "Math Teacher, GS Rubona", tint: "#178754" },
            ].map((t) => (
              <div key={t.name} className="flex flex-col bg-white rounded-xl p-5 border border-neutral-100 w-full md:w-[31%]">
                <UserCircle2 className="w-12 h-12 mb-3" style={{ color: t.tint }} aria-hidden="true" />
                <p className="ecw-body text-xs text-neutral-700 leading-relaxed mb-4">"{t.quote}"</p>
                <p className="ecw-heading text-xs font-bold text-neutral-900">{t.name}</p>
                <p className="ecw-body text-[11px] text-neutral-500">{t.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PARTNERS */}
      <section id="partners" className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400 text-center mb-8">Our partners</p>
          <div className="flex flex-wrap gap-5">
            {[
              { icon: Building2, bg: "#EAF6EF", tint: "#178754", name: "MINEDUC", sub: "Ministry of Education" },
              { icon: Landmark, bg: "#E6F1FB", tint: "#1D6FE0", name: "REB", sub: "Basic Education Board" },
              { icon: ScrollText, bg: "#EAF6EF", tint: "#178754", name: "NESA", sub: "National Examination" },
              { icon: HeartHandshake, bg: "#E6F1FB", tint: "#1D6FE0", name: "ASYV", sub: "System supporter" },
            ].map(({ icon: Icon, bg, tint, name, sub }) => (
              <div key={name} className="flex items-center gap-3 bg-neutral-50 rounded-xl p-4 border border-neutral-100 flex-1 min-w-[220px]">
                <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: bg }}>
                  <Icon className="w-5 h-5" style={{ color: tint }} aria-hidden="true" />
                </span>
                <div>
                  <p className="ecw-heading font-bold text-xs text-neutral-900">{name}</p>
                  <p className="ecw-body text-[10px] text-neutral-500">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-14 bg-neutral-50 border-y border-neutral-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-wrap gap-10 items-center">
          <div className="flex-1 min-w-[260px]">
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">Contact</span>
            <h2 className="ecw-heading text-2xl font-extrabold text-neutral-900 mt-2 mb-3">Talk to us before you sign up</h2>
            <p className="ecw-body text-xs text-neutral-600 leading-relaxed mb-5">
              Have questions about pricing, your school code, or how the switch works
              partway through a term? Reach the helpline and someone will walk you through it.
            </p>
            <div className="flex flex-col gap-2 text-xs ecw-body text-neutral-700">
              <p>support@classwork.rw</p>
              <p>+250 788 000 000</p>
              <p>Kigali, Rwanda</p>
            </div>
          </div>
          <div className="flex-1 min-w-[260px] bg-white rounded-xl p-6 border border-neutral-100">
            <div className="flex flex-col gap-3">
              <input type="text" placeholder="Full name" className="w-full text-xs px-3 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400" />
              <input type="text" placeholder="School name" className="w-full text-xs px-3 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400" />
              <textarea placeholder="How can we help?" rows="3" className="w-full text-xs px-3 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400"></textarea>
              <button type="button" className="w-full py-2.5 text-white font-bold text-xs rounded-lg transition-opacity hover:opacity-90 bg-[rgb(22,32,111)]">
                Send message
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="text-white pt-12 bg-[rgb(22,32,111)]">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pb-10 flex flex-wrap gap-8">
          <div className="flex flex-col gap-3 flex-1 min-w-[220px]">
            <div className="flex items-center gap-2.5">
              <span className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <img src={esms} alt="ESMS logo" className="w-full h-full" />
              </span>
              <span className="ecw-heading font-bold text-sm">ESMS</span>
            </div>
            <p className="ecw-body text-[11px] text-white/70 leading-relaxed">
              Academic records and classroom tools built for primary and secondary schools across Rwanda.
            </p>
          </div>
          <div className="flex-1 min-w-[160px]">
            <h4 className="ecw-heading font-bold text-xs uppercase tracking-wider mb-3">System</h4>
            <ul className="flex flex-col gap-2 text-[11px] ecw-body text-white/70">
              <li><a href="#services" className="hover:text-green-300 transition-colors">Our services</a></li>
              <li><a href="#register" className="hover:text-green-300 transition-colors">School registration</a></li>
              <li><a href="#dashboard" className="hover:text-green-300 transition-colors">Live dashboard</a></li>
              <li><a href="#team" className="hover:text-green-300 transition-colors">Our team</a></li>
            </ul>
          </div>
          <div className="flex-1 min-w-[160px]">
            <h4 className="ecw-heading font-bold text-xs uppercase tracking-wider mb-3">Helpline</h4>
            <ul className="flex flex-col gap-2 text-[11px] ecw-body text-white/70">
              <li>support@classwork.rw</li>
              <li>+250 788 000 000</li>
              <li>Kigali, Rwanda</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 px-5 sm:px-8">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 text-[11px] ecw-body text-white/60">
            <p>© 2026 Easy ClassWork Records. All rights reserved.</p>
            <div className="flex gap-4">
              <a href="#home" className="hover:text-white transition-colors">Privacy policy</a>
              <a href="#home" className="hover:text-white transition-colors">Terms of service</a>
              <a href="#contact" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
    </>
  );
}