import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client'; // npm i socket.io-client
import {
  GraduationCap, Bell, Filter, Users, UserCog, LogOut, LayoutGrid,
  ClipboardCheck, Plus, Trash2, X, ChevronDown, Menu,
  Search, Ban, CheckCircle2, Save,
  Mail, ShieldCheck, Clock, AlertCircle, Layers, Download,
  ArrowUpCircle, CheckSquare, Square, BellOff, Activity,
} from 'lucide-react';

// Keep the deployed host as the default, but allow deployments to point this
// dashboard at the backend that actually contains /api/schooladmin.
const API_BASE = (import.meta.env?.VITE_API_BASE || 'https://easy-class-work-records.onrender.com').replace(/\/$/, '');
const API = `${API_BASE}/api/schooladmin`; // server.js: app.use("/api/schooladmin", ...)
const ADMIN_SESSION_KEY = 'ecw_admin_session'; // written by Home.jsx on login: { token, school }

const t = {
  bg: '#FFFFFF', panel: '#F7F8FA', border: '#E7E9EF',
  text: '#13151C', subtext: '#6B7280', faint: '#A1A7B3',
  green: '#0E9F6E', greenSoft: '#E7F8F1',
  blue: '#2A5CDB', blueSoft: '#EAF0FE',
  orange: '#EA5B0C', orangeSoft: '#FFEEE3',
  shimmer1: '#EEF0F4', shimmer2: '#F9FAFC',
};

const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };
const fmtRelative = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
};

/* The backend speaks camelCase; the UI below was written against snake_case.
   These two adapters translate once, at the edge, so the rest stays unchanged. */
const normClass = (c) => ({ ...c, display_name: c.name, created_at: c.createdAt });
const normMember = (m) => ({
  ...m,
  full_name: m.fullName, created_at: m.createdAt,
  class_combination_id: m.classId, class_name: m.className,
  student_number: `#${m.id}`,
  assignments: m.assignments || [],
});

const getAdminProfile = (session) => {
  const source = session?.user || session?.profile || session?.admin || session?.school?.admin || {};
  return {
    name: source.name || source.fullName || source.full_name || session?.school?.adminName || 'School administrator',
    email: source.email || source.emailAddress || session?.school?.adminEmail || '',
    image: source.picture || source.photoURL || source.photoUrl || source.avatar || source.image || source.imageUrl || '',
  };
};

function exportCsv(rows, cols, name) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.map(c => esc(c.label)).join(','), ...rows.map(r => cols.map(c => esc(c.get(r))).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${name}.csv`; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

/* ------------------------------ CLASS NAMING ------------------------------
   The backend stores one class NAME per class (unique per school), which is
   what teachers and students see when they pick a class. This form builds
   that name: "P3 A", "S2 B", "S4 PCB A", "S5 TVET L3", ...
   S4-S6 also take a pathway; the stream letter is optional there.
--------------------------------------------------------------------------- */
const EDUCATION_LEVELS = [
  { value: 'nursery', label: 'Nursery' },
  { value: 'primary', label: 'Primary' },
  { value: 'senior_lower', label: 'Senior (S1 – S3)' },
  { value: 'senior_upper', label: 'Senior (S4 – S6)' },
];
const LEVEL_CODES = {
  nursery: ['N1', 'N2', 'N3'],
  primary: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
  senior_lower: ['S1', 'S2', 'S3'],
  senior_upper: ['S4', 'S5', 'S6'],
};
const STREAM_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const UPPER_STREAM_OPTIONS = [
  { value: '', label: 'No stream — single class' },
  ...STREAM_LETTERS.map(l => ({ value: l, label: `Stream ${l}` })),
];
const PATHWAYS = [
  { value: 'tvet_l3', label: 'TVET — Level 3' },
  { value: 'tvet_l4', label: 'TVET — Level 4' },
  { value: 'tvet_l5', label: 'TVET — Level 5' },
  { value: 'arts_humanities', label: 'Arts & Humanities' },
  { value: 'math_science_1', label: 'Math & Science, stream 1 (Math, Physics, Geography, Economics)' },
  { value: 'math_science_2', label: 'Math & Science, stream 2 (Math, Physics, Chemistry, Biology)' },
  { value: 'university', label: 'University track' },
];
const PATHWAY_SHORT = {
  tvet_l3: 'TVET L3', tvet_l4: 'TVET L4', tvet_l5: 'TVET L5',
  arts_humanities: 'Arts & Humanities', math_science_1: 'MPG', math_science_2: 'PCB', university: 'University',
};

/* -------------------------------- PRIMITIVES -------------------------------- */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      .sa-root { font-family: 'Inter', system-ui, sans-serif; background:#fff; }
      .sa-heading { font-family: 'Poppins', system-ui, sans-serif; }
      @keyframes saShimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
      .sa-skel { background-image: linear-gradient(90deg, var(--s1) 0px, var(--s2) 40px, var(--s1) 80px); background-size: 600px 100%; animation: saShimmer 1.4s infinite linear; }
      @keyframes saFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      .sa-fade { animation: saFade .26s ease both; }
      .sa-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
      .sa-scroll::-webkit-scrollbar-thumb { background: #E7E9EF; border-radius: 8px; }
      .sa-btn { transition: transform .1s ease, background .15s ease, opacity .15s ease, border-color .15s ease; touch-action: manipulation; }
      .sa-btn:active { transform: scale(0.97); }
      .sa-row:hover { background: #F7F8FA; }
      input:focus, textarea:focus, select:focus { outline: 2px solid #2A5CDB55; outline-offset: 1px; }
      @media (max-width: 860px) {
        .sa-hamburger { display: flex !important; }
        .sa-sidebar-wrap { display: none !important; }
        .sa-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .sa-notif-panel { width: 92vw !important; right: -8px !important; }
      }
      @media (max-width: 480px) { .sa-page-pad { padding: 16px !important; } }
    `}</style>
  );
}

function Skeleton({ w = '100%', h = 14, r = 6 }) {
  return <div className="sa-skel" style={{ width: w, height: h, borderRadius: r, '--s1': t.shimmer1, '--s2': t.shimmer2 }} />;
}
function Badge({ children, bg, color }) {
  return <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{children}</span>;
}
function StatusBadge({ status }) {
  const map = {
    active: { bg: t.greenSoft, color: t.green, label: 'Active' },
    approved: { bg: t.greenSoft, color: t.green, label: 'Active' },
    suspended: { bg: t.orangeSoft, color: t.orange, label: 'Suspended' },
  };
  const c = map[status] || map.active;
  return <Badge bg={c.bg} color={c.color}>{c.label}</Badge>;
}
function IconBtn({ icon: Icon, onClick, tone = 'default', title, size = 30, disabled }) {
  const tones = { default: { bg: t.panel, color: t.subtext }, orange: { bg: t.orangeSoft, color: t.orange }, blue: { bg: t.blueSoft, color: t.blue }, green: { bg: t.greenSoft, color: t.green } };
  const c = tones[tone];
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className="sa-btn" style={{ width: size, height: size, borderRadius: 8, border: 'none', background: c.bg, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, flexShrink: 0 }}><Icon size={size * 0.46} /></button>;
}
function Button({ children, onClick, icon: Icon, variant = 'solid', disabled, style }) {
  const styles = {
    solid: { background: t.green, color: '#fff', border: 'none' },
    blue: { background: t.blue, color: '#fff', border: 'none' },
    soft: { background: t.orangeSoft, color: t.orange, border: 'none' },
    outline: { background: '#fff', color: t.text, border: `1px solid ${t.border}` },
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="sa-btn"
      style={{ ...styles[variant], padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', minHeight: 36, ...style }}>
      {Icon && <Icon size={14} />}{children}
    </button>
  );
}
function Field({ label, children, hint }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><label style={{ fontSize: 11, fontWeight: 700, color: t.subtext }}>{label}</label>{children}{hint && <p style={{ margin: 0, fontSize: 10.5, color: t.faint }}>{hint}</p>}</div>;
}
function Input(props) {
  return <input {...props} style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, color: t.text, background: t.panel, outline: 'none', width: '100%', ...(props.style || {}) }} />;
}
function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, color: t.text, background: t.panel, outline: 'none', width: '100%' }}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );
}
function Dropdown({ value, options, onChange, icon: Icon, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); } document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc); }, []);
  const current = options.find(o => (o.value ?? o) === value);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="sa-btn" style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 11px', fontSize: 12.5, fontWeight: 600, color: t.text, cursor: 'pointer' }}>
        {Icon && <Icon size={14} color={t.subtext} />}<span>{current?.label ?? current ?? placeholder ?? value}</span><ChevronDown size={13} color={t.subtext} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div className="sa-fade" style={{ position: 'absolute', top: '110%', left: 0, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 10px 24px rgba(18,20,28,0.12)', minWidth: 170, zIndex: 40, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
          {options.map(opt => {
            const val = opt.value ?? opt; const label = opt.label ?? opt;
            return <div key={val} onClick={() => { onChange(val); setOpen(false); }} style={{ padding: '9px 13px', fontSize: 12.5, cursor: 'pointer', color: val === value ? t.blue : t.text, fontWeight: val === value ? 700 : 500, background: val === value ? t.blueSoft : 'transparent' }}>{label}</div>;
          })}
        </div>
      )}
    </div>
  );
}
function ErrorBar({ error }) {
  if (!error) return null;
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: t.orangeSoft, borderRadius: 8, padding: '10px 13px', color: t.orange, fontSize: 12.5, fontWeight: 600 }}><AlertCircle size={15} /> {error}</div>;
}
function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="sa-fade" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '52px 20px', textAlign: 'center', gap: 5 }}>
      <div style={{ width: 50, height: 50, borderRadius: 10, background: t.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}><Icon size={22} color={t.green} /></div>
      <h3 className="sa-heading" style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: t.text }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 12.5, color: t.subtext, maxWidth: 300, lineHeight: 1.5 }}>{text}</p>
      {action}
    </div>
  );
}
function Modal({ children, onClose, width = 440 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,17,23,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="sa-fade sa-scroll" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', border: `1px solid ${t.border}` }}>{children}</div>
    </div>
  );
}
function ConfirmModal({ title, text, confirmLabel, onConfirm, onCancel, busy }) {
  return (
    <Modal onClose={onCancel} width={360}>
      <div style={{ padding: 22 }}>
        <h3 className="sa-heading" style={{ margin: '0 0 8px', fontSize: 15, color: t.text }}>{title}</h3>
        <p style={{ margin: '0 0 18px', fontSize: 12.5, color: t.subtext, lineHeight: 1.5 }}>{text}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="soft" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
function StatMini({ icon: Icon, value, label, tone = 'green' }) {
  const map = { green: { bg: t.greenSoft, fg: t.green }, blue: { bg: t.blueSoft, fg: t.blue }, orange: { bg: t.orangeSoft, fg: t.orange } };
  const c = map[tone];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 13px', flex: '1 1 148px' }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={14} color={c.fg} /></div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span className="sa-heading" style={{ fontSize: 16, fontWeight: 800, color: t.text }}>{value}</span>
        <span style={{ fontSize: 11, color: t.subtext, fontWeight: 600 }}>{label}</span>
      </div>
    </div>
  );
}
function SearchBox({ value, onChange, placeholder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: t.panel, border: `1px solid ${t.border}`, borderRadius: 8, padding: '5px 10px', minHeight: 34, boxSizing: 'border-box', flex: '1 1 200px', maxWidth: 320 }}>
      <Search size={14} color={t.subtext} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, lineHeight: '18px', color: t.text, width: '100%', padding: 0, minWidth: 0 }} />
    </div>
  );
}
function Table({ columns, rows, renderRow, empty }) {
  if (rows.length === 0) return empty;
  return (
    <div className="sa-table-wrap" style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
        <thead><tr style={{ background: t.panel }}>{columns.map(c => <th key={c} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700, color: t.subtext, letterSpacing: 0.4, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>{c}</th>)}</tr></thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}
const Td = ({ children, style }) => <td style={{ padding: '11px 14px', fontSize: 12.5, color: t.text, borderBottom: `1px solid ${t.border}`, verticalAlign: 'middle', ...style }}>{children}</td>;

/* ---------------------------------- NOTIFICATIONS ---------------------------------- */
// Fed by the live socket events in the dashboard (nothing to poll).

const NOTIF_ICON = { user_registered: Bell, user_approved: CheckCircle2, user_rejected: X, user_removed: Trash2, class_promoted: ArrowUpCircle };

function NotificationsBell({ items, onMarkAllRead }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); } document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc); }, []);
  const unread = items.filter(n => !n.read_at).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <IconBtn icon={Bell} title="Notifications" onClick={() => setOpen(o => !o)} />
        {unread > 0 && <span style={{ position: 'absolute', top: -3, right: -3, background: t.orange, color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 5, minWidth: 15, height: 15, padding: '0 3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread > 9 ? '9+' : unread}</span>}
      </div>
      {open && (
        <div className="sa-fade sa-notif-panel sa-scroll" style={{ position: 'absolute', top: '120%', right: 0, width: 320, maxHeight: 420, overflowY: 'auto', background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: '0 14px 32px rgba(18,20,28,0.14)', zIndex: 90 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${t.border}` }}>
            <p className="sa-heading" style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: t.text }}>Notifications</p>
            {unread > 0 && <button onClick={onMarkAllRead} className="sa-btn" style={{ background: 'none', border: 'none', color: t.blue, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Mark all read</button>}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '30px 16px', textAlign: 'center' }}>
              <BellOff size={20} color={t.faint} />
              <p style={{ margin: '8px 0 0', fontSize: 12, color: t.subtext }}>Nothing yet — new sign-ups and changes at your school show up here live.</p>
            </div>
          ) : items.map(n => {
            const Icon = NOTIF_ICON[n.type] || Bell;
            return (
              <div key={n.id} style={{ display: 'flex', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${t.border}`, background: n.read_at ? 'transparent' : t.blueSoft }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: '#fff', border: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={13} color={t.blue} /></div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, color: t.text, lineHeight: 1.4 }}>{n.message}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 10.5, color: t.faint }}>{fmtRelative(n.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- SIDEBAR / HEADER ---------------------------------- */

function NavItem({ icon: Icon, label, count, active, onClick }) {
  return (
    <li onClick={onClick} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', background: active ? t.greenSoft : 'transparent', color: active ? t.green : t.text }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = t.panel; }} onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      <Icon size={15} /><span style={{ fontSize: 13, fontWeight: active ? 700 : 500 }}>{label}</span>
      {count !== undefined && <span style={{ background: active ? '#fff' : t.blueSoft, color: active ? t.green : t.blue, borderRadius: 6, padding: '2px 7px', fontSize: 10.5, fontWeight: 700 }}>{count}</span>}
    </li>
  );
}
function Sidebar({ section, go, counts, sidebarOpen, setSidebarOpen, schoolName, adminProfile, onSignOut }) {
  const items = [
    { key: 'overview', icon: LayoutGrid, label: 'Overview' },
    { key: 'classes', icon: Layers, label: 'Classes', count: counts.classes },
    { key: 'teachers', icon: UserCog, label: 'Teachers', count: counts.teachers },
    { key: 'students', icon: Users, label: 'Students', count: counts.students },
    { key: 'approvals', icon: ClipboardCheck, label: 'Approvals', count: counts.approvals },
  ];
  return (
    <div style={{ width: 236, background: '#fff', borderRight: `1px solid ${t.border}`, padding: '20px 16px', display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0, position: sidebarOpen ? 'fixed' : undefined, left: 0, top: 0, zIndex: 70 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: t.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><GraduationCap size={15} color="#fff" /></div>
          <div><span className="sa-heading" style={{ fontSize: 14, fontWeight: 700, color: t.text, display: 'block' }}>Easy Class</span><span style={{ fontSize: 10, color: t.subtext }}>School admin</span></div>
        </div>
        {sidebarOpen && <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.subtext, display: 'flex' }}><X size={18} /></button>}
      </div>
      <div style={{ background: t.panel, borderRadius: 9, padding: 12, display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
        {adminProfile?.image ? <img src={adminProfile.image} alt="" referrerPolicy="no-referrer" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${t.blue}` }} onError={e => { e.currentTarget.style.display = 'none'; }} /> : <div style={{ width: 34, height: 34, borderRadius: '50%', background: t.blue, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{(adminProfile?.name || 'A').trim().charAt(0).toUpperCase()}</div>}
        <div style={{ minWidth: 0 }}>
          <p className="sa-heading" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{adminProfile?.name || 'School administrator'}</p>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: t.blue, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{adminProfile?.email || schoolName || 'School administrator'}</p>
        </div>
      </div>
      <ul className="sa-scroll" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' }}>
        {items.map(it => <NavItem key={it.key} icon={it.icon} label={it.label} count={it.count} active={section === it.key} onClick={() => { go(it.key); setSidebarOpen(false); }} />)}
      </ul>
      <button onClick={onSignOut} className="sa-btn" style={{ display: 'grid', gridTemplateColumns: '20px 1fr', alignItems: 'center', gap: 10, marginTop: 8, padding: '9px 11px', borderRadius: 8, background: t.orangeSoft, color: t.orange, border: 'none', cursor: 'pointer' }}><LogOut size={15} /><span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'left' }}>Sign Out</span></button>
    </div>
  );
}
function Header({ onNew, newLabel, setSidebarOpen, title, onExport, notifications, onMarkAllRead }) {
  return (
    <div style={{ minHeight: 60, borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', gap: 12, background: '#fff', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button onClick={() => setSidebarOpen(true)} className="sa-hamburger" style={{ background: t.panel, border: 'none', borderRadius: 8, width: 34, height: 34, display: 'none', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text }}><Menu size={17} /></button>
        <h2 className="sa-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>{title}</h2>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onExport && <Button variant="outline" icon={Download} onClick={onExport}>Export CSV</Button>}
        {onNew && <Button icon={Plus} onClick={onNew}>{newLabel}</Button>}
        <NotificationsBell items={notifications} onMarkAllRead={onMarkAllRead} />
      </div>
    </div>
  );
}
function PageHead({ eyebrow, text }) {
  return <div><p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: t.green }}>{eyebrow}</p><p style={{ margin: '3px 0 0', fontSize: 13, color: t.subtext }}>{text}</p></div>;
}

/* ---------------------------------- OVERVIEW ---------------------------------- */

function Overview({ counts, approvals, teachers, go, error, activity }) {
  const recentTeachers = [...teachers].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
  return (
    <div className="sa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHead eyebrow="OVERVIEW" text="A snapshot of your school right now" />
      <ErrorBar error={error} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <StatMini icon={Layers} value={counts.classes} label="Classes" tone="blue" />
        <StatMini icon={UserCog} value={counts.teachers} label="Teachers" tone="green" />
        <StatMini icon={Users} value={counts.students} label="Students" tone="blue" />
        <StatMini icon={ClipboardCheck} value={counts.approvals} label="Pending approvals" tone="orange" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p className="sa-heading" style={{ margin: 0, fontSize: 13, color: t.text }}>Recent teachers</p><UserCog size={16} color={t.green} />
          </div>
          {recentTeachers.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: t.subtext }}>No approved teachers yet.</p> : recentTeachers.map(tc => (
            <div key={tc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${t.border}` }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: tc.status === 'suspended' ? t.orange : t.green }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{tc.full_name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, color: t.subtext }}>{fmtRelative(tc.created_at)}</span>
            </div>
          ))}
        </div>
        <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Activity size={16} color={t.blue} /><p className="sa-heading" style={{ margin: 0, fontSize: 13, color: t.text }}>Live activity</p></div>
          {activity.length === 0 ? <p style={{ margin: 0, fontSize: 12, color: t.subtext }}>Nothing yet — sign-ups and changes appear here as they happen.</p> : activity.slice(0, 6).map(item => (
            <div key={item.id} style={{ padding: '7px 0', borderBottom: `1px solid ${t.border}` }}><p style={{ margin: 0, fontSize: 12, color: t.text }}>{item.message}</p><p style={{ margin: '2px 0 0', fontSize: 10.5, color: t.faint }}>{fmtRelative(item.created_at)}</p></div>
          ))}
        </div>
      </div>
      {approvals.length > 0 && (
        <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p className="sa-heading" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text }}>Needs your review</p>
            <button onClick={() => go('approvals')} className="sa-btn" style={{ background: 'none', border: 'none', color: t.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>View all →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {approvals.slice(0, 3).map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: t.panel, borderRadius: 8, padding: '9px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Badge bg={t.blueSoft} color={t.blue}>{a.role}</Badge>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>{a.full_name}</span>
                </div>
                <span style={{ fontSize: 11, color: t.subtext }}>{fmtDate(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- CLASSES ---------------------------------- */

function ClassFormModal({ onCancel, onSave, saving }) {
  const [educationLevel, setEducationLevel] = useState('primary');
  const [levelCode, setLevelCode] = useState(LEVEL_CODES.primary[0]);
  const [stream, setStream] = useState('A');
  const [pathway, setPathway] = useState(PATHWAYS[0].value);

  const isUpper = educationLevel === 'senior_upper';

  function changeLevel(lvl) {
    setEducationLevel(lvl);
    setLevelCode(LEVEL_CODES[lvl][0]);
    setStream(lvl === 'senior_upper' ? '' : 'A'); // S4-S6 pathways may be a single class
  }

  const preview = isUpper
    ? `${levelCode} ${PATHWAY_SHORT[pathway]}${stream ? ` ${stream}` : ''}`
    : `${levelCode} ${stream}`;
  const canSave = !!levelCode && (isUpper ? !!pathway : !!stream);

  return (
    <Modal onClose={onCancel} width={480}>
      <div style={{ padding: 22 }}>
        <h3 className="sa-heading" style={{ margin: '0 0 4px', fontSize: 15.5, color: t.text }}>Add a class</h3>
        <p style={{ margin: '0 0 16px', fontSize: 11.5, color: t.subtext }}>
          Every level can be split into stream sections A–Z. S4–S6 also picks a pathway; leave the stream as
          "No stream" if that pathway is only a single class. Teachers and students see the name below.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Education level"><Select value={educationLevel} onChange={changeLevel} options={EDUCATION_LEVELS} /></Field>
          <Field label="Level"><Select value={levelCode} onChange={setLevelCode} options={LEVEL_CODES[educationLevel]} /></Field>
          {isUpper && <Field label="Pathway"><Select value={pathway} onChange={setPathway} options={PATHWAYS} /></Field>}
          <Field label={isUpper ? 'Stream (optional)' : 'Stream'} hint={isUpper ? 'Add a letter only if this pathway is split into multiple classes.' : undefined}>
            <Select value={stream} onChange={setStream} options={isUpper ? UPPER_STREAM_OPTIONS : STREAM_LETTERS} />
          </Field>
          <div style={{ background: t.panel, borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: t.text }}>Will show as: <strong>{preview}</strong></div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button icon={Save} disabled={!canSave || saving} onClick={() => onSave({ name: preview })}>{saving ? 'Saving…' : 'Add class'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ClassesPage({ classes, loading, error, onAdd, onDelete }) {
  return (
    <div className="sa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead eyebrow="CLASSES" text="Every class your school offers — teachers and students pick from this list" />
      <ErrorBar error={error} />
      {loading ? <Skeleton h={200} r={10} /> : classes.length === 0 ? (
        <EmptyState icon={Layers} title="No classes yet" text="Add your first class (e.g. S4 PCB or P3 A) so teachers and students can pick it." action={<div style={{ marginTop: 10 }}><Button icon={Plus} onClick={onAdd}>Add class</Button></div>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
          {classes.map(c => (
            <div key={c.id} style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h4 className="sa-heading" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text }}>{c.display_name}</h4>
                <IconBtn size={26} icon={Trash2} tone="orange" onClick={() => onDelete(c)} title="Delete" />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Badge bg={t.blueSoft} color={t.blue}>{c.studentCount} student{c.studentCount === 1 ? '' : 's'}</Badge>
                <Badge bg={t.greenSoft} color={t.green}>{c.teacherCount} teacher{c.teacherCount === 1 ? '' : 's'}</Badge>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: t.subtext }}>Created {fmtDate(c.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- APPROVALS ---------------------------------- */

function ApproveModal({ approval, classes, onCancel, onApprove, busy }) {
  const isStudent = approval.role === 'student';
  const [classId, setClassId] = useState('');
  const [assignments, setAssignments] = useState([{ classCombinationId: '', subject: '' }]);

  const classOptions = classes.map(c => ({ value: c.id, label: c.display_name }));
  const updateAssignment = (idx, patch) => setAssignments(list => list.map((a, i) => i === idx ? { ...a, ...patch } : a));
  const addAssignmentRow = () => setAssignments(list => [...list, { classCombinationId: '', subject: '' }]);
  const removeAssignmentRow = (idx) => setAssignments(list => list.filter((_, i) => i !== idx));

  // Class / subjects are optional (people can add their own after signing in),
  // but a half-filled row would be silently dropped, so block that.
  const canSubmit = isStudent || assignments.every(a => (!a.classCombinationId && !a.subject.trim()) || (a.classCombinationId && a.subject.trim()));

  return (
    <Modal onClose={onCancel} width={480}>
      <div style={{ padding: 22 }}>
        <h3 className="sa-heading" style={{ margin: '0 0 4px', fontSize: 15.5, color: t.text }}>Approve {approval.full_name}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 11.5, color: t.subtext }}>{approval.email} · requested as {isStudent ? 'student' : 'teacher'}</p>

        {isStudent ? (
          <Field label="Class (optional)" hint="Leave empty and the student will choose their own class after signing in.">
            <Select value={classId} onChange={setClassId} options={[{ value: '', label: 'No class yet' }, ...classOptions]} />
          </Field>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: t.subtext }}>CLASSES &amp; SUBJECTS TAUGHT (OPTIONAL)</p>
            {assignments.map((a, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1.2 }}>
                  <Select value={a.classCombinationId} onChange={(v) => updateAssignment(idx, { classCombinationId: v })} options={[{ value: '', label: 'Class' }, ...classOptions]} />
                </div>
                <div style={{ flex: 1 }}>
                  <Input value={a.subject} onChange={e => updateAssignment(idx, { subject: e.target.value })} placeholder="Subject" />
                </div>
                {assignments.length > 1 && <IconBtn size={34} icon={X} tone="orange" onClick={() => removeAssignmentRow(idx)} title="Remove" />}
              </div>
            ))}
            <button type="button" onClick={addAssignmentRow} className="sa-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: t.green, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: '3px 0', width: 'fit-content' }}>
              <Plus size={13} /> Add another class/subject
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            icon={CheckCircle2} disabled={!canSubmit || busy}
            onClick={() => onApprove(isStudent ? { classCombinationId: classId } : { assignments: assignments.filter(a => a.classCombinationId && a.subject.trim()) })}
          >
            {busy ? 'Approving…' : 'Approve'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ApprovalsPage({ approvals, classes, loading, error, onApprove, onReject, busyId }) {
  const [approveTarget, setApproveTarget] = useState(null);
  return (
    <div className="sa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead eyebrow="APPROVALS" text="New teacher and student sign-ups wait here until you approve them" />
      <ErrorBar error={error} />
      {loading ? <Skeleton h={160} r={10} /> : approvals.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="All caught up" text="New teacher or student sign-up requests will show up here for your review." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {approvals.map(a => (
            <div key={a.id} style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: t.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mail size={16} color={t.blue} /></div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text }}>{a.full_name} <Badge bg={t.orangeSoft} color={t.orange}>{a.role}</Badge></p>
                  <p style={{ margin: '3px 0 0', fontSize: 11.5, color: t.subtext, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={11} /> Requested {fmtDate(a.created_at)} · {a.email}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <Button variant="outline" icon={X} disabled={busyId === a.id} onClick={() => onReject(a)}>Reject</Button>
                <Button icon={CheckCircle2} disabled={busyId === a.id} onClick={() => setApproveTarget(a)}>Approve</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {approveTarget && (
        <ApproveModal
          approval={approveTarget} classes={classes} busy={busyId === approveTarget.id}
          onCancel={() => setApproveTarget(null)}
          onApprove={(payload) => onApprove(approveTarget, payload).then(ok => { if (ok) setApproveTarget(null); })}
        />
      )}
    </div>
  );
}

/* ---------------------------------- TEACHERS ---------------------------------- */

function AddAssignmentModal({ teacher, classes, onCancel, onSave }) {
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  return (
    <Modal onClose={onCancel} width={380}>
      <div style={{ padding: 22 }}>
        <h3 className="sa-heading" style={{ margin: '0 0 4px', fontSize: 15, color: t.text }}>Add a class for {teacher.full_name}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          <Field label="Class"><Select value={classId} onChange={setClassId} options={[{ value: '', label: 'Choose a class' }, ...classes.map(c => ({ value: c.id, label: c.display_name }))]} /></Field>
          <Field label="Subject"><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Mathematics" /></Field>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button icon={Save} disabled={!classId || !subject.trim()} onClick={() => onSave({ classId, subject: subject.trim() })}>Add</Button>
        </div>
      </div>
    </Modal>
  );
}

function TeachersPage({ teachers, classes, loading, error, onToggleStatus, onDelete, onAddAssignment }) {
  const [q, setQ] = useState('');
  const [addingFor, setAddingFor] = useState(null);
  const filtered = teachers.filter(tc => tc.full_name.toLowerCase().includes(q.toLowerCase()) || tc.email.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="sa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead eyebrow="TEACHERS" text="Teachers sign up with Google — approve requests, then manage their classes here" />
      <ErrorBar error={error} />
      <SearchBox value={q} onChange={setQ} placeholder="Search teachers…" />
      {loading ? <Skeleton h={200} r={10} /> : (
        <Table columns={['Name', 'Email', 'Classes & subjects', 'Status', 'Actions']} rows={filtered}
          empty={<EmptyState icon={UserCog} title={teachers.length === 0 ? 'No teachers yet' : 'No matches'} text={teachers.length === 0 ? 'Teachers will appear here once they sign up with Google and you approve their request.' : 'Try a different search term.'} />}
          renderRow={(tc) => (
            <tr key={tc.id} className="sa-row">
              <Td style={{ fontWeight: 600 }}>{tc.full_name}</Td>
              <Td style={{ color: t.subtext }}>{tc.email}</Td>
              <Td>
                {tc.assignments.length === 0 ? <span style={{ color: t.faint }}>None</span> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {tc.assignments.map((a, i) => <Badge key={a.id || i} bg={t.blueSoft} color={t.blue}>{a.className} · {a.subject}</Badge>)}
                  </div>
                )}
              </Td>
              <Td><StatusBadge status={tc.status} /></Td>
              <Td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <IconBtn size={26} icon={Plus} tone="blue" onClick={() => setAddingFor(tc)} title="Add class" />
                  <IconBtn size={26} icon={tc.status === 'suspended' ? CheckCircle2 : Ban} tone="orange" onClick={() => onToggleStatus(tc)} title={tc.status === 'suspended' ? 'Reactivate' : 'Suspend'} />
                  <IconBtn size={26} icon={Trash2} tone="orange" onClick={() => onDelete(tc)} title="Remove" />
                </div>
              </Td>
            </tr>
          )} />
      )}
      {addingFor && (
        <AddAssignmentModal
          teacher={addingFor} classes={classes}
          onCancel={() => setAddingFor(null)}
          onSave={(payload) => onAddAssignment(addingFor, payload).then(ok => { if (ok) setAddingFor(null); })}
        />
      )}
    </div>
  );
}

/* ---------------------------------- PROMOTE ---------------------------------- */

function PromoteModal({ classes, count, onCancel, onConfirm, busy }) {
  const [toClassId, setToClassId] = useState('');
  return (
    <Modal onClose={onCancel} width={400}>
      <div style={{ padding: 22 }}>
        <h3 className="sa-heading" style={{ margin: '0 0 4px', fontSize: 15.5, color: t.text }}>Promote {count} student{count === 1 ? '' : 's'}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 11.5, color: t.subtext }}>Choose the class they should move into — e.g. S5, or a specific S4 pathway.</p>
        <Field label="Destination class">
          <Select value={toClassId} onChange={setToClassId} options={[{ value: '', label: 'Choose a class' }, ...classes.map(c => ({ value: c.id, label: c.display_name }))]} />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button icon={ArrowUpCircle} disabled={!toClassId || busy} onClick={() => onConfirm(toClassId)}>{busy ? 'Promoting…' : 'Promote'}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------- STUDENTS ---------------------------------- */

function StudentsPage({ students, classes, loading, error, onToggleStatus, onDelete, onMoveClass, onPromote }) {
  const [q, setQ] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const filtered = students.filter(s =>
    (classFilter === 'all' || String(s.class_combination_id) === String(classFilter)) &&
    s.full_name.toLowerCase().includes(q.toLowerCase())
  );
  const classOptions = [{ value: 'all', label: 'All classes' }, ...classes.map(c => ({ value: c.id, label: c.display_name }))];

  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selected.has(s.id));
  const toggleOne = (id) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAllFiltered = () => setSelected(prev => {
    const next = new Set(prev);
    if (allFilteredSelected) filtered.forEach(s => next.delete(s.id)); else filtered.forEach(s => next.add(s.id));
    return next;
  });

  async function confirmPromote(toClassId) {
    setPromoting(true);
    const ok = await onPromote([...selected], toClassId);
    setPromoting(false);
    if (ok) { setPromoteOpen(false); setSelected(new Set()); }
  }

  return (
    <div className="sa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead eyebrow="STUDENTS" text="Students sign up with Google — approve requests, then manage their class here" />
      <ErrorBar error={error} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search students…" />
        <Dropdown value={classFilter} options={classOptions} onChange={setClassFilter} icon={Filter} />
        {selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', background: t.blueSoft, borderRadius: 8, padding: '6px 6px 6px 12px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: t.blue }}>{selected.size} selected</span>
            <Button variant="blue" icon={ArrowUpCircle} onClick={() => setPromoteOpen(true)}>Promote</Button>
          </div>
        )}
      </div>
      {loading ? <Skeleton h={200} r={10} /> : filtered.length === 0 ? (
        <EmptyState icon={Users} title={students.length === 0 ? 'No students yet' : 'No matches'} text={students.length === 0 ? 'Students will appear here once they sign up with Google and you approve their request.' : 'Try a different filter or search term.'} />
      ) : (
        <div className="sa-table-wrap" style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: t.panel }}>
                <th style={{ padding: '10px 14px', borderBottom: `1px solid ${t.border}`, width: 30 }}>
                  <button onClick={toggleAllFiltered} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: allFilteredSelected ? t.blue : t.faint }}>
                    {allFilteredSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
                {['Name', 'Student ID', 'Email', 'Class', 'Status', 'Actions'].map(c => <th key={c} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700, color: t.subtext, letterSpacing: 0.4, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="sa-row">
                  <Td>
                    <button onClick={() => toggleOne(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: selected.has(s.id) ? t.blue : t.faint }}>
                      {selected.has(s.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </Td>
                  <Td style={{ fontWeight: 600 }}>{s.full_name}</Td>
                  <Td style={{ color: t.subtext, fontFamily: 'monospace' }}>{s.student_number}</Td>
                  <Td style={{ color: t.subtext }}>{s.email}</Td>
                  <Td>
                    <div style={{ minWidth: 130 }}>
                      <Dropdown
                        value={s.class_combination_id || ''}
                        options={classes.map(c => ({ value: c.id, label: c.display_name }))}
                        onChange={(classId) => onMoveClass(s, classId)}
                        placeholder={s.class_name || 'Unassigned'}
                      />
                    </div>
                  </Td>
                  <Td><StatusBadge status={s.status} /></Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <IconBtn size={26} icon={s.status === 'suspended' ? CheckCircle2 : Ban} tone="orange" onClick={() => onToggleStatus(s)} title={s.status === 'suspended' ? 'Reactivate' : 'Suspend'} />
                      <IconBtn size={26} icon={Trash2} tone="orange" onClick={() => onDelete(s)} title="Remove" />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {promoteOpen && (
        <PromoteModal classes={classes} count={selected.size} busy={promoting} onCancel={() => setPromoteOpen(false)} onConfirm={confirmPromote} />
      )}
    </div>
  );
}

/* ------------------------------------ APP ------------------------------------ */

export default function SchoolAdminDashboard() {
  const navigate = useNavigate();

  const [session, setSession] = useState(undefined);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADMIN_SESSION_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      setSession(parsed?.token ? parsed : null);
    } catch { setSession(null); }
  }, []);
  useEffect(() => { if (session === null) navigate('/home', { replace: true }); }, [session, navigate]);

  const authHeader = () => (session?.token ? { Authorization: `Bearer ${session.token}` } : {});
  const adminProfile = getAdminProfile(session);

  const [section, setSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const go = (dest) => setSection(dest);

  const [classes, setClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError] = useState('');
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [classSaving, setClassSaving] = useState(false);
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(null);

  const [approvals, setApprovals] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [approvalsError, setApprovalsError] = useState('');
  const [approvalBusyId, setApprovalBusyId] = useState(null);

  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(true);
  const [teachersError, setTeachersError] = useState('');

  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState('');

  const [confirmRemove, setConfirmRemove] = useState(null); // { kind: 'teacher'|'student', item }
  const [feed, setFeed] = useState([]);                     // live notifications

  /* ---- one place that talks to the API ---- */
  async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API}${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeader() },
    });
    if (res.status === 401) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      navigate('/home', { replace: true });
      throw new Error('Your session expired. Please sign in again.');
    }
    let data;
    try { data = await res.json(); } catch { throw new Error(`Unexpected server response (${res.status}). Is /api/schooladmin deployed on the backend?`); }
    if (!res.ok || !data.success) {
      if (res.status === 404 && /No route for/i.test(String(data.message || data.error || ''))) {
        throw new Error('The deployed backend has not mounted /api/schooladmin. Deploy the School admin router, or set VITE_API_BASE to the correct backend URL.');
      }
      throw new Error(data.message || data.error || 'Something went wrong.');
    }
    return data;
  }
  async function load(path, setLoading, setError, onData, silent) {
    if (!silent) setLoading(true);
    try { onData(await call(path)); setError(''); }
    catch (e) { setError(e.message === 'Failed to fetch' ? 'Could not reach the server. Check your connection.' : e.message); }
    finally { setLoading(false); }
  }

  const fetchClasses   = (s) => load('/classes',   setClassesLoading,   setClassesError,   d => setClasses(d.classes.map(normClass)), s);
  const fetchApprovals = (s) => load('/approvals', setApprovalsLoading, setApprovalsError, d => setApprovals(d.approvals.map(normMember)), s);
  const fetchTeachers  = (s) => load('/teachers',  setTeachersLoading,  setTeachersError,  d => setTeachers(d.teachers.map(normMember)), s);
  const fetchStudents  = (s) => load('/students',  setStudentsLoading,  setStudentsError,  d => setStudents(d.students.map(normMember)), s);
  const refreshAll = () => { fetchClasses(true); fetchApprovals(true); fetchTeachers(true); fetchStudents(true); };

  useEffect(() => {
    if (!session?.token) return;
    fetchClasses(); fetchApprovals(); fetchTeachers(); fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  /* ---- realtime: same Socket.IO namespace teachers/students use ---- */
  const refreshRef = useRef(refreshAll);
  refreshRef.current = refreshAll;
  useEffect(() => {
    if (!session?.token) return;
    const socket = io(`${API_BASE}/classroom`, { auth: { token: session.token }, transports: ['websocket', 'polling'] });
    let timer = null;
    const scheduleRefresh = () => { clearTimeout(timer); timer = setTimeout(() => refreshRef.current(), 300); };
    const push = (type, message) => setFeed(f => [{ id: `${Date.now()}-${Math.random()}`, type, message, created_at: new Date().toISOString(), read_at: null }, ...f].slice(0, 30));
    const on = (event, type, text) => socket.on(event, (p) => { if (text) push(type, text(p || {})); scheduleRefresh(); });

    on('member:registered',  'user_registered', p => `${p.fullName || 'Someone'} signed up as a ${p.role || 'member'} — waiting for approval`);
    on('member:approved',    'user_approved',   p => `${p.fullName || 'A'} ${p.role ? `(${p.role})` : 'member'} was approved`);
    on('member:rejected',    'user_rejected',   p => `${p.fullName || 'A'} ${p.role ? `(${p.role})` : 'request'} was rejected`);
    on('member:removed',     'user_removed',    p => `A ${p.role || 'member'} was removed`);
    on('member:updated',     'class_promoted',  p => (p.promoted ? `${p.promoted} student${p.promoted === 1 ? '' : 's'} promoted` : null));
    on('member:classChosen', 'class_promoted',  p => `${p.fullName || 'A student'} chose ${p.className || 'a class'}`);
    on('class:created',      'user_registered', p => `Class ${p.name || ''} was created`);
    on('class:deleted',      'user_removed',    p => `Class ${p.name || ''} was deleted`);
    // member:updated with no text still needs to refresh; handled by `on` (text may return null)

    return () => { clearTimeout(timer); socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const markAllRead = () => setFeed(f => f.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));

  /* ---- actions: run the request, show the error, then refresh everything ---- */
  const run = (setErr) => async (fn) => {
    try { await fn(); setErr(''); refreshAll(); return true; }
    catch (e) { setErr(e.message); return false; }
  };

  const createClass = async (p) => {
    setClassSaving(true);
    const ok = await run(setClassesError)(() => call('/classes', { method: 'POST', body: { name: p.name } }));
    setClassSaving(false);
    if (ok) setClassModalOpen(false);
  };
  const deleteClass = async (c) => {
    await run(setClassesError)(() => call(`/classes/${c.id}`, { method: 'DELETE' }));
    setConfirmDeleteClass(null);
  };

  const approveRequest = async (a, p) => {
    setApprovalBusyId(a.id);
    const body = a.role === 'student'
      ? { classId: p.classCombinationId || undefined }
      : { assignments: p.assignments.map(x => ({ classId: x.classCombinationId, subject: x.subject.trim() })) };
    const ok = await run(setApprovalsError)(() => call(`/approvals/${a.id}/approve`, { method: 'POST', body }));
    setApprovalBusyId(null);
    return ok;
  };
  const rejectRequest = async (a) => {
    setApprovalBusyId(a.id);
    await run(setApprovalsError)(() => call(`/approvals/${a.id}/reject`, { method: 'POST' }));
    setApprovalBusyId(null);
  };

  const toggleTeacherStatus = (tc) => run(setTeachersError)(() => call(`/teachers/${tc.id}/status`, { method: 'PATCH', body: { status: tc.status === 'suspended' ? 'active' : 'suspended' } }));
  const toggleStudentStatus = (s) => run(setStudentsError)(() => call(`/students/${s.id}/status`, { method: 'PATCH', body: { status: s.status === 'suspended' ? 'active' : 'suspended' } }));
  const addTeacherAssignment = (tc, p) => run(setTeachersError)(() => call(`/teachers/${tc.id}/assignments`, { method: 'POST', body: p }));
  const moveStudentClass = (s, classId) => run(setStudentsError)(() => call(`/students/${s.id}/class`, { method: 'PATCH', body: { classId } }));
  const promoteStudents = (studentIds, toClassId) => run(setStudentsError)(() => call('/promote-students', { method: 'POST', body: { studentIds, toClassId } }));
  const removeUser = async (kind, item) => {
    await run(kind === 'teacher' ? setTeachersError : setStudentsError)(() => call(`/${kind}s/${item.id}`, { method: 'DELETE' }));
    setConfirmRemove(null);
  };

  function handleSignOut() {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    navigate('/home', { replace: true });
  }

  const counts = { classes: classes.length, teachers: teachers.length, students: students.length, approvals: approvals.length };
  const titles = { overview: 'Overview', classes: 'Classes', teachers: 'Teachers', students: 'Students', approvals: 'Approvals' };
  const newAction = { classes: () => setClassModalOpen(true) }[section];
  const newLabel = { classes: 'Add class' }[section];
  const exportAction = {
    classes: () => exportCsv(classes, [
      { label: 'Class', get: c => c.display_name }, { label: 'Students', get: c => c.studentCount }, { label: 'Teachers', get: c => c.teacherCount },
    ], 'classes'),
    teachers: () => exportCsv(teachers, [
      { label: 'Name', get: x => x.full_name }, { label: 'Email', get: x => x.email }, { label: 'Status', get: x => x.status },
      { label: 'Classes & subjects', get: x => x.assignments.map(a => `${a.className} (${a.subject})`).join('; ') },
    ], 'teachers'),
    students: () => exportCsv(students, [
      { label: 'Name', get: x => x.full_name }, { label: 'Student ID', get: x => x.student_number }, { label: 'Email', get: x => x.email },
      { label: 'Class', get: x => x.class_name }, { label: 'Status', get: x => x.status },
    ], 'students'),
  }[section];

  if (session === undefined || session === null) {
    return <div className="sa-root" style={{ minHeight: '100vh' }}><GlobalStyle /></div>;
  }

  return (
    <div className="sa-root" style={{ minHeight: '100vh', color: t.text }}>
      <GlobalStyle />
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <div className="sa-sidebar-wrap" style={{ display: 'flex' }}>
          <Sidebar section={section} go={go} counts={counts} sidebarOpen={false} setSidebarOpen={() => {}} schoolName={session.school?.name} adminProfile={adminProfile} onSignOut={handleSignOut} />
        </div>
        {sidebarOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
            <div onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,17,23,0.45)' }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0 }}><Sidebar section={section} go={go} counts={counts} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} schoolName={session.school?.name} adminProfile={adminProfile} onSignOut={handleSignOut} /></div>
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Header onNew={newAction} newLabel={newLabel} setSidebarOpen={setSidebarOpen} title={titles[section]} onExport={exportAction} notifications={feed} onMarkAllRead={markAllRead} />
          <div className="sa-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {section === 'overview' && <Overview counts={counts} approvals={approvals} teachers={teachers} go={go} error={classesError || approvalsError || teachersError || studentsError} activity={feed} />}
            {section === 'classes' && <ClassesPage classes={classes} loading={classesLoading} error={classesError} onAdd={() => setClassModalOpen(true)} onDelete={setConfirmDeleteClass} />}
            {section === 'approvals' && (
              <ApprovalsPage approvals={approvals} classes={classes} loading={approvalsLoading} error={approvalsError} busyId={approvalBusyId}
                onApprove={approveRequest} onReject={rejectRequest} />
            )}
            {section === 'teachers' && (
              <TeachersPage teachers={teachers} classes={classes} loading={teachersLoading} error={teachersError}
                onToggleStatus={toggleTeacherStatus} onDelete={(tc) => setConfirmRemove({ kind: 'teacher', item: tc })} onAddAssignment={addTeacherAssignment} />
            )}
            {section === 'students' && (
              <StudentsPage students={students} classes={classes} loading={studentsLoading} error={studentsError}
                onToggleStatus={toggleStudentStatus} onDelete={(s) => setConfirmRemove({ kind: 'student', item: s })} onMoveClass={moveStudentClass}
                onPromote={promoteStudents} />
            )}
          </div>
        </div>
      </div>

      {classModalOpen && <ClassFormModal onCancel={() => setClassModalOpen(false)} onSave={createClass} saving={classSaving} />}
      {confirmDeleteClass && (
        <ConfirmModal title="Delete this class?" text={`"${confirmDeleteClass.display_name}" will be removed. Students linked to it will be unassigned and teacher assignments to it are deleted.`} confirmLabel="Delete" onCancel={() => setConfirmDeleteClass(null)} onConfirm={() => deleteClass(confirmDeleteClass)} />
      )}
      {confirmRemove && (
        <ConfirmModal
          title={`Remove this ${confirmRemove.kind}?`}
          text={`"${confirmRemove.item.full_name}" will be permanently removed. This can't be undone.`}
          confirmLabel="Remove" onCancel={() => setConfirmRemove(null)}
          onConfirm={() => removeUser(confirmRemove.kind, confirmRemove.item)}
        />
      )}
    </div>
  );
}