import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import dashboard from './assets/dashboard.png';
import esms from './assets/esms.jpg';
import trends from './assets/trends.jpg';
import nesa from './assets/nesa.jpg';
import reb from './assets/reb.jpg';
import minedic from './assets/minedic.jpg';
import asyv from './assets/asyv.webp';
import ceo from './assets/ceo.jpg';
import mukunzi from './assets/muk.png';
import minister from './assets/minister.jpg';
import milker from './assets/milker.jpg';
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
  TrendingUp,
  ArrowUpRight,
  Quote,
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

   NOTE ON THIS PASS
   This is a visual-only redesign of the same page (now Home.jsx). The color
   palette is untouched (same green / navy / orange), and every auth/session/
   API call below is byte-for-byte the same as before: same endpoints, same
   storage keys, same fetch calls. Only markup, layout and CSS changed.
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
// FIX (root cause of "Your login session is missing" on Teacher.jsx and the
// silent bounce-back to home on Student.jsx): this used to be a single
// shared USER_SESSION_KEY = "ecw_user_session" that every member role wrote
// to. Teacher.jsx and Student.jsx were BOTH updated a while ago to read from
// their own role-specific keys ("ecw_teacher_session" and
// "ecw_student_session" respectively -- see the USER_SESSION_KEY comments in
// those files) specifically so a teacher and a student signed in on the same
// browser don't clobber each other's token. This file was never updated to
// match: it kept writing every login to the old shared key, so
// getSession() in Teacher.jsx/Student.jsx always found nothing, treated it
// as "no token", and Teacher.jsx surfaced its boot error while Student.jsx's
// requests came back 401 and triggered a real sign-out back to "/". Writing
// to a per-role key here closes that gap.
const MEMBER_SESSION_KEY = {
  teacher: "ecw_teacher_session",
  student: "ecw_student_session",
};

// Steps shown in the "connecting" loading overlay.
const LOADING_STEPS = [
  "Verifying your details",
  "Preparing your workspace",
  "Almost there",
];

// Placeholder shown in the school code input hints.
const DEFAULT_SCHOOL_CODE = "ECR-123456";

// Rotating screenshots shown inside the hero's browser-window mockup. Purely
// presentational — nothing here talks to the server.
const AD_SLIDES = [
  { image: minister, icon: Landmark, caption: "Supporting Rwanda's education vision", path: "/dashboard · partnerships" },
  { image: dashboard, icon: LayoutDashboard, caption: "One dashboard for the whole school", path: "/dashboard · overview" },
  { image: milker, icon: School, caption: "Making school management simpler", path: "/dashboard · schools" },
];

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
   PRESENTATION-ONLY HELPERS
   One small hook powers every scroll-in reveal on the page, so the motion
   language stays consistent instead of a different effect per section.
   ============================================================================ */

function useReveal(options) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2, ...options }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return [ref, visible];
}

function Reveal({ children, className = "", as: Tag = "div" }) {
  const [ref, visible] = useReveal();
  return (
    <Tag ref={ref} className={`ecw-reveal ${visible ? "ecw-reveal-visible" : ""} ${className}`}>
      {children}
    </Tag>
  );
}

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
        <p className="ecw-fade-in text-[11px] text-neutral-400 text-center">Loading Google sign-in…</p>
      )}
      {status === "missing" && (
        <p className="ecw-fade-in text-[11px] font-semibold text-red-600 text-center">
          Google sign-in isn't configured. Set VITE_GOOGLE_CLIENT_ID in your .env file.
        </p>
      )}
      {status === "error" && (
        <p className="ecw-fade-in text-[11px] font-semibold text-red-600 text-center">
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
        className={`w-full flex items-center justify-between text-xs px-3 py-2.5 rounded-lg border bg-white text-left focus:outline-none transition-colors ${error ? "border-red-400" : "border-neutral-200 focus:border-green-400"}`}
      >
        <span className={selected ? "text-neutral-800" : "text-neutral-400"}>
          {loading ? "Loading schools…" : selected ? selected.name : "Select your school"}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="ecw-dropdown-pop absolute z-20 mt-1.5 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
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
                className="flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-neutral-50 cursor-pointer border-b border-neutral-50 last:border-b-0 transition-colors"
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
    <div className="ecw-fade-in flex items-center gap-2.5 rounded-lg border border-[#178754]/25 bg-[#EAF6EF] px-3 py-2.5">
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
      className="ecw-modal-backdrop fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 px-4 py-6"
      role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ecw-modal-pop ecw-body bg-white w-full max-w-md rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
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
            <div className="ecw-fade-in mb-4 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
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
                  <p className="ecw-fade-in text-center text-[11px] font-semibold text-[#178754]">Signing you in…</p>
                )
              ) : (
                <button
                  type="submit"
                  disabled={!googleAccount || authSubmitting}
                  className="w-full mt-1 py-2.5 text-white font-bold text-xs rounded-lg transition-all hover:opacity-90 active:scale-[0.98] bg-[rgb(22,32,111)] disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400 disabled:bg-neutral-50 disabled:cursor-not-allowed transition-colors"
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
                  className="w-full text-xs px-3 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400 disabled:bg-neutral-50 disabled:cursor-not-allowed transition-colors"
                />
              </div>
              <button
                type="submit" disabled={!googleAccount || authSubmitting}
                className="w-full mt-2 py-2.5 text-white font-bold text-xs rounded-lg transition-all hover:opacity-90 active:scale-[0.98] bg-[#178754] disabled:opacity-50 disabled:cursor-not-allowed"
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
      className="ecw-modal-backdrop fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 px-4 py-6"
      role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ecw-modal-pop ecw-body bg-white w-full max-w-sm rounded-2xl shadow-2xl px-6 py-7 text-center">
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
          className="w-full py-2.5 text-white font-bold text-xs rounded-lg hover:opacity-90 active:scale-[0.98] transition-all bg-[rgb(22,32,111)]"
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
      className="ecw-modal-backdrop fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 px-4 py-6"
      role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ecw-modal-pop ecw-body bg-white w-full max-w-md rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
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
            <div className="ecw-fade-in mb-4 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
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
                className="w-full mt-1 py-2.5 text-white font-bold text-xs rounded-lg transition-all hover:opacity-90 active:scale-[0.98] bg-[rgb(22,32,111)]"
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
                className="w-full mt-1 py-2.5 text-white font-bold text-xs rounded-lg transition-all hover:opacity-90 active:scale-[0.98] bg-[#178754] disabled:opacity-50 disabled:cursor-not-allowed"
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

export default function Home() {
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

  // Drives the animated checklist in the "connecting" overlay.
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

  // Drives the hero browser-mockup carousel — crossfades through AD_SLIDES
  // on a timer. Purely visual; see AD_SLIDES above.
  useEffect(() => {
    const interval = setInterval(() => {
      setAdCarouselIndex((prev) => (prev + 1) % AD_SLIDES.length);
    }, 3800);
    return () => clearInterval(interval);
  }, []);

  // Drives the fill-in animation on the "live dashboard" stat rings once
  // they scroll into view.
  const [statsRef, statsVisible] = useReveal({ threshold: 0.4 });

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
  //
  // FIX: the token used to be saved under one shared USER_SESSION_KEY no
  // matter which role signed in, while Teacher.jsx/Student.jsx each read
  // from their OWN role-specific key. That meant getSession() on the
  // dashboard side never found the token this function had just saved. It
  // now writes to MEMBER_SESSION_KEY[role], matching what each dashboard
  // actually reads.
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

      localStorage.setItem(MEMBER_SESSION_KEY[role], JSON.stringify({ token }));
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

  // FIX: this used to remove the shared USER_SESSION_KEY, which — now that
  // sign-in writes to a role-specific key — would no longer actually clear
  // anything for a teacher who backs out of the class-picker step, leaving a
  // half-finished login token behind. It now clears the teacher's own key.
  const closeTeacherStep = () => {
    setTeacherStep(null);
    localStorage.removeItem(MEMBER_SESSION_KEY.teacher);
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

  const activeSlide = AD_SLIDES[adCarouselIndex];

  return (
    <>
      {/* Loading overlay — an animated checklist rather than a bare spinner. */}
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

        :root {
          --ecw-green: #178754;
          --ecw-green-dark: #136040;
          --ecw-green-tint: #EAF6EF;
          --ecw-navy: rgb(22,32,111);
          --ecw-orange: #FF4500;
        }

        .ecw-heading { font-family: 'Poppins', sans-serif; }
        .ecw-body { font-family: 'Inter', sans-serif; }

        @keyframes icon-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .icon-spin { animation: icon-spin 3s linear infinite; }

        /* ---------- scroll-in reveal: one pattern, used consistently ---------- */
        .ecw-reveal {
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1), transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ecw-reveal-visible { opacity: 1; transform: translateY(0); }

        .ecw-fade-in { animation: ecw-fade-in 0.3s ease; }
        @keyframes ecw-fade-in { from { opacity: 0; } to { opacity: 1; } }

        /* ---------- modal entrance ---------- */
        @keyframes ecw-backdrop-fade { from { opacity: 0; } to { opacity: 1; } }
        .ecw-modal-backdrop { animation: ecw-backdrop-fade 0.2s ease; }
        @keyframes ecw-modal-pop { from { opacity: 0; transform: translateY(14px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .ecw-modal-pop { animation: ecw-modal-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes ecw-dropdown-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .ecw-dropdown-pop { animation: ecw-dropdown-pop 0.15s ease; }

        /* ---------- loading overlay ---------- */
        .ecw-blur-active { filter: blur(6px) saturate(0.9) brightness(0.9); transform-origin:center; }
        .ecw-magic-overlay {
          position: fixed; inset: 0; display:flex; align-items:center; justify-content:center;
          background: rgba(6,10,30,0.65); z-index:9999; animation: ecw-backdrop-fade 0.2s ease;
        }
        .ecw-magic-card {
          width:300px; max-width:88%;
          background: var(--ecw-navy);
          border:1px solid rgba(255,255,255,0.1);
          padding:28px 26px; border-radius:18px;
          display:flex; flex-direction:column; align-items:center;
          box-shadow:0 20px 60px rgba(2,6,23,0.55);
          animation: ecw-modal-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
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

        /* ---------- hero browser-window carousel ---------- */
        .ecw-browser {
          position: relative; border-radius: 16px; overflow: hidden;
          background: #fff; border: 1px solid #E5E7EB;
          box-shadow: 0 24px 60px -20px rgba(22,32,111,0.35);
        }
        .ecw-browser-bar {
          display: flex; align-items: center; gap: 8px;
          padding: 0.6rem 0.85rem; background: #F6F7FB; border-bottom: 1px solid #ECEEF5;
        }
        .ecw-browser-dot { width: 8px; height: 8px; border-radius: 999px; background: #D8DCE8; }
        .ecw-browser-url {
          margin-left: 0.5rem; font-size: 10px; color: #8A90A6; font-family: 'Inter', sans-serif;
          background: #fff; border: 1px solid #ECEEF5; border-radius: 999px; padding: 0.15rem 0.65rem;
          flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ecw-browser-stage { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
        .ecw-browser-slide {
          position: absolute; inset: 0; opacity: 0; transform: scale(1.03);
          transition: opacity 0.9s ease, transform 0.9s ease;
        }
        .ecw-browser-slide-active { opacity: 1; transform: scale(1); z-index: 2; }
        .ecw-browser-caption {
          position: absolute; left: 0.85rem; bottom: 0.85rem; right: 0.85rem;
          display: flex; align-items: center; gap: 0.5rem;
          background: rgba(255,255,255,0.94); backdrop-filter: blur(6px);
          border-radius: 999px; padding: 0.5rem 0.85rem; box-shadow: 0 8px 20px rgba(2,6,23,0.12);
        }
        .ecw-badge-float {
          position: absolute; top: -0.9rem; right: 1.4rem; z-index: 4;
          width: 2.6rem; height: 2.6rem; border-radius: 999px; background: var(--ecw-orange);
          display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 24px rgba(255,69,0,0.35);
          animation: ecw-badge-bounce 3.4s ease-in-out infinite;
        }
        @keyframes ecw-badge-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .ecw-hero-dots { display: flex; gap: 0.35rem; justify-content: center; margin-top: 0.9rem; }
        .ecw-hero-dot { width: 6px; height: 6px; border-radius: 999px; background: #D8DCE8; transition: all 0.3s ease; }
        .ecw-hero-dot-active { width: 20px; background: var(--ecw-green); }

        /* ---------- partner marquee ---------- */
        .ecw-marquee { overflow: hidden; -webkit-mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent); mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent); }
        .ecw-marquee-track { display: flex; width: max-content; gap: 1.25rem; animation: ecw-marquee 26s linear infinite; }
        @keyframes ecw-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .ecw-marquee:hover .ecw-marquee-track { animation-play-state: paused; }

        /* ---------- team strip ---------- */
        .ecw-team-strip { display: flex; gap: 1.1rem; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 0.5rem; }
        .ecw-team-card { scroll-snap-align: start; }
        .ecw-team-strip::-webkit-scrollbar { height: 6px; }
        .ecw-team-strip::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 999px; }

        /* ---------- reduced motion ---------- */
        @media (prefers-reduced-motion: reduce) {
          .ecw-reveal { opacity: 1; transform: none; transition: none; }
          .icon-spin, .ecw-browser-slide, .ecw-badge-float, .ecw-marquee-track { animation: none; transition: none; }
          .ecw-browser-slide-active { opacity: 1; }
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

      {/* HERO — headline + inline stat strip on the left, a live browser-window carousel on the right */}
      <section id="home" className="bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-14 pb-16 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
          <div className="flex flex-col items-start text-left">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-white bg-gradient-to-r from-[#FF4500] to-[#c93500] px-4 py-2 rounded mb-5 shadow-sm">
              No more spending lot of time
            </span>
            <h1 className="ecw-heading text-[2rem] sm:text-4xl font-extrabold leading-[1.12] text-neutral-900 mb-4">
              Easy way to manage students in the classroom
            </h1>
            <p className="ecw-body text-sm text-neutral-600 leading-relaxed max-w-md mb-7">
              Easy ClassWork Records gives every school a single system for teachers, students
              and administrators, built for the curriculum and designed for Rwanda.
            </p>

            <div className="flex flex-wrap gap-3 mb-9">
              <button
                type="button" onClick={() => handleNavigate("/register")} disabled={isRegisterLoading}
                className="inline-flex items-center justify-center gap-2 text-[13px] font-bold text-white px-5 py-2.5 rounded-lg transition-all hover:opacity-90 active:scale-[0.98] bg-[#178754] disabled:opacity-90 disabled:cursor-not-allowed"
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
              <a href="#services" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[rgb(22,32,111)] border border-[rgb(22,32,111)]/20 hover:bg-[rgb(22,32,111)]/5 px-5 py-2.5 rounded-lg transition-colors">
                See what it does <ArrowUpRight size={14} />
              </a>
            </div>

            {/* Inline stat strip, replacing the old separate donut section content on the hero */}
            <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-neutral-100 pt-6 w-full">
              {[
                { value: "142+", label: "Partner schools" },
                { value: "48,500+", label: "Active students" },
                { value: "99.9%", label: "System uptime" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="ecw-heading text-lg font-extrabold text-neutral-900">{s.value}</p>
                  <p className="ecw-body text-[11px] text-neutral-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="ecw-badge-float">
              {(() => { const Icon = activeSlide.icon; return <Icon size={16} color="white" />; })()}
            </div>
            <div className="ecw-browser">
              <div className="ecw-browser-bar">
                <span className="ecw-browser-dot" /><span className="ecw-browser-dot" /><span className="ecw-browser-dot" />
                <span className="ecw-browser-url">app.easyclasswork.rw{activeSlide.path.replace("·", "")}</span>
              </div>
              <div className="ecw-browser-stage">
                {AD_SLIDES.map((slide, i) => {
                  const active = i === adCarouselIndex;
                  return (
                    <div key={slide.caption} className={`ecw-browser-slide ${active ? "ecw-browser-slide-active" : ""}`} aria-hidden={!active}>
                      <img src={slide.image} alt={slide.caption} className="w-full h-full object-cover" />
                    </div>
                  );
                })}
                <div className="ecw-browser-caption">
                  {(() => { const Icon = activeSlide.icon; return <Icon size={14} className="text-[#178754] shrink-0" />; })()}
                  <span className="ecw-body text-[11px] font-bold text-neutral-800 truncate">{activeSlide.caption}</span>
                </div>
              </div>
            </div>
            <div className="ecw-hero-dots">
              {AD_SLIDES.map((slide, i) => (
                <span key={slide.caption} className={`ecw-hero-dot ${i === adCarouselIndex ? "ecw-hero-dot-active" : ""}`} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* OUR SERVICES — bento-style list instead of a uniform card grid */}
      <section id="services" className="bg-white py-16 border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <Reveal className="max-w-xl mb-10">
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">Our services</span>
            <h2 className="ecw-heading text-2xl font-extrabold text-neutral-900 mt-2">
              Everything a school needs to run its academic year
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 border-t border-l border-neutral-100">
            {[
              { icon: BookOpen, tint: "#1D6FE0", title: "Class notes", text: "Teachers publish notes by subject and class, students open them anytime." },
              { icon: ClipboardCheck, tint: "#178754", title: "Quizzes", text: "Auto-graded assessments aligned with the competence-based curriculum." },
              { icon: GraduationCap, tint: "#1D6FE0", title: "Gradebook", text: "Record marks once, and let report cards build themselves." },
              { icon: CalendarCheck, tint: "#178754", title: "Attendance", text: "Mark attendance from a phone or a laptop in under a minute." },
              { icon: FileText, tint: "#1D6FE0", title: "Term reports", text: "Generate report cards for a class, or the whole school, in one click." },
              { icon: Wallet, tint: "#178754", title: "Fees and payments", text: "Accept MTN Mobile Money, Airtel Money and bank transfers." },
            ].map(({ icon: Icon, tint, title, text }, idx) => (
              <div
                key={title}
                className="group relative flex items-start gap-4 p-6 border-r border-b border-neutral-100 hover:bg-neutral-50/70 transition-colors duration-300"
              >
                <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-transparent group-hover:bg-[--tint] transition-colors" style={{ "--tint": tint }} />
                <Icon className="w-5 h-5 mt-0.5 shrink-0 transition-transform duration-300 group-hover:scale-110" style={{ color: tint }} aria-hidden="true" />
                <div>
                  <h3 className="ecw-heading font-bold text-sm text-neutral-900 mb-1">{title}</h3>
                  <p className="ecw-body text-xs text-neutral-600 leading-relaxed">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW TO GET STARTED — horizontal connected stepper on desktop, stacked on mobile */}
      <section id="how-it-works" className="py-16 bg-neutral-50 border-y border-neutral-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <Reveal className="max-w-xl mb-12">
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">How to get started</span>
            <h2 className="ecw-heading text-2xl font-extrabold text-neutral-900 mt-2">
              Six steps, and your school is online
            </h2>
          </Reveal>

          <div className="hidden lg:grid grid-cols-6 gap-4 relative">
            <div className="absolute top-5 left-[8.3%] right-[8.3%] h-0.5 bg-[#178754]/25" />
            {[
              { i: 1, title: "Register your school", text: "Verify your email with Google and submit your school details." },
              { i: 2, title: "Get approved", text: "We confirm payment, approve your school, and email your school code." },
              { i: 3, title: "Add staff & students", text: "They sign up with Google using your school code." },
              { i: 4, title: "Confirm sign-in", text: "Every account is verified through Google — no passwords." },
              { i: 5, title: "Publish materials", text: "Teachers start uploading notes and quizzes the same day." },
              { i: 6, title: "Track progress", text: "Watch attendance, grades and quiz results all term." },
            ].map((step) => (
              <div key={step.i} className="relative flex flex-col items-start">
                <div className="relative z-10 w-10 h-10 rounded-full bg-white border-2 border-[#178754] flex items-center justify-center text-sm font-bold text-[rgb(22,32,111)] shadow mb-3">
                  {step.i}
                </div>
                <h3 className="ecw-heading font-bold text-xs text-neutral-900 mb-1">{step.title}</h3>
                <p className="ecw-body text-[11px] text-neutral-600 leading-relaxed">{step.text}</p>
              </div>
            ))}
          </div>

          <div className="lg:hidden flex flex-col gap-5">
            {[
              { i: 1, title: "Register your school", text: "Verify your email with Google and submit your school details and phone number." },
              { i: 2, title: "Get approved", text: "Our team calls you to confirm payment, approves your school, and emails you your school code." },
              { i: 3, title: "Add staff and students", text: "Teachers and students sign up with Google using your school code." },
              { i: 4, title: "Confirm sign-in", text: "Every account is verified through Google — no passwords to manage or forget." },
              { i: 5, title: "Publish notes and quizzes", text: "Teachers start uploading materials the same day." },
              { i: 6, title: "Track progress", text: "Watch attendance, grades and quiz results as the term goes on." },
            ].map((step) => (
              <div key={step.i} className="flex items-start gap-3 bg-white rounded-xl border border-neutral-100 p-4">
                <div className="w-9 h-9 shrink-0 rounded-full bg-white border-2 border-[#178754] flex items-center justify-center text-sm font-bold text-[rgb(22,32,111)] shadow">{step.i}</div>
                <div>
                  <h3 className="ecw-heading font-bold text-sm text-neutral-900">{step.title}</h3>
                  <p className="ecw-body text-xs text-neutral-600 mt-1">{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REGISTER / DASHBOARDS — list-style role rows instead of a card grid */}
      <section id="register" className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <Reveal className="max-w-xl mb-10">
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#FF4500" }}>Register</span>
            <h2 className="ecw-heading text-2xl font-extrabold text-neutral-900 mt-2">Choose your dashboard</h2>
            <p className="ecw-body text-xs text-neutral-600 mt-2">
              Students and teachers verify their email and sign in with Google — teachers also pick every
              class and subject they teach at sign-in. School admins sign in with the same Google account
              they registered their school with, once the school has been approved.
            </p>
          </Reveal>

          <div className="flex flex-col divide-y divide-neutral-100 border-y border-neutral-100 mb-10">
            {[
              { role: "student", tint: "#178754", title: "Student dashboard", text: "Read class notes, take quizzes and check your report card, signed in with Google." },
              { role: "teacher", tint: "#1D6FE0", title: "Teacher dashboard", text: "Upload lesson materials, grade work and record attendance — choose every class and subject you teach when you sign in with Google." },
              { role: "schoolAdmin", tint: "#178754", title: "School admin", text: "Manage staff accounts, student codes and fees for your own school — sign in with the Google account you registered with." },
              { role: "superAdmin", tint: "#1D6FE0", title: "Super admin", text: "Oversee every school on the platform — sign in with the authorized Google account." },
            ].map(({ role, tint, title, text }) => {
              const RoleIcon = ROLE_CONFIG[role].icon;
              return (
                <div key={role} className="group flex flex-col sm:flex-row sm:items-center gap-4 py-6">
                  <span className="inline-flex w-11 h-11 shrink-0 rounded-xl items-center justify-center transition-transform duration-300 group-hover:scale-105" style={{ background: `${tint}14` }}>
                    <RoleIcon className="w-5 h-5" style={{ color: tint }} aria-hidden="true" />
                  </span>
                  <div className="flex-1">
                    <h3 className="ecw-heading font-bold text-sm text-neutral-900">{title}</h3>
                    <p className="ecw-body text-xs text-neutral-600 leading-relaxed mt-0.5 max-w-xl">{text}</p>
                  </div>
                  <button
                    type="button" onClick={() => openAuth(role, "login")}
                    className="shrink-0 py-2.5 px-5 text-white font-bold text-xs rounded-lg transition-all hover:opacity-90 active:scale-[0.98] bg-[rgb(22,32,111)]"
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
                className="whitespace-nowrap inline-flex items-center justify-center gap-2 py-2.5 px-5 text-white font-bold text-xs rounded-lg transition-all hover:opacity-90 active:scale-[0.98] bg-[#178754] disabled:opacity-90 disabled:cursor-not-allowed"
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
      <section id="dashboard" className="py-16 bg-neutral-50 border-y border-neutral-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <Reveal className="max-w-xl mb-8">
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">Live dashboard</span>
            <h2 className="ecw-heading text-2xl font-extrabold text-neutral-900 mt-2">
              See the school's whole term at a glance
            </h2>
          </Reveal>

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

          <div ref={statsRef} className="flex flex-wrap gap-5 mt-8">
            {[
              { pct: 71, color: "rgb(22,32,111)", value: "142+", label: "Partner schools" },
              { pct: 85, color: "#178754", value: "48,500+", label: "Active students" },
              { pct: 98, color: "rgb(22,32,111)", value: "98%", label: "Teacher approval" },
              { pct: 99, color: "#178754", value: "99.9%", label: "System uptime" },
            ].map(({ pct, color, value, label }) => {
              const shownPct = statsVisible ? pct : 0;
              return (
                <div key={label} className="flex flex-col items-center text-center flex-1 min-w-[120px]">
                  <svg width="76" height="76" viewBox="0 0 76 76">
                    <circle cx="38" cy="38" r="30" fill="none" stroke="#E5F0FF" strokeWidth="7" />
                    <circle
                      cx="38" cy="38" r="30" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
                      strokeDasharray="188.5" strokeDashoffset={188.5 - (188.5 * shownPct) / 100}
                      transform="rotate(-90 38 38)"
                      style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1)" }}
                    />
                  </svg>
                  <p className="ecw-heading text-sm font-extrabold text-neutral-900 mt-2">{value}</p>
                  <p className="ecw-body text-[11px] text-neutral-500">{label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* OUR TEAM — horizontal scrolling strip instead of a static grid */}
      <section id="team" className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <Reveal className="max-w-xl mb-10">
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">Our team</span>
            <h2 className="ecw-heading text-xl font-extrabold text-neutral-900 mt-2">
              The people who built ESMS
            </h2>
          </Reveal>
          <div className="ecw-team-strip">
            {[
              { name: "Erneste Itangishaka", role: "Founder and lead engineer", image: ceo, ring: "ring-emerald-100", tint: "#178754" },
              { name: "Aline Umurerwa", role: "Product designer", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80", ring: "ring-blue-100", tint: "rgb(22,32,111)" },
              { name: "Mukunzi Joseph", role: "Backend Developer", image: mukunzi, ring: "ring-emerald-100", tint: "#178754" },
              { name: "Mutangana Justin", role: "Curriculum lead", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=240&q=80", ring: "ring-blue-100", tint: "rgb(22,32,111)" },
            ].map((m) => (
              <div key={m.name} className="ecw-team-card flex flex-col items-center text-center bg-neutral-50 rounded-2xl border border-neutral-100 p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 w-56 shrink-0">
                <span className={`w-24 h-24 rounded-full bg-white flex items-center justify-center mx-auto mb-4 ring-4 ${m.ring} shadow-sm`}>
                  <img src={m.image} alt={`${m.name} portrait`} className="w-full h-full rounded-full object-cover" />
                </span>
                <p className="ecw-heading font-bold text-sm text-neutral-900">{m.name}</p>
                <p className="ecw-body text-xs mt-0.5" style={{ color: m.tint }}>{m.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS — editorial quote cards with an accent rail */}
      <section className="py-16 bg-neutral-50 border-y border-neutral-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <Reveal className="max-w-xl mb-10">
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700">In their words</span>
            <h2 className="ecw-heading text-2xl font-extrabold text-neutral-900 mt-2">Teachers who use it every day</h2>
          </Reveal>
          <div className="flex flex-col gap-4">
            {[
              { quote: "I used to spend a whole weekend marking. Now the quizzes grade themselves and I mark the harder work by hand.", name: "Abayo Albertine", role: "Geo Teacher, LFHS", tint: "#178754" },
              { quote: "Report cards that took two weeks at the end of term now take an afternoon.", name: "Dushime Benjamin", role: "Head teacher, GS Nyamirambo", tint: "rgb(22,32,111)" },
              { quote: "My students open the notes from their phones on the bus home, and that changed how much they read.", name: "Shyaka Jules", role: "Math Teacher, GS Rubona", tint: "#178754" },
            ].map((t) => (
              <div key={t.name} className="flex items-start gap-4 bg-white rounded-xl p-5 border-l-4 hover:shadow-md transition-shadow duration-300" style={{ borderColor: t.tint }}>
                <Quote className="w-7 h-7 shrink-0 mt-0.5 opacity-30" style={{ color: t.tint }} aria-hidden="true" />
                <div>
                  <p className="ecw-body text-xs text-neutral-700 leading-relaxed mb-3">{t.quote}</p>
                  <p className="ecw-heading text-xs font-bold text-neutral-900">{t.name} <span className="ecw-body font-normal text-neutral-400">· {t.role}</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PARTNERS — continuous marquee instead of a static row */}
      <section id="partners" className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-400 text-center mb-8">Our partners</p>
          <div className="ecw-marquee">
            <div className="ecw-marquee-track">
              {[...[
                { image: minedic, name: "MINEDUC", sub: "Ministry of Education" },
                { image: reb, name: "REB", sub: "Basic Education Board" },
                { image: nesa, name: "NESA", sub: "National Examination" },
                { image: asyv, name: "ASYV", sub: "System supporter" },
              ], ...[
                { image: minedic, name: "MINEDUC", sub: "Ministry of Education" },
                { image: reb, name: "REB", sub: "Basic Education Board" },
                { image: nesa, name: "NESA", sub: "National Examination" },
                { image: asyv, name: "ASYV", sub: "System supporter" },
              ]].map(({ image, name, sub }, idx) => (
                <div key={`${name}-${idx}`} className="flex items-center gap-3 bg-neutral-50 rounded-xl p-4 border border-neutral-100 w-72 shrink-0">
                  <span className="w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
                    <img src={image} alt={`${name} logo`} className="w-full h-full object-contain" />
                  </span>
                  <div>
                    <p className="ecw-heading font-bold text-xs text-neutral-900">{name}</p>
                    <p className="ecw-body text-[10px] text-neutral-500">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-16 bg-neutral-50 border-y border-neutral-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-wrap gap-10 items-center">
          <Reveal className="flex-1 min-w-[260px]">
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
          </Reveal>
          <div className="flex-1 min-w-[260px] bg-white rounded-xl p-6 border border-neutral-100">
            <div className="flex flex-col gap-3">
              <input type="text" placeholder="Full name" className="w-full text-xs px-3 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400 transition-colors" />
              <input type="text" placeholder="School name" className="w-full text-xs px-3 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400 transition-colors" />
              <textarea placeholder="How can we help?" rows="3" className="w-full text-xs px-3 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:border-green-400 transition-colors"></textarea>
              <button type="button" className="w-full py-2.5 text-white font-bold text-xs rounded-lg transition-all hover:opacity-90 active:scale-[0.98] bg-[rgb(22,32,111)]">
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