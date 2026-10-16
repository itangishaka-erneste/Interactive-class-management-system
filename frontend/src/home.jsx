import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import dashboard from './assets/dashboard.png';
import esms from './assets/esms.jpg';
import nesa from './assets/nesa.jpg';
import reb from './assets/reb.jpg';
import minedic from './assets/minedic.jpg';
import asyv from './assets/asyv.webp';
import ceo from './assets/ceo.jpg';
import mukunzi from './assets/muk.png';
import minister from './assets/pup.jpg';
import milker from './assets/pupe.jpg';
import {
  BookOpen, ClipboardCheck, GraduationCap, CalendarCheck, FileText, Wallet,
  ShieldCheck, School, LayoutDashboard, Smartphone, Landmark, Mail, Clock3,
  CheckCircle2, ArrowUpRight, Quote, ChevronDown, Menu, X, Sparkles,
  Users, BarChart3, Settings2, Building2, KeyRound, Check,
} from "lucide-react";

/* ============================================================================
   CONFIG  (.env)
     VITE_GOOGLE_CLIENT_ID=your-real-client-id.apps.googleusercontent.com
     VITE_API_BASE=http://localhost:5000

   AUTH NOTES (unchanged behaviour)
   - Every "Continue with Google" button is the real Google Identity Services
     button. Admin tokens are verified on the server. Students/teachers are
     checked against POST /api/{teacher|student}/login|register, and the
     server-issued token is stored under a role-specific key.
   - This pass is a visual/navigation redesign only: same endpoints, same
     storage keys, same fetch calls.
   ============================================================================ */

const GOOGLE_CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID || "";
const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:5000";

const MEMBER_API_PATH = { teacher: "teacher", student: "student" };

const ADMIN_SESSION_KEY = "ecw_admin_session";
const SUPERADMIN_SESSION_KEY = "ecw_superadmin_session";
// Role-specific keys so a teacher and a student on one browser don't clobber
// each other (Teacher.jsx / Student.jsx read from these same keys).
const MEMBER_SESSION_KEY = {
  teacher: "ecw_teacher_session",
  student: "ecw_student_session",
};

const LOADING_STEPS = ["Verifying your details", "Preparing your workspace", "Almost there"];
const DEFAULT_SCHOOL_CODE = "ECR-123456";

const AD_SLIDES = [
  { image: minister, icon: Landmark, caption: "Supporting Rwanda's education vision", path: "/dashboard/partnerships" },
  { image: dashboard, icon: LayoutDashboard, caption: "One dashboard for the whole school", path: "/dashboard/overview" },
  { image: milker, icon: School, caption: "Making school management simpler", path: "/dashboard/schools" },
];

const SUBJECT_OPTIONS = [
  "Mathematics", "English", "Kinyarwanda", "French", "Physics", "Chemistry",
  "Biology", "Geography", "History", "Economics", "Entrepreneurship",
  "Computer Science / ICT", "General Studies",
  "Religion & Values Education", "Physical Education", "Fine Art",
  "Literature in English", "Kiswahili",
];

const ROLE_CONFIG = {
  student: { label: "Student", icon: BookOpen, canRegister: true, authField: "google" },
  teacher: { label: "Teacher", icon: GraduationCap, canRegister: true, authField: "google" },
  schoolAdmin: { label: "School admin", icon: Wallet, canRegister: false, authField: "google" },
  superAdmin: { label: "Super admin", icon: ShieldCheck, canRegister: false, authField: "google" },
};

const isAdminRole = (role) => role === "schoolAdmin" || role === "superAdmin";

/* Dashboards, grouped for the navbar menu and the "Choose your dashboard" section. */
const DASHBOARDS = [
  {
    role: "student", tint: "#178754", group: "For learners & teachers", title: "Student",
    short: "Notes, quizzes, report card",
    text: "Everything a learner needs, in their pocket.",
    points: ["Read class notes anytime", "Take auto-graded quizzes", "Check your report card"],
  },
  {
    role: "teacher", tint: "#1D6FE0", group: "For learners & teachers", title: "Teacher",
    short: "Marks, attendance, materials",
    text: "Pick the classes and subjects you teach, then get on with teaching.",
    points: ["Publish notes and quizzes", "Record marks and attendance", "Choose every class & subject at sign-in"],
  },
  {
    role: "schoolAdmin", tint: "#FF4500", group: "For administrators", title: "School admin",
    short: "Staff, students, fees",
    text: "Run your school from one screen.",
    points: ["Approve staff and students", "Manage school codes", "Track fees and reports"],
  },
  {
    role: "superAdmin", tint: "rgb(22,32,111)", group: "For administrators", title: "Super admin",
    short: "Every school, one view",
    text: "Platform-wide oversight for the authorized account.",
    points: ["Approve new schools", "Monitor platform health", "Authorized Google account only"],
  },
];

const NAV_LINKS = [
  { href: "#services", label: "Services" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#team", label: "Team" },
  { href: "#contact", label: "Contact" },
];

/* Shared input style so every form field looks identical. */
const INPUT =
  "w-full text-xs px-3.5 py-3 rounded-xl border border-neutral-200 bg-white focus:outline-none focus:border-[#178754] focus:ring-4 focus:ring-[#178754]/10 disabled:bg-neutral-50 disabled:cursor-not-allowed transition";

/* ============================================================================
   PRESENTATION HELPERS
   ============================================================================ */

function useReveal(options) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
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

function SectionHead({ tag, title, text, tagColor = "#178754", className = "" }) {
  return (
    <Reveal className={`max-w-2xl mb-10 ${className}`}>
      <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-full mb-3" style={{ color: tagColor, background: `${tagColor}14` }}>{tag}</span>
      <h2 className="ecw-heading text-3xl sm:text-4xl font-extrabold text-neutral-900 leading-tight">{title}</h2>
      {text && <p className="ecw-body text-sm text-neutral-600 leading-relaxed mt-3">{text}</p>}
    </Reveal>
  );
}

/* ============================================================================
   REAL GOOGLE SIGN-IN (Google Identity Services)
   ============================================================================ */

function decodeGoogleJwt(token) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
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
          } catch { setStatus("error"); }
        };
        if (!gsiInitialized) {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => gsiHandler?.(response),
          });
          gsiInitialized = true;
        }
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline", size: "large", shape: "pill", text, width: 280,
        });
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div ref={containerRef} className="flex justify-center min-h-[44px]" />
      {status === "loading" && <p className="ecw-fade-in text-[11px] text-neutral-400 text-center">Loading Google sign-in…</p>}
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
        type="button" onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between text-xs px-3.5 py-3 rounded-xl border bg-white text-left focus:outline-none transition-colors ${error ? "border-red-400" : "border-neutral-200 focus:border-[#178754]"}`}
      >
        <span className={selected ? "text-neutral-800" : "text-neutral-400"}>
          {loading ? "Loading schools…" : selected ? selected.name : "Select your school"}
        </span>
        <ChevronDown size={14} className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="ecw-dropdown-pop absolute z-20 mt-1.5 w-full bg-white border border-neutral-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {schools.length === 0 && !loading && (
            <p className="px-3 py-3 text-[11px] text-neutral-400">
              No approved schools yet. Your school must be registered and approved first.
            </p>
          )}
          {schools.map((school) => {
            const checked = value === school.id;
            return (
              <label key={school.id} className="flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-neutral-50 cursor-pointer border-b border-neutral-50 last:border-b-0 transition-colors">
                <input
                  type="checkbox" checked={checked}
                  onChange={() => { onChange(school.id); setOpen(false); }}
                  className="w-3.5 h-3.5 accent-[#178754] shrink-0"
                />
                <span className="flex-1 text-neutral-700">{school.name}</span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-[#178754] shrink-0">
                  <CheckCircle2 size={11} /> Verified
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoogleAccountChip({ account, onSwitch }) {
  return (
    <div className="ecw-fade-in flex items-center gap-2.5 rounded-xl border border-[#178754]/25 bg-[#EAF6EF] px-3 py-2.5">
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
      <button type="button" onClick={onSwitch} className="text-[10px] font-bold text-[#178754] hover:underline shrink-0">Switch</button>
    </div>
  );
}

/* ---------------------------- Modal shell ---------------------------- */

function ModalShell({ onClose, children, size = "max-w-md" }) {
  return (
    <div
      className="ecw-modal-backdrop fixed inset-0 z-[9998] flex items-center justify-center bg-[#0b1033]/60 backdrop-blur-sm px-4 py-6"
      role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`ecw-modal-pop ecw-body bg-white w-full ${size} rounded-3xl max-h-[90vh] overflow-y-auto shadow-2xl`}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ icon: Icon, eyebrow, title, onClose }) {
  return (
    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur flex items-center gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-neutral-100">
      <span className="w-11 h-11 shrink-0 rounded-2xl bg-white p-1 overflow-hidden flex items-center justify-center ring-1 ring-[#178754]/20">
        <img src={esms} alt="ESMS logo" className="w-full h-full object-contain" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-green-700">{eyebrow}</p>
        <h3 className="ecw-heading text-base font-extrabold text-neutral-900 mt-0.5 truncate">{title}</h3>
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors">
        <X size={16} />
      </button>
    </div>
  );
}

function ErrorBanner({ children }) {
  return (
    <div className="ecw-fade-in mb-4 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
      {children}
    </div>
  );
}

function AuthModal({
  role, mode, onClose, onSwitchMode, onRegisterSchool,
  registerForm, setRegisterForm,
  formError, authSubmitting, onSubmitRegister, onSubmitLogin,
  googleAccount, onGoogleSignedIn, onGoogleSwitch, schools, schoolsLoading,
}) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.student;
  const roleLabel = config.label;
  const canRegister = config.canRegister;
  const autoSignIn = isAdminRole(role);

  const loginHint =
    role === "superAdmin"
      ? "Sign in with the Google account authorized for platform administration."
      : role === "schoolAdmin"
        ? "Sign in with the Google account you registered your school with. Your school must be approved first — we email your school code as soon as it is."
        : "Sign in with the Google account you registered with. We only use it to confirm your email — no password to remember.";

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader
        icon={config.icon} eyebrow={`${roleLabel} account`} onClose={onClose}
        title={mode === "login" ? `Sign in as ${roleLabel.toLowerCase()}` : `Create your ${roleLabel.toLowerCase()} account`}
      />
      <div className="px-5 sm:px-6 py-5">
        {formError && <ErrorBanner>{formError}</ErrorBanner>}

        {mode === "login" ? (
          <form onSubmit={onSubmitLogin} className="flex flex-col gap-3">
            <p className="text-[11px] text-neutral-500 -mt-1">{loginHint}</p>

            {googleAccount ? (
              <GoogleAccountChip account={googleAccount} onSwitch={onGoogleSwitch} />
            ) : (
              <GoogleSignInButton onSignedIn={onGoogleSignedIn} />
            )}

            {autoSignIn ? (
              authSubmitting && <p className="ecw-fade-in text-center text-[11px] font-semibold text-[#178754]">Signing you in…</p>
            ) : (
              <button
                type="submit" disabled={!googleAccount || authSubmitting}
                className="w-full mt-1 py-3 text-white font-bold text-xs rounded-xl transition-all hover:opacity-90 active:scale-[0.98] bg-[rgb(22,32,111)] disabled:opacity-50 disabled:cursor-not-allowed"
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
                <button type="button" onClick={onRegisterSchool} className="font-bold text-[#178754] hover:underline">Register your school</button>
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
                placeholder="Full name" className={INPUT}
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
                placeholder={`Given by your school (e.g. ${DEFAULT_SCHOOL_CODE})`} className={INPUT}
              />
            </div>
            <button
              type="submit" disabled={!googleAccount || authSubmitting}
              className="w-full mt-2 py-3 text-white font-bold text-xs rounded-xl transition-all hover:opacity-90 active:scale-[0.98] bg-[#178754] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {authSubmitting ? "Checking code…" : "Submit for school approval"}
            </button>
            <p className="text-center text-[11px] text-neutral-500 mt-1">
              Already have an account?{" "}
              <button type="button" onClick={() => onSwitchMode("login")} className="font-bold text-[rgb(22,32,111)] hover:underline">Sign in</button>
            </p>
          </form>
        )}
      </div>
    </ModalShell>
  );
}

function PendingApprovalModal({ roleLabel, schoolName, onClose }) {
  return (
    <ModalShell onClose={onClose} size="max-w-sm">
      <div className="px-6 py-8 text-center">
          <span className="w-14 h-14 rounded-full bg-white p-1 overflow-hidden flex items-center justify-center mx-auto mb-4 ring-1 ring-amber-200">
          <img src={esms} alt="ESMS logo" className="w-full h-full object-contain" />
        </span>
        <h3 className="ecw-heading text-lg font-extrabold text-neutral-900 mb-1.5">Registration submitted</h3>
        <p className="text-xs text-neutral-500 leading-relaxed mb-6">
          Your {roleLabel.toLowerCase()} account has been sent to {schoolName || "your school"} for approval.
          Once approved, sign in with the same Google account to continue.
        </p>
        <button type="button" onClick={onClose} className="w-full py-3 text-white font-bold text-xs rounded-xl hover:opacity-90 active:scale-[0.98] transition-all bg-[rgb(22,32,111)]">
          Got it
        </button>
      </div>
    </ModalShell>
  );
}

/* Teacher classes/subjects step — shown right after a teacher's Google sign-in. */
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
    <ModalShell onClose={onClose}>
      <ModalHeader
        icon={GraduationCap} eyebrow="Teacher sign-in" onClose={onClose}
        title={mode === "pick" ? "Your classes" : "Which classes & subjects?"}
      />
      <div className="px-5 sm:px-6 py-5">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        {mode === "pick" ? (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-neutral-500 -mt-1">
              These are the classes and subjects linked to your account. Continue to your dashboard, or add more if something's missing.
            </p>
            <div className="flex flex-col gap-2">
              {assignments.map((a) => (
                <div key={a.id} className="w-full flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3.5 py-2.5">
                  <span>
                    <span className="block text-xs font-bold text-neutral-800">{a.className}</span>
                    <span className="block text-[11px] text-neutral-500">{a.subject}</span>
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button" onClick={() => onPickExisting(assignments)}
              className="w-full mt-1 py-3 text-white font-bold text-xs rounded-xl transition-all hover:opacity-90 active:scale-[0.98] bg-[rgb(22,32,111)]"
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
              Tick every class you teach, and every subject you teach — we'll link you to each class/subject pair.
              You can always add more later at sign-in.
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
              <div className="max-h-36 overflow-y-auto border border-neutral-200 rounded-xl p-2.5 flex flex-col gap-1.5">
                {classes.length === 0 ? (
                  <p className="text-[11px] text-neutral-400 px-1 py-1">No classes yet — add one below.</p>
                ) : classes.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                    <input type="checkbox" checked={form.classIds.has(c.id)} onChange={() => onToggleClass(c.id)} className="w-3.5 h-3.5 accent-[#178754] shrink-0" />
                    {c.name}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  value={form.customClass}
                  onChange={(e) => setStep((s) => (s ? { ...s, form: { ...s.form, customClass: e.target.value } } : s))}
                  placeholder="e.g. S4 MCB" className={`${INPUT} !py-2 flex-1`}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddCustomClass(); } }}
                />
                <button type="button" onClick={onAddCustomClass} className="text-[11px] font-bold text-[#178754] hover:underline shrink-0">Add</button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-neutral-600">Subjects you teach</label>
                <button type="button" onClick={onToggleAllSubjects} className="text-[10px] font-bold text-[#178754] hover:underline">
                  {allSubjectsSelected ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto border border-neutral-200 rounded-xl p-2.5 flex flex-col gap-1.5">
                {allSubjectChoices.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                    <input type="checkbox" checked={form.subjects.has(s)} onChange={() => onToggleSubject(s)} className="w-3.5 h-3.5 accent-[#178754] shrink-0" />
                    {s}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  value={form.customSubject}
                  onChange={(e) => setStep((s) => (s ? { ...s, form: { ...s.form, customSubject: e.target.value } } : s))}
                  placeholder="Other subject not listed" className={`${INPUT} !py-2 flex-1`}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddCustomSubject(); } }}
                />
                <button type="button" onClick={onAddCustomSubject} className="text-[11px] font-bold text-[#178754] hover:underline shrink-0">Add</button>
              </div>
            </div>

            <button
              type="button" disabled={submitting || form.classIds.size === 0 || form.subjects.size === 0}
              onClick={onSubmitAdd}
              className="w-full mt-1 py-3 text-white font-bold text-xs rounded-xl transition-all hover:opacity-90 active:scale-[0.98] bg-[#178754] disabled:opacity-50 disabled:cursor-not-allowed"
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
    </ModalShell>
  );
}

/* ============================================================================
   NAVBAR
   Three separate pieces floating on one row: logo chip | links pill | actions.
   "Dashboards" is one dropdown grouped by audience, so the bar stays short
   and every role (student, teacher, school admin, super admin) is one click
   away.
   ============================================================================ */

function Navbar({ onGetStarted, onOpenAuth, loading }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dashOpen, setDashOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const dashRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const close = (e) => { if (dashRef.current && !dashRef.current.contains(e.target)) setDashOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { setDashOpen(false); setMenuOpen(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);

  const groups = [...new Set(DASHBOARDS.map((d) => d.group))];
  const pick = (role) => { setDashOpen(false); setMenuOpen(false); onOpenAuth(role, "login"); };
  const linkCls = "px-3.5 py-2 rounded-full text-[13px] font-semibold text-neutral-600 hover:text-[#178754] hover:bg-[#EAF6EF] transition-colors";

  return (
    <header className="fixed top-3 sm:top-4 inset-x-0 z-50 px-3 sm:px-6 pointer-events-none">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* logo chip */}
        <a href="#home" className={`pointer-events-auto flex items-center gap-2.5 bg-white rounded-full pl-1.5 pr-4 py-1.5 border border-neutral-200/80 transition-shadow ${scrolled ? "shadow-lg" : "shadow-sm"}`}>
          <span className="w-9 h-9 rounded-full bg-white p-0.5 overflow-hidden ring-1 ring-[#178754]/20 shrink-0 flex items-center justify-center">
            <img src={esms} alt="ESMS logo" className="w-full h-full object-contain" />
          </span>
          <span className="ecw-heading font-extrabold text-[15px] text-neutral-900 leading-none">ESMS</span>
        </a>

        {/* centre pill with the links */}
        <nav className={`pointer-events-auto hidden lg:flex items-center gap-0.5 bg-white/90 backdrop-blur-xl rounded-full p-1.5 border border-neutral-200/80 ecw-body transition-shadow ${scrolled ? "shadow-lg" : "shadow-sm"}`}>
          <a href="#services" className={linkCls}>Services</a>
          <a href="#how-it-works" className={linkCls}>How it works</a>

          <div className="relative" ref={dashRef}>
            <button
              type="button" onClick={() => setDashOpen((o) => !o)} aria-expanded={dashOpen} aria-haspopup="true"
              className={`${linkCls} inline-flex items-center gap-1 ${dashOpen ? "bg-[#EAF6EF] text-[#178754]" : ""}`}
            >
              Dashboards <ChevronDown size={13} className={`transition-transform ${dashOpen ? "rotate-180" : ""}`} />
            </button>
            {dashOpen && (
              <div className="ecw-dropdown-pop absolute left-1/2 -translate-x-1/2 top-[calc(100%+14px)] w-[520px] bg-white rounded-3xl border border-neutral-200 shadow-2xl p-4 grid grid-cols-2 gap-4">
                {groups.map((g) => (
                  <div key={g}>
                    <p className="text-[10px] font-bold text-neutral-400 px-2 mb-1.5">{g}</p>
                    <div className="flex flex-col gap-1">
                      {DASHBOARDS.filter((d) => d.group === g).map((d) => {
                        const Icon = ROLE_CONFIG[d.role].icon;
                        return (
                          <button key={d.role} type="button" onClick={() => pick(d.role)} className="group flex items-center gap-3 text-left rounded-2xl p-2.5 hover:bg-neutral-50 transition-colors">
                            <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${d.tint}14` }}>
                              <Icon size={18} style={{ color: d.tint }} />
                            </span>
                            <span className="min-w-0">
                              <span className="block ecw-heading text-[13px] font-bold text-neutral-900">{d.title}</span>
                              <span className="block text-[11px] text-neutral-500 truncate">{d.short}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <button
                  type="button" onClick={() => { setDashOpen(false); onGetStarted(); }}
                  className="col-span-2 flex items-center justify-between rounded-2xl bg-[rgb(22,32,111)] text-white px-4 py-3 hover:opacity-95 transition-opacity"
                >
                  <span className="text-left">
                    <span className="block ecw-heading text-[13px] font-bold">New school?</span>
                    <span className="block text-[11px] text-white/70">Register it and get your school code</span>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              </div>
            )}
          </div>

          <a href="#team" className={linkCls}>Team</a>
          <a href="#contact" className={linkCls}>Contact</a>
        </nav>

        {/* actions */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button" onClick={onGetStarted} disabled={loading}
            className="hidden sm:inline-flex items-center gap-2 text-[13px] font-bold text-white px-5 py-3 rounded-full bg-[#178754] hover:bg-[#136040] shadow-md shadow-[#178754]/25 transition-colors disabled:opacity-80 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 icon-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="30 20" /></svg>
                Loading…
              </>
            ) : "Get started"}
          </button>
          <button
            type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" aria-expanded={menuOpen}
            className="lg:hidden w-11 h-11 rounded-full bg-white border border-neutral-200 shadow-sm flex items-center justify-center text-neutral-700"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* mobile sheet */}
      {menuOpen && (
        <div className="pointer-events-auto lg:hidden ecw-dropdown-pop max-w-6xl mx-auto mt-2 bg-white rounded-3xl border border-neutral-200 shadow-2xl p-4 ecw-body max-h-[78vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-1 mb-3">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="px-3 py-2.5 rounded-xl text-[13px] font-semibold text-neutral-700 hover:bg-neutral-50">{l.label}</a>
            ))}
          </div>
          {groups.map((g) => (
            <div key={g} className="mb-3">
              <p className="text-[10px] font-bold text-neutral-400 px-1 mb-1.5">{g}</p>
              <div className="grid grid-cols-2 gap-2">
                {DASHBOARDS.filter((d) => d.group === g).map((d) => {
                  const Icon = ROLE_CONFIG[d.role].icon;
                  return (
                    <button key={d.role} type="button" onClick={() => pick(d.role)} className="flex items-center gap-2 rounded-xl border border-neutral-100 p-2.5 text-left">
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${d.tint}14` }}><Icon size={15} style={{ color: d.tint }} /></span>
                      <span className="text-[12px] font-bold text-neutral-800 leading-tight">{d.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => { setMenuOpen(false); onGetStarted(); }} className="w-full py-3 rounded-xl bg-[#178754] text-white text-[13px] font-bold">Register your school</button>
        </div>
      )}
    </header>
  );
}

/* ============================================================================
   PAGE
   ============================================================================ */

export default function Home() {
  const navigate = useNavigate();

  const [isRegisterLoading, setIsRegisterLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [adCarouselIndex, setAdCarouselIndex] = useState(0);

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

  const [authView, setAuthView] = useState(null);
  const [formError, setFormError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [registerForm, setRegisterForm] = useState({ fullName: "", email: "", school: "", schoolCode: "" });

  const [googleAccount, setGoogleAccount] = useState(null);
  const [pendingApproval, setPendingApproval] = useState(null);
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
    const interval = setInterval(() => setAdCarouselIndex((prev) => (prev + 1) % AD_SLIDES.length), 3800);
    return () => clearInterval(interval);
  }, []);

  const [statsRef, statsVisible] = useReveal({ threshold: 0.4 });

  const handleNavigate = (path, state) => {
    setIsRegisterLoading(true);
    setTimeout(() => { navigate(path, state ? { state } : undefined); }, 1600);
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

  // ---- School admin + super admin sign-in (token verified server-side) ----
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

  // ---- Student / teacher sign-in (real backend, role-specific session key) ----
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

      const meRes = await fetch(`${API_BASE}/api/${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
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
    if (authView?.mode === "login" && isAdminRole(authView.role)) signInAdmin(authView.role, account);
  };

  const handleGoogleSwitch = () => {
    setFormError("");
    setGoogleAccount(null);
    window.google?.accounts?.id?.disableAutoSelect?.();
  };

  // ---- Teacher classes/subjects step ----
  const blankAddForm = () => ({ classIds: new Set(), subjects: new Set(), customSubject: "", customClass: "" });

  const startTeacherClassStep = (token, teacher, assignments, classes) => {
    setTeacherStep({
      token, teacher, mode: assignments.length === 0 ? "add" : "pick",
      assignments, classes, form: blankAddForm(), submitting: false, error: "",
    });
  };

  const completeTeacherLogin = (token, teacher, assignments) => {
    setTeacherStep(null);
    handleNavigate("/dashboard/teacher", { token, email: teacher?.email, name: teacher?.fullName, assignments });
  };

  const handlePickExisting = (assignments) => {
    if (!teacherStep) return;
    completeTeacherLogin(teacherStep.token, teacherStep.teacher, assignments);
  };

  const handleSwitchTeacherStepToAdd = () => setTeacherStep((s) => (s ? { ...s, mode: "add", error: "", form: blankAddForm() } : s));
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

  const handleSubmitNewAssignment = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!teacherStep) return;
    const { classIds, subjects } = teacherStep.form;
    if (classIds.size === 0 || subjects.size === 0) {
      setTeacherStep((s) => (s ? { ...s, error: "Pick at least one class and one subject." } : s));
      return;
    }

    const classNames = [...classIds].map((id) => teacherStep.classes.find((c) => c.id === id)?.name).filter(Boolean);
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
        if (!res.ok || !data.success) throw new Error(data.message || `Could not add ${pair.className} · ${pair.subject}.`);
        latestAssignments = data.assignments;
      }
      completeTeacherLogin(teacherStep.token, teacherStep.teacher, latestAssignments);
    } catch (err) {
      setTeacherStep((s) => (s ? { ...s, submitting: false, error: err.message } : s));
    }
  };

  const closeTeacherStep = () => {
    setTeacherStep(null);
    localStorage.removeItem(MEMBER_SESSION_KEY.teacher);
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setFormError("");
    const role = authView?.role;
    if (!googleAccount) { setFormError("Continue with Google first."); return; }
    if (isAdminRole(role)) signInAdmin(role, googleAccount);
    else signInMember(role, googleAccount);
  };

  // ---- Student / teacher registration (pending school approval) ----
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
  const ActiveIcon = activeSlide.icon;
  const goRegister = () => handleNavigate("/register");

  const PARTNERS = [
    { image: minedic, name: "MINEDUC", sub: "Ministry of Education" },
    { image: reb, name: "REB", sub: "Basic Education Board" },
    { image: nesa, name: "NESA", sub: "National Examination" },
    { image: asyv, name: "ASYV", sub: "System supporter" },
  ];

  const SERVICES = [
    { icon: BookOpen, tint: "#1D6FE0", title: "Class notes", text: "Teachers publish notes by subject and class. Students open them anytime, on any phone.", span: "sm:col-span-2" },
    { icon: ClipboardCheck, tint: "#178754", title: "Quizzes", text: "Auto-graded and aligned with the competence-based curriculum.", span: "" },
    { icon: GraduationCap, tint: "#1D6FE0", title: "Gradebook", text: "Record marks once. Report cards build themselves.", span: "" },
    { icon: CalendarCheck, tint: "#FF4500", title: "Attendance", text: "Mark a whole class in under a minute.", span: "" },
    { icon: FileText, tint: "#178754", title: "Term reports", text: "One click for a class, or the whole school.", span: "" },
    { icon: Wallet, tint: "rgb(22,32,111)", title: "Fees and payments", text: "Accept MTN Mobile Money, Airtel Money and bank transfers, with receipts sent automatically.", span: "sm:col-span-2" },
  ];

  const STEPS = [
    { title: "Register your school", text: "Verify your email with Google and submit your school details and phone number." },
    { title: "Get approved", text: "We confirm payment, approve your school, and email your school code." },
    { title: "Add staff and students", text: "They sign up with Google using your school code." },
    { title: "Confirm sign-in", text: "Every account is verified through Google. No passwords to manage." },
    { title: "Publish materials", text: "Teachers start uploading notes and quizzes the same day." },
    { title: "Track progress", text: "Watch attendance, grades and quiz results all term." },
  ];

  const TEAM = [
    { name: "Erneste Itangishaka", role: "Founder and lead engineer", image: ceo, tint: "#178754" },
    { name: "Aline Umurerwa", role: "Product designer", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80", tint: "#1D6FE0" },
    { name: "Mukunzi Joseph", role: "Backend developer", image: mukunzi, tint: "#FF4500" },
    { name: "Mutangana Justin", role: "Curriculum lead", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=240&q=80", tint: "rgb(22,32,111)" },
  ];

  const TESTIMONIALS = [
    { quote: "I used to spend a whole weekend marking. Now the quizzes grade themselves and I mark the harder work by hand.", name: "Abayo Albertine", role: "Geo teacher, LFHS", tint: "#178754" },
    { quote: "Report cards that took two weeks at the end of term now take an afternoon.", name: "Dushime Benjamin", role: "Head teacher, GS Nyamirambo", tint: "rgb(22,32,111)" },
    { quote: "My students open the notes from their phones on the bus home, and that changed how much they read.", name: "Shyaka Jules", role: "Math teacher, GS Rubona", tint: "#FF4500" },
  ];

  const STATS = [
    { pct: 71, color: "rgb(22,32,111)", value: "142+", label: "Partner schools" },
    { pct: 85, color: "#178754", value: "48,500+", label: "Active students" },
    { pct: 98, color: "#FF4500", value: "98%", label: "Teacher approval" },
    { pct: 99, color: "#1D6FE0", value: "99.9%", label: "System uptime" },
  ];

  return (
    <>
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
                    <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors"
                      style={{ background: done ? "#178754" : active ? "#FF4500" : "rgba(255,255,255,0.12)" }}>
                      {done ? <CheckCircle2 size={13} color="white" strokeWidth={3} /> : <span className={`w-1.5 h-1.5 rounded-full bg-white ${active ? "animate-pulse" : "opacity-40"}`} />}
                    </span>
                    <span className={`text-xs ${done ? "text-white" : active ? "text-white font-semibold" : "text-white/50"}`}>{label}</span>
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
          roleLabel={pendingApproval.roleLabel} schoolName={pendingApproval.schoolName}
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

      <div className={`min-h-screen bg-white text-neutral-900 font-sans antialiased overflow-x-hidden ${isOverlayActive ? "ecw-blur-active" : ""}`}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600&display=swap');

          :root { --ecw-green:#178754; --ecw-green-dark:#136040; --ecw-green-tint:#EAF6EF; --ecw-navy:rgb(22,32,111); --ecw-orange:#FF4500; }
          html { scroll-behavior: smooth; }
          section[id] { scroll-margin-top: 6rem; }

          .ecw-heading { font-family:'Bricolage Grotesque','Inter',sans-serif; letter-spacing:-0.02em; }
          .ecw-body { font-family:'Inter',sans-serif; }

          @keyframes icon-spin { to { transform: rotate(360deg); } }
          .icon-spin { animation: icon-spin 1s linear infinite; }

          .ecw-reveal { opacity:0; transform:translateY(18px); transition:opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1); }
          .ecw-reveal-visible { opacity:1; transform:none; }

          .ecw-fade-in { animation: ecw-fade-in .3s ease; }
          @keyframes ecw-fade-in { from{opacity:0} to{opacity:1} }
          @keyframes ecw-backdrop-fade { from{opacity:0} to{opacity:1} }
          .ecw-modal-backdrop { animation: ecw-backdrop-fade .2s ease; }
          @keyframes ecw-modal-pop { from{opacity:0;transform:translateY(14px) scale(.97)} to{opacity:1;transform:none} }
          .ecw-modal-pop { animation: ecw-modal-pop .3s cubic-bezier(.16,1,.3,1); }
          @keyframes ecw-dropdown-pop { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }
          .ecw-dropdown-pop { animation: ecw-dropdown-pop .18s ease; }
          /* the centred desktop dropdown keeps its horizontal centring while animating */
          nav .ecw-dropdown-pop { animation-name: ecw-fade-in; }

          .ecw-blur-active { filter: blur(6px) saturate(.9) brightness(.9); }
          .ecw-magic-overlay { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(6,10,30,.65); z-index:9999; animation: ecw-backdrop-fade .2s ease; }
          .ecw-magic-card { width:300px; max-width:88%; background:var(--ecw-navy); border:1px solid rgba(255,255,255,.1); padding:28px 26px; border-radius:22px; display:flex; flex-direction:column; align-items:center; box-shadow:0 20px 60px rgba(2,6,23,.55); animation: ecw-modal-pop .3s cubic-bezier(.16,1,.3,1); }
          .ecw-magic-title { color:#fff; font-weight:700; font-size:15px; }
          .ecw-progress-track { width:100%; height:5px; border-radius:999px; background:rgba(255,255,255,.12); overflow:hidden; margin-top:14px; }
          .ecw-progress-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,#FF4500,#178754); transition:width .4s ease; }

          /* hero backdrop: soft colour blobs on a faint dot grid */
          .ecw-hero-bg { background:
            radial-gradient(600px 400px at 85% 10%, rgba(23,135,84,.16), transparent 70%),
            radial-gradient(500px 380px at 5% 30%, rgba(255,69,0,.10), transparent 70%),
            radial-gradient(520px 420px at 60% 100%, rgba(22,32,111,.10), transparent 70%),
            #fff; position:relative; }
          .ecw-hero-bg::before { content:""; position:absolute; inset:0; background-image:radial-gradient(#16206f14 1px, transparent 1px); background-size:22px 22px; mask-image:linear-gradient(to bottom,black,transparent 85%); -webkit-mask-image:linear-gradient(to bottom,black,transparent 85%); pointer-events:none; }

          .ecw-highlight { background:linear-gradient(transparent 62%, rgba(255,69,0,.28) 62%); }

          .ecw-browser { position:relative; border-radius:22px; overflow:hidden; background:#fff; border:1px solid #E5E7EB; box-shadow:0 30px 70px -24px rgba(22,32,111,.45); }
          .ecw-browser-bar { display:flex; align-items:center; gap:8px; padding:.65rem .9rem; background:#F6F7FB; border-bottom:1px solid #ECEEF5; }
          .ecw-browser-dot { width:9px; height:9px; border-radius:999px; background:#D8DCE8; }
          .ecw-browser-url { margin-left:.5rem; font-size:10px; color:#8A90A6; font-family:'Inter',sans-serif; background:#fff; border:1px solid #ECEEF5; border-radius:999px; padding:.15rem .7rem; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .ecw-browser-stage { position:relative; aspect-ratio:16/10; overflow:hidden; }
          .ecw-browser-slide { position:absolute; inset:0; opacity:0; transform:scale(1.03); transition:opacity .9s ease, transform .9s ease; }
          .ecw-browser-slide-active { opacity:1; transform:scale(1); z-index:2; }
          .ecw-browser-caption { position:absolute; left:.9rem; bottom:.9rem; right:.9rem; z-index:3; display:flex; align-items:center; gap:.5rem; background:rgba(255,255,255,.94); backdrop-filter:blur(6px); border-radius:999px; padding:.5rem .9rem; box-shadow:0 8px 20px rgba(2,6,23,.12); }
          .ecw-sticker { position:absolute; z-index:4; display:flex; align-items:center; gap:.5rem; background:#fff; border:1px solid #ECEEF5; border-radius:16px; padding:.55rem .8rem; box-shadow:0 14px 30px rgba(22,32,111,.16); animation: ecw-float 4.2s ease-in-out infinite; }
          @keyframes ecw-float { 0%,100%{transform:translateY(0) rotate(var(--r,0deg))} 50%{transform:translateY(-7px) rotate(var(--r,0deg))} }
          .ecw-hero-dots { display:flex; gap:.35rem; justify-content:center; margin-top:1rem; }
          .ecw-hero-dot { width:6px; height:6px; border-radius:999px; background:#D8DCE8; transition:all .3s ease; }
          .ecw-hero-dot-active { width:22px; background:var(--ecw-green); }

          .ecw-marquee { overflow:hidden; -webkit-mask-image:linear-gradient(to right,transparent,black 8%,black 92%,transparent); mask-image:linear-gradient(to right,transparent,black 8%,black 92%,transparent); }
          .ecw-marquee-track { display:flex; width:max-content; gap:1rem; animation: ecw-marquee 28s linear infinite; }
          @keyframes ecw-marquee { to { transform: translateX(-50%); } }
          .ecw-marquee:hover .ecw-marquee-track { animation-play-state:paused; }

          .ecw-team-strip::-webkit-scrollbar { height:6px; }
          .ecw-team-strip::-webkit-scrollbar-thumb { background:#E5E7EB; border-radius:999px; }

          :focus-visible { outline:2px solid var(--ecw-green); outline-offset:2px; }

          @media (prefers-reduced-motion: reduce) {
            html { scroll-behavior:auto; }
            .ecw-reveal { opacity:1; transform:none; transition:none; }
            .icon-spin, .ecw-browser-slide, .ecw-sticker, .ecw-marquee-track { animation:none; transition:none; }
            .ecw-browser-slide-active { opacity:1; }
          }
        `}</style>

        <Navbar onGetStarted={goRegister} onOpenAuth={openAuth} loading={isRegisterLoading} />

        {/* HERO */}
        <section id="home" className="ecw-hero-bg pt-32 sm:pt-36 pb-20">
          <div className="relative max-w-6xl mx-auto px-5 sm:px-8 grid lg:grid-cols-[1.05fr_1fr] gap-14 items-center">
            <div className="flex flex-col items-start text-left">
              <span className="inline-flex items-center gap-2 text-[12px] font-bold text-[rgb(22,32,111)] bg-white border border-neutral-200 pl-2 pr-4 py-1.5 rounded-full shadow-sm mb-6">
                <span className="w-6 h-6 rounded-full bg-[#FF4500] flex items-center justify-center"><Sparkles size={12} color="white" /></span>
                Built for Rwandan schools
              </span>
              <h1 className="ecw-heading text-[2.6rem] sm:text-6xl font-extrabold leading-[1.02] text-neutral-900 mb-5">
                Classwork, marks and fees. <span className="ecw-highlight">Sorted</span> in one place.
              </h1>
              <p className="ecw-body text-[15px] text-neutral-600 leading-relaxed max-w-md mb-8">
                Easy ClassWork Records gives every school one system for teachers, students and administrators,
                built around the Rwandan curriculum.
              </p>

              <div className="flex flex-wrap gap-3 mb-10">
                <button type="button" onClick={goRegister} disabled={isRegisterLoading}
                  className="inline-flex items-center justify-center gap-2 text-sm font-bold text-white px-6 py-3.5 rounded-full transition-all hover:-translate-y-0.5 active:scale-[0.98] bg-[#178754] shadow-lg shadow-[#178754]/30 disabled:opacity-90 disabled:cursor-not-allowed">
                  {isRegisterLoading ? "Loading…" : "Register your school"}
                </button>
                <a href="#dashboards" className="inline-flex items-center gap-1.5 text-sm font-bold text-[rgb(22,32,111)] bg-white border border-neutral-200 hover:border-[rgb(22,32,111)]/40 px-6 py-3.5 rounded-full transition-colors">
                  Pick your dashboard <ArrowUpRight size={15} />
                </a>
              </div>

              <div className="flex flex-wrap gap-x-10 gap-y-3 pt-6 border-t border-neutral-200/70 w-full">
                {[{ v: "142+", l: "Partner schools" }, { v: "48,500+", l: "Active students" }, { v: "99.9%", l: "System uptime" }].map((s) => (
                  <div key={s.l}>
                    <p className="ecw-heading text-xl font-extrabold text-neutral-900">{s.v}</p>
                    <p className="ecw-body text-[11px] text-neutral-500">{s.l}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="ecw-sticker -top-5 -left-3 sm:-left-8" style={{ "--r": "-4deg" }}>
                <span className="w-8 h-8 rounded-xl bg-[#EAF6EF] flex items-center justify-center"><ClipboardCheck size={16} className="text-[#178754]" /></span>
                <span><span className="block ecw-heading text-xs font-bold text-neutral-900">Quiz graded</span><span className="block ecw-body text-[10px] text-neutral-500">38 of 40 submitted</span></span>
              </div>
              <div className="ecw-sticker -bottom-6 -right-2 sm:-right-6" style={{ "--r": "3deg", animationDelay: "1.2s" }}>
                <span className="w-8 h-8 rounded-xl bg-[#FF4500]/10 flex items-center justify-center"><CalendarCheck size={16} className="text-[#FF4500]" /></span>
                <span><span className="block ecw-heading text-xs font-bold text-neutral-900">Attendance done</span><span className="block ecw-body text-[10px] text-neutral-500">S3 A · 41 present</span></span>
              </div>

              <div className="ecw-browser">
                <div className="ecw-browser-bar">
                  <span className="ecw-browser-dot" /><span className="ecw-browser-dot" /><span className="ecw-browser-dot" />
                  <span className="ecw-browser-url">app.easyclasswork.rw{activeSlide.path}</span>
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
                    <ActiveIcon size={14} className="text-[#178754] shrink-0" />
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

        {/* PARTNERS */}
        <section id="partners" className="py-10 bg-white border-y border-neutral-100">
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <p className="ecw-body text-xs font-semibold text-neutral-400 text-center mb-6">Supported by the people who run education in Rwanda</p>
            <div className="ecw-marquee">
              <div className="ecw-marquee-track">
                {[...PARTNERS, ...PARTNERS].map(({ image, name, sub }, idx) => (
                  <div key={`${name}-${idx}`} className="flex items-center gap-3 bg-neutral-50 rounded-2xl p-3.5 border border-neutral-100 w-64 shrink-0">
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

        {/* SERVICES — bento */}
        <section id="services" className="bg-white py-20">
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <SectionHead tag="Services" title="Everything a school needs to run its academic year" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {SERVICES.map(({ icon: Icon, tint, title, text, span }) => (
                <div key={title} className={`group relative overflow-hidden rounded-3xl border border-neutral-100 bg-neutral-50 p-6 hover:bg-white hover:shadow-xl hover:shadow-neutral-200/60 transition-all duration-300 ${span === "sm:col-span-2" ? "sm:col-span-2" : ""}`}>
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5" style={{ background: `${tint}18` }}>
                    <Icon className="w-5 h-5" style={{ color: tint }} aria-hidden="true" />
                  </span>
                  <h3 className="ecw-heading font-bold text-lg text-neutral-900 mb-1.5">{title}</h3>
                  <p className="ecw-body text-[13px] text-neutral-600 leading-relaxed max-w-sm">{text}</p>
                  <span className="absolute -right-8 -bottom-8 w-28 h-28 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `${tint}12` }} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="py-20 bg-[rgb(22,32,111)] text-white relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-[#178754]/30 blur-3xl" />
          <div className="relative max-w-6xl mx-auto px-5 sm:px-8">
            <Reveal className="max-w-2xl mb-12">
              <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-full mb-3 bg-white/10 text-white">How it works</span>
              <h2 className="ecw-heading text-3xl sm:text-4xl font-extrabold leading-tight">Six steps, and your school is online</h2>
            </Reveal>
            <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-3xl bg-white/[0.06] border border-white/10 p-6 hover:bg-white/10 transition-colors">
                  <span className="w-9 h-9 rounded-full bg-[#FF4500] text-white text-sm font-bold flex items-center justify-center mb-4">{i + 1}</span>
                  <h3 className="ecw-heading font-bold text-base mb-1.5">{s.title}</h3>
                  <p className="ecw-body text-[13px] text-white/70 leading-relaxed">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* DASHBOARDS — one card per role */}
        <section id="dashboards" className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <SectionHead
              tag="Dashboards" tagColor="#FF4500" title="Choose your dashboard"
              text="Students and teachers sign in with Google. Teachers also pick every class and subject they teach. School admins use the Google account they registered the school with, once it's approved."
            />
            <div className="grid sm:grid-cols-2 gap-4 mb-10">
              {DASHBOARDS.map((d) => {
                const Icon = ROLE_CONFIG[d.role].icon;
                return (
                  <div key={d.role} className="group flex flex-col rounded-3xl border border-neutral-100 bg-white p-6 hover:shadow-xl hover:shadow-neutral-200/60 hover:-translate-y-0.5 transition-all duration-300">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${d.tint}14` }}>
                        <Icon className="w-6 h-6" style={{ color: d.tint }} aria-hidden="true" />
                      </span>
                      <span className="ecw-body text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ color: d.tint, background: `${d.tint}12` }}>{d.group}</span>
                    </div>
                    <h3 className="ecw-heading font-bold text-xl text-neutral-900">{d.title} dashboard</h3>
                    <p className="ecw-body text-[13px] text-neutral-600 mt-1 mb-4">{d.text}</p>
                    <ul className="flex flex-col gap-2 mb-6">
                      {d.points.map((p) => (
                        <li key={p} className="ecw-body flex items-center gap-2 text-xs text-neutral-700">
                          <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: `${d.tint}18` }}><Check size={10} style={{ color: d.tint }} strokeWidth={3} /></span>
                          {p}
                        </li>
                      ))}
                    </ul>
                    <button type="button" onClick={() => openAuth(d.role, "login")}
                      className="mt-auto inline-flex items-center justify-center gap-1.5 py-3 px-5 text-white font-bold text-xs rounded-full transition-all hover:opacity-90 active:scale-[0.98] bg-[rgb(22,32,111)]">
                      Sign in as {ROLE_CONFIG[d.role].label.toLowerCase()} <ArrowUpRight size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* School registration / pricing */}
            <div id="register" className="rounded-3xl bg-[#EAF6EF] border border-[#178754]/15 p-6 sm:p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <span className="ecw-body inline-block text-[11px] font-bold text-[#136040] bg-white px-3 py-1 rounded-full mb-3">School registration</span>
                  <p className="ecw-heading text-3xl font-extrabold text-neutral-900">150,000 RWF <span className="ecw-body text-sm font-medium text-neutral-500">/ term</span></p>
                  <p className="ecw-body text-[13px] text-neutral-600 mt-2 max-w-lg">Includes notes, quizzes, report cards and a school code to add your staff and students. Your code is emailed to you once your school is approved.</p>
                </div>
                <button type="button" onClick={goRegister} disabled={isRegisterLoading}
                  className="whitespace-nowrap inline-flex items-center justify-center gap-2 py-3.5 px-7 text-white font-bold text-sm rounded-full transition-all hover:-translate-y-0.5 active:scale-[0.98] bg-[#178754] shadow-lg shadow-[#178754]/30 disabled:opacity-90 disabled:cursor-not-allowed">
                  {isRegisterLoading ? "Loading…" : "Register my school"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2.5 pt-5 mt-6 border-t border-[#178754]/15 items-center">
                <span className="ecw-body text-[11px] font-bold text-neutral-500 mr-1">Pay with</span>
                <span className="ecw-body flex items-center gap-2 text-[12px] font-bold px-4 py-2 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200"><Smartphone size={16} /> MTN Money</span>
                <span className="ecw-body flex items-center gap-2 text-[12px] font-bold px-4 py-2 rounded-full bg-red-50 text-red-700 border border-red-200"><Smartphone size={16} /> Airtel Money</span>
                <span className="ecw-body flex items-center gap-2 text-[12px] font-bold px-4 py-2 rounded-full bg-blue-50 text-[rgb(22,32,111)] border border-blue-200"><Landmark size={16} /> Bank transfer</span>
              </div>
            </div>
          </div>
        </section>

        {/* LIVE DASHBOARD */}
        <section id="dashboard" className="py-20 bg-neutral-50 border-y border-neutral-100">
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <SectionHead tag="Live dashboard" title="See the school's whole term at a glance" />
            <div className="rounded-3xl border border-neutral-200 overflow-hidden bg-white shadow-xl shadow-neutral-200/60">
              <div className="bg-neutral-50 px-4 py-3 flex items-center gap-1.5 border-b border-neutral-200">
                <span className="w-2.5 h-2.5 rounded-full bg-neutral-300" /><span className="w-2.5 h-2.5 rounded-full bg-neutral-300" /><span className="w-2.5 h-2.5 rounded-full bg-neutral-300" />
                <span className="ecw-body text-[11px] text-neutral-400 ml-3">app.easyclasswork.rw/dashboard</span>
              </div>
              <div className="w-full aspect-[16/9] bg-gradient-to-br from-[#EAF6EF] to-white">
                <img src={dashboard} alt="Dashboard preview" className="w-full h-full object-cover" />
              </div>
            </div>

            <div ref={statsRef} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
              {STATS.map(({ pct, color, value, label }) => {
                const shownPct = statsVisible ? pct : 0;
                return (
                  <div key={label} className="flex items-center gap-4 bg-white rounded-3xl border border-neutral-100 p-4">
                    <svg width="64" height="64" viewBox="0 0 76 76" className="shrink-0">
                      <circle cx="38" cy="38" r="30" fill="none" stroke="#EEF1F6" strokeWidth="8" />
                      <circle cx="38" cy="38" r="30" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                        strokeDasharray="188.5" strokeDashoffset={188.5 - (188.5 * shownPct) / 100}
                        transform="rotate(-90 38 38)" style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1)" }} />
                    </svg>
                    <div>
                      <p className="ecw-heading text-lg font-extrabold text-neutral-900 leading-none">{value}</p>
                      <p className="ecw-body text-[11px] text-neutral-500 mt-1">{label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* TEAM */}
        <section id="team" className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <SectionHead tag="Our team" title="The people who built ESMS" />
            <div className="ecw-team-strip flex gap-4 overflow-x-auto pb-2" style={{ scrollSnapType: "x mandatory" }}>
              {TEAM.map((m) => (
                <div key={m.name} style={{ scrollSnapAlign: "start" }} className="flex flex-col items-center text-center bg-neutral-50 rounded-3xl border border-neutral-100 p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 w-56 shrink-0">
                  <span className="w-24 h-24 rounded-full bg-white mb-4 p-1" style={{ boxShadow: `0 0 0 4px ${m.tint}22` }}>
                    <img src={m.image} alt={`${m.name} portrait`} className="w-full h-full rounded-full object-cover" />
                  </span>
                  <p className="ecw-heading font-bold text-sm text-neutral-900">{m.name}</p>
                  <p className="ecw-body text-xs mt-0.5" style={{ color: m.tint }}>{m.role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="py-20 bg-neutral-50 border-y border-neutral-100">
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <SectionHead tag="In their words" title="Teachers who use it every day" />
            <div className="grid md:grid-cols-3 gap-4">
              {TESTIMONIALS.map((t) => (
                <figure key={t.name} className="flex flex-col bg-white rounded-3xl p-6 border border-neutral-100 hover:shadow-lg transition-shadow duration-300">
                  <Quote className="w-7 h-7 mb-3" style={{ color: t.tint, opacity: 0.4 }} aria-hidden="true" />
                  <blockquote className="ecw-body text-[13px] text-neutral-700 leading-relaxed mb-5">{t.quote}</blockquote>
                  <figcaption className="mt-auto flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ background: t.tint }}>{t.name.charAt(0)}</span>
                    <span>
                      <span className="block ecw-heading text-xs font-bold text-neutral-900">{t.name}</span>
                      <span className="block ecw-body text-[11px] text-neutral-500">{t.role}</span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 grid md:grid-cols-2 gap-10 items-center">
            <Reveal>
              <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-full mb-3 text-[#178754] bg-[#178754]/10">Contact</span>
              <h2 className="ecw-heading text-3xl sm:text-4xl font-extrabold text-neutral-900 mb-3">Talk to us before you sign up</h2>
              <p className="ecw-body text-sm text-neutral-600 leading-relaxed mb-6 max-w-md">
                Questions about pricing, your school code, or switching partway through a term?
                Reach the helpline and someone will walk you through it.
              </p>
              <div className="flex flex-col gap-1.5 text-sm ecw-body text-neutral-700">
                <p>support@classwork.rw</p>
                <p>+250 788 000 000</p>
                <p>Kigali, Rwanda</p>
              </div>
            </Reveal>
            <div className="bg-neutral-50 rounded-3xl p-6 border border-neutral-100">
              <div className="flex flex-col gap-3">
                <input type="text" placeholder="Full name" className={INPUT} />
                <input type="text" placeholder="School name" className={INPUT} />
                <textarea placeholder="How can we help?" rows="4" className={INPUT}></textarea>
                <button type="button" className="w-full py-3.5 text-white font-bold text-sm rounded-full transition-all hover:opacity-90 active:scale-[0.98] bg-[rgb(22,32,111)]">Send message</button>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="text-white pt-14 bg-[rgb(22,32,111)]">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 pb-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="flex flex-col gap-3 lg:col-span-2">
              <div className="flex items-center gap-2.5">
                <span className="w-11 h-11 rounded-full bg-white p-1 overflow-hidden shrink-0 flex items-center justify-center"><img src={esms} alt="ESMS logo" className="w-full h-full object-contain" /></span>
                <span className="ecw-heading font-extrabold text-base">ESMS</span>
              </div>
              <p className="ecw-body text-xs text-white/70 leading-relaxed max-w-xs">
                Academic records and classroom tools built for primary and secondary schools across Rwanda.
              </p>
            </div>
            <div>
              <h4 className="ecw-heading font-bold text-sm mb-3">Explore</h4>
              <ul className="flex flex-col gap-2 text-xs ecw-body text-white/70">
                <li><a href="#services" className="hover:text-white transition-colors">Services</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How it works</a></li>
                <li><a href="#dashboards" className="hover:text-white transition-colors">Dashboards</a></li>
                <li><a href="#team" className="hover:text-white transition-colors">Our team</a></li>
              </ul>
            </div>
            <div>
              <h4 className="ecw-heading font-bold text-sm mb-3">Helpline</h4>
              <ul className="flex flex-col gap-2 text-xs ecw-body text-white/70">
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