import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import esms from './assets/esms.jpg';
import {
  ShieldCheck, Bell, Filter, UserCog, LogOut, Settings, LayoutGrid,
  Building2, Megaphone, Trash2, X, ChevronDown, Menu,
  Search, Ban, CheckCircle2, Circle, Save, Send, Activity,
  Mail, Phone, Clock, CreditCard, RefreshCw, AlertCircle, XCircle,
} from 'lucide-react';

/* ---------------------------------- THEME ---------------------------------- */

const t = {
  bg: '#F9FAFB',
  cardBg: '#FFFFFF',
  panel: '#F3F4F6',
  border: '#E5E7EB',
  text: '#111827',
  subtext: '#6B7280',
  faint: '#9CA3AF',

  blue: '#3B82F6',
  blueSoft: '#EFF6FF',
  green: '#10B981',
  greenSoft: '#ECFDF5',
  orange: '#F59E0B',
  orangeSoft: '#FEF3C7',
  red: '#EF4444',
  redSoft: '#FEE2E2',

  shimmer1: '#E5E7EB',
  shimmer2: '#F3F4F6',
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };
const fmtDateTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };

// Local backend while you run `npm run dev`, hosted backend once you deploy.
// (Vite sets import.meta.env.DEV to true only in dev.) Change either URL if needed.
const API_BASE = import.meta.env.DEV
  ? 'http://localhost:5000'
  : 'https://easy-class-work-records.onrender.com';
const SUPERADMIN_SESSION_KEY = 'ecw_superadmin_session';
const ANNOUNCEMENTS_KEY = 'ecw_superadmin_announcements';

// The backend stores "pending" (plus a separate payment flag). The dashboard splits
// it into two labels so you can see at a glance which schools still owe payment.
const STATUS_META = {
  active: { bg: t.greenSoft, color: t.green, label: 'Active' },
  suspended: { bg: t.redSoft, color: t.red, label: 'Suspended' },
  rejected: { bg: t.redSoft, color: t.red, label: 'Rejected' },
  pending_review: { bg: t.blueSoft, color: t.blue, label: 'Pending review' },
  pending_payment: { bg: t.orangeSoft, color: t.orange, label: 'Pending payment' },
};

// Backend already returns { id, name, email, phone, code, status, paymentStatus, createdAt, codeSentAt }.
const mapSchool = (s) => ({
  ...s,
  status: String(s.status).startsWith('pending')
    ? (s.paymentStatus ? 'pending_review' : 'pending_payment')
    : s.status,
});

// fetch() that gives up after `ms` so the screen never spins forever.
async function fetchWithTimeout(url, options = {}, ms = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function readSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SUPERADMIN_SESSION_KEY));
    return parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

/* -------------------------------- PRIMITIVES -------------------------------- */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      .pa-root { font-family: 'Inter', system-ui, sans-serif; background: ${t.bg}; }
      .pa-heading { font-family: 'Poppins', system-ui, sans-serif; }
      @keyframes paShimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
      .pa-skel { background-image: linear-gradient(90deg, var(--s1) 0px, var(--s2) 40px, var(--s1) 80px); background-size: 600px 100%; animation: paShimmer 1.4s infinite linear; }
      @keyframes paFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      .pa-fade { animation: paFade .26s ease both; }
      .pa-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
      .pa-scroll::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 8px; }
      .pa-btn { transition: transform .1s ease, background .15s ease, opacity .15s ease, border-color .15s ease; }
      .pa-btn:active { transform: scale(0.97); }
      .pa-row:hover { background: #F9FAFB; }
      input:focus, textarea:focus, select:focus { outline: 2px solid #3B82F655; outline-offset: 1px; }
      @media (max-width: 860px) {
        .pa-hamburger { display: flex !important; }
        .pa-sidebar-wrap { display: none !important; }
        .pa-table-wrap { overflow-x: auto; }
      }
      @media (max-width: 480px) { .pa-page-pad { padding: 16px !important; } }
    `}</style>
  );
}

function Skeleton({ w = '100%', h = 14, r = 6 }) {
  return <div className="pa-skel" style={{ width: w, height: h, borderRadius: r, '--s1': t.shimmer1, '--s2': t.shimmer2 }} />;
}
function Badge({ children, bg, color }) {
  return <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{children}</span>;
}
function StatusBadge({ status }) {
  const c = STATUS_META[status] || { bg: t.panel, color: t.subtext, label: String(status || 'Unknown') };
  return <Badge bg={c.bg} color={c.color}>{c.label}</Badge>;
}
function PaymentBadge({ paid }) {
  return paid ? <Badge bg={t.greenSoft} color={t.green}>Paid</Badge> : <Badge bg={t.orangeSoft} color={t.orange}>Unpaid</Badge>;
}
function IconBtn({ icon: Icon, onClick, tone = 'default', title, size = 30, disabled }) {
  const tones = { default: { bg: t.panel, color: t.subtext }, orange: { bg: t.orangeSoft, color: t.orange }, red: { bg: t.redSoft, color: t.red }, blue: { bg: t.blueSoft, color: t.blue }, green: { bg: t.greenSoft, color: t.green } };
  const c = tones[tone];
  return <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className="pa-btn" style={{ width: size, height: size, borderRadius: 8, border: 'none', background: c.bg, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, flexShrink: 0 }}><Icon size={size * 0.46} /></button>;
}
function Button({ children, onClick, icon: Icon, variant = 'solid', disabled, style }) {
  const styles = { solid: { background: t.green, color: '#fff', border: 'none' }, blue: { background: t.blue, color: '#fff', border: 'none' }, soft: { background: t.orangeSoft, color: t.orange, border: 'none' }, redSoft: { background: t.redSoft, color: t.red, border: 'none' }, outline: { background: '#fff', color: t.text, border: `1px solid ${t.border}` } };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="pa-btn" style={{ ...styles[variant], padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', ...style }}>
      {Icon && <Icon size={14} />}{children}
    </button>
  );
}
function Field({ label, children }) { return <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><label style={{ fontSize: 11, fontWeight: 700, color: t.subtext }}>{label}</label>{children}</div>; }
function Input(props) { return <input {...props} style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, color: t.text, background: t.panel, outline: 'none', width: '100%', ...(props.style || {}) }} />; }
function Dropdown({ value, options, onChange, icon: Icon }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); } document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc); }, []);
  const current = options.find(o => (o.value ?? o) === value);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="pa-btn" style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 11px', fontSize: 12.5, fontWeight: 600, color: t.text, cursor: 'pointer' }}>
        {Icon && <Icon size={14} color={t.subtext} />}<span>{current?.label ?? current ?? value}</span><ChevronDown size={13} color={t.subtext} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div className="pa-fade" style={{ position: 'absolute', top: '110%', left: 0, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 10px 24px rgba(18,20,28,0.12)', minWidth: 170, zIndex: 40, overflow: 'hidden' }}>
          {options.map(opt => {
            const val = opt.value ?? opt;
            const label = opt.label ?? opt;
            return <div key={val} onClick={() => { onChange(val); setOpen(false); }} style={{ padding: '9px 13px', fontSize: 12.5, cursor: 'pointer', color: val === value ? t.blue : t.text, fontWeight: val === value ? 700 : 500, background: val === value ? t.blueSoft : 'transparent' }}>{label}</div>;
          })}
        </div>
      )}
    </div>
  );
}
function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="pa-fade" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '52px 20px', textAlign: 'center', gap: 5 }}>
      <div style={{ width: 50, height: 50, borderRadius: 10, background: t.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}><Icon size={22} color={t.blue} /></div>
      <h3 className="pa-heading" style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: t.text }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 12.5, color: t.subtext, maxWidth: 300, lineHeight: 1.5 }}>{text}</p>
      {action}
    </div>
  );
}
function Modal({ children, onClose, width = 460 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="pa-fade pa-scroll" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', border: `1px solid ${t.border}` }}>{children}</div>
    </div>
  );
}
function StatMini({ icon: Icon, value, label, tone = 'blue' }) {
  const map = { green: { bg: t.greenSoft, fg: t.green }, blue: { bg: t.blueSoft, fg: t.blue }, orange: { bg: t.orangeSoft, fg: t.orange }, red: { bg: t.redSoft, fg: t.red } };
  const c = map[tone];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 13px', flex: '1 1 148px' }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={14} color={c.fg} /></div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span className="pa-heading" style={{ fontSize: 16, fontWeight: 800, color: t.text }}>{value}</span>
        <span style={{ fontSize: 11, color: t.subtext, fontWeight: 600 }}>{label}</span>
      </div>
    </div>
  );
}
function SearchBox({ value, onChange, placeholder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: t.panel, border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 11px', flex: '1 1 200px', maxWidth: 320 }}>
      <Search size={14} color={t.subtext} /><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, color: t.text, width: '100%' }} />
    </div>
  );
}
function Table({ columns, rows, renderRow, empty }) {
  if (rows.length === 0) return empty;
  return (
    <div className="pa-table-wrap" style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
        <thead><tr style={{ background: t.panel }}>{columns.map(c => <th key={c} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700, color: t.subtext, letterSpacing: 0.4, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>{c}</th>)}</tr></thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}
// Passes extra props (like onClick) through to the <td>.
const Td = ({ children, style, ...rest }) => <td {...rest} style={{ padding: '11px 14px', fontSize: 12.5, color: t.text, borderBottom: `1px solid ${t.border}`, verticalAlign: 'middle', ...style }}>{children}</td>;

function Flash({ flash, onClose }) {
  if (!flash) return null;
  const map = {
    error: { bg: t.redSoft, fg: t.red, Icon: AlertCircle },
    warn: { bg: t.orangeSoft, fg: t.orange, Icon: AlertCircle },
    success: { bg: t.greenSoft, fg: t.green, Icon: CheckCircle2 },
  };
  const c = map[flash.type] || map.error;
  return (
    <div className="pa-fade" role="alert" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: c.bg, borderRadius: 8, padding: '10px 13px', color: c.fg, fontSize: 12.5, fontWeight: 600 }}>
      <c.Icon size={15} style={{ marginTop: 1, flexShrink: 0 }} />
      <span style={{ flex: 1, lineHeight: 1.5, wordBreak: 'break-word' }}>{flash.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: c.fg, cursor: 'pointer', display: 'flex', padding: 0 }}><X size={15} /></button>
    </div>
  );
}

/* ---------------------------------- GOOGLE LOGIN ---------------------------------- */

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.getElementById('google-gsi-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in.')));
      return;
    }
    const s = document.createElement('script');
    s.id = 'google-gsi-script';
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in. Check your internet connection.'));
    document.head.appendChild(s);
  });
}

function LoginScreen({ onSuccess, notice, onBack }) {
  const btnRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [verified, setVerified] = useState(null); // Google-verified, waiting for "Continue to dashboard"
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function handleCredential(response) {
      setError('');
      setSigningIn(true);
      try {
        const res = await fetchWithTimeout(`${API_BASE}/api/superadmin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Sign-in failed.');
        // Don't enter the dashboard automatically. Wait for the "Continue to dashboard" button.
        setVerified({ token: data.token, email: data.email, name: data.name });
      } catch (err) {
        if (!cancelled) setError(err instanceof TypeError ? 'Could not reach the server. Please check your connection.' : err.message);
      } finally {
        if (!cancelled) setSigningIn(false);
      }
    }

    (async () => {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/api/superadmin/config`);
        const cfg = await res.json().catch(() => ({}));
        if (!res.ok || !cfg.googleClientId) throw new Error(cfg.message || 'Google sign-in is not configured on the server.');
        await loadGoogleScript();
        if (cancelled || !btnRef.current) return;
        window.google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: handleCredential, auto_select: false, ux_mode: 'popup' });
        window.google.accounts.id.renderButton(btnRef.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: 280 });
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof TypeError ? 'Could not reach the server. Please check your connection.' : err.message);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="pa-fade" style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 12, padding: 28, width: 380, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#fff', border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={esms} alt="ESMS" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <p className="pa-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>ESMS</p>
            <p style={{ margin: 0, fontSize: 11, color: t.subtext }}>Platform control</p>
          </div>
        </div>
        <div>
          <h1 className="pa-heading" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>Super admin sign in</h1>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: t.subtext, lineHeight: 1.55 }}>Continue with the Google account registered as the platform owner.</p>
        </div>

        {notice && <Flash flash={{ type: 'warn', text: notice }} onClose={() => {}} />}
        {error && <Flash flash={{ type: 'error', text: error }} onClose={() => setError('')} />}

        {verified && (
          <div className="pa-fade" style={{ background: t.greenSoft, borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.green, fontSize: 13, fontWeight: 700 }}>
              <CheckCircle2 size={16} /> Google account verified
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: t.text, wordBreak: 'break-all' }}>{verified.email}</p>
            <Button variant="blue" icon={ShieldCheck} onClick={() => onSuccess(verified)} style={{ justifyContent: 'center' }}>Continue to dashboard</Button>
            <button type="button" className="pa-btn" onClick={() => { window.google?.accounts?.id?.disableAutoSelect?.(); setVerified(null); }} style={{ background: 'none', border: 'none', color: t.subtext, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Use a different account</button>
          </div>
        )}

        {/* The Google button stays mounted (just hidden) once verified, so "Use a different account" can show it again. */}
        <div style={{ minHeight: 44, display: verified ? 'none' : 'flex', justifyContent: 'center', alignItems: 'center', opacity: signingIn ? 0.5 : 1, pointerEvents: signingIn ? 'none' : 'auto' }}>
          {!ready && !error && <Skeleton w={280} h={40} r={6} />}
          <div ref={btnRef} />
        </div>
        {signingIn && <p style={{ margin: 0, fontSize: 12, color: t.subtext, textAlign: 'center' }}>Verifying your account…</p>}

        <button type="button" onClick={onBack} className="pa-btn" style={{ background: 'none', border: 'none', color: t.subtext, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Back to site</button>
      </div>
    </div>
  );
}

/* ---------------------------------- SIDEBAR / HEADER ---------------------------------- */

function NavItem({ icon: Icon, label, count, active, onClick }) {
  return (
    <li onClick={onClick} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', background: active ? t.blueSoft : 'transparent', color: active ? t.blue : t.text }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = t.panel; }} onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      <Icon size={15} /><span style={{ fontSize: 13, fontWeight: active ? 700 : 500 }}>{label}</span>
      {count !== undefined && <span style={{ background: active ? '#fff' : t.blueSoft, color: t.blue, borderRadius: 6, padding: '2px 7px', fontSize: 10.5, fontWeight: 700 }}>{count}</span>}
    </li>
  );
}
function Sidebar({ section, go, counts, sidebarOpen, setSidebarOpen, adminEmail, onSignOut }) {
  const items = [
    { key: 'overview', icon: LayoutGrid, label: 'Overview' },
    { key: 'schools', icon: Building2, label: 'Schools', count: counts.schools },
    { key: 'admins', icon: UserCog, label: 'School admins', count: counts.admins },
    { key: 'announcements', icon: Megaphone, label: 'Announcements' },
    { key: 'activity', icon: Activity, label: 'Activity log' },
  ];
  return (
    <div style={{ width: 236, background: '#fff', borderRight: `1px solid ${t.border}`, padding: '20px 16px', display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0, position: sidebarOpen ? 'fixed' : undefined, left: 0, top: 0, zIndex: 70 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#fff', border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={esms} alt="ESMS" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div><span className="pa-heading" style={{ fontSize: 14, fontWeight: 700, color: t.text, display: 'block' }}>ESMS</span><span style={{ fontSize: 10, color: t.subtext }}>Platform control</span></div>
        </div>
        {sidebarOpen && <button onClick={() => setSidebarOpen(false)} aria-label="Close menu" style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.subtext, display: 'flex' }}><X size={18} /></button>}
      </div>
      <div style={{ background: t.panel, borderRadius: 9, padding: 12, display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${t.blue}`, flexShrink: 0 }}><ShieldCheck size={15} color={t.blue} /></div>
        <div style={{ minWidth: 0 }}>
          <p className="pa-heading" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{adminEmail || 'Platform Owner'}</p>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: t.blue, fontWeight: 600 }}>● Super admin</p>
        </div>
      </div>
      <ul className="pa-scroll" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' }}>
        {items.map(it => <NavItem key={it.key} icon={it.icon} label={it.label} count={it.count} active={section === it.key} onClick={() => { go(it.key); setSidebarOpen(false); }} />)}
        <div style={{ height: 1, background: t.border, margin: '7px 3px' }} />
        <NavItem icon={Settings} label="Platform settings" active={section === 'settings'} onClick={() => { go('settings'); setSidebarOpen(false); }} />
      </ul>
      <button onClick={onSignOut} className="pa-btn" style={{ display: 'grid', gridTemplateColumns: '20px 1fr', alignItems: 'center', gap: 10, marginTop: 8, padding: '9px 11px', borderRadius: 8, background: t.redSoft, color: t.red, border: 'none', cursor: 'pointer' }}><LogOut size={15} /><span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'left' }}>Sign out</span></button>
    </div>
  );
}
function Header({ setSidebarOpen, title, onRefresh, refreshing, live, notifCount, onNotifClick }) {
  return (
    <div style={{ height: 60, borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', gap: 12, background: '#fff', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="pa-hamburger" style={{ background: t.panel, border: 'none', borderRadius: 8, width: 34, height: 34, display: 'none', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text }}><Menu size={17} /></button>
        <h2 className="pa-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>{title}</h2>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span title={live ? 'Connected. New registrations appear instantly.' : 'Not connected. Use refresh to reload.'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: live ? t.green : t.faint }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: live ? t.green : t.faint }} />
          {live ? 'Live' : 'Offline'}
        </span>
        {onRefresh && (
          <button type="button" onClick={onRefresh} className="pa-btn" title="Refresh" aria-label="Refresh" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: t.panel, color: t.subtext, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={14} style={refreshing ? { animation: 'paSpin 0.8s linear infinite' } : undefined} />
          </button>
        )}
        <div style={{ position: 'relative' }}>
          <IconBtn icon={Bell} title={notifCount ? `${notifCount} new registration${notifCount === 1 ? '' : 's'}` : 'No new registrations'} onClick={onNotifClick} tone={notifCount ? 'orange' : 'default'} />
          {notifCount > 0 && (
            <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: t.red, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>{notifCount > 9 ? '9+' : notifCount}</span>
          )}
        </div>
      </div>
      <style>{`@keyframes paSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
function PageHead({ eyebrow, text }) { return <div><p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: t.blue }}>{eyebrow}</p><p style={{ margin: '3px 0 0', fontSize: 13, color: t.subtext }}>{text}</p></div>; }

/* ---------------------------------- OVERVIEW ---------------------------------- */

function Overview({ schools, go, loading }) {
  const pending = schools.filter(s => s.status === 'pending_review' || s.status === 'pending_payment').length;
  const active = schools.filter(s => s.status === 'active').length;
  const suspended = schools.filter(s => s.status === 'suspended').length;
  return (
    <div className="pa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHead eyebrow="PLATFORM OVERVIEW" text="Every school that has registered on the platform" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <StatMini icon={Building2} value={schools.length} label="Total schools" tone="blue" />
        <StatMini icon={CheckCircle2} value={active} label="Active" tone="green" />
        <StatMini icon={Clock} value={pending} label="Awaiting your review" tone="orange" />
        <StatMini icon={Ban} value={suspended} label="Suspended" tone="red" />
      </div>
      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p className="pa-heading" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text }}>Most recently registered</p>
          <button onClick={() => go('schools')} className="pa-btn" style={{ background: 'none', border: 'none', color: t.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>View all →</button>
        </div>
        {loading ? <Skeleton h={120} r={8} /> : schools.length === 0 ? (
          <p style={{ fontSize: 12.5, color: t.subtext, margin: 0 }}>No schools have registered yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {schools.slice(0, 5).map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: t.panel, borderRadius: 8, padding: '9px 12px', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Building2 size={14} color={t.blue} /><span style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>{s.name}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><StatusBadge status={s.status} /><span style={{ fontSize: 11, color: t.subtext }}>{fmtDate(s.createdAt)}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- SCHOOLS ---------------------------------- */

function SchoolDetailModal({ school, onClose, busy, actions }) {
  const isActive = school.status === 'active';
  const isRejected = school.status === 'rejected';
  const canApprove = !isActive;
  const canReject = !isActive && !isRejected;
  return (
    <Modal onClose={onClose} width={500}>
      <div style={{ padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h3 className="pa-heading" style={{ margin: 0, fontSize: 17, color: t.text }}>{school.name}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: t.subtext }}>{school.code} · Registered {fmtDate(school.createdAt)}</p>
          </div>
          <IconBtn icon={X} onClick={onClose} title="Close" />
        </div>

        <div style={{ margin: '14px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <StatusBadge status={school.status} />
          <PaymentBadge paid={school.paymentStatus} />
        </div>

        <div style={{ background: t.panel, borderRadius: 8, padding: 13, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: t.subtext }}>SCHOOL CONTACT (verified with Google)</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: t.text, display: 'flex', alignItems: 'center', gap: 6 }}><Mail size={12} /> {school.email}</p>
          {school.phone && <p style={{ margin: 0, fontSize: 12, color: t.text, display: 'flex', alignItems: 'center', gap: 6 }}><Phone size={12} /> {school.phone}</p>}
          {isActive && (
            <p style={{ margin: 0, fontSize: 12, color: t.subtext, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Send size={12} /> {school.codeSentAt ? `School code emailed ${fmtDateTime(school.codeSentAt)}` : 'School code has not been emailed yet'}
            </p>
          )}
        </div>

        {!school.paymentStatus && !isActive && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: t.orangeSoft, borderRadius: 8, padding: 11, marginBottom: 14 }}>
            <AlertCircle size={14} color={t.orange} style={{ marginTop: 1, flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 11.5, color: t.orange, lineHeight: 1.5 }}>Registration fee not confirmed. Mark this school as paid once you have received the payment, then approve it.</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="outline" icon={CreditCard} disabled={busy} onClick={() => actions.onTogglePaid(school)}>
            {school.paymentStatus ? 'Mark as unpaid' : 'Mark as paid'}
          </Button>
          {canApprove && <Button icon={CheckCircle2} disabled={busy || !school.paymentStatus} onClick={() => actions.onApprove(school)}>{busy ? 'Working…' : 'Approve school'}</Button>}
          {isActive && <Button variant="blue" icon={Mail} disabled={busy} onClick={() => actions.onSendCode(school)}>{busy ? 'Sending…' : school.codeSentAt ? 'Email code again' : 'Email code'}</Button>}
          {isActive && <Button variant="redSoft" icon={Ban} disabled={busy} onClick={() => actions.onSuspend(school)}>Suspend school</Button>}
          {canReject && <Button variant="soft" icon={XCircle} disabled={busy} onClick={() => actions.onReject(school)}>Reject</Button>}
        </div>

        <div style={{ height: 1, background: t.border, margin: '18px 0 14px' }} />
        <Button variant="redSoft" icon={Trash2} disabled={busy} onClick={() => actions.onDelete(school)}>Delete school</Button>
      </div>
    </Modal>
  );
}

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'pending_payment', label: 'Pending payment' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
];

function SchoolsPage({ schools, loading, onView, actions, busyId }) {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const needle = q.toLowerCase();
  const filtered = schools.filter(s =>
    (statusFilter === 'all' || s.status === statusFilter) &&
    ((s.name || '').toLowerCase().includes(needle) || (s.code || '').toLowerCase().includes(needle) || (s.email || '').toLowerCase().includes(needle))
  );
  return (
    <div className="pa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead eyebrow="SCHOOLS" text="Confirm payment, then approve newly registered schools so their admin can sign in" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search by name, code, or email…" />
        <Dropdown value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} icon={Filter} />
      </div>
      {loading ? <Skeleton h={220} r={10} /> : (
        <Table columns={['School', 'Code', 'Contact email', 'Payment', 'Status', 'Registered', 'Actions']} rows={filtered}
          empty={<EmptyState icon={Building2} title={schools.length === 0 ? 'No schools registered yet' : 'No matches'} text={schools.length === 0 ? 'Schools will appear here as soon as someone registers through the site.' : 'Try a different search or status filter.'} />}
          renderRow={(s) => (
            <tr key={s.id} className="pa-row" style={{ cursor: 'pointer' }} onClick={() => onView(s)}>
              <Td style={{ fontWeight: 700 }}>{s.name}</Td>
              <Td style={{ color: t.subtext }}>{s.code}</Td>
              <Td style={{ color: t.subtext }}>{s.email}</Td>
              <Td><PaymentBadge paid={s.paymentStatus} /></Td>
              <Td><StatusBadge status={s.status} /></Td>
              <Td>{fmtDate(s.createdAt)}</Td>
              <Td onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <IconBtn size={26} icon={CreditCard} tone={s.paymentStatus ? 'green' : 'orange'} disabled={busyId === s.id} onClick={() => actions.onTogglePaid(s)} title={s.paymentStatus ? 'Mark as unpaid' : 'Mark as paid'} />
                  {s.status !== 'active' && <IconBtn size={26} icon={CheckCircle2} tone="green" disabled={busyId === s.id || !s.paymentStatus} onClick={() => actions.onApprove(s)} title={s.paymentStatus ? 'Approve' : 'Mark as paid first'} />}
                  {s.status === 'active' && <IconBtn size={26} icon={Ban} tone="red" disabled={busyId === s.id} onClick={() => actions.onSuspend(s)} title="Suspend" />}
                </div>
              </Td>
            </tr>
          )} />
      )}
    </div>
  );
}

/* ---------------------------------- SCHOOL ADMINS ---------------------------------- */

function AdminsPage({ schools, loading }) {
  const [q, setQ] = useState('');
  const needle = q.toLowerCase();
  const activeSchools = schools.filter(s => s.status === 'active');
  const filtered = activeSchools.filter(s => (s.name || '').toLowerCase().includes(needle) || (s.email || '').toLowerCase().includes(needle));
  return (
    <div className="pa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead eyebrow="SCHOOL ADMINS" text="Each active school's admin is whoever verified its email with Google at registration" />
      <SearchBox value={q} onChange={setQ} placeholder="Search by school or email…" />
      {loading ? <Skeleton h={200} r={10} /> : (
        <Table columns={['School', 'Admin email', 'School code', 'Status']} rows={filtered}
          empty={<EmptyState icon={UserCog} title="No active school admins yet" text="Once you approve a school, its verified email becomes its admin login." />}
          renderRow={(s) => (
            <tr key={s.id} className="pa-row">
              <Td style={{ fontWeight: 600 }}>{s.name}</Td>
              <Td style={{ color: t.subtext }}>{s.email}</Td>
              <Td style={{ color: t.subtext }}>{s.code}</Td>
              <Td><StatusBadge status={s.status} /></Td>
            </tr>
          )} />
      )}
    </div>
  );
}

/* ---------------------------------- ANNOUNCEMENTS ---------------------------------- */

function AnnouncementComposer({ schools, onCancel, onSave }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState(['All schools']);
  const toggle = (s) => setAudience(a => { if (s === 'All schools') return ['All schools']; const next = a.filter(x => x !== 'All schools'); return next.includes(s) ? next.filter(x => x !== s) : [...next, s]; });
  const canSave = title.trim() && body.trim() && audience.length > 0;
  return (
    <Modal onClose={onCancel} width={500}>
      <div style={{ padding: 22 }}>
        <h3 className="pa-heading" style={{ margin: '0 0 4px', fontSize: 15.5, color: t.text }}>New platform announcement</h3>
        <p style={{ margin: '0 0 16px', fontSize: 11.5, color: t.subtext }}>Not sent to schools yet. Announcements are saved only in this browser.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance this weekend" /></Field>
          <Field label="Message"><textarea value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="Write your announcement…" style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 13, color: t.text, background: t.panel, outline: 'none', resize: 'vertical' }} /></Field>
          <Field label="Send to">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {['All schools', ...schools.map(s => s.name)].map(s => { const active = audience.includes(s); return <button key={s} type="button" onClick={() => toggle(s)} className="pa-btn" style={{ display: 'flex', alignItems: 'center', gap: 5, border: `1px solid ${active ? t.blue : t.border}`, background: active ? t.blueSoft : '#fff', color: active ? t.blue : t.text, borderRadius: 8, padding: '7px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{active ? <CheckCircle2 size={13} /> : <Circle size={13} color={t.faint} />} {s}</button>; })}
            </div>
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="blue" icon={Send} disabled={!canSave} onClick={() => onSave({ id: uid(), title: title.trim(), body: body.trim(), audience, postedAt: new Date().toISOString() })}>Save announcement</Button>
        </div>
      </div>
    </Modal>
  );
}

function AnnouncementsPage({ announcements, loading, onNew, onDelete }) {
  return (
    <div className="pa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <PageHead eyebrow="ANNOUNCEMENTS" text="Saved in this browser only. Not yet sent to schools by a backend" />
        <Button variant="blue" icon={Megaphone} onClick={onNew}>New announcement</Button>
      </div>
      {loading ? <Skeleton h={160} r={10} /> : announcements.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements yet" text="Draft a platform-wide update, e.g. maintenance windows or new features." action={<div style={{ marginTop: 10 }}><Button variant="blue" icon={Megaphone} onClick={onNew}>New announcement</Button></div>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {announcements.map(a => (
            <div key={a.id} style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 15 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <p className="pa-heading" style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: t.text }}>{a.title}</p>
                <IconBtn size={26} icon={Trash2} tone="red" onClick={() => onDelete(a)} title="Delete" />
              </div>
              <p style={{ margin: '6px 0 9px', fontSize: 12.5, color: t.subtext, lineHeight: 1.6 }}>{a.body}</p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{a.audience.map(s => <Badge key={s} bg={t.blueSoft} color={t.blue}>{s}</Badge>)}<span style={{ fontSize: 11, color: t.faint }}>· {fmtDate(a.postedAt)}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- ACTIVITY LOG ---------------------------------- */

function ActivityPage({ log }) {
  return (
    <div className="pa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead eyebrow="ACTIVITY LOG" text="Actions you've taken this session" />
      {log.length === 0 ? (
        <EmptyState icon={Activity} title="Nothing recorded yet" text="Approving, suspending, or updating a school will show up here." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: '8px 16px' }}>
          {log.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', gap: 12, padding: '11px 0', borderBottom: i === log.length - 1 ? 'none' : `1px solid ${t.border}` }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: t.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Activity size={14} color={t.blue} /></div>
              <div>
                <p style={{ margin: 0, fontSize: 12.5, color: t.text }}>{e.text}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: t.faint }}>{fmtDateTime(e.at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- SETTINGS ---------------------------------- */

function SettingsPage({ adminEmail, onTestEmail, testingEmail }) {
  return (
    <div className="pa-page-pad" style={{ padding: 22, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead eyebrow="PLATFORM SETTINGS" text="Global defaults applied across every school" />
      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="pa-heading" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 7 }}><ShieldCheck size={15} color={t.blue} /> Super admin account</p>
        <p style={{ margin: 0, fontSize: 12, color: t.subtext, lineHeight: 1.6 }}>Signed in as <b style={{ color: t.text }}>{adminEmail}</b>. To change the owner account, update <code>SUPERADMIN_EMAIL</code> in the server's .env file and restart the server.</p>
      </div>
      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="pa-heading" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 7 }}><Mail size={15} color={t.blue} /> Email delivery</p>
        <p style={{ margin: 0, fontSize: 12, color: t.subtext, lineHeight: 1.6 }}>School codes are emailed when you approve a school. Send yourself a test to check that your server's email settings work.</p>
        <div><Button variant="blue" icon={Send} disabled={testingEmail} onClick={onTestEmail}>{testingEmail ? 'Sending…' : `Send test email to me`}</Button></div>
      </div>
      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Platform name"><Input defaultValue="Easy Class" /></Field>
        <Field label="Support email"><Input defaultValue="support@easyclass.app" /></Field>
        <p style={{ margin: 0, fontSize: 11, color: t.subtext }}>Not wired to a backend yet. Changes here aren't saved.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button variant="blue" icon={Save} disabled>Save changes</Button></div>
      </div>
      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="pa-heading" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text, display: 'flex', alignItems: 'center', gap: 7 }}><CreditCard size={15} color={t.blue} /> Billing</p>
        <p style={{ margin: 0, fontSize: 12, color: t.subtext, lineHeight: 1.6 }}>Manage plan pricing and invoices from your billing provider dashboard.</p>
      </div>
    </div>
  );
}

/* ------------------------------------ MAIN COMPONENT ------------------------------------ */

export default function SuperAdminDashboard() {
  const navigate = useNavigate();

  const [session, setSession] = useState(readSession);
  const [loginNotice, setLoginNotice] = useState('');

  const [section, setSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [flash, setFlash] = useState(null);
  const go = (dest) => {
    setSection(dest);
    setFlash(null);
    if (dest === 'schools') setNotifCount(0);
  };

  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(() => !!readSession());
  const [busyId, setBusyId] = useState(null);
  const [live, setLive] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [testingEmail, setTestingEmail] = useState(false);

  const [announcements, setAnnouncements] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(ANNOUNCEMENTS_KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(announcements)); } catch { /* storage unavailable */ }
  }, [announcements]);

  const [log, setLog] = useState([]);
  const pushLog = (text) => setLog(l => [{ id: uid(), text, at: new Date().toISOString() }, ...l]);

  const [schoolDetail, setSchoolDetail] = useState(null);
  const [announcementModal, setAnnouncementModal] = useState(false);

  /* ---- session ---- */

  function handleLogin(newSession) {
    try { localStorage.setItem(SUPERADMIN_SESSION_KEY, JSON.stringify(newSession)); } catch { /* storage unavailable */ }
    setLoginNotice('');
    setFlash(null);
    setSchoolsLoading(true);
    setSession(newSession);
  }

  function endSession(notice = '') {
    try { localStorage.removeItem(SUPERADMIN_SESSION_KEY); } catch { /* storage unavailable */ }
    window.google?.accounts?.id?.disableAutoSelect?.();
    setSession(null);
    setSchools([]);
    setSchoolDetail(null);
    setSection('overview');
    setNotifCount(0);
    setLive(false);
    setLoginNotice(notice);
  }

  /* ---- API helper: sends the token, handles expiry, returns parsed JSON or throws ---- */

  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetchWithTimeout(`${API_BASE}/api/superadmin${path}`, {
        method,
        headers: {
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }, 60000);
    } catch (err) {
      throw new Error(err?.message?.includes('too long') ? err.message : 'Could not reach the server. Please check your connection.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      endSession(data.message || 'Your session expired. Please sign in again.');
      throw new Error(data.message || 'Your session expired.');
    }
    if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Something went wrong.');
    return data;
  }

  /* ---- schools ---- */

  async function fetchSchools() {
    if (!session?.token) return;
    setSchoolsLoading(true);
    try {
      const data = await api('/schools');
      setSchools(data.schools.map(mapSchool));
    } catch (err) {
      setFlash({ type: 'error', text: err.message });
    } finally {
      setSchoolsLoading(false);
    }
  }

  useEffect(() => {
    if (session?.token) fetchSchools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  function applyUpdate(raw) {
    const s = mapSchool(raw);
    setSchools(list => list.map(x => (x.id === s.id ? s : x)));
    setSchoolDetail(d => (d && d.id === s.id ? s : d));
    return s;
  }

  /* ---- live updates (Socket.IO): new registrations appear without refreshing ---- */

  useEffect(() => {
    if (!session?.token) return undefined;

    const socket = io(`${API_BASE}/superadmin`, {
      auth: { token: session.token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });

    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    socket.on('connect_error', (err) => {
      setLive(false);
      if (err?.message === 'unauthorized') endSession('Your session expired. Please sign in again.');
    });

    socket.on('school:registered', (raw) => {
      const s = mapSchool(raw);
      setSchools(list => (list.some(x => x.id === s.id) ? list.map(x => (x.id === s.id ? s : x)) : [s, ...list]));
      setNotifCount(n => n + 1);
      setFlash({ type: 'success', text: `New registration: "${s.name}" is waiting for review.` });
      pushLog(`New registration received: "${s.name}".`);
    });
    socket.on('school:updated', (raw) => applyUpdate(raw));
    socket.on('school:deleted', ({ id }) => {
      setSchools(list => list.filter(x => x.id !== id));
      setSchoolDetail(d => (d && d.id === id ? null : d));
    });

    // After a dropped connection, reload the list so nothing is missed.
    socket.io.on('reconnect', () => fetchSchools());

    return () => { socket.disconnect(); setLive(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  async function run(school, work) {
    setBusyId(school.id);
    setFlash(null);
    try {
      await work();
    } catch (err) {
      setFlash({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
    }
  }

  const actions = {
    onTogglePaid: (school) => run(school, async () => {
      const paid = !school.paymentStatus;
      const data = await api(`/schools/${school.id}/payment`, { method: 'PATCH', body: { paid } });
      applyUpdate(data.school);
      pushLog(`Marked "${school.name}" as ${paid ? 'paid' : 'unpaid'}.`);
    }),

    onApprove: (school) => run(school, async () => {
      if (!school.paymentStatus) throw new Error('Mark this school as paid before approving it.');
      const data = await api(`/schools/${school.id}/approve`, { method: 'POST' });
      applyUpdate(data.school);
      pushLog(`Approved "${school.name}".`);
      if (data.emailSent) {
        setFlash({ type: 'success', text: `"${school.name}" is approved and its school code was emailed to ${school.email}.` });
      } else if (data.emailError) {
        setFlash({ type: 'warn', text: `"${school.name}" is approved, but the code email failed: ${data.emailError} Open the school and press "Email code" to try again.` });
      } else {
        setFlash({ type: 'success', text: `"${school.name}" is approved.` });
      }
    }),

    onSuspend: (school) => {
      if (!window.confirm(`Suspend "${school.name}"?`)) return;
      return run(school, async () => {
        const data = await api(`/schools/${school.id}/suspend`, { method: 'POST' });
        applyUpdate(data.school);
        pushLog(`Suspended "${school.name}".`);
      });
    },

    onReject: (school) => {
      if (!window.confirm(`Reject the registration for "${school.name}"?`)) return;
      return run(school, async () => {
        const data = await api(`/schools/${school.id}/reject`, { method: 'POST' });
        applyUpdate(data.school);
        pushLog(`Rejected "${school.name}".`);
      });
    },

    onSendCode: (school) => run(school, async () => {
      const data = await api(`/schools/${school.id}/send-code`, { method: 'POST' });
      applyUpdate(data.school);
      pushLog(`Emailed the school code to "${school.name}".`);
      setFlash({ type: 'success', text: `School code emailed to ${school.email}.` });
    }),

    onDelete: (school) => {
      if (!window.confirm(`Permanently delete "${school.name}" and everything under it? This cannot be undone.`)) return;
      return run(school, async () => {
        await api(`/schools/${school.id}`, { method: 'DELETE' });
        setSchools(list => list.filter(x => x.id !== school.id));
        setSchoolDetail(null);
        pushLog(`Deleted "${school.name}".`);
      });
    },
  };

  async function handleTestEmail() {
    setTestingEmail(true);
    setFlash(null);
    try {
      const data = await api('/test-email', { method: 'POST', body: {} });
      setFlash({ type: 'success', text: `Test email sent to ${data.to}. Check the inbox (and spam folder).` });
      pushLog(`Sent a test email to ${data.to}.`);
    } catch (err) {
      setFlash({ type: 'error', text: `Test email failed: ${err.message}` });
    } finally {
      setTestingEmail(false);
    }
  }

  /* ---- render ---- */

  if (!session?.token) {
    return (
      <div className="pa-root" style={{ minHeight: '100vh', color: t.text }}>
        <GlobalStyle />
        <LoginScreen onSuccess={handleLogin} notice={loginNotice} onBack={() => navigate('/')} />
      </div>
    );
  }

  const counts = { schools: schools.length, admins: schools.filter(s => s.status === 'active').length };
  const titles = { overview: 'Overview', schools: 'Schools', admins: 'School Admins', announcements: 'Announcements', activity: 'Activity log', settings: 'Platform settings' };

  return (
    <div className="pa-root" style={{ minHeight: '100vh', color: t.text }}>
      <GlobalStyle />
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <div className="pa-sidebar-wrap" style={{ display: 'flex' }}>
          <Sidebar section={section} go={go} counts={counts} sidebarOpen={false} setSidebarOpen={() => {}} adminEmail={session.email} onSignOut={() => endSession()} />
        </div>
        {sidebarOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
            <div onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)' }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0 }}><Sidebar section={section} go={go} counts={counts} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} adminEmail={session.email} onSignOut={() => endSession()} /></div>
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Header setSidebarOpen={setSidebarOpen} title={titles[section]} onRefresh={fetchSchools} refreshing={schoolsLoading} live={live} notifCount={notifCount} onNotifClick={() => go('schools')} />
          <div className="pa-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {flash && <div className="pa-page-pad" style={{ padding: '16px 22px 0' }}><Flash flash={flash} onClose={() => setFlash(null)} /></div>}
            {section === 'overview' && <Overview schools={schools} go={go} loading={schoolsLoading} />}
            {section === 'schools' && (
              <SchoolsPage schools={schools} loading={schoolsLoading} busyId={busyId} onView={setSchoolDetail} actions={actions} />
            )}
            {section === 'admins' && <AdminsPage schools={schools} loading={schoolsLoading} />}
            {section === 'announcements' && <AnnouncementsPage announcements={announcements} loading={false} onNew={() => setAnnouncementModal(true)} onDelete={(a) => setAnnouncements(list => list.filter(x => x.id !== a.id))} />}
            {section === 'activity' && <ActivityPage log={log} />}
            {section === 'settings' && <SettingsPage adminEmail={session.email} onTestEmail={handleTestEmail} testingEmail={testingEmail} />}
          </div>
        </div>
      </div>

      {schoolDetail && (
        <SchoolDetailModal school={schoolDetail} onClose={() => setSchoolDetail(null)} busy={busyId === schoolDetail.id} actions={actions} />
      )}
      {announcementModal && <AnnouncementComposer schools={schools} onCancel={() => setAnnouncementModal(false)} onSave={(a) => { setAnnouncements(list => [a, ...list]); pushLog(`Saved announcement "${a.title}" (local only).`); setAnnouncementModal(false); }} />}
    </div>
  );
}