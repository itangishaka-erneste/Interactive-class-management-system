import React, { useState, useEffect, useRef, createContext, useContext } from "react";
import esms from "./assets/esms.jpg";
import {
  ArrowLeft,
  LogIn,
  Building2,
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
  Users,
  BookOpenCheck,
} from "lucide-react";

/* ============================================================================
   CONFIG
   Create a `.env` file in your project root with:

     VITE_GOOGLE_CLIENT_ID=your-real-client-id.apps.googleusercontent.com
     VITE_API_BASE=http://localhost:5000
   ============================================================================ */

const BRAND_NAME = "ESMS";

const GOOGLE_CLIENT_ID =
  import.meta.env?.VITE_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:5000";

/* Side-panel photos (swap for your own URLs or local imports anytime). */
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

const GOOGLE_CLIENT_ID_MISSING = !GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes("YOUR_GOOGLE_CLIENT_ID");

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
   TEXT — English / Kinyarwanda
   ============================================================================ */

const T_EN = {
  backHome: "Back to home",
  login: "Log in",
  langSwitch: "Kinyarwanda",
  formEyebrow: "School registration",
  formTitle: "Register your school",
  formDesc: "Four quick details and your school is on its way to approval.",
  institutionSection: "Institution details",
  namePh: "School name",
  phonePh: "078 123 4567",
  phoneHint: "MTN (078, 079) or Airtel (072, 073). Our team calls this number to confirm your registration and payment.",
  phoneInvalid: "Use 10 digits starting with 078 or 079 (MTN), or 072 or 073 (Airtel)",
  phoneValid: "Valid number",
  nameLabel: "School name",
  phoneLabel: "Phone number",
  logoLabel: "School logo",
  logoUploadTab: "Upload",
  logoLinkTab: "Paste link",
  logoLinkPh: "https://example.com/logo.png",
  logoHint: "PNG or JPG, square works best.",
  emailLabel: "School email",
  emailHint: "Verified through your Google account so it can't be faked. You'll use it to sign in later.",
  googleLoadError: "Couldn't load Google sign-in. Check your connection and try again.",
  googleNotConfigured: "Google sign-in isn't configured yet. Set VITE_GOOGLE_CLIENT_ID and try again.",
  verifiedAs: "Verified as",
  changeAccount: "Use a different account",
  submit: "Submit registration",
  submitting: "Submitting…",
  already: "Already registered?",
  successTitle: "Registration received",
  successUnder: "is registered and waiting for review.",
  nextTitle: "What happens next",
  stepReview: "Our team reviews your registration.",
  stepCall: "We call {phone} to confirm your details and payment.",
  stepCode: "Once approved, we email your school code to {email}.",
  stepSignIn: "Then sign in with Google using that same email, and share the code with your teachers and students.",
  registerAnother: "Register another institution",
  validationError: "Please complete every field above, including verifying your email with Google.",
  serverErrorFallback: "Something went wrong while submitting. Please try again.",
  progress: "of 4 completed",
  heroTitle: "Run your whole school from one place.",
  heroDesc: "Join schools across Rwanda managing students, teachers and results with ESMS.",
  point1: "Set up in minutes",
  point2: "Secure Google verification",
  point3: "Personal onboarding call",
  slideLabel: "Show photo",
};

const T_RW = {
  backHome: "Garuka ahabanza",
  login: "Injira",
  langSwitch: "English",
  formEyebrow: "Kwiyandikisha kw'ishuri",
  formTitle: "Andikisha ishuri ryawe",
  formDesc: "Amakuru ane yihuse, hanyuma ishuri ryawe rigatangira gusuzumwa.",
  institutionSection: "Amakuru y'ikigo",
  namePh: "Izina ry'ikigo",
  phonePh: "078 123 4567",
  phoneHint: "MTN (078, 079) cyangwa Airtel (072, 073). Itsinda ryacu rizahamagara iyi nimero kugira ngo ryemeze iyandikisha n'ubwishyu.",
  phoneInvalid: "Koresha imibare 10 itangira na 078 cyangwa 079 (MTN), cyangwa 072 cyangwa 073 (Airtel)",
  phoneValid: "Nimero nyayo",
  nameLabel: "Izina ry'ikigo",
  phoneLabel: "Nimero ya telefoni",
  logoLabel: "Ikirango cy'ishuri",
  logoUploadTab: "Ohereza dosiye",
  logoLinkTab: "Shyiramo link",
  logoLinkPh: "https://example.com/logo.png",
  logoHint: "PNG cyangwa JPG, isura ya kare niyo nziza.",
  emailLabel: "Email y'ishuri",
  emailHint: "Yemezwa binyuze kuri konti yawe ya Google kugira ngo hatabaho email y'ibinyoma. Uzayikoresha winjira nyuma.",
  googleLoadError: "Ntibyashobotse gufungura Google. Reba interineti yawe hanyuma ugerageze.",
  googleNotConfigured: "Kwinjira na Google ntibiraboneka. Shyiramo VITE_GOOGLE_CLIENT_ID hanyuma ugerageze.",
  verifiedAs: "Yemejwe nka",
  changeAccount: "Koresha indi konti",
  submit: "Ohereza iyandikisha",
  submitting: "Kohereza…",
  already: "Wamaze kwiyandikisha?",
  successTitle: "Iyandikisha ryakiriwe",
  successUnder: "ryanditswe kandi ritegereje isuzumwa.",
  nextTitle: "Ibikurikiraho",
  stepReview: "Itsinda ryacu risuzuma iyandikisha ryawe.",
  stepCall: "Turahamagara kuri {phone} kugira ngo twemeze amakuru n'ubwishyu.",
  stepCode: "Iyo byemejwe, kode y'ishuri ryawe iboherezwa kuri {email}.",
  stepSignIn: "Nyuma winjire na Google ukoresheje iyo email, hanyuma usangize abarimu n'abanyeshuri kode.",
  registerAnother: "Andikisha ikindi kigo",
  validationError: "Uzuza buri gice hejuru, harimo no kwemeza email yawe binyuze kuri Google.",
  serverErrorFallback: "Hari ikitagenze neza mu kohereza. Ongera ugerageze.",
  progress: "kuri 4 byuzuye",
  heroTitle: "Ayobora ishuri ryawe ryose ahantu hamwe.",
  heroDesc: "Funga amashuri yo mu Rwanda acunga abanyeshuri, abarimu n'amanota akoresheje ESMS.",
  point1: "Tangira mu minota mike",
  point2: "Kwemeza kwizewe na Google",
  point3: "Guhamagarwa n'itsinda ryacu",
  slideLabel: "Erekana ifoto",
};

const TextCtx = createContext(T_EN);
const useT = () => useContext(TextCtx);

/* ============================================================================
   DESIGN TOKENS
   ============================================================================ */

const INK = "#0B3B2C";
const INK_DEEP = "#052E21";
const EMERALD = "#1E9E5A";
const ORANGE = "#15803D"; // alert/accent (green-700, no red)
const ORANGE_BG = "#ECFDF5";
const PAPER = "#FFFFFF";
const LINE = "#DCE8E1";
const SURFACE = "#F3F8F5";

/* ============================================================================
   ROOT
   ============================================================================ */

export default function Register({ onBackHome, onLogin }) {
  const [lang, setLang] = useState("en");
  const t = lang === "rw" ? T_RW : T_EN;

  return (
    <TextCtx.Provider value={t}>
      <div className="min-h-screen w-full text-left" style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: SURFACE }}>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap"
        />
        <GlobalKeyframes />
        <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <HeroPanel />
          <div className="relative flex flex-col min-w-0 overflow-hidden" style={{ background: SURFACE }}>
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <path d="M600 0 V260 C470 230 400 120 420 0 Z" fill="#D1FAE5" opacity="0.7" />
              <path d="M0 800 V560 C140 600 260 700 240 800 Z" fill="#BBF7D0" opacity="0.55" />
              <circle cx="560" cy="700" r="90" fill="#ECFDF5" />
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

function GlobalKeyframes() {
  return (
    <style>{`
      @keyframes popIn { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes kenburns { from { transform: scale(1.02); } to { transform: scale(1.14) translate(-1.5%, -1%); } }
      @keyframes riseIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes slideRight { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
      @keyframes floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      @keyframes sheen { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
      @keyframes dotFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      .hero-curve { clip-path: ellipse(120% 100% at 50% 0%); }
      @media (min-width: 1024px) { .hero-curve { clip-path: ellipse(100% 100% at 0% 50%); } }
      .rise { animation: riseIn 0.55s cubic-bezier(.2,.7,.2,1) backwards; }
      .slide-in { animation: slideRight 0.6s cubic-bezier(.2,.7,.2,1) backwards; }
      .kb { animation: kenburns 9s ease-in-out forwards; }
      .float { animation: floatY 5s ease-in-out infinite; }
      .btn-sheen { position: relative; overflow: hidden; }
      .btn-sheen:not(:disabled):hover::after {
        content: ""; position: absolute; inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
        animation: sheen 0.8s ease;
      }
      @media (prefers-reduced-motion: reduce) {
        * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
      }
    `}</style>
  );
}

/* ============================================================================
   HERO PANEL (photo side)
   ============================================================================ */

function HeroPanel() {
  const t = useT();
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState({});

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % HERO_IMAGES.length), 7000);
    return () => clearInterval(id);
  }, []);

  const points = [
    { icon: BookOpenCheck, text: t.point1 },
    { icon: ShieldCheck, text: t.point2 },
    { icon: Users, text: t.point3 },
  ];

  return (
    <aside
      className="hero-curve relative overflow-hidden h-52 sm:h-60 lg:h-screen lg:sticky lg:top-0"
      style={{ background: INK_DEEP }}
    >
      {/* Slideshow */}
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

      {/* Overlays */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, rgba(6,78,59,0.70) 0%, rgba(5,46,33,0.60) 45%, rgba(3,30,22,0.90) 100%)",
        }}
      />

      <div className="relative z-10 h-full flex flex-col justify-between p-5 sm:p-8 lg:p-12">
        {/* Brand */}
        <div className="flex items-center gap-3 slide-in">
          <span className="w-10 h-10 rounded-xl overflow-hidden bg-white ring-1 ring-white/30 shadow-lg">
            <img src={esms} alt="ESMS logo" className="w-full h-full object-cover" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>
            {BRAND_NAME}
          </span>
        </div>

        {/* Message (desktop) */}
        <div className="hidden lg:block max-w-md">
          <h2
            className="rise text-[34px] leading-[1.15] font-bold text-white mb-4"
            style={{ fontFamily: "'Poppins', sans-serif", animationDelay: "0.15s" }}
          >
            {t.heroTitle}
          </h2>
          <p className="rise text-sm leading-relaxed text-white/75 mb-8" style={{ animationDelay: "0.3s" }}>
            {t.heroDesc}
          </p>

          <ul className="space-y-3 mb-10">
            {points.map(({ icon: Icon, text }, i) => (
              <li
                key={text}
                className="slide-in flex items-center gap-3 text-sm font-medium text-white"
                style={{ animationDelay: `${0.45 + i * 0.12}s` }}
              >
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center backdrop-blur-sm"
                  style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
                >
                  <Icon size={15} strokeWidth={2.2} color="white" />
                </span>
                {text}
              </li>
            ))}
          </ul>

          {/* Slide indicators */}
          <div className="flex items-center gap-2">
            {HERO_IMAGES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`${t.slideLabel} ${i + 1}`}
                className="h-1 rounded-full overflow-hidden transition-all duration-500"
                style={{ width: i === active ? 40 : 14, background: "rgba(255,255,255,0.28)" }}
              >
                {i === active && (
                  <span
                    key={active}
                    className="block h-full w-full origin-left"
                    style={{ background: "white", animation: "dotFill 7s linear forwards" }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Floating trust badge (desktop) */}
        <div
          className="hidden lg:flex float absolute right-10 top-28 items-center gap-2.5 rounded-xl px-3.5 py-2.5 backdrop-blur-md"
          style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)" }}
        >
          <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: EMERALD }}>
            <ShieldCheck size={14} color="white" strokeWidth={2.5} />
          </span>
          <span className="text-xs font-semibold text-white">Google verified</span>
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
        className="inline-flex items-center gap-1.5 border border-slate-200 bg-white text-[#0B3B2C] rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 hover:-translate-x-0.5 transition-all shadow-sm"
      >
        <ArrowLeft size={14} strokeWidth={2.5} />
        <span>{t.backHome}</span>
      </button>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => setLang((l) => (l === "en" ? "rw" : "en"))}
          className="inline-flex items-center gap-1.5 border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
          style={{ color: INK }}
          aria-label="Switch language"
        >
          <Languages size={13} strokeWidth={2.5} />
          <span className="hidden sm:inline">{t.langSwitch}</span>
        </button>

        <button
          type="button"
          onClick={onLogin}
          className="btn-sheen inline-flex items-center gap-1.5 text-white rounded-lg px-3.5 py-1.5 text-xs font-bold hover:opacity-95 transition-opacity shadow-sm"
          style={{ background: EMERALD }}
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

  useEffect(() => {
    if (GOOGLE_CLIENT_ID_MISSING) return;
    if (window.google?.accounts?.id) {
      setReady(true);
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
            onVerified({
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
      <p className="text-[11px] text-slate-400 mb-2 -mt-1">{t.emailHint}</p>

      {form.emailVerified ? (
        <div
          className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
          style={{ borderColor: EMERALD, background: "#ECFDF5", animation: "popIn 0.3s ease-out" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {form.emailPicture ? (
              <img src={form.emailPicture} alt="" className="w-7 h-7 rounded-full shrink-0" />
            ) : (
              <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: EMERALD }}>
                <CheckCircle2 size={14} color="white" strokeWidth={2.5} />
              </span>
            )}
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-500 leading-tight">{t.verifiedAs}</div>
              <div className="text-[13px] font-bold truncate leading-tight" style={{ color: INK }}>{form.email}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-[11px] font-bold shrink-0 hover:opacity-75 transition-opacity"
            style={{ color: ORANGE }}
          >
            <RefreshCw size={12} strokeWidth={2.5} />
            {t.changeAccount}
          </button>
        </div>
      ) : GOOGLE_CLIENT_ID_MISSING ? (
        <p className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: ORANGE }}>
          <AlertCircle size={12} strokeWidth={2.5} /> {t.googleNotConfigured}
        </p>
      ) : (
        <div>
          <div ref={buttonRef} />
          {error && (
            <p className="flex items-center gap-1.5 text-[11px] font-medium mt-2" style={{ color: ORANGE }}>
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

      // The school code is intentionally NOT returned by the server.
      // It is emailed to the school after the super admin approves it.
      setSuccess(true);
    } catch (err) {
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
      <div className="w-full max-w-xl">
        <div className="bg-white border border-emerald-100 rounded-2xl shadow-xl shadow-emerald-900/10 overflow-hidden rise">
          {/* Progress bar */}
          <div className="h-1 w-full" style={{ background: LINE }}>
            <div
              className="h-full transition-all duration-500 ease-out"
              style={{ width: `${(doneCount / 4) * 100}%`, background: `linear-gradient(90deg, ${EMERALD}, #34D399)` }}
            />
          </div>

          <div className="px-5 py-6 sm:px-8 sm:py-7">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <div className="text-[11px] font-semibold mb-1" style={{ color: ORANGE }}>{t.formEyebrow}</div>
                <h1 className="text-xl sm:text-2xl font-bold mb-1" style={{ color: INK, fontFamily: "'Poppins', sans-serif" }}>
                  {t.formTitle}
                </h1>
                <p className="text-xs text-slate-500 max-w-sm">{t.formDesc}</p>
              </div>
              <div
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
                style={{ background: doneCount === 4 ? "#ECFDF5" : SURFACE, color: doneCount === 4 ? EMERALD : INK, border: `1px solid ${LINE}` }}
              >
                {doneCount} {t.progress}
              </div>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div className="rise" style={{ animationDelay: "0.1s" }}>
                <InstitutionFields form={form} set={set} phoneDone={phoneDone} />
              </div>

              <div className="rise" style={{ animationDelay: "0.2s" }}>
                <LogoField form={form} set={set} />
              </div>

              <div className="rise" style={{ animationDelay: "0.3s" }}>
                <GoogleEmailField form={form} setForm={setForm} />
              </div>

              {showValidationError && (
                <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: ORANGE, animation: "riseIn 0.3s ease-out" }}>
                  <AlertCircle size={14} strokeWidth={2.5} /> {t.validationError}
                </p>
              )}

              {apiError && (
                <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: ORANGE, animation: "riseIn 0.3s ease-out" }}>
                  <AlertCircle size={14} strokeWidth={2.5} /> {apiError}
                </p>
              )}

              <button
                type="submit"
                disabled={!isValid || submitting}
                className="btn-sheen w-full inline-flex items-center justify-center gap-2 rounded-lg text-white text-sm font-bold py-2.5 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-35 disabled:cursor-not-allowed shadow-sm"
                style={{ background: INK }}
              >
                {submitting && <Loader2 size={15} strokeWidth={2.5} style={{ animation: "spin 0.8s linear infinite" }} />}
                {submitting ? t.submitting : t.submit}
              </button>

              <p className="text-center text-xs text-slate-500">
                {t.already}{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onLogin?.(e);
                  }}
                  className="font-bold no-underline hover:underline"
                  style={{ color: EMERALD }}
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
  "w-full h-9 rounded-lg border border-slate-200 px-3 text-[13px] text-[#0B3B2C] bg-white placeholder:text-slate-400 focus:outline-none transition-shadow disabled:bg-slate-50 disabled:cursor-not-allowed";

function focusRing(e, on) {
  e.currentTarget.style.borderColor = on ? EMERALD : LINE;
  e.currentTarget.style.boxShadow = on ? `0 0 0 3px rgba(30,158,90,0.14)` : "none";
}

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon size={13} strokeWidth={2.5} color={INK} />
      <div className="text-[12px] font-bold" style={{ color: INK }}>{children}</div>
    </div>
  );
}

function FieldStatus({ show, ok, okText, badText }) {
  if (!show) return null;
  return (
    <div
      key={ok ? "ok" : "bad"}
      className="flex items-center gap-1.5 mt-1.5 text-[11px] font-medium"
      style={{ color: ok ? EMERALD : ORANGE, animation: "riseIn 0.25s ease-out" }}
    >
      {ok ? <CheckCircle2 size={12} strokeWidth={2.5} /> : <AlertCircle size={12} strokeWidth={2.5} />}
      {ok ? okText : badText}
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="block text-[12px] font-semibold text-slate-600 mb-1">{children}</label>;
}

function InstitutionFields({ form, set, phoneDone }) {
  const t = useT();
  const network = getNetwork(form.phone);
  return (
    <div>
      <SectionLabel icon={Building2}>{t.institutionSection}</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>{t.nameLabel}</FieldLabel>
          <div className="relative">
            <School size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2} />
            <input
              className={`${inputBase} pl-9`}
              type="text"
              value={form.schoolName}
              onFocus={(e) => focusRing(e, true)}
              onBlur={(e) => focusRing(e, false)}
              onChange={(e) => set("schoolName", e.target.value)}
              placeholder={t.namePh}
            />
          </div>
        </div>

        <div>
          <FieldLabel>{t.phoneLabel}</FieldLabel>
          <div className="relative">
            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2} />
            <input
              className={`${inputBase} pl-9 pr-16`}
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
                style={{ background: EMERALD, animation: "popIn 0.25s ease-out" }}
              >
                {network}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-[18px]">
        {form.phone ? (
          <FieldStatus show ok={phoneDone} okText={`${t.phoneValid}${network ? ` · ${network}` : ""}`} badText={t.phoneInvalid} />
        ) : (
          <p className="text-[11px] text-slate-400 mt-1.5">{t.phoneHint}</p>
        )}
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
          className="w-12 h-12 rounded-lg border flex items-center justify-center overflow-hidden shrink-0 bg-slate-50"
          style={{ borderColor: LINE }}
        >
          {previewSrc ? (
            <img key={previewSrc} src={previewSrc} alt="Logo preview" className="w-full h-full object-cover" style={{ animation: "popIn 0.3s ease-out" }} />
          ) : (
            <ImageIcon size={17} className="text-slate-300" />
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
                className="w-full h-9 inline-flex items-center justify-center gap-1.5 border border-dashed rounded-lg px-3 text-xs font-semibold hover:bg-slate-50 transition-colors"
                style={{ color: INK, borderColor: form.logoFile ? EMERALD : "#BFD3C8" }}
              >
                {form.logoFile ? <CheckCircle2 size={13} strokeWidth={2.5} color={EMERALD} /> : <Upload size={13} strokeWidth={2.5} />}
                {t.logoUploadTab}
                <span className="font-normal text-slate-400 hidden sm:inline">· {t.logoHint}</span>
              </button>
            </>
          ) : (
            <input
              className={inputBase}
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
        background: active ? INK : "white",
        color: active ? "white" : INK,
        border: `1px solid ${active ? INK : LINE}`,
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
        className="w-full max-w-md text-center bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/60 px-6 sm:px-8 py-9"
        style={{ animation: "popIn 0.3s ease-out" }}
      >
        {previewSrc ? (
          <img src={previewSrc} alt="School logo" className="w-14 h-14 rounded-full mx-auto mb-4 object-cover ring-2 ring-emerald-500" />
        ) : (
          <div className="w-11 h-11 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: EMERALD }}>
            <CheckCircle2 size={22} color="white" strokeWidth={2.5} />
          </div>
        )}

        <h1 className="text-lg font-bold mb-1.5" style={{ color: INK, fontFamily: "'Poppins', sans-serif" }}>{t.successTitle}</h1>
        <p className="text-xs text-slate-500 mb-5">
          <span className="font-semibold" style={{ color: INK }}>{form.schoolName}</span> {t.successUnder}
        </p>

        <div className="mb-5 rounded-xl border px-4 py-4 text-left" style={{ borderColor: ORANGE + "55", background: ORANGE_BG }}>
          <p className="text-[12px] font-bold mb-3" style={{ color: "#14532D" }}>{t.nextTitle}</p>
          <ol className="flex flex-col gap-3">
            {steps.map(({ icon: Icon, text }, i) => (
              <li key={i} className="slide-in flex items-start gap-2.5" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white mt-px"
                  style={{ background: ORANGE }}
                >
                  {i + 1}
                </span>
                <span className="flex items-start gap-1.5 text-[11px] leading-relaxed break-words min-w-0" style={{ color: "#14532D" }}>
                  <Icon size={13} strokeWidth={2.5} className="shrink-0 mt-0.5" />
                  <span className="min-w-0">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <button
          type="button"
          className="btn-sheen w-full rounded-lg text-white text-sm font-semibold py-2.5 hover:opacity-95 transition-opacity"
          style={{ background: INK }}
          onClick={onRegisterAnother}
        >
          {t.registerAnother}
        </button>
      </div>
    </div>
  );
}