import { useState, useEffect, useRef, useCallback } from 'react';
import logo from './assets/esms.jpg';
import {
  User, Filter, BookOpen, Share2,
  Users, LogOut, Settings, Plus,
  Eye, Pencil, EyeOff, Trash2, X,
  ChevronDown, Clock, CheckCircle2, Circle, Menu, ArrowLeft,
  Save, FileText, AlertCircle, ListChecks, PenLine,
  CalendarClock, PlusCircle, Sparkles, Lock, RefreshCw, Check, BarChart3
} from 'lucide-react';

/* ============================================================================
   TEACHER DASHBOARD

   - Talks to the real API at /api/teacher (see teacher.js).
   - Notes and quizzes can be written by hand or drafted with AI. AI output is
     always shown as a preview first; nothing reaches the editor until the
     teacher accepts it.
   - Drafts auto-save (debounced, one request at a time). Published items are
     never auto-saved, so students never see half-typed edits.
   - The session token is read from localStorage("ecw_user_session"), the same
     key the student dashboard uses.
   ============================================================================ */

/* ---------------------------------- THEME ---------------------------------- */

const t = {
  bg: '#FFFFFF', surface: '#FFFFFF', panel: '#F7F8FA', sidebar: '#FFFFFF',
  border: '#E7E9EF', text: '#13151C', subtext: '#6B7280', faint: '#A1A7B3',
  green: '#0E9F6E', greenSoft: '#E7F8F1',
  blue: '#2A5CDB', blueSoft: '#EAF0FE',
  orange: '#EA5B0C', orangeSoft: '#FFEEE3', red: '#DC2626', redSoft: '#FEECEC',
  shimmer1: '#EEF0F4', shimmer2: '#F9FAFC',
};

const inputStyle = {
  width: '100%', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 12px',
  fontSize: 13, color: t.text, background: t.panel, outline: 'none',
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ------------------------------------ API ----------------------------------- */

// Keep authentication and dashboard requests on the same backend. A deployed
// frontend may provide the API explicitly; otherwise use the current origin
// instead of silently pointing at a different Render service.
const API_BASE = (typeof window !== 'undefined' && window.ECW_API_BASE)
  || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE)
  || (typeof window !== 'undefined' ? window.location.origin : '');
const USER_SESSION_KEY = 'ecw_user_session';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
function getSession() {
  try {
    const raw = localStorage.getItem(USER_SESSION_KEY);
    if (!raw) return null;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }

    const findToken = (value, depth = 0) => {
      if (!value || depth > 6) return null;

      if (typeof value === 'string') {
        const token = value.replace(/^Bearer\s+/i, '').trim();
        return token.split('.').length === 3 ? token : null;
      }

      if (typeof value !== 'object') return null;

      const tokenKeys = [
        'token',
        'accessToken',
        'access_token',
        'jwt',
        'sessionToken',
      ];

      for (const key of tokenKeys) {
        if (typeof value[key] === 'string' && value[key].trim()) {
          return value[key].replace(/^Bearer\s+/i, '').trim();
        }
      }

      for (const child of Object.values(value)) {
        const token = findToken(child, depth + 1);
        if (token) return token;
      }

      return null;
    };

    const token = findToken(parsed);
    if (!token) return null;

    return {
      ...(typeof parsed === 'object' && parsed !== null ? parsed : {}),
      token,
    };
  } catch {
    return null;
  }
}

// Do not leave the whole dashboard on an apparently frozen loading screen
// while the hosted API is asleep or unreachable. The error view provides a
// retry action when the request times out.
async function api(path, { method = 'GET', body, timeoutMs = 25000 } = {}) {
  const session = getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session && session.token) headers.Authorization = `Bearer ${session.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${API_BASE}/api/teacher${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiError(
      err.name === 'AbortError'
        ? 'The server took too long to answer. Please try again.'
        : 'Cannot reach the server. Check your internet connection and try again.',
      0
    );
  } finally {
    clearTimeout(timer);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError('The server response was unreadable.', response.status);
  }
  if (response.status === 401) throw new ApiError(result.message || 'Your session expired. Please sign in again.', 401);
  if (!response.ok || !result.success) throw new ApiError(result.message || 'Something went wrong.', response.status);
  return result;
}

/* --------------------------------- FORMATTING -------------------------------- */

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return 'Not set';
  const d = new Date(iso);
  if (isNaN(d)) return 'Not set';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtTime(d) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
// datetime-local <input> wants "YYYY-MM-DDTHH:mm" in LOCAL time; state keeps ISO.
function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local) {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d) ? null : d.toISOString();
}

const assignmentKey = (a) => (a ? `${a.classId}::${a.subject}` : '');

function upsertById(list, item) {
  const next = list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list];
  return next.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/* -------------------------------- PRIMITIVES -------------------------------- */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; border-radius: 6px !important; }
      .td-spin, [style*="border-radius: 50%"] { border-radius: 50% !important; }
      .td-root { font-family: 'Inter', system-ui, sans-serif; background:#fff; }
      .td-heading { font-family: 'Poppins', system-ui, sans-serif; }
      @keyframes tdShimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
      .td-skel { background-image: linear-gradient(90deg, var(--s1) 0px, var(--s2) 40px, var(--s1) 80px); background-size: 600px 100%; animation: tdShimmer 1.4s infinite linear; }
      @keyframes tdFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      .td-fade { animation: tdFade .28s ease both; }
      @keyframes tdToastIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .td-toast { animation: tdToastIn .22s ease both; }
      @keyframes tdSpin { to { transform: rotate(360deg); } }
      .td-spin { animation: tdSpin .8s linear infinite; }
      .td-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
      .td-scroll::-webkit-scrollbar-thumb { background: #E7E9EF; border-radius: 8px; }
      .td-btn { transition: transform .1s ease, box-shadow .12s ease, background .15s ease, opacity .15s ease, border-color .15s ease; }
      .td-btn:active { transform: scale(0.97); }
      .td-card:hover { box-shadow: 0 4px 16px rgba(18,20,28,0.06); }
      textarea, input, select { font-family: inherit; }
      input[type="datetime-local"]::-webkit-calendar-picker-indicator { cursor: pointer; }
      input:focus, textarea:focus, select:focus, button:focus-visible { outline: 2px solid #2A5CDB55; outline-offset: 1px; }
      fieldset:disabled input, fieldset:disabled textarea, fieldset:disabled select { opacity: .65; cursor: not-allowed; }
      @media (prefers-reduced-motion: reduce) {
        .td-skel, .td-fade, .td-toast, .td-spin { animation: none !important; }
      }
      @media (max-width: 860px) {
        .td-hamburger { display: flex !important; }
        .td-sidebar-wrap { display: none !important; }
        .td-header-actions span.td-btn-label { display: none; }
        .td-header-actions .td-btn { padding: 10px !important; }
      }
      @media (max-width: 480px) {
        .td-page-pad { padding: 16px !important; }
      }
    `}</style>
  );
}

function Skeleton({ w = '100%', h = 14, r = 6 }) {
  return <div className="td-skel" style={{ width: w, height: h, borderRadius: r, '--s1': t.shimmer1, '--s2': t.shimmer2 }} />;
}
function Spinner({ size = 14, color }) {
  return <div className="td-spin" style={{ width: size, height: size, borderRadius: '50%', border: `2px solid ${color}33`, borderTopColor: color }} />;
}
function Badge({ children, bg, color }) {
  return <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>{children}</span>;
}
function Chip({ children, tone = 'neutral' }) {
  const map = {
    neutral: { bg: t.panel, color: t.subtext },
    blue: { bg: t.blueSoft, color: t.blue },
    green: { bg: t.greenSoft, color: t.green },
    orange: { bg: t.orangeSoft, color: t.orange },
  };
  const c = map[tone];
  return <span style={{ background: c.bg, color: c.color, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{children}</span>;
}
function IconBtn({ icon: Icon, onClick, tone = 'default', title, size = 32, busy, disabled }) {
  const tones = {
    default: { bg: t.panel, color: t.subtext },
    orange: { bg: t.orangeSoft, color: t.orange },
    blue: { bg: t.blueSoft, color: t.blue },
    green: { bg: t.greenSoft, color: t.green },
  };
  const c = tones[tone];
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled || busy} className="td-btn"
      style={{ width: size, height: size, borderRadius: 8, border: 'none', background: c.bg, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: disabled ? 0.5 : 1 }}>
      {busy ? <Spinner size={size * 0.4} color={c.color} /> : <Icon size={size * 0.46} />}
    </button>
  );
}
function PrimaryButton({ children, onClick, icon: Icon, variant = 'solid', busy, disabled, style }) {
  const styles = {
    solid: { background: t.green, color: '#fff', border: 'none' },
    blue: { background: t.blue, color: '#fff', border: 'none' },
    soft: { background: t.orangeSoft, color: t.orange, border: 'none' },
    outline: { background: '#fff', color: t.text, border: `1px solid ${t.border}` },
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy} className="td-btn"
      style={{ ...styles[variant], padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: disabled || busy ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', ...style }}>
      {busy ? <Spinner size={13} color={variant === 'outline' || variant === 'soft' ? t.orange : '#fff'} /> : (Icon && <Icon size={14} />)}
      <span className="td-btn-label">{children}</span>
    </button>
  );
}
function Dropdown({ value, options, onChange, icon: Icon }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="td-btn" aria-haspopup="listbox" aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 11px', fontSize: 12.5, fontWeight: 600, color: t.text, cursor: 'pointer' }}>
        {Icon && <Icon size={14} color={t.subtext} />}
        <span>{value}</span>
        <ChevronDown size={13} color={t.subtext} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div className="td-fade" role="listbox" style={{ position: 'absolute', top: '110%', left: 0, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 10px 24px rgba(18,20,28,0.12)', minWidth: 170, zIndex: 40, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
          {options.map((opt) => (
            <div key={opt} role="option" aria-selected={opt === value} onClick={() => { onChange(opt); setOpen(false); }}
              style={{ padding: '9px 13px', fontSize: 12.5, cursor: 'pointer', color: opt === value ? t.blue : t.text, fontWeight: opt === value ? 700 : 500, background: opt === value ? t.blueSoft : 'transparent' }}
              onMouseEnter={(e) => { if (opt !== value) e.currentTarget.style.background = t.panel; }}
              onMouseLeave={(e) => { if (opt !== value) e.currentTarget.style.background = 'transparent'; }}>{opt}</div>
          ))}
        </div>
      )}
    </div>
  );
}
function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="td-fade" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 20px', textAlign: 'center', gap: 5 }}>
      <div style={{ width: 52, height: 52, borderRadius: 10, background: t.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Icon size={24} color={t.green} />
      </div>
      <h3 className="td-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 13, color: t.subtext, maxWidth: 320, lineHeight: 1.5 }}>{text}</p>
      {action}
    </div>
  );
}
function Modal({ children, onClose, width = 420 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,17,23,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="td-fade td-scroll" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 10, width, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', border: `1px solid ${t.border}` }}>
        {children}
      </div>
    </div>
  );
}
function ConfirmModal({ title, text, confirmLabel, onConfirm, onCancel, busy }) {
  return (
    <Modal onClose={onCancel} width={360}>
      <div style={{ padding: 22 }}>
        <h3 className="td-heading" style={{ margin: '0 0 8px', fontSize: 15.5, color: t.text }}>{title}</h3>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: t.subtext, lineHeight: 1.5 }}>{text}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <PrimaryButton variant="outline" onClick={onCancel} disabled={busy}>Cancel</PrimaryButton>
          <PrimaryButton variant="soft" onClick={onConfirm} busy={busy}>{confirmLabel}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
function Notice({ tone = 'blue', icon: Icon = AlertCircle, children, action }) {
  const map = {
    blue: { bg: t.blueSoft, fg: t.blue },
    orange: { bg: t.orangeSoft, fg: t.orange },
    red: { bg: t.redSoft, fg: t.red },
    green: { bg: t.greenSoft, fg: t.green },
  };
  const c = map[tone];
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} style={{ display: 'flex', alignItems: 'center', gap: 9, background: c.bg, color: c.fg, borderRadius: 8, padding: '10px 13px', fontSize: 12.5, fontWeight: 600, flexWrap: 'wrap' }}>
      <Icon size={15} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 180, lineHeight: 1.45 }}>{children}</span>
      {action}
    </div>
  );
}
function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: t.subtext, marginBottom: 5 }}>{label}</label>
      {children}
      {hint && <p style={{ margin: '4px 0 0', fontSize: 11, color: t.faint }}>{hint}</p>}
    </div>
  );
}

function StatMini({ icon: Icon, value, label, tone = 'green' }) {
  const map = { green: { bg: t.greenSoft, fg: t.green }, blue: { bg: t.blueSoft, fg: t.blue }, orange: { bg: t.orangeSoft, fg: t.orange } };
  const c = map[tone];
  return (
    <div className="td-fade" style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 13px', flex: '1 1 148px' }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={14} color={c.fg} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span className="td-heading" style={{ fontSize: 16, fontWeight: 800, color: t.text }}>{value}</span>
        <span style={{ fontSize: 11, color: t.subtext, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </div>
    </div>
  );
}
function StatRow({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{children}</div>;
}

function CardsSkeleton({ count = 4 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 16 }}>
          <Skeleton w="70%" h={15} />
          <div style={{ marginTop: 9 }}><Skeleton w="40%" h={11} /></div>
          <div style={{ marginTop: 16 }}><Skeleton w={64} h={20} r={6} /></div>
          <div style={{ marginTop: 16, display: 'flex', gap: 7 }}>{[0, 1, 2, 3].map((j) => <Skeleton key={j} w={30} h={30} r={7} />)}</div>
        </div>
      ))}
    </div>
  );
}
function PageSkeleton() {
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#fff' }}>
      <div style={{ width: 236, background: '#fff', borderRight: `1px solid ${t.border}`, padding: 20 }}>
        <Skeleton w="70%" h={17} />
        <div style={{ marginTop: 24 }}><Skeleton w="100%" h={56} r={8} /></div>
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} w="100%" h={15} />)}</div>
      </div>
      <div style={{ flex: 1, padding: 22 }}>
        <Skeleton w={200} h={17} />
        <div style={{ marginTop: 18 }}><StatRow>{[0, 1, 2].map((i) => <Skeleton key={i} w="100%" h={48} r={8} />)}</StatRow></div>
        <div style={{ marginTop: 20 }}><CardsSkeleton /></div>
      </div>
    </div>
  );
}

/* ---------------------------------- TOASTS ---------------------------------- */

function ToastStack({ toasts, onDismiss }) {
  return (
    <div aria-live="polite" style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
      {toasts.map((tst) => {
        const tone = tst.type === 'error' ? { bg: t.red, icon: AlertCircle } : { bg: t.green, icon: CheckCircle2 };
        const Icon = tone.icon;
        return (
          <div key={tst.id} className="td-toast" onClick={() => onDismiss(tst.id)}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: tone.bg, color: '#fff', borderRadius: 9, padding: '11px 13px', boxShadow: '0 10px 26px rgba(18,20,28,0.18)', cursor: 'pointer' }}>
            <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>{tst.message}</span>
          </div>
        );
      })}
    </div>
  );
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const push = useCallback((message, type = 'success') => {
    const id = uid();
    setToasts((list) => [...list, { id, message, type }]);
    timers.current.push(setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), type === 'error' ? 5000 : 3200));
  }, []);
  const dismiss = useCallback((id) => setToasts((list) => list.filter((x) => x.id !== id)), []);
  return { toasts, push, dismiss };
}

/* --------------------------------- AUTO-SAVE --------------------------------- */

/*
  Debounced auto-save that never runs two requests at once.

    snapshot  plain object with everything the teacher can edit
    ready     false while there is nothing worth saving yet
    persist   async () => void   (throws on failure)

  Changes made while a request is in flight are saved as soon as it finishes.
  pause() is used by explicit Save/Publish so a late auto-save can never
  overwrite the status the teacher just chose.
*/
function useAutosave({ enabled, snapshot, ready, persist, delay = 1500 }) {
  const [state, setState] = useState({ status: 'idle', at: null, message: '' });
  const snapshotRef = useRef(snapshot);
  const persistRef = useRef(persist);
  const readyRef = useRef(ready);
  const savedJson = useRef(JSON.stringify(snapshot));
  const inFlight = useRef(null);
  const timer = useRef(null);
  const paused = useRef(false);
  const alive = useRef(true);
  const json = JSON.stringify(snapshot);

  snapshotRef.current = snapshot;
  persistRef.current = persist;
  readyRef.current = ready;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearTimeout(timer.current); };
  }, []);

  const run = useCallback(async () => {
    clearTimeout(timer.current);
    if (paused.current) return true;
    if (inFlight.current) return inFlight.current;
    const current = JSON.stringify(snapshotRef.current);
    if (current === savedJson.current || !readyRef.current) return true;

    const job = (async () => {
      if (alive.current) setState((s) => ({ ...s, status: 'saving' }));
      let ok = true;
      try {
        await persistRef.current();
        savedJson.current = current;
        if (alive.current) setState({ status: 'saved', at: new Date(), message: '' });
      } catch (err) {
        ok = false;
        if (alive.current) setState({ status: 'error', at: null, message: err.message || 'Unknown error' });
      }
      inFlight.current = null;
      if (ok && !paused.current && readyRef.current && JSON.stringify(snapshotRef.current) !== savedJson.current) return run();
      return ok;
    })();
    inFlight.current = job;
    return job;
  }, []);

  useEffect(() => {
    if (!enabled || paused.current) return undefined;
    if (json === savedJson.current) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { run(); }, delay);
    return () => clearTimeout(timer.current);
  }, [json, enabled, delay, run]);

  const isDirty = useCallback(
    () => !!readyRef.current && JSON.stringify(snapshotRef.current) !== savedJson.current,
    []
  );
  const pause = useCallback(() => { paused.current = true; clearTimeout(timer.current); }, []);
  const resume = useCallback(() => { paused.current = false; }, []);
  const settle = useCallback(async () => { while (inFlight.current) await inFlight.current; }, []);

  return { state, flush: run, isDirty, pause, resume, settle };
}

function SaveStatus({ enabled, hasAssignment, state, onRetry }) {
  let content;
  let color = t.subtext;
  if (!enabled) {
    content = 'Editing a live item. Changes reach students when you save.';
  } else if (!hasAssignment) {
    content = 'Pick a class and subject to turn on auto-save.';
  } else if (state.status === 'saving') {
    content = <><Spinner size={11} color={t.subtext} /> Saving…</>;
  } else if (state.status === 'saved') {
    content = <><Check size={12} /> Draft saved at {fmtTime(state.at)}</>;
    color = t.green;
  } else if (state.status === 'error') {
    content = <>Auto-save failed: {state.message} <button type="button" onClick={onRetry} style={{ background: 'none', border: 'none', color: t.blue, fontWeight: 700, cursor: 'pointer', fontSize: 11.5, padding: 0 }}>Retry</button></>;
    color = t.red;
  } else {
    content = 'Auto-save is on. Your draft saves as you type.';
  }
  return <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color }}>{content}</span>;
}

/* ---------------------------------- SIDEBAR ---------------------------------- */

function NavItem({ icon: Icon, label, count, active, onClick }) {
  return (
    <li onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{ position: 'relative', display: 'grid', gridTemplateColumns: '18px 1fr auto', alignItems: 'center', gap: 11, padding: '9px 12px 9px 14px', borderRadius: 8, cursor: 'pointer', background: active ? t.greenSoft : 'transparent', color: active ? t.green : t.text }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = t.panel; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      {active && <span style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, borderRadius: 3, background: t.green }} />}
      <Icon size={15} strokeWidth={active ? 2.3 : 1.9} />
      <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, letterSpacing: -0.1 }}>{label}</span>
      {count !== undefined ? (
        <span style={{ background: active ? '#fff' : t.blueSoft, color: active ? t.green : t.blue, borderRadius: 6, padding: '2px 7px', fontSize: 10.5, fontWeight: 700, minWidth: 22, textAlign: 'center' }}>{count}</span>
      ) : null}
    </li>
  );
}

function NavSection({ label, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <p style={{ margin: '4px 0 5px 14px', fontSize: 10.5, fontWeight: 700, color: t.faint, letterSpacing: 0.2 }}>{label}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</ul>
    </div>
  );
}

function Sidebar({ section, go, notesCount, quizzesCount, teacherName, onClose, onSignOut }) {
  const active = section === 'noteEditor' ? 'notes' : section === 'quizEditor' ? 'quizzes' : section;
  return (
    <div style={{ width: 240, background: '#fff', borderRight: `1px solid ${t.border}`, padding: '18px 14px', display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 16px', borderBottom: `1px solid ${t.border}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, ${t.blue}, ${t.green})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

<img
  src={logo}
  alt="Easy Class logo"
  style={{ width: 50, height: 50, flexShrink: 0 }}
/>          </div>
          <div>
            <span className="td-heading" style={{ fontSize: 14.5, fontWeight: 700, color: t.text, display: 'block', letterSpacing: -0.2 }}>Easy Class</span>
            <span style={{ fontSize: 10.5, color: t.subtext }}>Teacher workspace</span>
          </div>
        </div>
        {onClose && <button type="button" aria-label="Close menu" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.subtext, display: 'flex' }}><X size={18} /></button>}
      </div>

      <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 11px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${t.green}`, flexShrink: 0 }}>
          <User size={14} color={t.green} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p className="td-heading" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teacherName || 'Teacher'}</p>
          <p style={{ margin: '2px 0 0', fontSize: 10.5, color: t.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.green, display: 'inline-block' }} /> Teacher
          </p>
        </div>
      </div>

      <div className="td-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <NavSection label="Classroom">
          <NavItem icon={BookOpen} label="Notes" count={notesCount} active={active === 'notes'} onClick={() => go('notes')} />
          <NavItem icon={PenLine} label="Quizzes" count={quizzesCount} active={active === 'quizzes'} onClick={() => go('quizzes')} />
        </NavSection>
        <NavSection label="Insights">
          <NavItem icon={Users} label="Students" active={active === 'students'} onClick={() => go('students')} />
          <NavItem icon={BarChart3} label="Quiz results" active={active === 'results'} onClick={() => go('results')} />
        </NavSection>
        <NavSection label="Account">
          <NavItem icon={Settings} label="Settings" active={active === 'settings'} onClick={() => go('settings')} />
        </NavSection>
      </div>

      <button type="button" className="td-btn" onClick={onSignOut}
        style={{ display: 'grid', gridTemplateColumns: '18px 1fr', alignItems: 'center', gap: 11, marginTop: 12, padding: '9px 12px', borderRadius: 8, background: t.orangeSoft, color: t.orange, border: 'none', cursor: 'pointer' }}>
        <LogOut size={15} /><span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'left' }}>Sign out</span>
      </button>
    </div>
  );
}

/* ---------------------------------- HEADER ---------------------------------- */

function Header({ selectedClass, setSelectedClass, filterOptions, onNewNote, onNewQuiz, onMenu, title }) {
  return (
    <div style={{ minHeight: 60, borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', gap: 12, background: '#fff', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button type="button" aria-label="Open menu" onClick={onMenu} className="td-hamburger" style={{ background: t.panel, border: 'none', borderRadius: 8, width: 34, height: 34, display: 'none', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text, flexShrink: 0 }}><Menu size={17} /></button>
        <h2 className="td-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
      </div>
      <div className="td-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Dropdown value={selectedClass} options={filterOptions} onChange={setSelectedClass} icon={Filter} />
        <PrimaryButton variant="outline" icon={Plus} onClick={onNewNote}>New note</PrimaryButton>
        <PrimaryButton variant="soft" icon={Plus} onClick={onNewQuiz}>New quiz</PrimaryButton>
      </div>
    </div>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
      {tabs.map((tab) => (
        <button type="button" key={tab.key} onClick={() => onChange(tab.key)} className="td-btn"
          style={{ border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', background: active === tab.key ? t.green : t.panel, color: active === tab.key ? '#fff' : t.text }}>
          {tab.label} ({tab.count})
        </button>
      ))}
    </div>
  );
}

/* --------------------------- CLASS / SUBJECT PICKER --------------------------- */

function AssignmentPicker({ assignments, value, onChange, onGoSettings }) {
  if (assignments.length === 0 && !value) {
    return (
      <Notice tone="orange" action={onGoSettings && <PrimaryButton variant="outline" onClick={onGoSettings}>Open settings</PrimaryButton>}>
        No classes or subjects are assigned to you yet. Add them in Settings first.
      </Notice>
    );
  }
  // An item can belong to a class/subject the teacher has since removed. Keep it visible.
  const options = value && !assignments.some((a) => assignmentKey(a) === assignmentKey(value)) ? [value, ...assignments] : assignments;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((a) => {
        const active = value && assignmentKey(value) === assignmentKey(a);
        return (
          <button key={assignmentKey(a)} type="button" onClick={() => onChange(a)} className="td-btn" aria-pressed={!!active}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${active ? t.green : t.border}`, background: active ? t.greenSoft : '#fff', color: active ? t.green : t.text, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            {active ? <CheckCircle2 size={14} /> : <Circle size={14} color={t.faint} />} {a.className} · {a.subject}
          </button>
        );
      })}
    </div>
  );
}

function NoAssignmentsNotice({ show, onGoSettings }) {
  if (!show) return null;
  return (
    <Notice tone="orange" action={<PrimaryButton variant="outline" onClick={onGoSettings}>Open settings</PrimaryButton>}>
      Add the classes and subjects you teach in Settings before creating notes or quizzes.
    </Notice>
  );
}

/* ----------------------------------- NOTES ----------------------------------- */

function NoteCard({ note, onView, onEdit, onTogglePublish, onDelete, busyAction }) {
  const isBusy = busyAction === note.id;
  return (
    <div className="td-card td-fade" style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 16, borderLeft: `3px solid ${note.status === 'published' ? t.green : t.orange}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div>
        <h4 className="td-heading" style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: t.text }}>{note.title || 'Untitled note'}</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, color: t.subtext, fontSize: 11, flexWrap: 'wrap' }}>
          <Clock size={11} /><span>{fmtDate(note.updatedAt)}</span>
          {note.fileName && <><span>·</span><FileText size={11} /><span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.fileName}</span></>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Badge bg={note.status === 'published' ? t.greenSoft : t.orangeSoft} color={note.status === 'published' ? t.green : t.orange}>{note.status === 'published' ? 'Published' : 'Draft'}</Badge>
        <Chip tone="blue">{note.className}</Chip>
        <Chip tone="neutral">{note.subject}</Chip>
      </div>
      <div style={{ display: 'flex', gap: 7, marginTop: 3 }}>
        <IconBtn icon={Eye} onClick={() => onView(note)} title="Preview" />
        <IconBtn icon={Pencil} onClick={() => onEdit(note)} title="Edit" tone="blue" disabled={isBusy} />
        {note.status === 'published'
          ? <IconBtn icon={EyeOff} onClick={() => onTogglePublish(note)} title="Unpublish" tone="orange" busy={isBusy} />
          : <IconBtn icon={Share2} onClick={() => onTogglePublish(note)} title="Publish to class" tone="green" busy={isBusy} />}
        <IconBtn icon={Trash2} onClick={() => onDelete(note)} title="Delete" tone="orange" disabled={isBusy} />
      </div>
    </div>
  );
}

function AttachmentPreview({ url, type, name }) {
  if (!url) return null;
  return (
    <div style={{ marginTop: 16 }}>
      {type === 'image' && <img src={url} alt={name || 'Attachment'} style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 8 }} />}
      {type === 'video' && <video src={url} controls style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 8 }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: t.blue, wordBreak: 'break-all' }}>
        <FileText size={13} /> <a href={url} target="_blank" rel="noreferrer" style={{ color: t.blue }}>{name || url}</a>
      </div>
    </div>
  );
}

function NotePreviewModal({ note, onClose }) {
  return (
    <Modal onClose={onClose} width={620}>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
          <div>
            <h2 className="td-heading" style={{ margin: 0, fontSize: 18, color: t.text }}>{note.title || 'Untitled note'}</h2>
            <p style={{ margin: '5px 0 0', fontSize: 11.5, color: t.subtext }}>{note.className} · {note.subject} · updated {fmtDate(note.updatedAt)}</p>
          </div>
          <IconBtn icon={X} onClick={onClose} title="Close" />
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: t.text, whiteSpace: 'pre-wrap' }}>{note.content || 'No content yet.'}</p>
        <AttachmentPreview url={note.fileUrl} type={note.fileType} name={note.fileName} />
      </div>
    </Modal>
  );
}

function NotesDashboard({ notes, filter, setFilter, onView, onEdit, onTogglePublish, onDelete, onNewNote, busyAction, noAssignments, goSettings }) {
  const filtered = notes.filter((n) => (filter === 'all' ? true : filter === 'published' ? n.status === 'published' : n.status === 'draft'));
  const stats = {
    total: notes.length,
    published: notes.filter((n) => n.status === 'published').length,
    draft: notes.filter((n) => n.status === 'draft').length,
  };
  return (
    <div className="td-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p className="td-heading" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text }}>Your notes</p>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: t.subtext }}>Write a note yourself or draft one with AI. Drafts save automatically.</p>
        </div>
        <PrimaryButton icon={Plus} onClick={onNewNote}>New note</PrimaryButton>
      </div>

      <NoAssignmentsNotice show={noAssignments} onGoSettings={goSettings} />

      <StatRow>
        <StatMini icon={BookOpen} value={stats.total} label="Total notes" tone="green" />
        <StatMini icon={Share2} value={stats.published} label="Published" tone="blue" />
        <StatMini icon={Pencil} value={stats.draft} label="Drafts" tone="orange" />
      </StatRow>

      <Tabs active={filter} onChange={setFilter} tabs={[{ key: 'all', label: 'All', count: stats.total }, { key: 'published', label: 'Published', count: stats.published }, { key: 'draft', label: 'Drafts', count: stats.draft }]} />

      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title={notes.length === 0 ? 'No notes yet' : 'Nothing here'}
          text={notes.length === 0 ? 'Create your first note for one of your classes.' : 'No notes match this filter yet.'}
          action={notes.length === 0 && <div style={{ marginTop: 12 }}><PrimaryButton icon={Plus} onClick={onNewNote}>Create your first note</PrimaryButton></div>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
          {filtered.map((n) => <NoteCard key={n.id} note={n} onView={onView} onEdit={onEdit} onTogglePublish={onTogglePublish} onDelete={onDelete} busyAction={busyAction} />)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------ AI ------------------------------------ */

function AiShell({ open, setOpen, title, subtitle, children }) {
  return (
    <div style={{ background: t.blueSoft, border: `1px solid ${t.blue}22`, borderRadius: 10, padding: 14 }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkles size={15} color={t.blue} /></span>
        <span style={{ flex: 1 }}>
          <span className="td-heading" style={{ display: 'block', fontSize: 13, fontWeight: 700, color: t.text }}>{title}</span>
          <span style={{ display: 'block', fontSize: 11.5, color: t.subtext, marginTop: 1 }}>{subtitle}</span>
        </span>
        <ChevronDown size={16} color={t.blue} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>}
    </div>
  );
}

const LANGUAGE_OPTIONS = ['English', 'Kinyarwanda', 'French'];
const DIFFICULTY_OPTIONS = ['Easy', 'Medium', 'Hard'];

function AiNotePanel({ assignment, request, hasContent, onUse }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('English');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);

  const generate = async () => {
    if (!assignment) { setError('Pick a class and subject above first.'); return; }
    if (!topic.trim()) { setError('Describe what the note should cover.'); return; }
    setError('');
    setBusy(true);
    try {
      const res = await request('/ai/note', {
        method: 'POST',
        timeoutMs: 110000,
        body: { classId: assignment.classId, subject: assignment.subject, topic: topic.trim(), language, instructions: instructions.trim() },
      });
      setDraft(res.note);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AiShell open={open} setOpen={setOpen} title="Draft this note with AI" subtitle="Describe the topic. You review the draft before it goes into your note.">
      <Field label="What should the note cover?">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Photosynthesis: light and dark reactions" style={{ ...inputStyle, background: '#fff' }} maxLength={300} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Field label="Language">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ ...inputStyle, background: '#fff' }}>
            {LANGUAGE_OPTIONS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Extra wishes (optional)">
          <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Include two worked examples" style={{ ...inputStyle, background: '#fff' }} maxLength={1000} />
        </Field>
      </div>
      {error && <Notice tone="red">{error}</Notice>}
      <div>
        <PrimaryButton variant="blue" icon={Sparkles} busy={busy} onClick={generate}>{draft ? 'Generate again' : 'Generate note'}</PrimaryButton>
        {busy && <span style={{ marginLeft: 10, fontSize: 11.5, color: t.subtext }}>This can take up to a minute.</span>}
      </div>

      {draft && !busy && (
        <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, padding: 14 }}>
          <p className="td-heading" style={{ margin: '0 0 8px', fontSize: 13.5, fontWeight: 700, color: t.text }}>{draft.title}</p>
          <div className="td-scroll" style={{ maxHeight: 220, overflowY: 'auto', fontSize: 12.5, lineHeight: 1.65, color: t.text, whiteSpace: 'pre-wrap' }}>{draft.content}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <PrimaryButton icon={Check} onClick={() => { onUse(draft); setDraft(null); setOpen(false); }}>{hasContent ? 'Replace my note with this' : 'Use this note'}</PrimaryButton>
            <PrimaryButton variant="outline" onClick={() => setDraft(null)}>Discard</PrimaryButton>
          </div>
        </div>
      )}
    </AiShell>
  );
}

function NoteEditor({ initial, assignments, request, onSaved, onClose, leaveGuardRef, toast, goSettings }) {
  const isPublished = initial.status === 'published';
  const [title, setTitle] = useState(initial.title || '');
  const [content, setContent] = useState(initial.content || '');
  const [fileUrl, setFileUrl] = useState(initial.fileUrl || '');
  const [fileType, setFileType] = useState(initial.fileType || '');
  const [fileName, setFileName] = useState(initial.fileName || '');
  const [assignment, setAssignment] = useState(() => {
    if (initial.classId) return { classId: initial.classId, subject: initial.subject, className: initial.className };
    return assignments.length === 1 ? assignments[0] : null;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); // 'draft' | 'published' | false
  const idRef = useRef(initial.id || null);

  const bodyFor = (status) => ({
    classId: assignment.classId,
    subject: assignment.subject,
    title: title.trim(),
    content: content.trim(),
    status,
    fileUrl: fileUrl.trim(),
    fileType: fileUrl.trim() ? (fileType || 'file') : '',
    fileName: fileUrl.trim() ? fileName.trim() : '',
  });

  const send = async (status) => {
    const body = bodyFor(status);
    const res = idRef.current
      ? await request(`/notes/${idRef.current}`, { method: 'PUT', body })
      : await request('/notes', { method: 'POST', body });
    idRef.current = res.note.id;
    onSaved(res.note);
    return res.note;
  };

  const autosave = useAutosave({
    enabled: !isPublished && !busy,
    snapshot: { a: assignmentKey(assignment), title, content, fileUrl, fileType, fileName },
    ready: !!assignment && !!(title.trim() || content.trim()),
    persist: () => send('draft'),
  });

  const leave = async () => {
    if (!isPublished) {
      const ok = await autosave.flush();
      return ok || window.confirm('Your latest changes could not be saved. Leave anyway?');
    }
    if (autosave.isDirty()) return window.confirm('You have unsaved changes to a live note. Leave without saving?');
    return true;
  };
  useEffect(() => {
    leaveGuardRef.current = leave;
    return () => { leaveGuardRef.current = null; };
  });

  useEffect(() => {
    const warn = (e) => { if (autosave.isDirty()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [autosave.isDirty]);

  const back = async () => { if (busy) return; if (await leave()) onClose(); };

  const save = async (status) => {
    if (!assignment) { setError('Pick a class and subject first.'); return; }
    if (status === 'published' && (!title.trim() || !content.trim())) { setError('A note needs both a title and content before it can be published.'); return; }
    if (!title.trim() && !content.trim()) { setError('Write a title or some content before saving.'); return; }
    setError('');
    setBusy(status);
    autosave.pause();
    await autosave.settle();
    try {
      await send(status);
      toast(status === 'published' ? (isPublished ? 'Changes saved.' : 'Note published.') : 'Note saved as draft.');
      leaveGuardRef.current = null;
      onClose();
    } catch (e) {
      setError(e.message);
      autosave.resume();
      setBusy(false);
    }
  };

  return (
    <div className="td-fade td-page-pad" style={{ padding: 22, maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <IconBtn icon={ArrowLeft} onClick={back} title="Back to notes" />
        <h2 className="td-heading" style={{ margin: 0, fontSize: 16, color: t.text }}>{initial.id ? 'Edit note' : 'New note'}</h2>
        <span style={{ marginLeft: 'auto' }}>
          <SaveStatus enabled={!isPublished} hasAssignment={!!assignment} state={autosave.state} onRetry={autosave.flush} />
        </span>
      </div>

      {error && <Notice tone="red">{error}</Notice>}

      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <p className="td-heading" style={{ margin: '0 0 9px', fontSize: 12.5, fontWeight: 700, color: t.text }}>Class and subject</p>
          <AssignmentPicker assignments={assignments} value={assignment} onChange={setAssignment} onGoSettings={goSettings} />
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title" aria-label="Note title" maxLength={200}
          style={{ ...inputStyle, padding: '11px 13px', fontSize: 15, fontWeight: 700 }} />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write the note content…" aria-label="Note content" rows={10}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
      </div>

      <AiNotePanel assignment={assignment} request={request} hasContent={!!content.trim()}
        onUse={(draft) => { setTitle(draft.title); setContent(draft.content); }} />

      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18 }}>
        <p className="td-heading" style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 700, color: t.text }}>Attach a file (optional)</p>
        <p style={{ margin: '0 0 10px', fontSize: 11.5, color: t.subtext }}>Paste a link to an image, video, or PDF that is already hosted online.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 8 }}>
          <input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" aria-label="File link" style={inputStyle} />
          <select value={fileType} onChange={(e) => setFileType(e.target.value)} aria-label="File type" style={inputStyle}>
            <option value="">File type…</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="pdf">PDF</option>
            <option value="file">Other file</option>
          </select>
        </div>
        {fileUrl.trim() && (
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="Display name for this file (optional)" aria-label="File display name" style={{ ...inputStyle, marginTop: 8 }} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingBottom: 18, flexWrap: 'wrap' }}>
        {isPublished ? (
          <>
            <PrimaryButton variant="outline" busy={busy === 'draft'} disabled={!!busy} onClick={() => save('draft')}>Move to drafts</PrimaryButton>
            <PrimaryButton icon={Save} busy={busy === 'published'} disabled={!!busy} onClick={() => save('published')}>Save changes</PrimaryButton>
          </>
        ) : (
          <>
            <PrimaryButton variant="soft" icon={Save} busy={busy === 'draft'} disabled={!!busy} onClick={() => save('draft')}>Save draft</PrimaryButton>
            <PrimaryButton icon={Share2} busy={busy === 'published'} disabled={!!busy} onClick={() => save('published')}>Publish</PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- QUIZZES ---------------------------------- */

function QuizCard({ quiz, onView, onEdit, onTogglePublish, onDelete, onSchedule, busyAction }) {
  const isBusy = busyAction === quiz.id;
  return (
    <div className="td-card td-fade" style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 16, borderLeft: `3px solid ${quiz.status === 'published' ? t.green : t.orange}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div>
        <h4 className="td-heading" style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: t.text }}>{quiz.title || 'Untitled quiz'}</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, color: t.subtext, fontSize: 11, flexWrap: 'wrap' }}>
          <ListChecks size={11} /><span>{quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'}</span>
          {quiz.timeLimitMinutes ? <><span>·</span><span>{quiz.timeLimitMinutes} min</span></> : null}
          {quiz.attemptCount > 0 ? <><span>·</span><Lock size={10} /><span>{quiz.attemptCount} started</span></> : null}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge bg={quiz.status === 'published' ? t.greenSoft : t.orangeSoft} color={quiz.status === 'published' ? t.green : t.orange}>
          {quiz.status === 'published' ? 'Published' : 'Draft'}
        </Badge>
        <Chip tone="blue">{quiz.className}</Chip>
        <Chip tone="neutral">{quiz.subject}</Chip>
      </div>
      <button type="button" onClick={() => onSchedule(quiz)} className="td-btn" title="Adjust schedule"
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: t.panel, border: `1px dashed ${t.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 11, color: t.subtext, cursor: 'pointer', textAlign: 'left' }}>
        <CalendarClock size={12} /><span>{fmtDateTime(quiz.startsAt)} → {fmtDateTime(quiz.endsAt)}</span>
      </button>
      <div style={{ display: 'flex', gap: 7, marginTop: 2, flexWrap: 'wrap' }}>
        <IconBtn icon={Eye} onClick={() => onView(quiz)} title="Preview" />
        <IconBtn icon={quiz.attemptCount > 0 ? Lock : Pencil} onClick={() => onEdit(quiz)} title={quiz.attemptCount > 0 ? 'Locked: students have started' : 'Edit'} tone="blue" disabled={isBusy} />
        {quiz.status === 'published'
          ? <IconBtn icon={EyeOff} onClick={() => onTogglePublish(quiz)} title="Unpublish" tone="orange" busy={isBusy} />
          : <IconBtn icon={Share2} onClick={() => onTogglePublish(quiz)} title="Publish to class" tone="green" busy={isBusy} />}
        <IconBtn icon={Trash2} onClick={() => onDelete(quiz)} title="Delete" tone="orange" disabled={isBusy} />
      </div>
    </div>
  );
}

function ScheduleModal({ quiz, onCancel, onSave, saving, error }) {
  const [start, setStart] = useState(isoToLocalInput(quiz.startsAt));
  const [end, setEnd] = useState(isoToLocalInput(quiz.endsAt));
  return (
    <Modal onClose={onCancel} width={380}>
      <div style={{ padding: 22 }}>
        <h3 className="td-heading" style={{ margin: '0 0 4px', fontSize: 15.5, color: t.text }}>Adjust schedule</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: t.subtext }}>{quiz.title || 'Untitled quiz'}. You can change the window at any time, even after students have started.</p>
        <Field label="Starts">
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
        </Field>
        <div style={{ height: 12 }} />
        <Field label="Ends">
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
        </Field>
        {error && <div style={{ marginTop: 12 }}><Notice tone="red">{error}</Notice></div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <PrimaryButton variant="outline" onClick={onCancel} disabled={saving}>Cancel</PrimaryButton>
          <PrimaryButton icon={Save} busy={saving} onClick={() => onSave(localInputToIso(start), localInputToIso(end))}>Save schedule</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

function QuizPreviewModal({ quiz, onClose }) {
  return (
    <Modal onClose={onClose} width={620}>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5, gap: 10 }}>
          <div>
            <h2 className="td-heading" style={{ margin: 0, fontSize: 18, color: t.text }}>{quiz.title || 'Untitled quiz'}</h2>
            <p style={{ margin: '5px 0 0', fontSize: 11.5, color: t.subtext }}>{quiz.className} · {quiz.subject} · {fmtDateTime(quiz.startsAt)} → {fmtDateTime(quiz.endsAt)}</p>
          </div>
          <IconBtn icon={X} onClick={onClose} title="Close" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
          {quiz.questions.length === 0 && <p style={{ color: t.subtext, fontSize: 13 }}>No questions added yet.</p>}
          {quiz.questions.map((q, i) => (
            <div key={q.id} style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 13 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text }}>Q{i + 1}. {q.question || 'Untitled question'}</p>
              <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {q.options.length === 0 && <p style={{ margin: 0, fontSize: 11.5, color: t.orange }}>No options yet.</p>}
                {q.options.map((o) => <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: o.isCorrect ? t.green : t.text }}>{o.isCorrect ? <CheckCircle2 size={13} /> : <Circle size={13} color={t.faint} />} {o.optionText || 'Option'}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function QuizzesDashboard({ quizzes, filter, setFilter, onView, onEdit, onTogglePublish, onDelete, onNewQuiz, onSchedule, busyAction, noAssignments, goSettings }) {
  const filtered = quizzes.filter((q) => (filter === 'all' ? true : filter === 'published' ? q.status === 'published' : q.status === 'draft'));
  const stats = { total: quizzes.length, published: quizzes.filter((q) => q.status === 'published').length, draft: quizzes.filter((q) => q.status === 'draft').length };
  return (
    <div className="td-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p className="td-heading" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text }}>Your quizzes</p>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: t.subtext }}>Build a quiz by hand or generate questions with AI. Drafts save automatically.</p>
        </div>
        <PrimaryButton icon={Plus} onClick={onNewQuiz}>New quiz</PrimaryButton>
      </div>

      <NoAssignmentsNotice show={noAssignments} onGoSettings={goSettings} />

      <StatRow>
        <StatMini icon={PenLine} value={stats.total} label="Total quizzes" tone="green" />
        <StatMini icon={Share2} value={stats.published} label="Published" tone="blue" />
        <StatMini icon={Pencil} value={stats.draft} label="Drafts" tone="orange" />
      </StatRow>

      <Tabs active={filter} onChange={setFilter} tabs={[{ key: 'all', label: 'All', count: stats.total }, { key: 'published', label: 'Published', count: stats.published }, { key: 'draft', label: 'Drafts', count: stats.draft }]} />

      {filtered.length === 0 ? (
        <EmptyState icon={PenLine} title={quizzes.length === 0 ? 'No quizzes yet' : 'Nothing here'}
          text={quizzes.length === 0 ? 'Build a quiz for one of your classes.' : 'No quizzes match this filter yet.'}
          action={quizzes.length === 0 && <div style={{ marginTop: 12 }}><PrimaryButton icon={Plus} onClick={onNewQuiz}>Build your first quiz</PrimaryButton></div>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
          {filtered.map((q) => <QuizCard key={q.id} quiz={q} onView={onView} onEdit={onEdit} onTogglePublish={onTogglePublish} onDelete={onDelete} onSchedule={onSchedule} busyAction={busyAction} />)}
        </div>
      )}
    </div>
  );
}

function QuestionEditor({ q, index, onChange, onRemove }) {
  const setField = (patch) => onChange({ ...q, ...patch });
  const addOption = () => { if (q.options.length < 6) setField({ options: [...q.options, { id: uid(), optionText: '', isCorrect: false }] }); };
  const updateOption = (id, patch) => setField({ options: q.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const removeOption = (id) => setField({ options: q.options.filter((o) => o.id !== id) });
  const markCorrect = (id) => setField({ options: q.options.map((o) => ({ ...o, isCorrect: o.id === id })) });

  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 15, background: t.panel }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 11 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: t.blue }}>Question {index + 1}</span>
        <IconBtn size={26} icon={Trash2} tone="orange" onClick={onRemove} title="Remove question" />
      </div>
      <textarea value={q.question} onChange={(e) => setField({ question: e.target.value })} rows={2} placeholder="Write the question…" aria-label={`Question ${index + 1}`}
        style={{ ...inputStyle, background: '#fff', resize: 'vertical' }} />
      <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {q.options.map((o, oi) => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <button type="button" onClick={() => markCorrect(o.id)} title="Mark as the correct answer" aria-label={`Mark option ${oi + 1} as correct`} aria-pressed={o.isCorrect}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
              {o.isCorrect ? <CheckCircle2 size={18} color={t.green} /> : <Circle size={18} color={t.faint} />}
            </button>
            <input value={o.optionText} onChange={(e) => updateOption(o.id, { optionText: e.target.value })} placeholder={`Option ${oi + 1}`} aria-label={`Option ${oi + 1}`}
              style={{ ...inputStyle, flex: 1, padding: 8, fontSize: 12, background: '#fff', width: 'auto' }} />
            <IconBtn size={24} icon={X} onClick={() => removeOption(o.id)} title="Remove option" />
          </div>
        ))}
        {q.options.length < 6 && (
          <button type="button" onClick={addOption} className="td-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: t.green, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: '3px 0', width: 'fit-content' }}><PlusCircle size={13} /> Add option</button>
        )}
      </div>
    </div>
  );
}

// Mirrors the server's publish rules so the teacher hears about problems immediately.
function firstQuizProblem(questions) {
  if (questions.length === 0) return 'Add at least one question before publishing.';
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const options = q.options.filter((o) => o.optionText.trim());
    if (!q.question.trim()) return `Question ${i + 1} has no text.`;
    if (options.length < 2) return `Question ${i + 1} needs at least two options.`;
    if (options.filter((o) => o.isCorrect).length !== 1) return `Question ${i + 1} needs exactly one correct answer.`;
  }
  return '';
}

const toEditorQuestion = (q) => ({
  id: uid(),
  question: q.question,
  options: q.options.map((o) => ({ id: uid(), optionText: o.optionText, isCorrect: !!o.isCorrect })),
});

function AiQuizPanel({ assignment, request, onUse, room }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('Medium');
  const [language, setLanguage] = useState('English');
  const [instructions, setInstructions] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);

  const readFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 300000) { setError('That file is too large. Use a plain-text file under 300 KB, or paste the important part.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setError(''); setSourceText(String(reader.result || '').slice(0, 12000)); };
    reader.onerror = () => setError('That file could not be read.');
    reader.readAsText(file);
  };

  const generate = async () => {
    if (!assignment) { setError('Pick a class and subject above first.'); return; }
    if (!topic.trim()) { setError('Describe what the quiz should cover.'); return; }
    if (room <= 0) { setError('This quiz already has the maximum of 50 questions.'); return; }
    setError('');
    setBusy(true);
    try {
      const res = await request('/ai/quiz', {
        method: 'POST',
        timeoutMs: 110000,
        body: {
          classId: assignment.classId,
          subject: assignment.subject,
          topic: topic.trim(),
          count: Math.min(Number(count) || 5, room),
          difficulty,
          language,
          instructions: instructions.trim(),
          sourceText: sourceText.trim(),
        },
      });
      setDraft({ ...res.quiz, requested: res.requested });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AiShell open={open} setOpen={setOpen} title="Generate questions with AI" subtitle="Each question gets four options and one correct answer. You review them before adding.">
      <Field label="What should the quiz cover?">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Newton's laws of motion" style={{ ...inputStyle, background: '#fff' }} maxLength={300} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        <Field label="Questions (1 to 20)">
          <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} style={{ ...inputStyle, background: '#fff' }} />
        </Field>
        <Field label="Difficulty">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{ ...inputStyle, background: '#fff' }}>
            {DIFFICULTY_OPTIONS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Language">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ ...inputStyle, background: '#fff' }}>
            {LANGUAGE_OPTIONS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Extra wishes (optional)">
        <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Include calculation questions" style={{ ...inputStyle, background: '#fff' }} maxLength={1000} />
      </Field>
      <Field label="Base the questions on your own material (optional)" hint="Paste text from your notes, or load a plain-text file. Up to 12,000 characters.">
        <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value.slice(0, 12000))} rows={4} placeholder="Paste lesson text here…" style={{ ...inputStyle, background: '#fff', resize: 'vertical' }} />
        <label style={{ display: 'inline-block', marginTop: 6, fontSize: 11.5, fontWeight: 700, color: t.blue, cursor: 'pointer' }}>
          Load a .txt file
          <input type="file" accept=".txt,.md,text/plain" onChange={readFile} style={{ display: 'none' }} />
        </label>
      </Field>
      {error && <Notice tone="red">{error}</Notice>}
      <div>
        <PrimaryButton variant="blue" icon={Sparkles} busy={busy} onClick={generate}>{draft ? 'Generate again' : 'Generate questions'}</PrimaryButton>
        {busy && <span style={{ marginLeft: 10, fontSize: 11.5, color: t.subtext }}>This can take up to a minute.</span>}
      </div>

      {draft && !busy && (
        <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, padding: 14 }}>
          <p className="td-heading" style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: t.text }}>{draft.title}</p>
          {draft.questions.length < draft.requested && (
            <p style={{ margin: '0 0 8px', fontSize: 11.5, color: t.orange, fontWeight: 600 }}>The AI returned {draft.questions.length} of {draft.requested} questions. Generate again to get more.</p>
          )}
          <div className="td-scroll" style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
            {draft.questions.map((q, i) => (
              <div key={i} style={{ fontSize: 12.5 }}>
                <p style={{ margin: 0, fontWeight: 700, color: t.text }}>{i + 1}. {q.question}</p>
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {q.options.map((o, j) => (
                    <span key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, color: o.isCorrect ? t.green : t.subtext, fontWeight: o.isCorrect ? 700 : 500 }}>
                      {o.isCorrect ? <CheckCircle2 size={12} /> : <Circle size={12} color={t.faint} />} {o.optionText}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <PrimaryButton icon={Check} onClick={() => { onUse(draft); setDraft(null); setOpen(false); }}>
              Add {draft.questions.length} question{draft.questions.length === 1 ? '' : 's'} to the quiz
            </PrimaryButton>
            <PrimaryButton variant="outline" onClick={() => setDraft(null)}>Discard</PrimaryButton>
          </div>
        </div>
      )}
    </AiShell>
  );
}

function QuizEditor({ initial, assignments, request, onSaved, onClose, leaveGuardRef, toast, goSettings }) {
  const isPublished = initial.status === 'published';
  const locked = (initial.attemptCount || 0) > 0;

  const [title, setTitle] = useState(initial.title || '');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(initial.timeLimitMinutes || '');
  const [startsAt, setStartsAt] = useState(isoToLocalInput(initial.startsAt));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(initial.endsAt));
  const [questions, setQuestions] = useState(initial.questions || []);
  const [assignment, setAssignment] = useState(() => {
    if (initial.classId) return { classId: initial.classId, subject: initial.subject, className: initial.className };
    return assignments.length === 1 ? assignments[0] : null;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const idRef = useRef(initial.id || null);

  const bodyFor = (status) => ({
    classId: assignment.classId,
    subject: assignment.subject,
    title: title.trim(),
    timeLimitMinutes: timeLimitMinutes ? Number(timeLimitMinutes) : null,
    startsAt: localInputToIso(startsAt),
    endsAt: localInputToIso(endsAt),
    status,
    questions,
  });

  const send = async (status) => {
    const body = bodyFor(status);
    const res = idRef.current
      ? await request(`/quizzes/${idRef.current}`, { method: 'PUT', body })
      : await request('/quizzes', { method: 'POST', body });
    idRef.current = res.quiz.id;
    onSaved(res.quiz);
    return res.quiz;
  };

  const autosave = useAutosave({
    enabled: !isPublished && !locked && !busy,
    snapshot: { a: assignmentKey(assignment), title, timeLimitMinutes, startsAt, endsAt, questions },
    ready: !!assignment && !!(title.trim() || questions.length > 0),
    persist: () => send('draft'),
  });

  const leave = async () => {
    if (locked) return true;
    if (!isPublished) {
      const ok = await autosave.flush();
      return ok || window.confirm('Your latest changes could not be saved. Leave anyway?');
    }
    if (autosave.isDirty()) return window.confirm('You have unsaved changes to a live quiz. Leave without saving?');
    return true;
  };
  useEffect(() => {
    leaveGuardRef.current = leave;
    return () => { leaveGuardRef.current = null; };
  });

  useEffect(() => {
    const warn = (e) => { if (!locked && autosave.isDirty()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [autosave.isDirty, locked]);

  const back = async () => { if (busy) return; if (await leave()) onClose(); };

  const addQuestion = () => setQuestions((qs) => (qs.length >= 50 ? qs : [...qs, { id: uid(), question: '', options: [{ id: uid(), optionText: '', isCorrect: true }, { id: uid(), optionText: '', isCorrect: false }] }]));
  const updateQuestion = (id, next) => setQuestions((qs) => qs.map((q) => (q.id === id ? next : q)));
  const removeQuestion = (id) => setQuestions((qs) => qs.filter((q) => q.id !== id));

  const save = async (status) => {
    if (!assignment) { setError('Pick a class and subject first.'); return; }
    if (status === 'published') {
      if (!title.trim()) { setError('Give the quiz a title before publishing.'); return; }
      const problem = firstQuizProblem(questions);
      if (problem) { setError(problem); return; }
    }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) { setError('The quiz must end after it starts.'); return; }
    setError('');
    setBusy(status);
    autosave.pause();
    await autosave.settle();
    try {
      await send(status);
      toast(status === 'published' ? (isPublished ? 'Changes saved.' : 'Quiz published.') : 'Quiz saved as draft.');
      leaveGuardRef.current = null;
      onClose();
    } catch (e) {
      setError(e.message);
      autosave.resume();
      setBusy(false);
    }
  };

  return (
    <div className="td-fade td-page-pad" style={{ padding: 22, maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <IconBtn icon={ArrowLeft} onClick={back} title="Back to quizzes" />
        <h2 className="td-heading" style={{ margin: 0, fontSize: 16, color: t.text }}>{initial.id ? (locked ? 'Quiz (locked)' : 'Edit quiz') : 'New quiz'}</h2>
        {!locked && (
          <span style={{ marginLeft: 'auto' }}>
            <SaveStatus enabled={!isPublished} hasAssignment={!!assignment} state={autosave.state} onRetry={autosave.flush} />
          </span>
        )}
      </div>

      {locked && (
        <Notice tone="orange" icon={Lock}>
          {initial.attemptCount} student{initial.attemptCount === 1 ? ' has' : 's have'} already started this quiz, so its questions can no longer be changed. You can still adjust the schedule from the quiz card, or unpublish it.
        </Notice>
      )}
      {error && <Notice tone="red">{error}</Notice>}

      <fieldset disabled={locked || !!busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p className="td-heading" style={{ margin: '0 0 9px', fontSize: 12.5, fontWeight: 700, color: t.text }}>Class and subject</p>
            <AssignmentPicker assignments={assignments} value={assignment} onChange={setAssignment} onGoSettings={goSettings} />
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz title" aria-label="Quiz title" maxLength={200}
            style={{ ...inputStyle, padding: '11px 13px', fontSize: 15, fontWeight: 700 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Field label="Time limit (minutes)">
              <input type="number" min={1} max={300} value={timeLimitMinutes} onChange={(e) => setTimeLimitMinutes(e.target.value)} placeholder="e.g. 20" style={inputStyle} />
            </Field>
            <Field label="Opens">
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Closes">
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </div>

        {!locked && (
          <AiQuizPanel assignment={assignment} request={request} room={50 - questions.length}
            onUse={(draft) => {
              setQuestions((qs) => [...qs, ...draft.questions.map(toEditorQuestion)].slice(0, 50));
              if (!title.trim()) setTitle(draft.title);
            }} />
        )}

        <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <p className="td-heading" style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: t.text }}>Questions ({questions.length})</p>
              <p style={{ margin: '3px 0 0', fontSize: 11.5, color: t.subtext }}>Write each question and its options, then tap the circle next to the correct answer.</p>
            </div>
            <PrimaryButton variant="soft" icon={Plus} onClick={addQuestion}>Add question</PrimaryButton>
          </div>
          {questions.length === 0 ? (
            <EmptyState icon={ListChecks} title="No questions yet" text="Add a question by hand, or generate a set with AI above." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {questions.map((q, i) => <QuestionEditor key={q.id} q={q} index={i} onChange={(next) => updateQuestion(q.id, next)} onRemove={() => removeQuestion(q.id)} />)}
            </div>
          )}
        </div>
      </fieldset>

      {!locked && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingBottom: 18, flexWrap: 'wrap' }}>
          {isPublished ? (
            <>
              <PrimaryButton variant="outline" busy={busy === 'draft'} disabled={!!busy} onClick={() => save('draft')}>Move to drafts</PrimaryButton>
              <PrimaryButton icon={Save} busy={busy === 'published'} disabled={!!busy} onClick={() => save('published')}>Save changes</PrimaryButton>
            </>
          ) : (
            <>
              <PrimaryButton variant="soft" icon={Save} busy={busy === 'draft'} disabled={!!busy} onClick={() => save('draft')}>Save draft</PrimaryButton>
              <PrimaryButton icon={Share2} busy={busy === 'published'} disabled={!!busy} onClick={() => save('published')}>Publish</PrimaryButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- INSIGHTS ---------------------------------- */

function useRemote(load, deps) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    load()
      .then((data) => { if (alive) setState({ loading: false, error: '', data }); })
      .catch((e) => { if (alive) setState({ loading: false, error: e.message, data: null }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((n) => n + 1) };
}

function ErrorBlock({ message, onRetry }) {
  return (
    <div style={{ padding: 22 }}>
      <Notice tone="red" action={<PrimaryButton variant="outline" icon={RefreshCw} onClick={onRetry}>Try again</PrimaryButton>}>{message}</Notice>
    </div>
  );
}

function StudentsPage({ request, classFilter }) {
  const { loading, error, data, reload } = useRemote(() => request('/students').then((r) => r.students), [request]);
  const [query, setQuery] = useState('');

  if (loading) return <div className="td-page-pad" style={{ padding: 22 }}><CardsSkeleton count={3} /></div>;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  const q = query.trim().toLowerCase();
  const students = data.filter((s) => (classFilter === 'All Classes' || s.className === classFilter) && (!q || s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)));
  const byClass = new Map();
  for (const s of students) {
    if (!byClass.has(s.className)) byClass.set(s.className, []);
    byClass.get(s.className).push(s);
  }

  return (
    <div className="td-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p className="td-heading" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text }}>Your students</p>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: t.subtext }}>Students who joined the classes you teach.</p>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" aria-label="Search students" style={{ ...inputStyle, width: 240 }} />
      </div>

      {students.length === 0 ? (
        <EmptyState icon={Users} title={data.length === 0 ? 'No students yet' : 'No matches'}
          text={data.length === 0 ? 'Students appear here after they register and choose one of your classes.' : 'Try a different search or class filter.'} />
      ) : (
        [...byClass.entries()].map(([className, list]) => (
          <div key={className} style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '11px 16px', background: t.panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="td-heading" style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{className}</span>
              <Chip tone="blue">{list.length} student{list.length === 1 ? '' : 's'}</Chip>
            </div>
            {list.map((s) => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) auto auto', gap: 14, alignItems: 'center', padding: '11px 16px', borderTop: `1px solid ${t.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.fullName}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: t.subtext, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</p>
                </div>
                <span style={{ fontSize: 11.5, color: t.subtext, whiteSpace: 'nowrap' }}>{s.quizzesDone} quiz{s.quizzesDone === 1 ? '' : 'zes'} done</span>
                <Badge bg={s.averageScore === null ? t.panel : t.greenSoft} color={s.averageScore === null ? t.subtext : t.green}>{s.averageScore === null ? 'No scores' : `${s.averageScore}% avg`}</Badge>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function QuizResultsDetail({ quiz, request, onBack }) {
  const { loading, error, data, reload } = useRemote(() => request(`/quizzes/${quiz.id}/results`), [request, quiz.id]);
  return (
    <div className="td-fade td-page-pad" style={{ padding: 22, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <IconBtn icon={ArrowLeft} onClick={onBack} title="Back to results" />
        <div style={{ minWidth: 0 }}>
          <h2 className="td-heading" style={{ margin: 0, fontSize: 16, color: t.text }}>{quiz.title}</h2>
          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: t.subtext }}>{quiz.className} · {quiz.subject}</p>
        </div>
      </div>

      {loading && <CardsSkeleton count={2} />}
      {error && <Notice tone="red" action={<PrimaryButton variant="outline" icon={RefreshCw} onClick={reload}>Try again</PrimaryButton>}>{error}</Notice>}
      {data && (
        <>
          <StatRow>
            <StatMini icon={Users} value={`${data.submitted}/${data.classSize}`} label="Submitted" tone="blue" />
            <StatMini icon={BarChart3} value={data.average === null ? '—' : `${data.average}%`} label="Class average" tone="green" />
            <StatMini icon={ListChecks} value={data.quiz.questionCount} label="Questions" tone="orange" />
          </StatRow>

          <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '11px 16px', background: t.panel }}><span className="td-heading" style={{ fontSize: 13, fontWeight: 700 }}>Student scores</span></div>
            {data.results.length === 0 ? (
              <p style={{ margin: 0, padding: 20, fontSize: 13, color: t.subtext }}>No student has started this quiz yet.</p>
            ) : data.results.map((r) => (
              <div key={r.attemptId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) auto auto', gap: 14, alignItems: 'center', padding: '11px 16px', borderTop: `1px solid ${t.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.studentName}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: t.subtext }}>
                    {r.submittedAt ? `Submitted ${fmtDateTime(r.submittedAt)}` : 'In progress'}
                    {r.penaltyMarks > 0 ? ` · ${r.penaltyMarks} mark${r.penaltyMarks === 1 ? '' : 's'} deducted for leaving the quiz screen` : ''}
                  </p>
                </div>
                <span style={{ fontSize: 12, color: t.subtext, whiteSpace: 'nowrap' }}>{r.submittedAt ? `${r.finalScore}/${r.total}` : ''}</span>
                {r.submittedAt
                  ? <Badge bg={r.scorePercent >= 50 ? t.greenSoft : t.redSoft} color={r.scorePercent >= 50 ? t.green : t.red}>{r.scorePercent}%</Badge>
                  : <Badge bg={t.orangeSoft} color={t.orange}>Working</Badge>}
              </div>
            ))}
          </div>

          {data.questionStats.length > 0 && (
            <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '11px 16px', background: t.panel }}>
                <span className="td-heading" style={{ fontSize: 13, fontWeight: 700 }}>Question difficulty</span>
                <span style={{ marginLeft: 8, fontSize: 11, color: t.subtext }}>Share of submitted students who answered correctly</span>
              </div>
              {data.questionStats.map((s, i) => (
                <div key={s.id} style={{ padding: '11px 16px', borderTop: `1px solid ${t.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
                    <span style={{ color: t.text, fontWeight: 600 }}>{i + 1}. {s.question}</span>
                    <span style={{ color: t.subtext, whiteSpace: 'nowrap' }}>{s.percentCorrect === null ? 'No answers' : `${s.percentCorrect}%`}</span>
                  </div>
                  <div style={{ marginTop: 6, height: 6, borderRadius: 4, background: t.panel }}>
                    <div style={{ width: `${s.percentCorrect || 0}%`, height: '100%', borderRadius: 4, background: (s.percentCorrect || 0) >= 50 ? t.green : t.orange }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResultsPage({ quizzes, request, classFilter }) {
  const [openQuiz, setOpenQuiz] = useState(null);
  if (openQuiz) return <QuizResultsDetail quiz={openQuiz} request={request} onBack={() => setOpenQuiz(null)} />;

  const list = quizzes.filter((q) => (q.status === 'published' || q.attemptCount > 0) && (classFilter === 'All Classes' || q.className === classFilter));
  return (
    <div className="td-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <p className="td-heading" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text }}>Quiz results</p>
        <p style={{ margin: '3px 0 0', fontSize: 13, color: t.subtext }}>Open a quiz to see every student's score and which questions were hardest.</p>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={BarChart3} title="No results yet" text="Publish a quiz and results appear here as students submit." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
          {list.map((q) => (
            <button type="button" key={q.id} onClick={() => setOpenQuiz(q)} className="td-card td-btn"
              style={{ textAlign: 'left', background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="td-heading" style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{q.title}</span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Chip tone="blue">{q.className}</Chip><Chip>{q.subject}</Chip></span>
              <span style={{ fontSize: 12, color: t.subtext }}>{q.submittedCount} submitted · {q.attemptCount} started</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- SETTINGS ---------------------------------- */

function SettingsPage({ me, assignments, classes, request, onChange, toast }) {
  const [className, setClassName] = useState('');
  const [subject, setSubject] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const add = async () => {
    if (!className.trim() || !subject.trim()) { setError('Enter both a class name and a subject.'); return; }
    setError('');
    setAdding(true);
    try {
      const res = await request('/assignments', { method: 'POST', body: { className: className.trim(), subject: subject.trim() } });
      onChange(res.assignments, res.classes);
      setClassName('');
      setSubject('');
      toast('Class and subject added.');
    } catch (e) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    setRemoveBusy(true);
    try {
      const res = await request(`/assignments/${removing.id}`, { method: 'DELETE' });
      onChange(res.assignments, classes);
      toast('Removed.');
      setRemoving(null);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div className="td-page-pad" style={{ padding: 22, maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <p className="td-heading" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text }}>Settings</p>
        <p style={{ margin: '3px 0 0', fontSize: 13, color: t.subtext }}>Your profile and the classes you teach.</p>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18 }}>
        <p className="td-heading" style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: t.text }}>Profile</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 13 }}>
          <div><p style={{ margin: 0, fontSize: 11, color: t.subtext, fontWeight: 700 }}>Name</p><p style={{ margin: '3px 0 0', color: t.text }}>{me.fullName}</p></div>
          <div><p style={{ margin: 0, fontSize: 11, color: t.subtext, fontWeight: 700 }}>Email</p><p style={{ margin: '3px 0 0', color: t.text, wordBreak: 'break-all' }}>{me.email}</p></div>
          <div><p style={{ margin: 0, fontSize: 11, color: t.subtext, fontWeight: 700 }}>School</p><p style={{ margin: '3px 0 0', color: t.text }}>{me.schoolName}</p></div>
        </div>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <p className="td-heading" style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: t.text }}>Classes and subjects you teach</p>
          <p style={{ margin: '3px 0 0', fontSize: 11.5, color: t.subtext }}>Students choose their class from this list. You can only publish to a class and subject listed here.</p>
        </div>

        {assignments.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: t.subtext }}>Nothing added yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {assignments.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.panel, borderRadius: 8, padding: '8px 10px 8px 12px' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: t.text }}>{a.className} · {a.subject}</span>
                <IconBtn icon={Trash2} tone="orange" size={28} title="Remove" onClick={() => setRemoving(a)} />
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <Field label="Class name" hint="Pick an existing class or type a new one.">
              <input list="ecw-classes" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. S4 MCB" maxLength={60} style={inputStyle} />
              <datalist id="ecw-classes">{classes.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </Field>
            <Field label="Subject">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Biology" maxLength={80} style={inputStyle} />
            </Field>
          </div>
          {error && <Notice tone="red">{error}</Notice>}
          <div><PrimaryButton icon={Plus} busy={adding} onClick={add}>Add class and subject</PrimaryButton></div>
        </div>
      </div>

      {removing && (
        <ConfirmModal
          title="Remove this class and subject?"
          text={`You will no longer be able to publish ${removing.subject} content to ${removing.className}. Existing notes and quizzes stay, but you must add it again to edit them.`}
          confirmLabel="Remove"
          busy={removeBusy}
          onCancel={() => setRemoving(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}

/* ------------------------------------ APP ------------------------------------ */

export default function Teacher({ onSignOut }) {
  const { toasts, push: toast, dismiss: dismissToast } = useToasts();

  const [boot, setBoot] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [bootError, setBootError] = useState('');
  const [me, setMe] = useState({ fullName: '', email: '', schoolName: '' });
  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [notes, setNotes] = useState([]);
  const [quizzes, setQuizzes] = useState([]);

  const [section, setSection] = useState('notes');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState('All Classes');
  const [notesFilter, setNotesFilter] = useState('all');
  const [quizzesFilter, setQuizzesFilter] = useState('all');

  const [editingNote, setEditingNote] = useState(null);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [previewNote, setPreviewNote] = useState(null);
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [scheduleQuiz, setScheduleQuiz] = useState(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyAction, setBusyAction] = useState(null);

  // The open editor registers a function here that saves pending work (or asks
  // before discarding it). Every way of leaving the editor goes through it.
  const leaveGuardRef = useRef(null);

  const handleSignOut = useCallback(() => {
    try { localStorage.removeItem(USER_SESSION_KEY); } catch { /* ignore */ }
    if (onSignOut) onSignOut();
    else window.location.assign('/');
  }, [onSignOut]);
  const signOutRef = useRef(handleSignOut);
  signOutRef.current = handleSignOut;

  // Every request goes through here so an expired session always ends in sign-out.
const request = useCallback((path, opts) => api(path, opts), []);

const load = useCallback(async () => {
  const session = getSession();

  if (!session?.token) {
    setBootError('Your login session is missing. Please sign in again.');
    setBoot('error');
    return;
  }

  setBoot('loading');
  setBootError('');

  try {
    const [meRes, notesRes, quizzesRes] = await Promise.all([
      request('/me'),
      request('/notes'),
      request('/quizzes'),
    ]);

    setMe(meRes.teacher || {});
    setAssignments(meRes.assignments || []);
    setClasses(meRes.classes || []);
    setNotes(notesRes.notes || []);
    setQuizzes(quizzesRes.quizzes || []);
    setBoot('ready');
  } catch (e) {
    setBootError(
      e.status === 401
        ? 'Your session is invalid or expired. Please sign in again.'
        : e.message || 'The teacher workspace could not load.'
    );
    setBoot('error');
  }
}, [request]);

  useEffect(() => { load(); }, [load]);

  const filterOptions = ['All Classes', ...new Set(assignments.map((a) => a.className))];
  const matchesClass = (className) => selectedClass === 'All Classes' || className === selectedClass;
  const visibleNotes = notes.filter((n) => matchesClass(n.className));
  const visibleQuizzes = quizzes.filter((q) => matchesClass(q.className));

  /* ---- navigation (always passes through the editor's leave guard) ---- */
  const guarded = useCallback(async (fn) => {
    if (leaveGuardRef.current) {
      const ok = await leaveGuardRef.current();
      if (!ok) return;
    }
    fn();
  }, []);

  const go = (key) => guarded(() => {
    setEditingNote(null);
    setEditingQuiz(null);
    setSection(key);
    setSidebarOpen(false);
  });

  const blankNote = () => ({ id: null, title: '', content: '', status: 'draft', classId: null, subject: null, className: null, fileUrl: '', fileType: '', fileName: '' });
  const blankQuiz = () => ({ id: null, title: '', status: 'draft', timeLimitMinutes: null, startsAt: null, endsAt: null, classId: null, subject: null, className: null, attemptCount: 0, questions: [] });

  const openNewNote = () => guarded(() => { setEditingQuiz(null); setEditingNote(blankNote()); setSection('noteEditor'); setSidebarOpen(false); });
  const openEditNote = (note) => guarded(() => { setEditingNote(note); setSection('noteEditor'); });
  const openNewQuiz = () => guarded(() => { setEditingNote(null); setEditingQuiz(blankQuiz()); setSection('quizEditor'); setSidebarOpen(false); });
  const openEditQuiz = (quiz) => guarded(() => { setEditingQuiz(quiz); setSection('quizEditor'); });

  const closeNoteEditor = () => { setEditingNote(null); setSection('notes'); };
  const closeQuizEditor = () => { setEditingQuiz(null); setSection('quizzes'); };

  const upsertNote = useCallback((note) => setNotes((list) => upsertById(list, note)), []);
  const upsertQuiz = useCallback((quiz) => setQuizzes((list) => upsertById(list, quiz)), []);

  /* ---- publish / unpublish ---- */
  const toggleNotePublish = async (note) => {
    setBusyAction(note.id);
    const next = note.status === 'published' ? 'draft' : 'published';
    try {
      const res = await request(`/notes/${note.id}/status`, { method: 'PATCH', body: { status: next } });
      upsertNote(res.note);
      toast(next === 'published' ? 'Note published to the class.' : 'Note moved back to drafts.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const toggleQuizPublish = async (quiz) => {
    setBusyAction(quiz.id);
    const next = quiz.status === 'published' ? 'draft' : 'published';
    try {
      const res = await request(`/quizzes/${quiz.id}/status`, { method: 'PATCH', body: { status: next } });
      upsertQuiz(res.quiz);
      toast(next === 'published' ? 'Quiz published to the class.' : 'Quiz moved back to drafts.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const saveSchedule = async (startsAt, endsAt) => {
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) { setScheduleError('The quiz must end after it starts.'); return; }
    setScheduleError('');
    setScheduleSaving(true);
    try {
      const res = await request(`/quizzes/${scheduleQuiz.id}/schedule`, { method: 'PATCH', body: { startsAt, endsAt } });
      upsertQuiz(res.quiz);
      toast('Schedule updated.');
      setScheduleQuiz(null);
    } catch (e) {
      setScheduleError(e.message);
    } finally {
      setScheduleSaving(false);
    }
  };

  /* ---- delete ---- */
  const runDelete = async () => {
    if (!confirmDelete) return;
    const { type, item } = confirmDelete;
    setDeleteBusy(true);
    try {
      await request(`/${type === 'note' ? 'notes' : 'quizzes'}/${item.id}`, { method: 'DELETE' });
      if (type === 'note') setNotes((list) => list.filter((n) => n.id !== item.id));
      else setQuizzes((list) => list.filter((q) => q.id !== item.id));
      toast(type === 'note' ? 'Note deleted.' : 'Quiz deleted.');
      setConfirmDelete(null);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const titles = { notes: 'Notes', noteEditor: 'Note editor', quizzes: 'Quizzes', quizEditor: 'Quiz builder', students: 'Students', results: 'Quiz results', settings: 'Settings' };
  const goSettings = () => go('settings');

  if (boot === 'loading') return <div className="td-root" style={{ minHeight: '100vh' }}><GlobalStyle /><PageSkeleton /></div>;

  if (boot === 'error') {
    return (
      <div className="td-root" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <GlobalStyle />
        <div style={{ maxWidth: 420 }}>
          <EmptyState icon={AlertCircle} title="Your workspace did not load" text={bootError}
            action={<div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <PrimaryButton icon={RefreshCw} onClick={load}>Try again</PrimaryButton>
              <PrimaryButton variant="outline" onClick={handleSignOut}>Sign out</PrimaryButton>
            </div>} />
        </div>
      </div>
    );
  }

  const sidebarProps = { section, notesCount: notes.length, quizzesCount: quizzes.length, teacherName: me.fullName, onSignOut: handleSignOut };

  return (
    <div className="td-root" style={{ minHeight: '100vh', color: t.text }}>
      <GlobalStyle />
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <div className="td-sidebar-wrap" style={{ display: 'flex' }}>
          <Sidebar {...sidebarProps} go={go} />
        </div>

        {sidebarOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
            <div onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,17,23,0.45)' }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0 }}>
              <Sidebar {...sidebarProps} go={go} onClose={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Header selectedClass={selectedClass} setSelectedClass={setSelectedClass} filterOptions={filterOptions}
            onNewNote={openNewNote} onNewQuiz={openNewQuiz} onMenu={() => setSidebarOpen(true)} title={titles[section]} />

          <div className="td-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {section === 'notes' && (
              <NotesDashboard notes={visibleNotes} filter={notesFilter} setFilter={setNotesFilter}
                onView={setPreviewNote} onEdit={openEditNote} onTogglePublish={toggleNotePublish}
                onDelete={(n) => setConfirmDelete({ type: 'note', item: n })} onNewNote={openNewNote} busyAction={busyAction}
                noAssignments={assignments.length === 0} goSettings={goSettings} />
            )}
            {section === 'noteEditor' && editingNote && (
              <NoteEditor key={editingNote.id || 'new-note'} initial={editingNote} assignments={assignments} request={request}
                onSaved={upsertNote} onClose={closeNoteEditor} leaveGuardRef={leaveGuardRef} toast={toast} goSettings={goSettings} />
            )}
            {section === 'quizzes' && (
              <QuizzesDashboard quizzes={visibleQuizzes} filter={quizzesFilter} setFilter={setQuizzesFilter}
                onView={setPreviewQuiz} onEdit={openEditQuiz} onTogglePublish={toggleQuizPublish}
                onDelete={(q) => setConfirmDelete({ type: 'quiz', item: q })} onNewQuiz={openNewQuiz}
                onSchedule={(q) => { setScheduleError(''); setScheduleQuiz(q); }} busyAction={busyAction}
                noAssignments={assignments.length === 0} goSettings={goSettings} />
            )}
            {section === 'quizEditor' && editingQuiz && (
              <QuizEditor key={editingQuiz.id || 'new-quiz'} initial={editingQuiz} assignments={assignments} request={request}
                onSaved={upsertQuiz} onClose={closeQuizEditor} leaveGuardRef={leaveGuardRef} toast={toast} goSettings={goSettings} />
            )}
            {section === 'students' && <StudentsPage request={request} classFilter={selectedClass} />}
            {section === 'results' && <ResultsPage quizzes={quizzes} request={request} classFilter={selectedClass} />}
            {section === 'settings' && (
              <SettingsPage me={me} assignments={assignments} classes={classes} request={request} toast={toast}
                onChange={(nextAssignments, nextClasses) => { setAssignments(nextAssignments); setClasses(nextClasses); }} />
            )}
          </div>
        </div>
      </div>

      {previewNote && <NotePreviewModal note={previewNote} onClose={() => setPreviewNote(null)} />}
      {previewQuiz && <QuizPreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
      {scheduleQuiz && <ScheduleModal quiz={scheduleQuiz} saving={scheduleSaving} error={scheduleError} onCancel={() => setScheduleQuiz(null)} onSave={saveSchedule} />}
      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${confirmDelete.type === 'note' ? 'note' : 'quiz'}?`}
          text={`"${confirmDelete.item.title || 'Untitled'}" will be permanently deleted${confirmDelete.type === 'quiz' && confirmDelete.item.attemptCount > 0 ? ', together with the results of the students who took it' : ''}. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleteBusy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={runDelete}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}