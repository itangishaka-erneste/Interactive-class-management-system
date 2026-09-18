import React, { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  ArrowLeft,
  LogIn,
  Building2,
  CheckCircle2,
  AlertCircle,
  School,
  Languages,
  Clock3,
  ImageIcon,
  Link2,
  Upload,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

/* ============================================================================
   CONFIG — frontend-only. No API_BASE, no server calls anywhere in this file.
   The only "external" thing that happens is loading Google's own
   accounts.google.com script so we can verify an email address — that is
   still 100% client-side, no backend of ours involved.
   ============================================================================ */

const BRAND_NAME = "Easy Class Records System";

// Replace with your own Google OAuth Client ID from
// https://console.cloud.google.com/apis/credentials
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

const INITIAL_FORM = {
  schoolName: "",
  phone: "",
  logoMode: "upload", // "upload" | "link"
  logoFile: null, // data URL preview
  logoUrl: "",
  email: "",
  emailVerified: false,
  emailName: "",
  emailPicture: "",
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
const isValidRwandaPhone = (raw) => /^07[0-9]{8}$/.test(normalizeRwandaPhone(raw));

function generateSchoolCode() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `ECR-${n}`;
}

// Decodes a Google JWT credential purely client-side — no backend call.
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
  formEyebrow: "INSTITUTION REGISTRATION",
  formTitle: "Register your institution",
  formDesc: "Just the essentials — school name, logo, phone number, and a verified email.",
  institutionSection: "Institution details",
  namePh: "Institution name",
  phonePh: "07XX XXX XXX",
  phoneInvalid: "Enter a valid Rwandan number — 10 digits, starting with 07",
  phoneValid: "Valid Rwandan number",
  logoLabel: "School logo",
  logoUploadTab: "Upload",
  logoLinkTab: "Paste link",
  logoLinkPh: "https://example.com/logo.png",
  logoHint: "PNG or JPG, square works best.",
  emailLabel: "School email",
  emailHint: "We verify this through your Google account so a typed-in email can't be faked.",
  continueWithGoogle: "Continue with Google",
  googleLoadError: "Couldn't load Google sign-in. Check your connection and try again.",
  verifiedAs: "Verified as",
  changeAccount: "Use a different account",
  submit: "Submit registration",
  already: "Already registered?",
  successTitle: "Registration submitted",
  successUnder: "has been registered.",
  successSentTo: "A confirmation will be sent to",
  yourSchoolCode: "Your school code",
  keepCodeSafe: "Keep this code safe — you'll need it to log in.",
  pendingVerification:
    "One last step: our team reviews and approves every new school before its admin can sign in. You'll get an email as soon as that's done — usually within one business day.",
  registerAnother: "Register another institution",
  validationError: "Please complete every field above, including verifying your email with Google.",
};

const T_RW = {
  backHome: "Garuka ahabanza",
  login: "Injira",
  langSwitch: "English",
  formEyebrow: "KWIYANDIKISHA KW'IKIGO",
  formTitle: "Andikisha ikigo cyawe",
  formDesc: "Ibisabwa gusa — izina ry'ikigo, ikirango, telefoni, na email yemejwe.",
  institutionSection: "Amakuru y'ikigo",
  namePh: "Izina ry'ikigo",
  phonePh: "07XX XXX XXX",
  phoneInvalid: "Andika nimero nyayo yo mu Rwanda — imibare 10, itangira na 07",
  phoneValid: "Nimero nyayo yo mu Rwanda",
  logoLabel: "Ikirango cy'ishuri",
  logoUploadTab: "Ohereza dosiye",
  logoLinkTab: "Shyiramo link",
  logoLinkPh: "https://example.com/logo.png",
  logoHint: "PNG cyangwa JPG, isura ya kare niyo nziza.",
  emailLabel: "Email y'ishuri",
  emailHint: "Turayemeza binyuze kuri konti yawe ya Google kugira ngo hatabaho email y'ibinyoma.",
  continueWithGoogle: "Komeza na Google",
  googleLoadError: "Ntibyashobotse gufungura Google. Reba interineti yawe hanyuma ugerageze.",
  verifiedAs: "Yemejwe nka",
  changeAccount: "Koresha indi konti",
  submit: "Ohereza iyandikisha",
  already: "Wamaze kwiyandikisha?",
  successTitle: "Iyandikisha ryoherejwe",
  successUnder: "ryanditswe.",
  successSentTo: "Iyemeza rizoherezwa kuri",
  yourSchoolCode: "Kode y'ishuri ryawe",
  keepCodeSafe: "Bika neza iyi kode — uzayikenera kugira ngo winjire.",
  pendingVerification:
    "Intambwe iheruka: itsinda ryacu risuzuma kandi ryemeza buri shuri rishya mbere y'uko umuyobozi waryo yinjira. Uzabona email igihe byemejwe — akenshi mu munsi umwe w'akazi.",
  registerAnother: "Andikisha ikindi kigo",
  validationError: "Uzuza buri gice hejuru, harimo no kwemeza email yawe binyuze kuri Google.",
};

const TextCtx = createContext(T_EN);
const useT = () => useContext(TextCtx);

/* ============================================================================
   DESIGN TOKENS
   ============================================================================ */

const INK = "rgb(11,22,111)"; // blue
const EMERALD = "#1E9E5A"; // green
const ORANGE = "#FF4500"; // orange
const ORANGE_BG = "#FFF1EC";
const PAPER = "#FFFFFF";
const LINE = "#E4E7F2";

/* ============================================================================
   ROOT COMPONENT
   ============================================================================ */

export default function Register({ onBackHome, onLogin }) {
  const [lang, setLang] = useState("en");
  const t = lang === "rw" ? T_RW : T_EN;

  return (
    <TextCtx.Provider value={t}>
      <div className="min-h-screen" style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: PAPER }}>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap"
        />
        <GlobalKeyframes />
        <TopBar onBackHome={onBackHome} onLogin={onLogin} lang={lang} setLang={setLang} />
        <RegistrationFormBody onLogin={onLogin} />
      </div>
    </TextCtx.Provider>
  );
}

function GlobalKeyframes() {
  return (
    <style>{`
      @keyframes popIn { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
      @media (prefers-reduced-motion: reduce) {
        * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
      }
    `}</style>
  );
}

/* ============================================================================
   TOP BAR
   ============================================================================ */

function TopBar({ onBackHome, onLogin, lang, setLang }) {
  const t = useT();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 pb-3 flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        onClick={onBackHome}
        className="order-1 inline-flex items-center gap-1.5 border border-slate-200 bg-white text-[rgb(11,22,111)] rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
      >
        <ArrowLeft size={14} strokeWidth={2.5} />
        <span className="hidden xs:inline">{t.backHome}</span>
      </button>

      <div className="order-3 sm:order-2 flex items-center gap-2.5">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center ring-1 ring-slate-200"
          style={{ background: INK }}
        >
          <School size={18} color="white" strokeWidth={2.25} />
        </span>
        <span className="text-[13px] font-extrabold tracking-tight" style={{ color: INK, fontFamily: "'Poppins', sans-serif" }}>
          {BRAND_NAME}
        </span>
      </div>

      <div className="order-2 sm:order-3 flex items-center gap-1.5 sm:gap-2">
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
          className="inline-flex items-center gap-1.5 text-white rounded-lg px-3.5 py-1.5 text-xs font-bold hover:opacity-90 transition-opacity shadow-sm"
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
   GOOGLE SIGN-IN (client-side email verification)
   ============================================================================ */

function useGoogleIdentity(onVerified) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
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
              verified: !!payload.email_verified,
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

  const handleVerified = ({ email, name, picture, verified }) => {
    setForm((f) => ({
      ...f,
      email,
      emailName: name,
      emailPicture: picture,
      emailVerified: verified !== false,
    }));
  };

  const { error, buttonRef } = useGoogleIdentity(handleVerified);

  const reset = () => {
    setForm((f) => ({ ...f, email: "", emailVerified: false, emailName: "", emailPicture: "" }));
    window.google?.accounts?.id?.disableAutoSelect?.();
  };

  return (
    <div>
      <SectionLabel icon={ShieldCheck}>{t.emailLabel}</SectionLabel>
      <p className="text-[11px] text-slate-400 mb-2.5 -mt-1">{t.emailHint}</p>

      {form.emailVerified ? (
        <div
          className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
          style={{ borderColor: EMERALD, background: "#ECFDF5" }}
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
              <div className="text-[11px] font-semibold text-slate-500">{t.verifiedAs}</div>
              <div className="text-[13px] font-bold truncate" style={{ color: INK }}>{form.email}</div>
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
  const [success, setSuccess] = useState(false);
  const [schoolCode, setSchoolCode] = useState(null);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const phoneDone = isValidRwandaPhone(form.phone);
  const logoDone = form.logoMode === "upload" ? !!form.logoFile : !!form.logoUrl.trim();
  const nameDone = !!form.schoolName.trim();

  const isValid = nameDone && phoneDone && logoDone && form.emailVerified;
  const showValidationError = submitted && !isValid;

  function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    setSchoolCode(generateSchoolCode());
    setSuccess(true);
  }

  function resetForm() {
    setForm(INITIAL_FORM);
    setSubmitted(false);
    setSuccess(false);
    setSchoolCode(null);
  }

  if (success) {
    return <SuccessScreen form={form} schoolCode={schoolCode} onRegisterAnother={resetForm} />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-14">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-lg shadow-slate-200/50 px-4 py-6 sm:px-8 sm:py-8">
        <div className="text-[10px] tracking-widest font-bold mb-1.5" style={{ color: ORANGE }}>{t.formEyebrow}</div>
        <h1 className="text-xl sm:text-2xl font-bold mb-1.5" style={{ color: INK, fontFamily: "'Poppins', sans-serif" }}>{t.formTitle}</h1>
        <p className="text-xs text-slate-500 mb-6 max-w-md">{t.formDesc}</p>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <InstitutionFields form={form} set={set} phoneDone={phoneDone} />

          <LogoField form={form} set={set} />

          <GoogleEmailField form={form} setForm={setForm} />

          {showValidationError && (
            <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: ORANGE }}>
              <AlertCircle size={14} strokeWidth={2.5} /> {t.validationError}
            </p>
          )}

          <button
            type="submit"
            disabled={!isValid}
            className="w-full rounded-lg text-white text-sm font-bold py-3 hover:opacity-95 transition-opacity disabled:opacity-35 disabled:cursor-not-allowed shadow-sm"
            style={{ background: INK }}
          >
            {t.submit}
          </button>

          <p className="text-center text-xs text-slate-500">
            {t.already}{" "}
            <a href="#" onClick={onLogin} className="font-bold no-underline" style={{ color: EMERALD }}>
              {t.login}
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------- Form field components ---------------------------- */

const inputBase =
  "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] text-[rgb(11,22,111)] bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-shadow disabled:bg-slate-50 disabled:cursor-not-allowed";

function focusRing(e, on) {
  e.currentTarget.style.borderColor = on ? EMERALD : LINE;
  e.currentTarget.style.boxShadow = on ? `0 0 0 3px rgba(30,158,90,0.14)` : "none";
}

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      <Icon size={13} strokeWidth={2.5} color={INK} />
      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: INK }}>{children}</div>
    </div>
  );
}

function FieldStatus({ show, ok, okText, badText }) {
  if (!show) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-medium" style={{ color: ok ? EMERALD : ORANGE }}>
      {ok ? <CheckCircle2 size={12} strokeWidth={2.5} /> : <AlertCircle size={12} strokeWidth={2.5} />}
      {ok ? okText : badText}
    </div>
  );
}

function InstitutionFields({ form, set, phoneDone }) {
  const t = useT();
  return (
    <div>
      <SectionLabel icon={Building2}>{t.institutionSection}</SectionLabel>
      <div className="space-y-2.5">
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

        <div>
          <input
            className={inputBase}
            type="tel"
            inputMode="numeric"
            value={form.phone}
            maxLength={13}
            onFocus={(e) => focusRing(e, true)}
            onBlur={(e) => focusRing(e, false)}
            onChange={(e) => set("phone", e.target.value.replace(/[^\d+\s-]/g, ""))}
            placeholder={t.phonePh}
          />
          <FieldStatus show={!!form.phone} ok={phoneDone} okText={t.phoneValid} badText={t.phoneInvalid} />
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

  const previewSrc = form.logoMode === "upload" ? form.logoFile : form.logoUrl;

  return (
    <div>
      <SectionLabel icon={ImageIcon}>{t.logoLabel}</SectionLabel>

      <div className="flex gap-1.5 mb-2.5">
        <TabButton active={form.logoMode === "upload"} onClick={() => set("logoMode", "upload")} icon={Upload}>
          {t.logoUploadTab}
        </TabButton>
        <TabButton active={form.logoMode === "link"} onClick={() => set("logoMode", "link")} icon={Link2}>
          {t.logoLinkTab}
        </TabButton>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 rounded-lg border flex items-center justify-center overflow-hidden shrink-0 bg-slate-50"
          style={{ borderColor: LINE }}
        >
          {previewSrc ? (
            <img src={previewSrc} alt="Logo preview" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={18} className="text-slate-300" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {form.logoMode === "upload" ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors"
                style={{ color: INK }}
              >
                <Upload size={13} strokeWidth={2.5} />
                {t.logoUploadTab}
              </button>
              <p className="text-[11px] text-slate-400 mt-1">{t.logoHint}</p>
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
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors"
      style={{
        background: active ? INK : "white",
        color: active ? "white" : INK,
        border: `1px solid ${active ? INK : LINE}`,
      }}
    >
      <Icon size={12} strokeWidth={2.5} />
      {children}
    </button>
  );
}

function SuccessScreen({ form, schoolCode, onRegisterAnother }) {
  const t = useT();
  const previewSrc = form.logoMode === "upload" ? form.logoFile : form.logoUrl;

  return (
    <div className="min-h-[65vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center bg-white border border-slate-200 rounded-2xl shadow-lg px-6 sm:px-7 py-9" style={{ animation: "popIn 0.25s ease-out" }}>
        {previewSrc ? (
          <img src={previewSrc} alt="School logo" className="w-14 h-14 rounded-full mx-auto mb-4 object-cover ring-2" style={{ borderColor: EMERALD }} />
        ) : (
          <div className="w-11 h-11 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: EMERALD }}>
            <CheckCircle2 size={22} color="white" strokeWidth={2.5} />
          </div>
        )}

        <h1 className="text-lg font-bold mb-1.5" style={{ color: INK, fontFamily: "'Poppins', sans-serif" }}>{t.successTitle}</h1>
        <p className="text-xs text-slate-500 mb-5">
          {form.schoolName} {t.successUnder} {t.successSentTo} {form.email}.
        </p>

        {schoolCode && (
          <div className="mb-5 rounded-xl border px-4 py-4" style={{ borderColor: EMERALD, background: "#ECFDF5" }}>
            <div className="text-[11px] font-semibold text-slate-500 mb-1">{t.yourSchoolCode}</div>
            <div className="text-xl font-extrabold tracking-wider" style={{ color: INK }}>{schoolCode}</div>
            <div className="text-[11px] text-slate-500 mt-1">{t.keepCodeSafe}</div>
          </div>
        )}

        <div className="mb-5 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-left" style={{ borderColor: ORANGE + "55", background: ORANGE_BG }}>
          <Clock3 size={15} color={ORANGE} strokeWidth={2.5} className="shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed" style={{ color: "#9A3412" }}>{t.pendingVerification}</p>
        </div>

        <button
          type="button"
          className="w-full rounded-lg text-white text-sm font-semibold py-2.5 hover:opacity-95 transition-opacity"
          style={{ background: INK }}
          onClick={onRegisterAnother}
        >
          {t.registerAnother}
        </button>
      </div>
    </div>
  );
}