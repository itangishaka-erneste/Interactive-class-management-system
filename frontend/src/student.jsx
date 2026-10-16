import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import {
  Home,
  BookOpen,
  Lightbulb,
  FileText,
  LineChart,
  Settings,
  X,
  LogOut,
  Menu,
  Backpack,
  CheckCircle2,
  FileEdit,
  User,
  Languages,
  ArrowLeft,
  ArrowRight,
  Award,
  Timer,
  MessageSquare,
  Send,
  ChevronRight,
  ChevronDown,
  School,
  Check,
  Camera,
  Trash2,
} from "lucide-react";

/* ============================================================================
   BRAND COLORS — green, orange-red and white only
   ============================================================================ */
const GREEN = "#15803D";
const GREEN_DEEP = "#0B3B2C";
const GREEN_SOFT = "#E8F5EC";
const ORANGE = "#FF4500";
const ORANGE_SOFT = "#FFF0EB";
const WHITE = "#FFFFFF";
const MUTED = "#5F7A6C";
const LINE = "#D5E6DB";
const TINT = "#F4FAF6";

/* ============================================================================
   CONFIG & HELPERS
   ============================================================================ */
// Same-origin by default; set VITE_API_BASE (or window.ECW_API_BASE) to override.
const API_BASE =
  (typeof window !== "undefined" && window.ECW_API_BASE) ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  (typeof window !== "undefined" ? window.location.origin : "");

// Student-only storage key, so a teacher session in the same browser can never
// overwrite the student's token.
const USER_SESSION_KEY = "ecw_student_session";
const SHOW_MORE_STEP = 3;
const CLASSROOM_SOCKET_NAMESPACE = "/classroom";

// Remember the active tab across page refreshes.
const NAV_STORAGE_KEY = "ecw_student_section";
const NAV_KEYS = ["home", "notes", "quizzes", "results", "progress", "settings"];
function getStoredNav() {
  try {
    const v = localStorage.getItem(NAV_STORAGE_KEY);
    return NAV_KEYS.includes(v) ? v : "home";
  } catch {
    return "home";
  }
}

// Profile picture chosen on this device (stored per student).
const AVATAR_KEY_PREFIX = "ecw_student_avatar_";
function readAvatar(key) {
  try {
    return localStorage.getItem(AVATAR_KEY_PREFIX + key) || "";
  } catch {
    return "";
  }
}
function writeAvatar(key, dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(AVATAR_KEY_PREFIX + key, dataUrl);
    else localStorage.removeItem(AVATAR_KEY_PREFIX + key);
    return true;
  } catch {
    return false;
  }
}

// Crop to a centered square and shrink, so the saved picture stays small.
function fileToAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) return reject(new Error("Please choose an image file."));
    if (file.size > 8 * 1024 * 1024) return reject(new Error("That image is too large (max 8 MB)."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function getSession() {
  try {
    const raw = localStorage.getItem(USER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// A 401 means the server rejected the token: treat it as a real sign-out.
let sessionExpiredHandler = null;
function registerSessionExpiredHandler(fn) {
  sessionExpiredHandler = fn;
}

// Sliding session: swap in the renewed token the server sends back.
function saveRenewedToken(response) {
  try {
    const renewed = response.headers.get("X-Renewed-Token");
    if (!renewed) return;
    const raw = localStorage.getItem(USER_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    localStorage.setItem(
      USER_SESSION_KEY,
      JSON.stringify({ ...(typeof parsed === "object" && parsed ? parsed : {}), token: renewed })
    );
  } catch {
    /* best-effort */
  }
}

async function apiFetch(path, options = {}) {
  const session = getSession();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  saveRenewedToken(response);
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server response was unreadable.");
  }
  if (response.status === 401) {
    const message = result.message || "Your session expired. Please sign in again.";
    if (sessionExpiredHandler) sessionExpiredHandler(message);
    throw new Error(message);
  }
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Something went wrong.");
  }
  return result;
}

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtCountdown(ms) {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/* ============================================================================
   NAVIGATION & TRANSLATIONS
   ============================================================================ */
const NAV_ITEMS = [
  { key: "home", label: "Home", icon: Home },
  { key: "notes", label: "Notes", icon: BookOpen },
  { key: "quizzes", label: "Quizzes", icon: Lightbulb },
  { key: "results", label: "My Results", icon: FileText },
  { key: "progress", label: "Progress", icon: LineChart },
  { key: "settings", label: "Settings", icon: Settings },
];

const T_EN = {
  brand: "ESMS",
  hello: "Hello",
  guest: "Student",
  guestRole: "STUDENT",
  notesAvailable: "NOTES",
  pendingQuizzes: "PENDING QUIZZES",
  quizzesDone: "QUIZZES DONE",
  averageScore: "AVERAGE SCORE",
  welcome: "Welcome",
  welcomeSub1: "You have",
  welcomeSub2: "notes and",
  welcomeSub3: "quizzes this week.",
  recentNotes: "Recent Notes",
  recentNotesSub: "From your teachers",
  pendingQuizzesTitle: "Quizzes",
  pendingQuizzesSub: "Don't miss these",
  allDone: "All caught up",
  allDoneSub: "No quizzes waiting for you.",
  noNotes: "No notes yet",
  noNotesSub: "Notes appear here once your teachers publish them.",
  signOut: "Sign Out",
  langSwitch: "Kinyarwanda",
  chooseClassTitle: "Choose your class",
  chooseClassSub: "Pick your class so you can see your teachers' notes and quizzes.",
  chooseClassEmpty: "No classes have been set up for your school yet. Check back soon, or ask your school admin.",
  chooseClassConfirm: "Confirm class",
  chooseClassSaving: "Saving…",
  currentClass: "Your class",
  changeClass: "Change class",
  changePhoto: "Change profile picture",
  removePhoto: "Remove picture",
  myProfile: "My profile",
};

const T_RW = {
  brand: "ESMS",
  hello: "Muraho",
  guest: "Umunyeshuri",
  guestRole: "UMUNYESHURI",
  notesAvailable: "INYANDIKO",
  pendingQuizzes: "IBIZAMINI BITEGEREJE",
  quizzesDone: "IBIZAMINI BYARANGIYE",
  averageScore: "AMANOTA MPUZANDENGO",
  welcome: "Murakaza neza",
  welcomeSub1: "Ufite",
  welcomeSub2: "inyandiko na",
  welcomeSub3: "ibizamini muri iki cyumweru.",
  recentNotes: "Inyandiko za vuba",
  recentNotesSub: "Ziturutse ku barimu bawe",
  pendingQuizzesTitle: "Ibizamini",
  pendingQuizzesSub: "Ntuzabyibagirwe",
  allDone: "Byose byarangiye",
  allDoneSub: "Nta kizamini gitegereje.",
  noNotes: "Nta nyandiko irahari",
  noNotesSub: "Inyandiko zizagaragara abarimu bazishyizeho.",
  signOut: "Sohoka",
  langSwitch: "English",
  chooseClassTitle: "Hitamo ikiciro cyawe",
  chooseClassSub: "Hitamo ikiciro kugira ngo ubone inyandiko n'ibizamini by'abarimu bawe.",
  chooseClassEmpty: "Nta biciro biraboneka ku ishuri ryawe. Ongera ugerageze, cyangwa ubaze umuyobozi w'ishuri.",
  chooseClassConfirm: "Emeza ikiciro",
  chooseClassSaving: "Kubika…",
  currentClass: "Ikiciro cyawe",
  changeClass: "Hindura ikiciro",
  changePhoto: "Hindura ifoto y'umwirondoro",
  removePhoto: "Kuraho ifoto",
  myProfile: "Umwirondoro wanjye",
};

/* ============================================================================
   GLOBAL HOVER STYLES (used by buttons, cards and rows across the app)
   ============================================================================ */
const HOVER_CSS = `
.ecw-lift { transition: transform .15s ease, box-shadow .15s ease, background-color .15s ease, border-color .15s ease; }
.ecw-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(11,59,44,.12); }
.ecw-lift:active { transform: translateY(0); box-shadow: none; }
.ecw-btn { transition: transform .15s ease, filter .15s ease, background-color .15s ease; }
.ecw-btn:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
.ecw-btn:active:not(:disabled) { transform: translateY(0); }
.ecw-pop { animation: ecwPop .14s ease-out; transform-origin: top right; }
@keyframes ecwPop { from { opacity: 0; transform: scale(.96) translateY(-4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .ecw-lift, .ecw-btn { transition: none; }
  .ecw-lift:hover, .ecw-btn:hover:not(:disabled) { transform: none; }
  .ecw-pop { animation: none; }
}
`;

/* ============================================================================
   TOAST NOTIFICATIONS
   ============================================================================ */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, message, type }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 3200);
  }, []);
  return { toasts, push };
}

function ToastStack({ toasts }) {
  return (
    <div style={{ position: "fixed", bottom: 80, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
      {toasts.map((tst) => (
        <div
          key={tst.id}
          style={{
            background: tst.type === "error" ? ORANGE : GREEN,
            color: WHITE,
            borderRadius: 10,
            padding: "11px 14px",
            boxShadow: "0 10px 26px rgba(11,59,44,0.22)",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {tst.message}
        </div>
      ))}
    </div>
  );
}

/* ============================================================================
   AVATAR
   ============================================================================ */
function Avatar({ src, name, size = 40, onBroken, bg = GREEN }) {
  const letter = name ? name.charAt(0).toUpperCase() : "S";
  if (src) {
    return (
      <img
        src={src}
        alt={`${name || "Student"}'s profile`}
        referrerPolicy="no-referrer"
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
        onError={onBroken}
      />
    );
  }
  return (
    <div
      className="rounded-full text-white flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.4 }}
    >
      {letter}
    </div>
  );
}

/* ============================================================================
   PROFILE MENU (top right) — click the avatar to change picture or sign out
   ============================================================================ */
function ProfileMenu({ t, studentName, className, image, hasCustomImage, onBroken, onPickPhoto, onRemovePhoto, onChangeClass, onSignOut }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass = "w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-semibold rounded-lg text-left transition-colors";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.myProfile}
        className="ecw-lift flex items-center gap-1.5 rounded-full pl-1 pr-2 py-1 bg-white"
        style={{ border: `1px solid ${open ? GREEN : LINE}` }}
      >
        <Avatar src={image} name={studentName} size={30} onBroken={onBroken} />
        <ChevronDown size={14} color={MUTED} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && (
        <div
          role="menu"
          className="ecw-pop absolute right-0 top-full mt-2 w-64 bg-white rounded-xl z-50 overflow-hidden"
          style={{ border: `1px solid ${LINE}`, boxShadow: "0 16px 40px rgba(11,59,44,0.18)" }}
        >
          <div className="flex items-center gap-3 p-4" style={{ background: TINT, borderBottom: `1px solid ${LINE}` }}>
            <div className="relative group">
              <Avatar src={image} name={studentName} size={46} onBroken={onBroken} />
              <button
                type="button"
                onClick={onPickPhoto}
                aria-label={t.changePhoto}
                className="absolute inset-0 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                style={{ background: "rgba(11,59,44,0.6)" }}
              >
                <Camera size={16} />
              </button>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[13px] truncate" style={{ color: GREEN_DEEP }}>{studentName || t.guest}</p>
              <p className="text-[11px] truncate" style={{ color: MUTED }}>{className || t.guestRole}</p>
            </div>
          </div>

          <div className="p-1.5 flex flex-col gap-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onPickPhoto(); }}
              className={`${itemClass} hover:bg-[#E8F5EC]`}
              style={{ color: GREEN_DEEP }}
            >
              <Camera size={15} color={GREEN} /> {t.changePhoto}
            </button>
            {hasCustomImage && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onRemovePhoto(); }}
                className={`${itemClass} hover:bg-[#E8F5EC]`}
                style={{ color: GREEN_DEEP }}
              >
                <Trash2 size={15} color={MUTED} /> {t.removePhoto}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onChangeClass(); }}
              className={`${itemClass} hover:bg-[#E8F5EC]`}
              style={{ color: GREEN_DEEP }}
            >
              <School size={15} color={GREEN} /> {t.changeClass}
            </button>
            <div className="my-1 h-px" style={{ background: LINE }} />
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onSignOut(); }}
              className={`${itemClass} hover:bg-[#FFF0EB]`}
              style={{ color: ORANGE }}
            >
              <LogOut size={15} /> {t.signOut}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   CHAT WIDGET
   ============================================================================ */
function InAppChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, text: "Hello! How can we help with your classwork today?", sender: "system", time: "10:00 AM" },
  ]);
  const [input, setInput] = useState("");

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMsg = {
      // Random suffix keeps keys unique even within the same millisecond.
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      text: input,
      sender: "user",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {isOpen && (
        <div className="mb-3 w-80 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col h-96" style={{ border: `1px solid ${LINE}` }}>
          <div className="px-4 py-3 text-white flex items-center justify-between" style={{ background: GREEN_DEEP }}>
            <div className="flex items-center gap-2">
              <MessageSquare size={16} />
              <span className="font-bold text-xs">Classroom Chat</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:opacity-80 transition-opacity" aria-label="Close chat">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-2" style={{ background: TINT }}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] p-2.5 rounded-xl text-xs ${m.sender === "user" ? "ml-auto text-white" : "mr-auto bg-white text-[#0B3B2C]"}`}
                style={{ background: m.sender === "user" ? GREEN : undefined, border: m.sender === "user" ? "none" : `1px solid ${LINE}` }}
              >
                <p>{m.text}</p>
                <span className="block text-[9px] mt-1 text-right" style={{ color: m.sender === "user" ? "rgba(255,255,255,0.75)" : MUTED }}>
                  {m.time}
                </span>
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} className="p-2 bg-white flex items-center gap-2" style={{ borderTop: `1px solid ${LINE}` }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 rounded-lg px-3 py-2 text-xs focus:outline-none"
              style={{ background: TINT, border: `1px solid ${LINE}`, color: GREEN_DEEP }}
            />
            <button type="submit" className="ecw-btn p-2 rounded-lg text-white" style={{ background: ORANGE }} aria-label="Send">
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-12 h-12 rounded-full text-white shadow-xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{ background: ORANGE }}
        aria-label="Toggle chat"
      >
        {isOpen ? <X size={20} /> : <MessageSquare size={20} />}
      </button>
    </div>
  );
}

/* ============================================================================
   CHOOSE-CLASS ONBOARDING (restored: calls GET /api/student/classes and
   POST /api/student/class)
   ============================================================================ */
function ChooseClassModal({ classes, loading, saving, error, onPick, allowClose, onClose, t }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 px-4 py-6" role="dialog" aria-modal="true">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl">
        <div className="flex items-center gap-3 px-5 pt-5 pb-3" style={{ borderBottom: `1px solid ${LINE}` }}>
          <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: GREEN_SOFT }}>
            <School size={18} color={GREEN} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-[15px]" style={{ fontFamily: "'Poppins', sans-serif", color: GREEN_DEEP }}>{t.chooseClassTitle}</h3>
            <p className="text-[11px]" style={{ color: MUTED }}>{t.chooseClassSub}</p>
          </div>
          {allowClose && (
            <button type="button" onClick={onClose} style={{ color: MUTED }} aria-label="Close"><X size={18} /></button>
          )}
        </div>
        <div className="px-5 py-4">
          {error && (
            <p className="text-[11.5px] font-semibold rounded-lg px-3 py-2 mb-3" style={{ color: ORANGE, background: ORANGE_SOFT, border: `1px solid ${ORANGE}` }}>
              {error}
            </p>
          )}
          {loading ? (
            <p className="text-xs py-6 text-center" style={{ color: MUTED }}>Loading classes…</p>
          ) : classes.length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: MUTED }}>{t.chooseClassEmpty}</p>
          ) : (
            <div className="max-h-64 overflow-y-auto flex flex-col gap-1.5">
              {classes.map((c) => {
                const isSel = selected === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className="flex items-center justify-between text-left rounded-lg px-3.5 py-2.5 text-xs transition-colors hover:bg-[#E8F5EC]"
                    style={{ border: `1px solid ${isSel ? GREEN : LINE}`, background: isSel ? GREEN_SOFT : WHITE, color: isSel ? GREEN : GREEN_DEEP }}
                  >
                    <span className="font-semibold">{c.name}</span>
                    {isSel && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            disabled={!selected || saving || classes.length === 0}
            onClick={() => onPick(selected)}
            className="ecw-btn w-full mt-4 py-2.5 text-white font-bold text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: GREEN }}
          >
            {saving ? t.chooseClassSaving : t.chooseClassConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   SIDEBAR & UI COMPONENTS
   ============================================================================ */
function Sidebar({ open, onClose, active, setActive, t, studentName, studentImage, onBroken, onSignOut }) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed lg:static top-0 left-0 h-full z-40 bg-white flex flex-col transform transition-transform duration-300 ease-in-out w-[80%] max-w-[17rem] p-5 ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        style={{ borderRight: `1px solid ${LINE}` }}
      >
        <div className="flex items-center justify-between mb-6">
          <span className="font-extrabold text-lg tracking-tight" style={{ color: GREEN, fontFamily: "'Poppins', sans-serif" }}>
            {t.brand}
          </span>
          <button onClick={onClose} className="lg:hidden p-1" style={{ color: MUTED }} aria-label="Close menu">
            <X className="w-[1.125rem] h-[1.125rem]" />
          </button>
        </div>

        <div className="rounded-xl flex items-center gap-3 p-3.5 mb-6" style={{ background: TINT, border: `1px solid ${LINE}` }}>
          <Avatar src={studentImage} name={studentName} size={40} onBroken={onBroken} />
          <div className="min-w-0">
            <p className="font-semibold truncate text-[13px]" style={{ color: GREEN_DEEP }}>{studentName || t.guest}</p>
            <p className="font-bold tracking-wide text-[10px]" style={{ color: ORANGE }}>{t.guestRole}</p>
          </div>
        </div>

        <nav className="flex flex-col flex-1 gap-1">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setActive(key);
                  onClose();
                }}
                className={`flex items-center justify-between rounded-lg font-medium transition-all py-2.5 px-3 text-[13px] ${isActive ? "" : "hover:bg-[#E8F5EC] hover:translate-x-0.5"}`}
                style={{
                  background: isActive ? GREEN : "transparent",
                  color: isActive ? WHITE : GREEN_DEEP,
                }}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-[1.0625rem] h-[1.0625rem]" />
                  {label}
                </span>
                {isActive && <ChevronRight size={14} className="opacity-80" />}
              </button>
            );
          })}
        </nav>

        <button
          onClick={onSignOut}
          className="flex items-center rounded-lg font-semibold gap-2.5 py-2.5 px-3 text-[13px] mt-4 hover:bg-[#FFF0EB] transition-colors"
          style={{ color: ORANGE }}
        >
          <LogOut className="w-[0.9375rem] h-[0.9375rem]" />
          {t.signOut}
        </button>
      </aside>
    </>
  );
}

function StatCard({ label, value, icon: Icon, tint, ink, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl flex items-center gap-3 p-3.5 ${onClick ? "ecw-lift cursor-pointer" : ""}`}
      style={{ border: `1px solid ${LINE}` }}
    >
      <div className="rounded-lg flex items-center justify-center shrink-0 w-9 h-9" style={{ background: tint, color: ink }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="font-extrabold leading-tight text-lg" style={{ fontFamily: "'Poppins', sans-serif", color: GREEN_DEEP }}>{value}</p>
        <p className="font-semibold tracking-wide truncate text-[9px]" style={{ color: MUTED }}>{label}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub, tint, ink }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-9">
      <div className="rounded-full flex items-center justify-center w-12 h-12 mb-3" style={{ background: tint }}>
        <Icon size={20} color={ink} />
      </div>
      <p className="font-bold mb-1 text-[13px]" style={{ color: GREEN_DEEP }}>{title}</p>
      <p className="text-xs max-w-[240px]" style={{ color: MUTED }}>{sub}</p>
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-xl p-5 ${className}`} style={{ border: `1px solid ${LINE}` }}>
      {children}
    </div>
  );
}

function PageHeading({ title, sub }) {
  return (
    <div className="mb-5">
      <h2 className="font-extrabold text-lg" style={{ color: GREEN_DEEP, fontFamily: "'Poppins', sans-serif" }}>{title}</h2>
      <div className="h-1 w-10 rounded-full mt-1.5 mb-2" style={{ background: ORANGE }} />
      <p className="text-xs" style={{ color: MUTED }}>{sub}</p>
    </div>
  );
}

function ShowMoreButton({ remaining, onClick }) {
  if (remaining <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full mt-3 py-2.5 rounded-lg text-xs font-bold hover:bg-[#E8F5EC] transition-colors"
      style={{ border: `1px solid ${GREEN}`, color: GREEN }}
    >
      Show more ({remaining})
    </button>
  );
}

function NoteViewerModal({ note, onClose }) {
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 px-4 py-6" role="dialog" aria-modal="true">
      <div className="bg-white w-full max-w-lg rounded-2xl max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white flex items-center gap-3 px-5 pt-5 pb-3" style={{ borderBottom: `1px solid ${LINE}` }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: GREEN_SOFT }}>
            <FileEdit size={16} color={GREEN} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-[15px] truncate" style={{ fontFamily: "'Poppins', sans-serif", color: GREEN_DEEP }}>{note.title}</h3>
            <p className="text-[11px]" style={{ color: MUTED }}>{note.subject} · {note.authorName} · {fmtDateTime(note.updatedAt)}</p>
          </div>
          <button onClick={onClose} style={{ color: MUTED }} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-5 py-5">
          <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: GREEN_DEEP }}>{note.content}</p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   QUIZ HELPERS & ROWS
   ============================================================================ */
const STATUS_META = {
  upcoming: { label: "Not started yet", tint: TINT, ink: MUTED },
  available: { label: "Available now", tint: GREEN_SOFT, ink: GREEN },
  in_progress: { label: "In progress", tint: ORANGE_SOFT, ink: ORANGE },
  expired: { label: "Missed", tint: ORANGE_SOFT, ink: ORANGE },
  closed: { label: "Closed", tint: TINT, ink: MUTED },
  completed: { label: "Completed", tint: GREEN_SOFT, ink: GREEN_DEEP },
};

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function QuizRow({ quiz, onStart, onViewResult }) {
  const now = useNow(1000);
  const meta = STATUS_META[quiz.status] || STATUS_META.closed;

  let subline = `${quiz.subject || "General"} · ${quiz.questionCount || 0} question${quiz.questionCount === 1 ? "" : "s"}`;
  if (quiz.timeLimitMinutes) subline += ` · ${quiz.timeLimitMinutes} min`;

  let countdown = null;
  if (quiz.status === "upcoming" && quiz.startsAt) {
    countdown = `Starts in ${fmtCountdown(new Date(quiz.startsAt).getTime() - now)}`;
  } else if (quiz.status === "available" && quiz.endsAt) {
    countdown = `Closes in ${fmtCountdown(new Date(quiz.endsAt).getTime() - now)}`;
  } else if (quiz.status === "in_progress" && quiz.attempt?.deadlineAt) {
    countdown = `Time left: ${fmtCountdown(new Date(quiz.attempt.deadlineAt).getTime() - now)}`;
  }

  return (
    <div className="ecw-lift flex items-center gap-3 rounded-lg p-3" style={{ background: TINT, border: `1px solid ${LINE}` }}>
      <div className="rounded-lg flex items-center justify-center shrink-0 w-9 h-9" style={{ background: meta.tint }}>
        <Lightbulb size={14} color={meta.ink} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold truncate text-[13px]" style={{ color: GREEN_DEEP }}>{quiz.title}</p>
        <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>{subline}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: meta.tint, color: meta.ink }}>{meta.label}</span>
          {countdown && (
            <span className="text-[10px] font-semibold inline-flex items-center gap-1" style={{ color: MUTED }}>
              <Timer size={10} /> {countdown}
            </span>
          )}
        </div>
        {quiz.status === "completed" && quiz.attempt && (
          <p className="text-[11px] mt-1 font-bold" style={{ color: GREEN }}>
            Score: {quiz.attempt.finalScore}/{quiz.questionCount} ({quiz.attempt.scorePercent}%)
          </p>
        )}
      </div>
      {(quiz.status === "available" || quiz.status === "in_progress") && (
        <button
          type="button"
          onClick={() => onStart(quiz)}
          className="ecw-btn shrink-0 rounded-lg text-white font-bold text-[11px] px-3.5 py-2"
          style={{ background: ORANGE }}
        >
          {quiz.status === "in_progress" ? "Resume" : "Start"}
        </button>
      )}
      {quiz.status === "completed" && (
        <button
          type="button"
          onClick={() => onViewResult(quiz)}
          className="shrink-0 rounded-lg font-bold text-[11px] px-3.5 py-2 hover:bg-[#E8F5EC] transition-colors"
          style={{ border: `1px solid ${GREEN}`, color: GREEN }}
        >
          Review
        </button>
      )}
    </div>
  );
}

/* ============================================================================
   QUIZ TAKER MODAL
   ============================================================================ */
function QuizTakerModal({ quizId, onClose, onFinished, toast }) {
  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const now = useNow(1000);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/student/quizzes/${quizId}/start`, { method: "POST" });
        if (cancelled) return;
        setQuiz(res.quiz);
        setAttempt(res.attempt);
        const initialAnswers = {};
        for (const a of res.answers) initialAnswers[a.questionId] = a.optionId;
        setAnswers(initialAnswers);
      } catch (err) {
        toast(err.message, "error");
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, toast, onClose]);

  const deadlineMs = attempt?.deadlineAt ? new Date(attempt.deadlineAt).getTime() : null;
  const remainingMs = deadlineMs ? deadlineMs - now : null;

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/student/quizzes/${quizId}/submit`, { method: "POST" });
      setResult(res.result);
      onFinished();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSubmitting(false);
      setConfirmingSubmit(false);
    }
  }, [quizId, onFinished, toast]);

  // Auto-submit when time runs out.
  useEffect(() => {
    if (!loading && !result && remainingMs !== null && remainingMs <= 0) {
      submit();
    }
  }, [remainingMs, loading, result, submit]);

  // While the tab is hidden, report away-time once a second (penalty); report
  // the return once. Best-effort; never interrupts the quiz.
  useEffect(() => {
    if (loading || result) return undefined;
    let hiddenSince = null;
    let tickId = null;

    const reportAway = async () => {
      try {
        const res = await apiFetch(`/api/student/quizzes/${quizId}/penalty`, { method: "POST", body: JSON.stringify({ seconds: 1 }) });
        if (res && typeof res.penaltyMarks === "number") {
          setAttempt((a) => (a ? { ...a, penaltyMarks: res.penaltyMarks } : a));
        }
      } catch {
        /* best-effort */
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (hiddenSince) return;
        hiddenSince = Date.now();
        tickId = window.setInterval(reportAway, 1000);
      } else if (hiddenSince) {
        hiddenSince = null;
        if (tickId) {
          window.clearInterval(tickId);
          tickId = null;
        }
        apiFetch(`/api/student/quizzes/${quizId}/returned`, { method: "POST" }).catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (tickId) window.clearInterval(tickId);
    };
  }, [quizId, loading, result]);

  async function pick(questionId, optionId) {
    setAnswers((a) => ({ ...a, [questionId]: optionId }));
    try {
      await apiFetch(`/api/student/quizzes/${quizId}/answer`, { method: "POST", body: JSON.stringify({ questionId, optionId }) });
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function handleSubmitClick() {
    const skipped = quiz.questions.filter((q) => !answers[q.id]);
    if (skipped.length > 0) setConfirmingSubmit(true);
    else submit();
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl px-8 py-6 text-sm font-semibold" style={{ color: GREEN_DEEP }}>Loading quiz…</div>
      </div>
    );
  }
  if (!quiz) return null;

  if (confirmingSubmit) {
    const skippedCount = quiz.questions.filter((q) => !answers[q.id]).length;
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4 py-6" role="dialog" aria-modal="true">
        <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl px-6 py-7 text-center">
          <span className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: ORANGE_SOFT }}>
            <FileEdit size={22} color={ORANGE} />
          </span>
          <h3 className="font-extrabold text-base mb-1" style={{ fontFamily: "'Poppins', sans-serif", color: ORANGE }}>
            {skippedCount} question{skippedCount === 1 ? "" : "s"} unanswered
          </h3>
          <p className="text-xs mb-5" style={{ color: MUTED }}>You can still submit as-is, or go back and finish answering first.</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="ecw-btn w-full py-2.5 text-white font-bold text-xs rounded-lg disabled:opacity-50"
              style={{ background: GREEN }}
            >
              {submitting ? "Submitting…" : "Submit anyway"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirmingSubmit(false)}
              className="w-full py-2.5 font-bold text-xs rounded-lg hover:bg-[#FFF0EB] transition-colors disabled:opacity-50"
              style={{ border: `1px solid ${ORANGE}`, color: ORANGE }}
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4 py-6" role="dialog" aria-modal="true">
        <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl px-6 py-8 text-center">
          <span className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: GREEN_SOFT }}>
            <CheckCircle2 size={30} color={GREEN} />
          </span>
          <h2 className="font-extrabold text-xl mb-1" style={{ fontFamily: "'Poppins', sans-serif", color: GREEN }}>Quiz submitted</h2>
          <p className="text-4xl font-extrabold my-3" style={{ fontFamily: "'Poppins', sans-serif", color: ORANGE }}>{result.scorePercent}%</p>
          <p className="text-xs" style={{ color: MUTED }}>
            {result.rawScore} of {result.totalQuestions} correct on "{quiz.title}"
          </p>
          <button
            type="button"
            onClick={onClose}
            className="ecw-btn w-full py-2.5 text-white font-bold text-xs rounded-lg mt-5"
            style={{ background: GREEN }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const question = quiz.questions[currentIndex];
  const answeredCount = quiz.questions.filter((q) => answers[q.id]).length;
  const timeRunningLow = remainingMs !== null && remainingMs < 60000;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-3 py-4" role="dialog" aria-modal="true">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center gap-3 px-5 pt-5 pb-3" style={{ borderBottom: `1px solid ${LINE}` }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: GREEN_SOFT }}>
            <Lightbulb size={16} color={GREEN} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-[15px] truncate" style={{ fontFamily: "'Poppins', sans-serif", color: GREEN_DEEP }}>{quiz.title}</h3>
            <p className="text-[11px]" style={{ color: MUTED }}>{answeredCount}/{quiz.questions.length} answered</p>
          </div>
          {remainingMs !== null && (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-extrabold shrink-0"
              style={{ background: timeRunningLow ? ORANGE_SOFT : GREEN_SOFT, color: timeRunningLow ? ORANGE : GREEN }}
            >
              <Timer size={13} /> {fmtCountdown(remainingMs)}
            </span>
          )}
          {attempt?.penaltyMarks > 0 && (
            <span className="text-[10px] font-bold shrink-0" style={{ color: ORANGE }} title="Marks lost for time spent away from this tab">
              −{attempt.penaltyMarks} for leaving the tab
            </span>
          )}
        </div>

        {/* Progress */}
        <div className="h-1" style={{ background: LINE }}>
          <div className="h-full transition-all duration-300" style={{ width: `${(answeredCount / quiz.questions.length) * 100}%`, background: GREEN }} />
        </div>

        <div className="px-5 py-5 overflow-y-auto flex-1">
          <p className="font-semibold text-[14px] mb-4" style={{ color: GREEN_DEEP }}>
            Q{currentIndex + 1}. {question.question}{" "}
            <span className="font-normal text-[11px]" style={{ color: MUTED }}>({question.marks ?? 1} mark{(question.marks ?? 1) === 1 ? "" : "s"})</span>
          </p>
          <div className="flex flex-col gap-2">
            {question.options.map((o) => {
              const selected = answers[question.id] === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pick(question.id, o.id)}
                  className={`flex items-center gap-2.5 text-left rounded-lg px-3.5 py-3 text-xs transition-colors ${selected ? "" : "hover:bg-[#F4FAF6] hover:border-[#15803D]"}`}
                  style={{
                    border: `1px solid ${selected ? GREEN : LINE}`,
                    background: selected ? GREEN_SOFT : WHITE,
                    color: selected ? GREEN : GREEN_DEEP,
                  }}
                >
                  <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ border: `2px solid ${selected ? GREEN : LINE}` }}>
                    {selected && <span className="w-2 h-2 rounded-full" style={{ background: GREEN }} />}
                  </span>
                  <span className="font-medium">{o.optionText}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: `1px solid ${LINE}` }}>
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1.5 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-70 transition-opacity"
            style={{ color: GREEN_DEEP }}
          >
            <ArrowLeft size={14} /> Back
          </button>
          {currentIndex < quiz.questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.min(quiz.questions.length - 1, i + 1))}
              className="ecw-btn inline-flex items-center gap-1.5 rounded-lg text-white font-bold text-xs px-4 py-2.5"
              style={{ background: GREEN }}
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitClick}
              className="ecw-btn inline-flex items-center gap-1.5 rounded-lg text-white font-bold text-xs px-4 py-2.5 disabled:opacity-50"
              style={{ background: ORANGE }}
            >
              {submitting ? "Submitting…" : "Submit quiz"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   QUIZ REVIEW MODAL (read-only; uses GET /quizzes/:id/review)
   ============================================================================ */
function QuizReviewModal({ quizId, onClose, toast }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/student/quizzes/${quizId}/review`);
        if (!cancelled) setData(res);
      } catch (err) {
        toast(err.message, "error");
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, toast, onClose]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl px-8 py-6 text-sm font-semibold" style={{ color: GREEN_DEEP }}>Loading review…</div>
      </div>
    );
  }
  if (!data) return null;

  const { quiz, result, questions } = data;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-3 py-4" role="dialog" aria-modal="true">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center gap-3 px-5 pt-5 pb-3" style={{ borderBottom: `1px solid ${LINE}` }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: GREEN_SOFT }}>
            <Award size={16} color={GREEN} />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-[15px] truncate" style={{ fontFamily: "'Poppins', sans-serif", color: GREEN_DEEP }}>{quiz.title}</h3>
            <p className="text-[11px]" style={{ color: MUTED }}>
              {result.finalScore}/{result.total} marks ({result.scorePercent}%)
              {result.penaltyMarks > 0 ? ` · ${result.penaltyMarks} mark${result.penaltyMarks === 1 ? "" : "s"} deducted for leaving the tab` : ""}
            </p>
          </div>
          <button onClick={onClose} style={{ color: MUTED }} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-5 py-5 overflow-y-auto flex-1 flex flex-col gap-4">
          {questions.map((q, i) => {
            const correctOption = q.options.find((o) => o.isCorrect);
            const gotItRight = q.selectedOptionId && correctOption && q.selectedOptionId === correctOption.id;
            return (
              <div key={q.id} className="rounded-lg p-3.5" style={{ border: `1px solid ${gotItRight ? GREEN : q.selectedOptionId ? ORANGE : LINE}` }}>
                <p className="font-semibold text-[13px] mb-2" style={{ color: GREEN_DEEP }}>
                  Q{i + 1}. {q.question}{" "}
                  <span className="font-normal text-[11px]" style={{ color: MUTED }}>({q.marks ?? 1} mark{(q.marks ?? 1) === 1 ? "" : "s"})</span>
                </p>
                <div className="flex flex-col gap-1.5">
                  {q.options.map((o) => {
                    const isSelected = q.selectedOptionId === o.id;
                    const isCorrect = o.isCorrect;
                    let style = { border: `1px solid ${LINE}`, background: WHITE, color: GREEN_DEEP };
                    if (isCorrect) style = { border: `1px solid ${GREEN}`, background: GREEN_SOFT, color: GREEN };
                    else if (isSelected) style = { border: `1px solid ${ORANGE}`, background: ORANGE_SOFT, color: ORANGE };
                    return (
                      <div key={o.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs" style={style}>
                        <span className="font-medium flex-1">{o.optionText}</span>
                        {isCorrect && <CheckCircle2 size={14} />}
                        {isSelected && !isCorrect && <X size={14} />}
                      </div>
                    );
                  })}
                </div>
                {!q.selectedOptionId && <p className="text-[11px] mt-2 font-semibold" style={{ color: ORANGE }}>You did not answer this question.</p>}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4" style={{ borderTop: `1px solid ${LINE}` }}>
          <button type="button" onClick={onClose} className="ecw-btn w-full py-2.5 text-white font-bold text-xs rounded-lg" style={{ background: GREEN }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   MAIN COMPONENT
   ============================================================================ */
export default function Student({ onSignOut }) {
  const { toasts, push: toast } = useToasts();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [active, setActive] = useState(getStoredNav);
  const [lang, setLang] = useState("en");
  const t = lang === "rw" ? T_RW : T_EN;

  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState("");
  const [studentImage, setStudentImage] = useState("");
  const [studentKey, setStudentKey] = useState("me");
  const [localAvatar, setLocalAvatar] = useState(() => readAvatar("me"));
  const fileInputRef = useRef(null);
  const [notes, setNotes] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [live, setLive] = useState(false);

  const [notesVisible, setNotesVisible] = useState(SHOW_MORE_STEP);
  const [quizzesVisible, setQuizzesVisible] = useState(SHOW_MORE_STEP);
  const [resultsVisible, setResultsVisible] = useState(SHOW_MORE_STEP);
  useEffect(() => { setNotesVisible(SHOW_MORE_STEP); }, [notes.length]);
  useEffect(() => { setQuizzesVisible(SHOW_MORE_STEP); }, [quizzes.length]);

  // classId === undefined: still booting. null: no class yet -> show picker.
  const [classId, setClassId] = useState(undefined);
  const [className, setClassName] = useState("");
  const [availableClasses, setAvailableClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classSaving, setClassSaving] = useState(false);
  const [classError, setClassError] = useState("");
  const [showClassPicker, setShowClassPicker] = useState(false);

  const [openNote, setOpenNote] = useState(null);
  const [takingQuizId, setTakingQuizId] = useState(null);
  const [reviewingQuizId, setReviewingQuizId] = useState(null);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem(USER_SESSION_KEY);
    localStorage.removeItem(NAV_STORAGE_KEY);
    if (onSignOut) onSignOut();
    else window.location.href = "/";
  }, [onSignOut]);
  const signOutRef = useRef(handleSignOut);
  signOutRef.current = handleSignOut;

  useEffect(() => {
    registerSessionExpiredHandler((message) => {
      toast(message, "error");
      signOutRef.current();
    });
    return () => registerSessionExpiredHandler(null);
  }, [toast]);

  const refreshNotes = useCallback(async () => {
    try {
      const n = await apiFetch("/api/student/notes");
      setNotes(n.notes || []);
    } catch (err) {
      toast(err.message, "error");
    }
  }, [toast]);

  const refreshQuizzes = useCallback(async () => {
    try {
      const q = await apiFetch("/api/student/quizzes");
      setQuizzes(q.quizzes || []);
    } catch (err) {
      toast(err.message, "error");
    }
  }, [toast]);

  const loadClassOptions = useCallback(async () => {
    setClassesLoading(true);
    setClassError("");
    try {
      const res = await apiFetch("/api/student/classes");
      setAvailableClasses(res.classes || []);
    } catch (err) {
      setClassError(err.message);
    } finally {
      setClassesLoading(false);
    }
  }, []);

  const pickClass = useCallback(async (id) => {
    setClassSaving(true);
    setClassError("");
    try {
      const res = await apiFetch("/api/student/class", { method: "POST", body: JSON.stringify({ classId: id }) });
      setClassId(res.student.classId);
      setClassName(res.student.className || "");
      setShowClassPicker(false);
      toast("Class set. Loading your notes and quizzes…");
      await Promise.all([refreshNotes(), refreshQuizzes()]);
    } catch (err) {
      setClassError(err.message);
    } finally {
      setClassSaving(false);
    }
  }, [refreshNotes, refreshQuizzes, toast]);

  const openClassPicker = useCallback(() => {
    setShowClassPicker(true);
    loadClassOptions();
  }, [loadClassOptions]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    // Use profile details saved at sign-in immediately, then prefer the
    // student record returned by the authenticated API.
    const session = getSession();
    const profile = session?.user || session?.student || session;
    const sessionName = profile?.full_name || profile?.fullName || profile?.name || profile?.displayName || "";
    const sessionImage = profile?.picture || profile?.photoURL || profile?.photoUrl || profile?.image || profile?.avatar || "";
    if (sessionName) setStudentName(sessionName);
    if (sessionImage) setStudentImage(sessionImage);

    try {
      const me = await apiFetch("/api/student/me");
      const student = me.student || {};
      setStudentName(student.full_name || student.fullName || student.name || sessionName);
      setStudentImage(student.profile_image || student.profileImage || student.photoURL || student.photoUrl || student.image || student.avatar || sessionImage);

      // Key the locally saved picture to this student.
      const key = String(student.id ?? student.email ?? "me");
      setStudentKey(key);
      setLocalAvatar(readAvatar(key));

      const currentClassId = student.classId ?? null;
      setClassId(currentClassId);
      setClassName(student.className || "");

      if (currentClassId) {
        await Promise.all([refreshNotes(), refreshQuizzes()]);
      } else {
        setShowClassPicker(true);
        loadClassOptions();
      }
    } catch (err) {
      toast(err.message, "error");
    }
    setLoading(false);
  }, [toast, refreshNotes, refreshQuizzes, loadClassOptions]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    try { localStorage.setItem(NAV_STORAGE_KEY, active); } catch { /* ignore */ }
  }, [active]);

  // Profile picture handlers
  const openPhotoPicker = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  const handlePhotoSelected = useCallback(
    async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const dataUrl = await fileToAvatar(file);
        if (!writeAvatar(studentKey, dataUrl)) {
          toast("Could not save the picture on this device.", "error");
          return;
        }
        setLocalAvatar(dataUrl);
        toast("Profile picture updated.");
      } catch (err) {
        toast(err.message, "error");
      }
    },
    [studentKey, toast]
  );

  const removePhoto = useCallback(() => {
    writeAvatar(studentKey, "");
    setLocalAvatar("");
    toast("Profile picture removed.");
  }, [studentKey, toast]);

  const displayImage = localAvatar || studentImage;
  const handleImageBroken = useCallback(() => {
    if (localAvatar) setLocalAvatar("");
    else setStudentImage("");
  }, [localAvatar]);

  // Realtime connection. A dropped socket never signs the student out; only an
  // explicit "unauthorized" from the server does.
  useEffect(() => {
    const session = getSession();
    if (!session?.token) return undefined;

    const socket = io(`${API_BASE}${CLASSROOM_SOCKET_NAMESPACE}`, {
      auth: (cb) => cb({ token: getSession()?.token }),
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });

    socket.on("connect", () => setLive(true));
    socket.on("disconnect", () => setLive(false));
    socket.on("connect_error", (err) => {
      setLive(false);
      if (err?.message === "unauthorized") {
        toast("Your session expired. Please sign in again.", "error");
        signOutRef.current();
      }
    });

    socket.on("note:changed", (info) => {
      if (info.action !== "deleted" && info.action !== "unpublished") {
        toast(`New from your teacher: "${info.title}"`, "success");
      }
      refreshNotes();
    });

    socket.on("quiz:changed", (info) => {
      if (info.action === "published") toast(`New quiz available: "${info.title}"`, "success");
      else if (info.action === "updated") toast(`Quiz updated: "${info.title}"`, "success");
      refreshQuizzes();
    });

    return () => {
      socket.disconnect();
      setLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, refreshNotes, refreshQuizzes]);

  // Fallback sync when Socket.IO is unavailable; skipped until a class exists.
  useEffect(() => {
    if (!classId) return undefined;
    const syncContent = () => {
      if (document.visibilityState === "visible") {
        refreshNotes();
        refreshQuizzes();
      }
    };
    const intervalId = window.setInterval(syncContent, 30000);
    document.addEventListener("visibilitychange", syncContent);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", syncContent);
    };
  }, [classId, refreshNotes, refreshQuizzes]);

  const pendingQuizzes = quizzes.filter((q) => q.status === "available" || q.status === "in_progress" || q.status === "upcoming");
  const doneQuizzes = quizzes.filter((q) => q.status === "completed");
  useEffect(() => { setResultsVisible(SHOW_MORE_STEP); }, [doneQuizzes.length]);
  const averageScore = doneQuizzes.length
    ? Math.round(doneQuizzes.reduce((sum, q) => sum + (q.attempt?.scorePercent || 0), 0) / doneQuizzes.length) + "%"
    : "—";

  const stats = [
    { label: t.notesAvailable, value: notes.length, icon: BookOpen, tint: GREEN_SOFT, ink: GREEN, key: "notes" },
    { label: t.pendingQuizzes, value: pendingQuizzes.length, icon: Lightbulb, tint: ORANGE_SOFT, ink: ORANGE, key: "quizzes" },
    { label: t.quizzesDone, value: doneQuizzes.length, icon: CheckCircle2, tint: GREEN_SOFT, ink: GREEN, key: "results" },
    { label: t.averageScore, value: averageScore, icon: LineChart, tint: ORANGE_SOFT, ink: ORANGE, key: "progress" },
  ];

  return (
    <div className="min-h-screen bg-white flex" style={{ color: GREEN_DEEP, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap"
      />
      <style>{HOVER_CSS}</style>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelected} />

      {showClassPicker && (
        <ChooseClassModal
          classes={availableClasses}
          loading={classesLoading}
          saving={classSaving}
          error={classError}
          onPick={pickClass}
          allowClose={!!classId}
          onClose={() => setShowClassPicker(false)}
          t={t}
        />
      )}
      {openNote && <NoteViewerModal note={openNote} onClose={() => setOpenNote(null)} />}
      {takingQuizId && (
        <QuizTakerModal
          quizId={takingQuizId}
          toast={toast}
          onClose={() => {
            setTakingQuizId(null);
            refreshQuizzes();
          }}
          onFinished={() => {
            refreshQuizzes();
          }}
        />
      )}
      {reviewingQuizId && <QuizReviewModal quizId={reviewingQuizId} toast={toast} onClose={() => setReviewingQuizId(null)} />}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        active={active}
        setActive={setActive}
        t={t}
        studentName={studentName}
        studentImage={displayImage}
        onBroken={handleImageBroken}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 min-w-0 flex flex-col" style={{ background: TINT }}>
        <header className="relative z-20 flex items-center justify-between gap-2.5 py-3 px-[4%] bg-white" style={{ borderBottom: `1px solid ${LINE}` }}>
          <div className="flex items-center min-w-0 gap-2.5">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2" style={{ color: GREEN_DEEP }} aria-label="Open menu">
              <Menu className="w-[1.125rem] h-[1.125rem]" />
            </button>
            <h1 className="font-bold truncate text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {t.hello}, <span style={{ color: GREEN }}>{studentName || t.guest}</span>
            </h1>
          </div>
          <div className="flex items-center shrink-0 gap-3">
            <span
              title={live ? "Connected. New notes and quizzes appear instantly." : "Not connected."}
              className="hidden sm:inline-flex items-center gap-1.5 text-[10.5px] font-bold"
              style={{ color: live ? GREEN : ORANGE }}
            >
              <span className="inline-block w-[6px] h-[6px] rounded-full" style={{ background: live ? GREEN : ORANGE }} />
              {live ? "Live" : "Offline"}
            </span>
            <button
              type="button"
              onClick={() => setLang((l) => (l === "en" ? "rw" : "en"))}
              className="ecw-lift inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold bg-white"
              style={{ color: GREEN_DEEP, border: `1px solid ${LINE}` }}
            >
              <Languages size={13} /> <span className="hidden sm:inline">{t.langSwitch}</span>
            </button>
            <ProfileMenu
              t={t}
              studentName={studentName}
              className={className}
              image={displayImage}
              hasCustomImage={!!localAvatar}
              onBroken={handleImageBroken}
              onPickPhoto={openPhotoPicker}
              onRemovePhoto={removePhoto}
              onChangeClass={openClassPicker}
              onSignOut={handleSignOut}
            />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-[4%] py-6">
          {active === "home" && (
            <>
              <div className="relative overflow-hidden rounded-xl text-white flex items-center justify-between py-5 px-[5%] mb-6" style={{ background: GREEN_DEEP }}>
                <div className="absolute left-0 top-0 h-full w-1.5" style={{ background: ORANGE }} />
                <div className="max-w-[36rem]">
                  <h2 className="font-extrabold text-lg mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    {t.welcome}, {studentName || t.guest}
                  </h2>
                  <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.8)" }}>
                    {t.welcomeSub1} <span className="font-bold text-white">{notes.length}</span> {t.welcomeSub2}{" "}
                    <span className="font-bold text-white">{pendingQuizzes.length}</span> {t.welcomeSub3}
                  </p>
                  <button
                    type="button"
                    onClick={openClassPicker}
                    className="inline-flex items-center rounded-md gap-1.5 text-[11px] font-semibold py-1.5 px-2.5 hover:bg-white/10 transition-colors"
                    style={{ border: "1px solid rgba(255,255,255,0.3)" }}
                  >
                    <Backpack className="w-3 h-3" /> {className || t.currentClass}
                  </button>
                </div>
                <div className="relative flex shrink-0 items-center justify-center rounded-full w-12 h-12 ml-4 overflow-hidden" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)" }}>
                  {displayImage ? (
                    <img src={displayImage} alt={`${studentName || t.guest}'s profile`} referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={handleImageBroken} />
                  ) : (
                    <span className="font-bold text-white text-lg" aria-label={studentName || t.guest}>
                      {studentName ? studentName.charAt(0).toUpperCase() : <User className="w-[55%] h-[55%]" aria-hidden="true" />}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 max-w-full">
                {stats.map((s) => <StatCard key={s.label} {...s} onClick={() => setActive(s.key)} />)}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card className="!p-4">
                  <h3 className="flex items-center font-bold gap-2 text-[15px] mb-0.5">
                    <BookOpen className="w-4 h-4" style={{ color: GREEN }} /> {t.recentNotes}
                  </h3>
                  <p className="text-[11px] mb-3.5" style={{ color: MUTED }}>{t.recentNotesSub}</p>

                  {loading ? (
                    <p className="text-xs py-6 text-center" style={{ color: MUTED }}>Loading…</p>
                  ) : notes.length === 0 ? (
                    <EmptyState icon={BookOpen} title={t.noNotes} sub={t.noNotesSub} tint={GREEN_SOFT} ink={GREEN} />
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {notes.slice(0, 5).map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => setOpenNote(note)}
                          className="ecw-lift flex items-start rounded-lg gap-2.5 p-3 text-left w-full"
                          style={{ background: TINT, border: `1px solid ${LINE}` }}
                        >
                          <div className="rounded-lg flex items-center justify-center shrink-0 w-8 h-8" style={{ background: GREEN_SOFT }}>
                            <FileEdit size={13} color={GREEN} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate text-[13px]">{note.title}</p>
                            <p className="flex items-center gap-1 text-[11px] mt-0.5" style={{ color: MUTED }}>
                              <User className="w-2.5 h-2.5" /> {note.authorName} · {fmtDateTime(note.updatedAt)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="!p-4">
                  <h3 className="flex items-center font-bold gap-2 text-[15px] mb-0.5">
                    <Lightbulb className="w-4 h-4" style={{ color: ORANGE }} /> {t.pendingQuizzesTitle}
                  </h3>
                  <p className="text-[11px] mb-3.5" style={{ color: MUTED }}>{t.pendingQuizzesSub}</p>

                  {loading ? (
                    <p className="text-xs py-6 text-center" style={{ color: MUTED }}>Loading…</p>
                  ) : pendingQuizzes.length === 0 ? (
                    <EmptyState icon={CheckCircle2} title={t.allDone} sub={t.allDoneSub} tint={GREEN_SOFT} ink={GREEN} />
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {pendingQuizzes.map((quiz) => (
                        <QuizRow key={quiz.id} quiz={quiz} onStart={(q) => setTakingQuizId(q.id)} onViewResult={(q) => setReviewingQuizId(q.id)} />
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}

          {active === "notes" && (
            <Card>
              <PageHeading title="Class Notes" sub="Notes published by your teachers." />
              {notes.length === 0 ? (
                <EmptyState icon={BookOpen} title={t.noNotes} sub={t.noNotesSub} tint={GREEN_SOFT} ink={GREEN} />
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {notes.slice(0, notesVisible).map((note) => (
                      <div
                        key={note.id}
                        onClick={() => setOpenNote(note)}
                        className="ecw-lift p-3.5 rounded-lg cursor-pointer"
                        style={{ background: TINT, border: `1px solid ${LINE}` }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: GREEN_SOFT, color: GREEN }}>{note.subject || "General"}</span>
                          <span className="text-[10px]" style={{ color: MUTED }}>{fmtDateTime(note.updatedAt)}</span>
                        </div>
                        <h3 className="font-bold text-sm mb-1">{note.title}</h3>
                        <p className="text-xs line-clamp-2" style={{ color: MUTED }}>{note.content}</p>
                      </div>
                    ))}
                  </div>
                  <ShowMoreButton remaining={notes.length - notesVisible} onClick={() => setNotesVisible((n) => n + SHOW_MORE_STEP)} />
                </>
              )}
            </Card>
          )}

          {active === "quizzes" && (
            <Card>
              <PageHeading title="Quizzes" sub="Take quizzes before they close." />
              {quizzes.length === 0 ? (
                <EmptyState icon={Lightbulb} title="No quizzes" sub="New quizzes will appear here." tint={ORANGE_SOFT} ink={ORANGE} />
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                    {quizzes.slice(0, quizzesVisible).map((quiz) => (
                      <QuizRow key={quiz.id} quiz={quiz} onStart={(q) => setTakingQuizId(q.id)} onViewResult={(q) => setReviewingQuizId(q.id)} />
                    ))}
                  </div>
                  <ShowMoreButton remaining={quizzes.length - quizzesVisible} onClick={() => setQuizzesVisible((n) => n + SHOW_MORE_STEP)} />
                </>
              )}
            </Card>
          )}

          {active === "results" && (
            <Card>
              <PageHeading title="My Results" sub="Scores and answers for completed quizzes." />
              {doneQuizzes.length === 0 ? (
                <EmptyState icon={FileText} title="No results yet" sub="Scores appear here after you submit a quiz." tint={GREEN_SOFT} ink={GREEN} />
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                    {doneQuizzes.slice(0, resultsVisible).map((q) => (
                      <div key={q.id} className="ecw-lift flex items-center justify-between rounded-lg p-3.5 gap-3" style={{ background: TINT, border: `1px solid ${LINE}` }}>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm truncate">{q.title}</h4>
                          <p className="text-xs" style={{ color: MUTED }}>{q.subject || "General"} · {fmtDateTime(q.attempt?.completedAt)}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="font-extrabold text-sm" style={{ color: GREEN }}>{q.attempt?.scorePercent}%</span>
                            <p className="text-[11px]" style={{ color: MUTED }}>{q.attempt?.finalScore} / {q.questionCount}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReviewingQuizId(q.id)}
                            className="rounded-lg font-bold text-[11px] px-3.5 py-2 hover:bg-[#E8F5EC] transition-colors"
                            style={{ border: `1px solid ${GREEN}`, color: GREEN }}
                          >
                            Review
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <ShowMoreButton remaining={doneQuizzes.length - resultsVisible} onClick={() => setResultsVisible((n) => n + SHOW_MORE_STEP)} />
                </>
              )}
            </Card>
          )}

          {active === "progress" && (
            <Card>
              <PageHeading title="Progress" sub="Your overall quiz performance." />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="ecw-lift p-4 rounded-xl" style={{ background: TINT, border: `1px solid ${LINE}` }}>
                  <span className="text-xs font-semibold" style={{ color: MUTED }}>Average score</span>
                  <p className="text-3xl font-extrabold mt-1" style={{ color: ORANGE, fontFamily: "'Poppins', sans-serif" }}>{averageScore}</p>
                </div>
                <div className="ecw-lift p-4 rounded-xl" style={{ background: TINT, border: `1px solid ${LINE}` }}>
                  <span className="text-xs font-semibold" style={{ color: MUTED }}>Quizzes finished</span>
                  <p className="text-3xl font-extrabold mt-1" style={{ color: GREEN, fontFamily: "'Poppins', sans-serif" }}>{doneQuizzes.length}</p>
                </div>
              </div>
            </Card>
          )}

          {active === "settings" && (
            <Card>
              <PageHeading title="Settings" sub="Your profile, class and language." />
              <div className="flex items-center justify-between gap-3 py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar src={displayImage} name={studentName} size={44} onBroken={handleImageBroken} />
                  <div className="min-w-0">
                    <p className="font-bold text-xs truncate">{studentName || t.guest}</p>
                    <p className="text-[11px]" style={{ color: MUTED }}>{t.changePhoto}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openPhotoPicker}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-[#E8F5EC] transition-colors shrink-0"
                  style={{ color: GREEN, border: `1px solid ${GREEN}` }}
                >
                  <Camera size={13} /> Upload
                </button>
              </div>
              <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
                <div>
                  <p className="font-bold text-xs">{t.currentClass}</p>
                  <p className="text-[11px]" style={{ color: MUTED }}>{className || "No class chosen yet"}</p>
                </div>
                <button
                  type="button"
                  onClick={openClassPicker}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-[#E8F5EC] transition-colors"
                  style={{ color: GREEN, border: `1px solid ${GREEN}` }}
                >
                  {t.changeClass}
                </button>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="font-bold text-xs">Language</p>
                  <p className="text-[11px]" style={{ color: MUTED }}>English or Kinyarwanda.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLang((l) => (l === "en" ? "rw" : "en"))}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-[#E8F5EC] transition-colors"
                  style={{ color: GREEN, border: `1px solid ${GREEN}` }}
                >
                  {t.langSwitch}
                </button>
              </div>
            </Card>
          )}
        </main>
      </div>

      <InAppChatWidget />
      <ToastStack toasts={toasts} />
    </div>
  );
}