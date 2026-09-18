import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Bell, Filter, Users, UserCog, LogOut, Settings, LayoutGrid,
  Building2, Megaphone, Pencil, Trash2, X, ChevronDown, Menu,
  Search, Ban, CheckCircle2, Circle, Save, Send, Activity, School,
  Mail, Phone, Clock, CreditCard, Globe, KeyRound, RefreshCw, AlertCircle,
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

const API_BASE = 'https://easy-class-work-records.onrender.com';
const SUPERADMIN_SESSION_KEY = 'ecw_superadmin_session';

const STATUS_META = {
  active: { bg: t.greenSoft, color: t.green, label: 'Active' },
  suspended: { bg: t.redSoft, color: t.red, label: 'Suspended' },
  pending_review: { bg: t.blueSoft, color: t.blue, label: 'Pending review' },
  pending_payment: { bg: t.orangeSoft, color: t.orange, label: 'Pending payment' },
};

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
  const c = STATUS_META[status] || STATUS_META.pending_review;
  return <Badge bg={c.bg} color={c.color}>{c.label}</Badge>;
}
function IconBtn({ icon: Icon, onClick, tone = 'default', title, size = 30, disabled }) {
  const tones = { default: { bg: t.panel, color: t.subtext }, orange: { bg: t.orangeSoft, color: t.orange }, red: { bg: t.redSoft, color: t.red }, blue: { bg: t.blueSoft, color: t.blue }, green: { bg: t.greenSoft, color: t.green } };
  const c = tones[tone];
  return <button type="button" title={title} onClick={onClick} disabled={disabled} className="pa-btn" style={{ width: size, height: size, borderRadius: 8, border: 'none', background: c.bg, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, flexShrink: 0 }}><Icon size={size * 0.46} /></button>;
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
function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, color: t.text, background: t.panel, outline: 'none', width: '100%' }}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );
}
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
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
        <thead><tr style={{ background: t.panel }}>{columns.map(c => <th key={c} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700, color: t.subtext, letterSpacing: 0.4, textTransform: 'uppercase', borderBottom: `1px solid ${t.border}` }}>{c}</th>)}</tr></thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}
const Td = ({ children, style }) => <td style={{ padding: '11px 14px', fontSize: 12.5, color: t.text, borderBottom: `1px solid ${t.border}`, verticalAlign: 'middle', ...style }}>{children}</td>;

/* ---------------------------------- SIDEBAR / HEADER ---------------------------------- */

function NavItem({ icon: Icon, label, count, active, onClick }) {
  return (
    <li onClick={onClick} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', background: active ? t.blueSoft : 'transparent', color: active ? t.blue : t.text }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = t.panel; }} onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      <Icon size={15} /><span style={{ fontSize: 13, fontWeight: active ? 700 : 500 }}>{label}</span>
      {count !== undefined && <span style={{ background: active ? '#fff' : t.blueSoft, color: active ? t.blue : t.blue, borderRadius: 6, padding: '2px 7px', fontSize: 10.5, fontWeight: 700 }}>{count}</span>}
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
          <div style={{ width: 28, height: 28, borderRadius: 7, background: t.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Globe size={15} color="#fff" /></div>
          <div><span className="pa-heading" style={{ fontSize: 14, fontWeight: 700, color: t.text, display: 'block' }}>Easy Class</span><span style={{ fontSize: 10, color: t.subtext }}>Platform control</span></div>
        </div>
        {sidebarOpen && <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.subtext, display: 'flex' }}><X size={18} /></button>}
      </div>
      <div style={{ background: t.panel, borderRadius: 9, padding: 12, display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${t.blue}` }}><ShieldCheck size={15} color={t.blue} /></div>
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
      <button onClick={onSignOut} className="pa-btn" style={{ display: 'grid', gridTemplateColumns: '20px 1fr', alignItems: 'center', gap: 10, marginTop: 8, padding: '9px 11px', borderRadius: 8, background: t.redSoft, color: t.red, border: 'none', cursor: 'pointer' }}><LogOut size={15} /><span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'left' }}>Sign Out</span></button>
    </div>
  );
}
function Header({ setSidebarOpen, title, onRefresh, refreshing }) {
  return (
    <div style={{ height: 60, borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', gap: 12, background: '#fff', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button onClick={() => setSidebarOpen(true)} className="pa-hamburger" style={{ background: t.panel, border: 'none', borderRadius: 8, width: 34, height: 34, display: 'none', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text }}><Menu size={17} /></button>
        <h2 className="pa-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text }}>{title}</h2>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onRefresh && (
          <button type="button" onClick={onRefresh} className="pa-btn" title="Refresh" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: t.panel, color: t.subtext, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={14} style={refreshing ? { animation: 'paSpin 0.8s linear infinite' } : undefined} />
          </button>
        )}
        <div style={{ position: 'relative' }}><IconBtn icon={Bell} title="Notifications" /></div>
      </div>
      <style>{`@keyframes paSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
function PageHead({ eyebrow, text }) { return <div><p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: t.blue }}>{eyebrow}</p><p style={{ margin: '3px 0 0', fontSize: 13, color: t.subtext }}>{text}</p></div>; }

/* ---------------------------------- OVERVIEW ---------------------------------- */

function Overview({ schools, go }) {
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
        {schools.length === 0 ? (
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

function SchoolDetailModal({ school, onClose, onApprove, onSuspend, busy }) {
  const canApprove = school.status !== 'active';
  const canSuspend = school.status === 'active';
  return (
    <Modal onClose={onClose} width={480}>
      <div style={{ padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 className="pa-heading" style={{ margin: 0, fontSize: 17, color: t.text }}>{school.name}</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: t.subtext }}>{school.code} · Registered {fmtDate(school.createdAt)}</p>
          </div>
          <IconBtn icon={X} onClick={onClose} />
        </div>
        <div style={{ margin: '14px 0' }}><StatusBadge status={school.status} /></div>
        <div style={{ background: t.panel, borderRadius: 8, padding: 13, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: t.subtext }}>SCHOOL CONTACT (verified with Google)</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: t.text, display: 'flex', alignItems: 'center', gap: 6 }}><Mail size={12} /> {school.email}</p>
          {school.phone && <p style={{ margin: 0, fontSize: 12, color: t.text, display: 'flex', alignItems: 'center', gap: 6 }}><Phone size={12} /> {school.phone}</p>}
        </div>
        {school.status === 'pending_payment' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: t.orangeSoft, borderRadius: 8, padding: 11, marginBottom: 16 }}>
            <AlertCircle size={14} color={t.orange} style={{ marginTop: 1, flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 11.5, color: t.orange, lineHeight: 1.5 }}>This school hasn't completed the registration fee payment yet. You can still approve it manually if needed.</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {canApprove && <Button icon={CheckCircle2} disabled={busy} onClick={() => onApprove(school)} style={{ flex: 1, justifyContent: 'center' }}>{busy ? 'Approving…' : 'Approve school'}</Button>}
          {canSuspend && <Button variant="redSoft" icon={Ban} disabled={busy} onClick={() => onSuspend(school)} style={{ flex: 1, justifyContent: 'center' }}>{busy ? 'Working…' : 'Suspend school'}</Button>}
        </div>
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
];

function SchoolsPage({ schools, loading, error, onView, onApprove, onSuspend, busyId }) {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const filtered = schools.filter(s =>
    (statusFilter === 'all' || s.status === statusFilter) &&
    (s.name.toLowerCase().includes(q.toLowerCase()) || s.code.toLowerCase().includes(q.toLowerCase()) || s.email.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div className="pa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead eyebrow="SCHOOLS" text="Approve newly registered schools so their admin can sign in" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <SearchBox value={q} onChange={setQ} placeholder="Search by name, code, or email…" />
        <Dropdown value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} icon={Filter} />
      </div>
      {error && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: t.redSoft, borderRadius: 8, padding: '10px 13px', color: t.red, fontSize: 12.5, fontWeight: 600 }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {loading ? <Skeleton h={220} r={10} /> : (
        <Table columns={['School', 'Code', 'Contact email', 'Status', 'Registered', 'Actions']} rows={filtered}
          empty={<EmptyState icon={Building2} title={schools.length === 0 ? 'No schools registered yet' : 'No matches'} text={schools.length === 0 ? 'Schools will appear here as soon as someone registers through the site.' : 'Try a different search or status filter.'} />}
          renderRow={(s) => (
            <tr key={s.id} className="pa-row" style={{ cursor: 'pointer' }} onClick={() => onView(s)}>
              <Td style={{ fontWeight: 700 }}>{s.name}</Td>
              <Td style={{ color: t.subtext }}>{s.code}</Td>
              <Td style={{ color: t.subtext }}>{s.email}</Td>
              <Td><StatusBadge status={s.status} /></Td>
              <Td>{fmtDate(s.createdAt)}</Td>
              <Td onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {s.status !== 'active' && <IconBtn size={26} icon={CheckCircle2} tone="green" disabled={busyId === s.id} onClick={() => onApprove(s)} title="Approve" />}
                  {s.status === 'active' && <IconBtn size={26} icon={Ban} tone="red" disabled={busyId === s.id} onClick={() => onSuspend(s)} title="Suspend" />}
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
  const activeSchools = schools.filter(s => s.status === 'active');
  const filtered = activeSchools.filter(s => s.name.toLowerCase().includes(q.toLowerCase()) || s.email.toLowerCase().includes(q.toLowerCase()));
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
  return (
    <Modal onClose={onCancel} width={500}>
      <div style={{ padding: 22 }}>
        <h3 className="pa-heading" style={{ margin: '0 0 4px', fontSize: 15.5, color: t.text }}>New platform announcement</h3>
        <p style={{ margin: '0 0 16px', fontSize: 11.5, color: t.subtext }}>Not wired to a backend yet — this is stored locally in your browser for now.</p>
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
          <Button variant="blue" icon={Send} disabled={!title || !body} onClick={() => onSave({ id: uid(), title, body, audience, postedAt: new Date().toISOString() })}>Broadcast</Button>
        </div>
      </div>
    </Modal>
  );
}

function AnnouncementsPage({ announcements, loading, onNew, onDelete }) {
  return (
    <div className="pa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <PageHead eyebrow="ANNOUNCEMENTS" text="Local only for now — not yet sent to schools by a backend" />
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

function ActivityPage({ log, loading }) {
  return (
    <div className="pa-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead eyebrow="ACTIVITY LOG" text="Actions you've taken this session (approvals, suspensions)" />
      {loading ? <Skeleton h={220} r={10} /> : log.length === 0 ? (
        <EmptyState icon={Activity} title="Nothing recorded yet" text="Approving or suspending a school will show up here." />
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

function SettingsPage() {
  return (
    <div className="pa-page-pad" style={{ padding: 22, maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead eyebrow="PLATFORM SETTINGS" text="Global defaults applied across every school" />
      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Platform name"><Input defaultValue="Easy Class" /></Field>
        <Field label="Support email"><Input defaultValue="support@easyclass.app" /></Field>
        <p style={{ margin: 0, fontSize: 11, color: t.subtext }}>Not wired to a backend yet — changes here aren't saved.</p>
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

  // Default fallback mock session to allow viewing without signing in
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem(SUPERADMIN_SESSION_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.token ? parsed : { token: 'guest_dev_mode', email: 'dev.guest@easyclass.app' };
    } catch {
      return { token: 'guest_dev_mode', email: 'dev.guest@easyclass.app' };
    }
  });

  const [section, setSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const go = (dest) => setSection(dest);

  const [schools, setSchools] = useState([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolsError, setSchoolsError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [announcements, setAnnouncements] = useState([]);
  const [log, setLog] = useState([]);
  const pushLog = (text) => setLog(l => [{ id: uid(), text, at: new Date().toISOString() }, ...l]);

  const [schoolDetail, setSchoolDetail] = useState(null);
  const [announcementModal, setAnnouncementModal] = useState(false);

  const authHeader = () => (session?.token ? { Authorization: `Bearer ${session.token}` } : {});

  const mapSchool = (raw) => ({
    id: raw.id,
    name: raw.name,
    email: raw.email,
    phone: raw.phone,
    code: raw.school_code,
    status: raw.status,
    createdAt: raw.created_at,
  });

  async function fetchSchools() {
    if (!session?.token) return;
    setSchoolsLoading(true);
    setSchoolsError('');
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/schools`, { headers: authHeader() });
      const data = await res.json();
      if (res.ok && data.success) {
        setSchools(data.schools.map(mapSchool));
      } else {
        setSchoolsError(data.message || 'Could not load schools.');
      }
    } catch (err) {
      console.error(err);
      setSchoolsError('Could not reach the server. Please check your connection.');
    } finally {
      setSchoolsLoading(false);
    }
  }

  useEffect(() => {
    if (session?.token && session.token !== 'guest_dev_mode') {
      fetchSchools();
    }
  }, [session]);

  async function handleApprove(school) {
    setBusyId(school.id);
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/schools/${school.id}/approve`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSchools(list => list.map(s => s.id === school.id ? { ...s, status: 'active' } : s));
        pushLog(`Approved "${school.name}".`);
        setSchoolDetail(d => d && d.id === school.id ? { ...d, status: 'active' } : d);
      } else {
        setSchoolsError(data.message || 'Could not approve that school.');
      }
    } catch (err) {
      console.error(err);
      setSchoolsError('Could not reach the server. Please check your connection.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSuspend(school) {
    setBusyId(school.id);
    try {
      const res = await fetch(`${API_BASE}/api/superadmin/schools/${school.id}/reject`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSchools(list => list.map(s => s.id === school.id ? { ...s, status: 'suspended' } : s));
        pushLog(`Suspended "${school.name}".`);
        setSchoolDetail(d => d && d.id === school.id ? { ...d, status: 'suspended' } : d);
      } else {
        setSchoolsError(data.message || 'Could not suspend that school.');
      }
    } catch (err) {
      console.error(err);
      setSchoolsError('Could not reach the server. Please check your connection.');
    } finally {
      setBusyId(null);
    }
  }

  function handleSignOut() {
    localStorage.removeItem(SUPERADMIN_SESSION_KEY);
    navigate('/', { replace: true });
  }

  const activeAdminCount = schools.filter(s => s.status === 'active').length;
  const counts = { schools: schools.length, admins: activeAdminCount };
  const titles = { overview: 'Overview', schools: 'Schools', admins: 'School Admins', announcements: 'Announcements', activity: 'Activity log', settings: 'Platform settings' };

  return (
    <div className="pa-root" style={{ minHeight: '100vh', color: t.text }}>
      <GlobalStyle />
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <div className="pa-sidebar-wrap" style={{ display: 'flex' }}>
          <Sidebar section={section} go={go} counts={counts} sidebarOpen={false} setSidebarOpen={() => {}} adminEmail={session?.email} onSignOut={handleSignOut} />
        </div>
        {sidebarOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
            <div onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)' }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0 }}><Sidebar section={section} go={go} counts={counts} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} adminEmail={session?.email} onSignOut={handleSignOut} /></div>
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Header setSidebarOpen={setSidebarOpen} title={titles[section]} onRefresh={fetchSchools} refreshing={schoolsLoading} />
          <div className="pa-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {section === 'overview' && <Overview schools={schools} go={go} />}
            {section === 'schools' && (
              <SchoolsPage schools={schools} loading={schoolsLoading} error={schoolsError} busyId={busyId}
                onView={setSchoolDetail} onApprove={handleApprove} onSuspend={handleSuspend} />
            )}
            {section === 'admins' && <AdminsPage schools={schools} loading={schoolsLoading} />}
            {section === 'announcements' && <AnnouncementsPage announcements={announcements} loading={false} onNew={() => setAnnouncementModal(true)} onDelete={(a) => setAnnouncements(list => list.filter(x => x.id !== a.id))} />}
            {section === 'activity' && <ActivityPage log={log} loading={false} />}
            {section === 'settings' && <SettingsPage />}
          </div>
        </div>
      </div>

      {schoolDetail && (
        <SchoolDetailModal school={schoolDetail} onClose={() => setSchoolDetail(null)} busy={busyId === schoolDetail.id}
          onApprove={handleApprove} onSuspend={handleSuspend} />
      )}
      {announcementModal && <AnnouncementComposer schools={schools} onCancel={() => setAnnouncementModal(false)} onSave={(a) => { setAnnouncements(list => [a, ...list]); pushLog(`Drafted announcement "${a.title}" (local only).`); setAnnouncementModal(false); }} />}
    </div>
  );
}