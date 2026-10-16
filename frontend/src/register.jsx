import React, { useState, useEffect, useRef, createContext, useContext } from "react";
import esms from "./assets/esms.jpg";
import {
  ArrowLeft,
  LogIn,
  CheckCircle2,
  AlertCircle,
  School,
  Languages,
  ImageIcon,
  Link2,
  Upload,
  ShieldCheck,
  RefreshCw,
  Loader2,
  Phone,
  Mail,
  ClipboardCheck,
  KeyRound,
} from "lucide-react";

/* ============================================================================
   CONFIG  (.env)
     VITE_GOOGLE_CLIENT_ID=your-real-client-id.apps.googleusercontent.com
     VITE_API_BASE=http://localhost:5000
   ============================================================================ */

const BRAND_NAME = "ESMS";

const GOOGLE_CLIENT_ID =
  import.meta.env?.VITE_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:5000";

const GOOGLE_CLIENT_ID_MISSING = !GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes("YOUR_GOOGLE_CLIENT_ID");

const HERO_IMAGES = [
  "https://media.glassdoor.com/l/60/81/49/32/the-liquidnet-family-high-school-at-the-agahozo-shalom-youth-village.jpg?signature=a89e63ad6ac1c5ed1ec53b6d8480a0925eb7444df30adae6d82e868e02de808a",
  "https://media.istockphoto.com/id/1338737959/photo/little-kids-schoolchildren-pupils-students-running-hurrying-to-the-school-building-for.jpg?s=612x612&w=0&k=20&c=u2eZV7PY4TTGKvxRBRkhiaDoFFEFPKeOlCsYARCqFSI=",
];

function resolveLogoUrl(value) {
  const logo = (value || "").trim();
  if (!logo) return "";
  if (/^(data:|blob:|https?:\/\/)/i.test(logo)) return logo;
  if (logo.startsWith("/")) return `${API_BASE.replace(/\/$/, "")}${logo}`;
  return logo;
}

const INITIAL_FORM = {
  schoolName: "",
  phone: "",
  logoMode: "upload",
  logoFile: null,
  logoUrl: "",
  email: "",
  emailVerified: false,
  emailName: "",
  emailPicture: "",
  googleCredential: null,
};

/* ============================================================================
   HELPERS
   ============================================================================ */

function normalizeRwandaPhone(raw) {
  let v = (raw || "").replace(/[\s-]/g, "");
  if (v.startsWith("+250")) v = "0" + v.slice(4);
  else if (v.startsWith("250")) v = "0" + v.slice(3);
  return v;
}
const isValidRwandaPhone = (raw) => /^07[2389][0-9]{7}$/.test(normalizeRwandaPhone(raw));

// MTN: 078 / 079 — Airtel: 072 / 073
function getNetwork(raw) {
  const v = normalizeRwandaPhone(raw);
  if (/^07[89]/.test(v)) return "MTN";
  if (/^07[23]/.test(v)) return "Airtel";
  return "";
}

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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================================
   TEXT — English / Kinyarwanda (kept short)
   ============================================================================ */

const T_EN = {
  backHome: "Home",
  login: "Log in",
  langSwitch: "Kinyarwanda",
  formTitle: "Register your school",
  namePh: "School name",
  phonePh: "078 123 4567",
  phoneInvalid: "Use 078/079 (MTN) or 072/073 (Airtel)",
  phoneValid: "Valid number",
  nameLabel: "School name",
  phoneLabel: "Phone",
  logoLabel: "Logo",
  logoUploadTab: "Upload",
  logoLinkTab: "Link",
  logoLinkPh: "https://example.com/logo.png",
  emailLabel: "School email",
  googleLoadError: "Google sign-in failed to load. Try again.",
  googleNotConfigured: "Google sign-in is not set up.",
  verifiedAs: "Verified",
  changeAccount: "Change",
  submit: "Register",
  submitting: "Sending…",
  already: "Have an account?",
  successTitle: "Registration received",
  successUnder: "is waiting for review.",
  stepReview: "We review your request",
  stepCall: "We call {phone}",
  stepCode: "Code sent to {email}",
  stepSignIn: "Sign in with Google",
  registerAnother: "Register another",
  validationError: "Complete all fields and verify your email.",
  serverErrorFallback: "Something went wrong. Try again.",
  progress: "/ 4",
  heroTitle: "Your whole school, one place.",
  slideLabel: "Photo",
};

const T_RW = {
  backHome: "Ahabanza",
  login: "Injira",
  langSwitch: "English",
  formTitle: "Andikisha ishuri ryawe",
  namePh: "Izina ry'ikigo",
  phonePh: "078 123 4567",
  phoneInvalid: "Koresha 078/079 (MTN) cyangwa 072/073 (Airtel)",
  phoneValid: "Nimero nyayo",
  nameLabel: "Izina ry'ikigo",
  phoneLabel: "Telefoni",
  logoLabel: "Ikirango",
  logoUploadTab: "Ohereza",
  logoLinkTab: "Link",
  logoLinkPh: "https://example.com/logo.png",
  emailLabel: "Email y'ishuri",
  googleLoadError: "Google ntiyafunguye. Ongera ugerageze.",
  googleNotConfigured: "Google ntiraboneka.",
  verifiedAs: "Yemejwe",
  changeAccount: "Hindura",
  submit: "Iyandikishe",
  submitting: "Kohereza…",
  already: "Usanzwe ufite konti?",
  successTitle: "Iyandikisha ryakiriwe",
  successUnder: "ritegereje isuzumwa.",
  stepReview: "Turasuzuma ubusabe bwawe",
  stepCall: "Turahamagara {phone}",
  stepCode: "Kode iboherezwa kuri {email}",
  stepSignIn: "Injira na Google",
  registerAnother: "Andikisha ikindi",
  validationError: "Uzuza byose kandi wemeze email yawe.",
  serverErrorFallback: "Hari ikitagenze neza. Ongera ugerageze.",
  progress: "/ 4",
  heroTitle: "Ishuri ryawe ryose, hamwe.",
  slideLabel: "Ifoto",
};

const TextCtx = createContext(T_EN);
const useT = () => useContext(TextCtx);

/* ============================================================================
   DESIGN TOKENS — orange-red, green, white only
   ============================================================================ */

const GREEN = "#15803D";
const GREEN_DEEP = "#0B3B2C";
const GREEN_SOFT = "#E8F5EC"; // light tint of green
const ORANGE_RED = "#FF4500";
const WHITE = "#FFFFFF";
const LINE = "#CFE3D6";

/* ============================================================================
   ROOT
   ============================================================================ */

export default function Register({ onBackHome, onLogin }) {
  const [lang, setLang] = useState("en");
  const t = lang === "rw" ? T_RW : T_EN;

  return (
    <TextCtx.Provider value={t}>
      <div className="min-h-screen w-full text-left" style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: WHITE }}>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap"
        />
        <GlobalStyles />
        <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <HeroPanel />
          <div className="relative flex flex-col min-w-0 overflow-hidden" style={{ background: WHITE }}>
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <path d="M600 0 V220 C480 200 410 110 430 0 Z" fill={GREEN_SOFT} />
              <path d="M0 800 V600 C120 640 230 710 215 800 Z" fill={GREEN_SOFT} />
            </svg>
            <div className="relative flex flex-col flex-1 min-w-0">
              <TopBar onBackHome={onBackHome} onLogin={onLogin} lang={lang} setLang={setLang} />
              <RegistrationFormBody onLogin={onLogin} />
            </div>
          </div>
        </div>
      </div>
    </TextCtx.Provider>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @keyframes popIn { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes kenburns { from { transform: scale(1.02); } to { transform: scale(1.12) translate(-1.5%, -1%); } }
      @keyframes riseIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes dotFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      .hero-curve { clip-path: ellipse(120% 100% at 50% 0%); }
      @media (min-width: 1024px) { .hero-curve { clip-path: ellipse(100% 100% at 0% 50%); } }
      .rise { animation: riseIn 0.5s cubic-bezier(.2,.7,.2,1) backwards; }
      .kb { animation: kenburns 9s ease-in-out forwards; }
      button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid ${ORANGE_RED}; outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) {
        * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
      }
    `}</style>
  );
}

/* ============================================================================
   HERO PANEL
   ============================================================================ */

function HeroPanel() {
  const t = useT();
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState({});

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % HERO_IMAGES.length), 7000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside
      className="hero-curve relative overflow-hidden h-44 sm:h-56 lg:h-screen lg:sticky lg:top-0"
      style={{ background: GREEN_DEEP }}
    >
      {HERO_IMAGES.map((src, i) =>
        broken[i] ? null : (
          <img
            key={`${src}-${i === active ? "on" : "off"}`}
            src={src}
            alt=""
            onError={() => setBroken((b) => ({ ...b, [i]: true }))}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[1400ms] ${
              i === active ? "opacity-100 kb" : "opacity-0"
            }`}
          />
        )
      )}

      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(160deg, rgba(21,128,61,0.65) 0%, rgba(11,59,44,0.75) 55%, rgba(11,59,44,0.92) 100%)" }}
      />

      <div className="relative z-10 h-full flex flex-col justify-between p-5 sm:p-8 lg:p-12">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl overflow-hidden bg-white ring-1 ring-white/40 shadow-lg">
            <img src={esms} alt="ESMS logo" className="w-full h-full object-cover" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>
            {BRAND_NAME}
          </span>
        </div>

        <div className="hidden lg:block max-w-md">
          <h2
            className="rise text-[40px] leading-[1.1] font-bold text-white mb-6"
            style={{ fontFamily: "'Poppins', sans-serif", animationDelay: "0.15s" }}
          >
            {t.heroTitle}
          </h2>
          <div className="h-1 w-16 rounded-full mb-8" style={{ background: ORANGE_RED }} />

          <div className="flex items-center gap-2">
            {HERO_IMAGES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${t.slideLabel} ${i + 1}`}
                className="h-1 rounded-full overflow-hidden transition-all duration-500"
                style={{ width: i === active ? 40 : 14, background: "rgba(255,255,255,0.35)" }}
              >
                {i === active && (
                  <span
                    key={active}
                    className="block h-full w-full origin-left"
                    style={{ background: WHITE, animation: "dotFill 7s linear forwards" }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ============================================================================
   TOP BAR
   ============================================================================ */

function TopBar({ onBackHome, onLogin, lang, setLang }) {
  const t = useT();
  return (
    <div className="w-full max-w-xl mx-auto px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onBackHome}
        className="inline-flex items-center gap-1.5 bg-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-green-50 transition-colors"
        style={{ color: GREEN_DEEP, border: `1px solid ${LINE}` }}
      >
        <ArrowLeft size={14} strokeWidth={2.5} />
        {t.backHome}
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLang((l) => (l === "en" ? "rw" : "en"))}
          className="inline-flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1.5 text-xs font-bold hover:bg-green-50 transition-colors"
          style={{ color: GREEN_DEEP, border: `1px solid ${LINE}` }}
          aria-label="Switch language"
        >
          <Languages size={13} strokeWidth={2.5} />
          <span className="hidden sm:inline">{t.langSwitch}</span>
        </button>

        <button
          type="button"
          onClick={onLogin}
          className="inline-flex items-center gap-1.5 text-white rounded-lg px-3.5 py-1.5 text-xs font-bold hover:opacity-90 transition-opacity"
          style={{ background: ORANGE_RED }}
        >
          <LogIn size={14} strokeWidth={2.5} />
          {t.login}
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   GOOGLE SIGN-IN
   ============================================================================ */

function useGoogleIdentity(onVerified) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const buttonRef = useRef(null);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  useEffect(() => {
    if (GOOGLE_CLIENT_ID_MISSING) return;
    if (window.google?.accounts?.id) {
      setReady(true);
      return;
    }
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => setReady(true));
      existing.addEventListener("error", () => setError(true));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setReady(true);
    script.onerror = () => setError(true);
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ready || !window.google?.accounts?.id || !buttonRef.current) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        try {
          const payload = decodeGoogleJwt(response.credential);
          if (payload?.email) {
            onVerifiedRef.current({
              email: payload.email,
              name: payload.name || "",
              picture: payload.picture || "",
              credential: response.credential,
            });
          }
        } catch {
          setError(true);
        }
      },
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      width: 260,
    });
  }, [ready]);

  return { ready, error, buttonRef };
}

function GoogleEmailField({ form, setForm }) {
  const t = useT();

  const handleVerified = ({ email, name, picture, credential }) => {
    setForm((f) => ({
      ...f,
      email,
      emailName: name,
      emailPicture: picture,
      emailVerified: true,
      googleCredential: credential,
    }));
  };

  const { error, buttonRef } = useGoogleIdentity(handleVerified);

  const reset = () => {
    setForm((f) => ({
      ...f,
      email: "",
      emailVerified: false,
      emailName: "",
      emailPicture: "",
      googleCredential: null,
    }));
    window.google?.accounts?.id?.disableAutoSelect?.();
  };

  return (
    <div>
      <SectionLabel icon={ShieldCheck}>{t.emailLabel}</SectionLabel>

      {form.emailVerified ? (
        <div
          className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
          style={{ borderColor: GREEN, background: GREEN_SOFT, animation: "popIn 0.3s ease-out" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {form.emailPicture ? (
              <img src={form.emailPicture} alt="" className="w-7 h-7 rounded-full shrink-0" />
            ) : (
              <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: GREEN }}>
                <CheckCircle2 size={14} color="white" strokeWidth={2.5} />
              </span>
            )}
            <div className="min-w-0">
              <div className="text-[11px] font-semibold leading-tight" style={{ color: GREEN }}>{t.verifiedAs}</div>
              <div className="text-[13px] font-bold truncate leading-tight" style={{ color: GREEN_DEEP }}>{form.email}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-[11px] font-bold shrink-0 hover:opacity-75 transition-opacity"
            style={{ color: ORANGE_RED }}
          >
            <RefreshCw size={12} strokeWidth={2.5} />
            {t.changeAccount}
          </button>
        </div>
      ) : GOOGLE_CLIENT_ID_MISSING ? (
        <p className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: ORANGE_RED }}>
          <AlertCircle size={12} strokeWidth={2.5} /> {t.googleNotConfigured}
        </p>
      ) : (
        <div>
          <div ref={buttonRef} />
          {error && (
            <p className="flex items-center gap-1.5 text-[11px] font-medium mt-2" style={{ color: ORANGE_RED }}>
              <AlertCircle size={12} strokeWidth={2.5} /> {t.googleLoadError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   REGISTRATION FORM
   ============================================================================ */

function RegistrationFormBody({ onLogin }) {
  const t = useT();

  const [form, setForm] = useState(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const phoneDone = isValidRwandaPhone(form.phone);
  const logoDone = form.logoMode === "upload" ? !!form.logoFile : !!form.logoUrl.trim();
  const nameDone = !!form.schoolName.trim();
  const emailDone = form.emailVerified && !!form.googleCredential;

  const isValid = nameDone && phoneDone && logoDone && emailDone;
  const showValidationError = submitted && !isValid && !submitting;
  const doneCount = [nameDone, phoneDone, logoDone, emailDone].filter(Boolean).length;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setApiError("");
    if (!isValid) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/schools/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolName: form.schoolName.trim(),
          phone: form.phone,
          logo: form.logoMode === "upload" ? form.logoFile : form.logoUrl.trim(),
          googleCredential: form.googleCredential,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        setApiError(data.error || t.serverErrorFallback);
        return;
      }

      // School code is emailed after the super admin approves the school.
      setSuccess(true);
    } catch {
      setApiError(t.serverErrorFallback);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setForm(INITIAL_FORM);
    setSubmitted(false);
    setApiError("");
    setSuccess(false);
  }

  if (success) {
    return <SuccessScreen form={form} onRegisterAnother={resetForm} />;
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 sm:px-6 pb-10 pt-3">
      <div className="w-full max-w-md">
        <div
          className="bg-white rounded-2xl shadow-xl overflow-hidden rise"
          style={{ border: `1px solid ${LINE}`, boxShadow: "0 20px 40px -20px rgba(11,59,44,0.25)" }}
        >
          {/* Progress bar */}
          <div className="h-1.5 w-full" style={{ background: LINE }}>
            <div
              className="h-full transition-all duration-500 ease-out"
              style={{ width: `${(doneCount / 4) * 100}%`, background: doneCount === 4 ? GREEN : ORANGE_RED }}
            />
          </div>

          <div className="px-5 py-6 sm:px-7 sm:py-7">
            <div className="flex items-center justify-between gap-3 mb-6">
              <h1 className="text-xl sm:text-2xl font-bold" style={{ color: GREEN_DEEP, fontFamily: "'Poppins', sans-serif" }}>
                {t.formTitle}
              </h1>
              <div
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
                style={{
                  background: doneCount === 4 ? GREEN : WHITE,
                  color: doneCount === 4 ? WHITE : ORANGE_RED,
                  border: `1px solid ${doneCount === 4 ? GREEN : ORANGE_RED}`,
                }}
              >
                {doneCount} {t.progress}
              </div>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <InstitutionFields form={form} set={set} phoneDone={phoneDone} />
              <LogoField form={form} set={set} />
              <GoogleEmailField form={form} setForm={setForm} />

              {showValidationError && (
                <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: ORANGE_RED, animation: "riseIn 0.3s ease-out" }}>
                  <AlertCircle size={14} strokeWidth={2.5} /> {t.validationError}
                </p>
              )}

              {apiError && (
                <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: ORANGE_RED, animation: "riseIn 0.3s ease-out" }}>
                  <AlertCircle size={14} strokeWidth={2.5} /> {apiError}
                </p>
              )}

              <button
                type="submit"
                disabled={!isValid || submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg text-white text-sm font-bold py-2.5 hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: ORANGE_RED }}
              >
                {submitting && <Loader2 size={15} strokeWidth={2.5} style={{ animation: "spin 0.8s linear infinite" }} />}
                {submitting ? t.submitting : t.submit}
              </button>

              <p className="text-center text-xs" style={{ color: GREEN_DEEP }}>
                {t.already}{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onLogin?.(e);
                  }}
                  className="font-bold no-underline hover:underline"
                  style={{ color: GREEN }}
                >
                  {t.login}
                </a>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Form field components ---------------------------- */

const inputBase =
  "w-full h-10 rounded-lg border px-3 text-[13px] bg-white placeholder:text-gray-400 focus:outline-none transition-shadow";

function focusRing(e, on) {
  e.currentTarget.style.borderColor = on ? GREEN : LINE;
  e.currentTarget.style.boxShadow = on ? "0 0 0 3px rgba(21,128,61,0.15)" : "none";
}

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon size={14} strokeWidth={2.5} color={GREEN} />
      <div className="text-[13px] font-bold" style={{ color: GREEN_DEEP }}>{children}</div>
    </div>
  );
}

function FieldStatus({ ok, okText, badText }) {
  return (
    <div
      key={ok ? "ok" : "bad"}
      className="flex items-center gap-1.5 mt-1.5 text-[11px] font-medium"
      style={{ color: ok ? GREEN : ORANGE_RED, animation: "riseIn 0.25s ease-out" }}
    >
      {ok ? <CheckCircle2 size={12} strokeWidth={2.5} /> : <AlertCircle size={12} strokeWidth={2.5} />}
      {ok ? okText : badText}
    </div>
  );
}

function InstitutionFields({ form, set, phoneDone }) {
  const t = useT();
  const network = getNetwork(form.phone);
  const borderStyle = { borderColor: LINE, color: GREEN_DEEP };

  return (
    <div className="space-y-3">
      <div>
        <SectionLabel icon={School}>{t.nameLabel}</SectionLabel>
        <input
          className={inputBase}
          style={borderStyle}
          type="text"
          value={form.schoolName}
          onFocus={(e) => focusRing(e, true)}
          onBlur={(e) => focusRing(e, false)}
          onChange={(e) => set("schoolName", e.target.value)}
          placeholder={t.namePh}
        />
      </div>

      <div>
        <SectionLabel icon={Phone}>{t.phoneLabel}</SectionLabel>
        <div className="relative">
          <input
            className={`${inputBase} pr-16`}
            style={borderStyle}
            type="tel"
            inputMode="numeric"
            value={form.phone}
            maxLength={13}
            onFocus={(e) => focusRing(e, true)}
            onBlur={(e) => focusRing(e, false)}
            onChange={(e) => set("phone", e.target.value.replace(/[^\d+\s-]/g, ""))}
            placeholder={t.phonePh}
          />
          {network && (
            <span
              key={network}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ background: GREEN, animation: "popIn 0.25s ease-out" }}
            >
              {network}
            </span>
          )}
        </div>
        <div className="min-h-[18px]">
          {form.phone && (
            <FieldStatus ok={phoneDone} okText={t.phoneValid} badText={t.phoneInvalid} />
          )}
        </div>
      </div>
    </div>
  );
}

function LogoField({ form, set }) {
  const t = useT();
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    set("logoFile", dataUrl);
  };

  const previewSrc = resolveLogoUrl(form.logoMode === "upload" ? form.logoFile : form.logoUrl);

  return (
    <div>
      <SectionLabel icon={ImageIcon}>{t.logoLabel}</SectionLabel>

      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-lg border flex items-center justify-center overflow-hidden shrink-0 bg-white"
          style={{ borderColor: LINE }}
        >
          {previewSrc ? (
            <img key={previewSrc} src={previewSrc} alt="Logo preview" className="w-full h-full object-cover" style={{ animation: "popIn 0.3s ease-out" }} />
          ) : (
            <ImageIcon size={17} color={LINE} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex gap-1.5 mb-1.5">
            <TabButton active={form.logoMode === "upload"} onClick={() => set("logoMode", "upload")} icon={Upload}>
              {t.logoUploadTab}
            </TabButton>
            <TabButton active={form.logoMode === "link"} onClick={() => set("logoMode", "link")} icon={Link2}>
              {t.logoLinkTab}
            </TabButton>
          </div>

          {form.logoMode === "upload" ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleFile}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-10 inline-flex items-center justify-center gap-1.5 border border-dashed rounded-lg px-3 text-xs font-semibold hover:bg-green-50 transition-colors"
                style={{ color: GREEN_DEEP, borderColor: form.logoFile ? GREEN : ORANGE_RED }}
              >
                {form.logoFile ? <CheckCircle2 size={13} strokeWidth={2.5} color={GREEN} /> : <Upload size={13} strokeWidth={2.5} color={ORANGE_RED} />}
                {t.logoUploadTab}
              </button>
            </>
          ) : (
            <input
              className={inputBase}
              style={{ borderColor: LINE, color: GREEN_DEEP }}
              type="url"
              value={form.logoUrl}
              onFocus={(e) => focusRing(e, true)}
              onBlur={(e) => focusRing(e, false)}
              onChange={(e) => set("logoUrl", e.target.value)}
              placeholder={t.logoLinkPh}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors"
      style={{
        background: active ? GREEN : WHITE,
        color: active ? WHITE : GREEN_DEEP,
        border: `1px solid ${active ? GREEN : LINE}`,
      }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {children}
    </button>
  );
}

/* ============================================================================
   SUCCESS SCREEN
   ============================================================================ */

function SuccessScreen({ form, onRegisterAnother }) {
  const t = useT();
  const previewSrc = resolveLogoUrl(form.logoMode === "upload" ? form.logoFile : form.logoUrl);

  const steps = [
    { icon: ClipboardCheck, text: t.stepReview },
    { icon: Phone, text: t.stepCall.replace("{phone}", form.phone) },
    { icon: Mail, text: t.stepCode.replace("{email}", form.email) },
    { icon: KeyRound, text: t.stepSignIn },
  ];

  return (
    <div className="flex-1 flex items-center justify-center px-4 pb-10 pt-3">
      <div
        className="w-full max-w-md text-center bg-white rounded-2xl px-6 sm:px-8 py-9"
        style={{ border: `1px solid ${LINE}`, boxShadow: "0 20px 40px -20px rgba(11,59,44,0.25)", animation: "popIn 0.3s ease-out" }}
      >
        {previewSrc ? (
          <img src={previewSrc} alt="School logo" className="w-14 h-14 rounded-full mx-auto mb-4 object-cover" style={{ boxShadow: `0 0 0 2px ${GREEN}` }} />
        ) : (
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: GREEN }}>
            <CheckCircle2 size={24} color="white" strokeWidth={2.5} />
          </div>
        )}

        <h1 className="text-lg font-bold mb-1" style={{ color: GREEN_DEEP, fontFamily: "'Poppins', sans-serif" }}>{t.successTitle}</h1>
        <p className="text-xs mb-6" style={{ color: GREEN_DEEP }}>
          <span className="font-semibold">{form.schoolName}</span> {t.successUnder}
        </p>

        <ol className="flex flex-col gap-2.5 mb-6 text-left">
          {steps.map(({ icon: Icon, text }, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 rise"
              style={{ background: GREEN_SOFT, animationDelay: `${0.1 + i * 0.1}s` }}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
                style={{ background: i === 0 ? ORANGE_RED : GREEN }}
              >
                {i + 1}
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium break-words min-w-0" style={{ color: GREEN_DEEP }}>
                <Icon size={13} strokeWidth={2.5} className="shrink-0" color={GREEN} />
                <span className="min-w-0">{text}</span>
              </span>
            </li>
          ))}
        </ol>

        <button
          type="button"
          className="w-full rounded-lg text-white text-sm font-semibold py-2.5 hover:opacity-90 transition-opacity"
          style={{ background: GREEN }}
          onClick={onRegisterAnother}
        >
          {t.registerAnother}
        </button>
      </div>
    </div>
  );
}