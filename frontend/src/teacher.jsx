import { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, GraduationCap, Bell, Filter, BookOpen, Share2,
  Users, LogOut, Settings, TrendingUp, ClipboardList, Plus,
  Eye, Pencil, EyeOff, Trash2, X,
  ChevronDown, Clock, CheckCircle2, Circle, Menu, ArrowLeft,
  Wifi, Save, FileText, AlertCircle, ListChecks, PenLine,
  CalendarClock, PlusCircle
} from 'lucide-react';

/* ---------------------------------- THEME ---------------------------------- */

const t = {
  bg: '#FFFFFF', surface: '#FFFFFF', panel: '#F7F8FA', sidebar: '#FFFFFF',
  border: '#E7E9EF', text: '#13151C', subtext: '#6B7280', faint: '#A1A7B3',
  green: '#0E9F6E', greenSoft: '#E7F8F1',
  blue: '#2A5CDB', blueSoft: '#EAF0FE',
  orange: '#EA5B0C', orangeSoft: '#FFEEE3', red: '#DC2626', redSoft: '#FEECEC',
  shimmer1: '#EEF0F4', shimmer2: '#F9FAFC',
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ============================================================================
   FRONTEND-ONLY DATA LAYER
   There is no server, no fetch, no localStorage, no auth token. Everything
   lives in React state for the life of the page. `delay()` just fakes the
   pause you'd get from a network so the loading states stay visible.
   ============================================================================ */

const delay = (ms = 420) => new Promise(res => setTimeout(res, ms));

const TEACHER = { fullName: 'Ms. Uwase Claire' };

const SEED_ASSIGNMENTS = [
  { classCombinationId: 'c1', className: 'S4 MCB', subject: 'Biology' },
  { classCombinationId: 'c2', className: 'S4 MCB', subject: 'Chemistry' },
  { classCombinationId: 'c3', className: 'S5 PCM', subject: 'Physics' },
  { classCombinationId: 'c4', className: 'S6 MEG', subject: 'Geography' },
];

const daysFromNow = (d, h = 9) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(h, 0, 0, 0);
  return x.toISOString();
};

const SEED_NOTES = [
  {
    id: uid(), classCombinationId: 'c1', className: 'S4 MCB', subject: 'Biology',
    title: 'Cell structure and organelles', status: 'published',
    content: 'The cell is the basic unit of life.\n\nAnimal cells contain a nucleus, mitochondria, ribosomes, and a cell membrane. Plant cells add a cell wall, chloroplasts, and a large central vacuole.\n\nMitochondria release energy from glucose during respiration, which is why muscle cells carry so many of them.',
    fileUrl: '', fileType: '', fileName: '', updatedAt: daysFromNow(-2),
  },
  {
    id: uid(), classCombinationId: 'c3', className: 'S5 PCM', subject: 'Physics',
    title: 'Newton\u2019s laws of motion', status: 'published',
    content: 'First law: an object stays at rest or in uniform motion unless a resultant force acts on it.\n\nSecond law: F = ma.\n\nThird law: every action has an equal and opposite reaction.',
    fileUrl: '', fileType: '', fileName: '', updatedAt: daysFromNow(-5),
  },
  {
    id: uid(), classCombinationId: 'c2', className: 'S4 MCB', subject: 'Chemistry',
    title: 'Balancing chemical equations', status: 'draft',
    content: 'Atoms are never created or destroyed in a reaction, so the count of each element must match on both sides.\n\nWork element by element, leave hydrogen and oxygen for last, and only change coefficients \u2014 never subscripts.',
    fileUrl: '', fileType: '', fileName: '', updatedAt: daysFromNow(-1),
  },
];

const SEED_QUIZZES = [
  {
    id: uid(), classCombinationId: 'c1', className: 'S4 MCB', subject: 'Biology',
    title: 'Cell structure check-in', status: 'published',
    timeLimitMinutes: 15, startsAt: daysFromNow(1, 8), endsAt: daysFromNow(1, 17),
    questions: [
      {
        id: uid(), question: 'Which organelle releases energy from glucose?',
        options: [
          { id: uid(), optionText: 'Mitochondrion', isCorrect: true },
          { id: uid(), optionText: 'Ribosome', isCorrect: false },
          { id: uid(), optionText: 'Vacuole', isCorrect: false },
        ],
      },
      {
        id: uid(), question: 'Which structure is found in plant cells but not animal cells?',
        options: [
          { id: uid(), optionText: 'Cell membrane', isCorrect: false },
          { id: uid(), optionText: 'Cell wall', isCorrect: true },
          { id: uid(), optionText: 'Nucleus', isCorrect: false },
        ],
      },
    ],
  },
  {
    id: uid(), classCombinationId: 'c3', className: 'S5 PCM', subject: 'Physics',
    title: 'Forces and motion \u2014 warm up', status: 'draft',
    timeLimitMinutes: 10, startsAt: null, endsAt: null,
    questions: [
      {
        id: uid(), question: 'A resultant force of 12 N acts on a 4 kg mass. What is the acceleration?',
        options: [
          { id: uid(), optionText: '3 m/s\u00b2', isCorrect: true },
          { id: uid(), optionText: '48 m/s\u00b2', isCorrect: false },
          { id: uid(), optionText: '0.33 m/s\u00b2', isCorrect: false },
        ],
      },
    ],
  },
];

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

/* -------------------------------- PRIMITIVES -------------------------------- */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
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
      @media (prefers-reduced-motion: reduce) {
        .td-skel, .td-fade, .td-toast, .td-spin { animation: none !important; }
      }
      @media (max-width: 860px) {
        .td-hamburger { display: flex !important; }
        .td-desktop-filters { display: none !important; }
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
    <button type="button" title={title} onClick={onClick} disabled={disabled || busy} className="td-btn"
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
      style={{ ...styles[variant], padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', ...style }}>
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
      <button type="button" onClick={() => setOpen(o => !o)} className="td-btn"
        style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 11px', fontSize: 12.5, fontWeight: 600, color: t.text, cursor: 'pointer' }}>
        {Icon && <Icon size={14} color={t.subtext} />}
        <span>{value}</span>
        <ChevronDown size={13} color={t.subtext} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div className="td-fade" style={{ position: 'absolute', top: '110%', left: 0, background: '#fff', border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 10px 24px rgba(18,20,28,0.12)', minWidth: 170, zIndex: 40, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
          {options.map(opt => (
            <div key={opt} onClick={() => { onChange(opt); setOpen(false); }}
              style={{ padding: '9px 13px', fontSize: 12.5, cursor: 'pointer', color: opt === value ? t.blue : t.text, fontWeight: opt === value ? 700 : 500, background: opt === value ? t.blueSoft : 'transparent' }}
              onMouseEnter={e => { if (opt !== value) e.currentTarget.style.background = t.panel; }}
              onMouseLeave={e => { if (opt !== value) e.currentTarget.style.background = 'transparent'; }}>{opt}</div>
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
      <p style={{ margin: 0, fontSize: 13, color: t.subtext, maxWidth: 300, lineHeight: 1.5 }}>{text}</p>
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
      <div className="td-fade td-scroll" onClick={e => e.stopPropagation()}
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
          <div style={{ marginTop: 16, display: 'flex', gap: 7 }}>{[0, 1, 2, 3].map(j => <Skeleton key={j} w={30} h={30} r={7} />)}</div>
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
        <div style={{ marginTop: 18 }}><StatRow>{[0, 1, 2, 3].map(i => <Skeleton key={i} w="100%" h={48} r={8} />)}</StatRow></div>
        <div style={{ marginTop: 20 }}><CardsSkeleton /></div>
      </div>
    </div>
  );
}

/* ---------------------------------- TOASTS ---------------------------------- */

function ToastStack({ toasts, onDismiss }) {
  return (
    <div style={{ position: 'fixed', bottom: 18, right: 18, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
      {toasts.map(tst => {
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
    setToasts(list => [...list, { id, message, type }]);
    timers.current.push(setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), 3200));
  }, []);
  const dismiss = (id) => setToasts(list => list.filter(x => x.id !== id));
  return { toasts, push, dismiss };
}

/* ---------------------------------- SIDEBAR ---------------------------------- */

function NavItem({ icon: Icon, label, count, live, active, onClick }) {
  return (
    <li onClick={onClick} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '18px 1fr auto', alignItems: 'center', gap: 11, padding: '9px 12px 9px 14px', borderRadius: 8, cursor: 'pointer', background: active ? t.greenSoft : 'transparent', color: active ? t.green : t.text }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = t.panel; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
      {active && <span style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, borderRadius: 3, background: t.green }} />}
      <Icon size={15} strokeWidth={active ? 2.3 : 1.9} />
      <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, letterSpacing: -0.1 }}>{label}</span>
      {live ? <Badge bg={t.orangeSoft} color={t.orange}>Live</Badge> : count !== undefined ? (
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

function Sidebar({ section, go, notesCount, quizzesCount, teacherName, sidebarOpen, setSidebarOpen, onSignOut }) {
  const classroomItems = [
    { key: 'notes', icon: BookOpen, label: 'Notes', count: notesCount },
    { key: 'quizzes', icon: PenLine, label: 'Quizzes', count: quizzesCount },
    { key: 'live', icon: Wifi, label: 'Live activity', live: true },
  ];
  const insightItems = [
    { key: 'students', icon: Users, label: 'Students' },
    { key: 'progress', icon: TrendingUp, label: 'Progress' },
    { key: 'records', icon: ClipboardList, label: 'All records' },
  ];
  return (
    <div style={{
      width: 240, background: '#fff', borderRight: `1px solid ${t.border}`, padding: '18px 14px',
      display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 16px', borderBottom: `1px solid ${t.border}`, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: `linear-gradient(135deg, ${t.blue}, ${t.green})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <GraduationCap size={16} color="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <span className="td-heading" style={{ fontSize: 14.5, fontWeight: 700, color: t.text, display: 'block', letterSpacing: -0.2 }}>Easy Class</span>
            <span style={{ fontSize: 10.5, color: t.subtext }}>Teacher workspace</span>
          </div>
        </div>
        {sidebarOpen && <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.subtext, display: 'flex' }}><X size={18} /></button>}
      </div>

      <div style={{ background: t.panel, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 11px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${t.green}`, flexShrink: 0 }}>
          <User size={14} color={t.green} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p className="td-heading" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teacherName || 'Loading\u2026'}</p>
          <p style={{ margin: '2px 0 0', fontSize: 10.5, color: t.green, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.green, display: 'inline-block' }} /> Teacher
          </p>
        </div>
      </div>

      <div className="td-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <NavSection label="Classroom">
          {classroomItems.map(it => <NavItem key={it.key} icon={it.icon} label={it.label} count={it.count} live={it.live} active={section === it.key} onClick={() => { go(it.key); setSidebarOpen(false); }} />)}
        </NavSection>
        <NavSection label="Insights">
          {insightItems.map(it => <NavItem key={it.key} icon={it.icon} label={it.label} count={it.count} live={it.live} active={section === it.key} onClick={() => { go(it.key); setSidebarOpen(false); }} />)}
        </NavSection>
        <NavSection label="Account">
          <NavItem icon={Settings} label="Settings" active={section === 'settings'} onClick={() => { go('settings'); setSidebarOpen(false); }} />
        </NavSection>
      </div>

      <button
        className="td-btn"
        onClick={onSignOut}
        style={{ display: 'grid', gridTemplateColumns: '18px 1fr', alignItems: 'center', gap: 11, marginTop: 12, padding: '9px 12px', borderRadius: 8, background: t.orangeSoft, color: t.orange, border: 'none', cursor: 'pointer' }}>
        <LogOut size={15} /><span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'left' }}>Sign out</span>
      </button>
    </div>
  );
}

/* ---------------------------------- HEADER ---------------------------------- */

function Header({ selectedClass, setSelectedClass, filterOptions, onNewNote, onNewQuiz, setSidebarOpen, title }) {
  return (
    <div style={{ minHeight: 60, borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', gap: 12, background: '#fff', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button onClick={() => setSidebarOpen(true)} className="td-hamburger" style={{ background: t.panel, border: 'none', borderRadius: 8, width: 34, height: 34, display: 'none', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text, flexShrink: 0 }}><Menu size={17} /></button>
        <h2 className="td-heading" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
      </div>
      <div className="td-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div className="td-desktop-filters" style={{ display: 'flex', gap: 8 }}>
          <Dropdown value={selectedClass} options={filterOptions} onChange={setSelectedClass} icon={Filter} />
        </div>
        <PrimaryButton variant="outline" icon={Plus} onClick={onNewNote}>New Note</PrimaryButton>
        <PrimaryButton variant="soft" icon={Plus} onClick={onNewQuiz}>New Quiz</PrimaryButton>
        <div style={{ position: 'relative' }}>
          <IconBtn icon={Bell} title="Notifications" />
          <span style={{ position: 'absolute', top: -3, right: -3, background: t.green, color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 5, width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>0</span>
        </div>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: t.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={15} color={t.blue} /></div>
      </div>
    </div>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
      {tabs.map(tab => (
        <button key={tab.key} onClick={() => onChange(tab.key)} className="td-btn"
          style={{ border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', background: active === tab.key ? t.green : t.panel, color: active === tab.key ? '#fff' : t.text }}>
          {tab.label} ({tab.count})
        </button>
      ))}
    </div>
  );
}

/* --------------------------- CLASS / SUBJECT PICKER --------------------------- */

function AssignmentPicker({ assignments, value, onChange, loading }) {
  if (loading) return <Skeleton w="100%" h={44} r={8} />;
  if (assignments.length === 0) {
    return (
      <div style={{ border: `1px dashed ${t.border}`, borderRadius: 8, padding: 14, fontSize: 12, color: t.subtext, background: t.panel }}>
        No classes or subjects are assigned to you yet.
      </div>
    );
  }
  const key = (a) => `${a.classCombinationId}::${a.subject}`;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {assignments.map(a => {
        const active = value && key(value) === key(a);
        return (
          <button key={key(a)} type="button" onClick={() => onChange(a)} className="td-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${active ? t.green : t.border}`, background: active ? t.greenSoft : '#fff', color: active ? t.green : t.text, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            {active ? <CheckCircle2 size={14} /> : <Circle size={14} color={t.faint} />} {a.className} · {a.subject}
          </button>
        );
      })}
    </div>
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

function NotePreviewModal({ note, onClose }) {
  return (
    <Modal onClose={onClose} width={620}>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h2 className="td-heading" style={{ margin: 0, fontSize: 18, color: t.text }}>{note.title || 'Untitled note'}</h2>
            <p style={{ margin: '5px 0 0', fontSize: 11.5, color: t.subtext }}>{note.className} · {note.subject} · updated {fmtDate(note.updatedAt)}</p>
          </div>
          <IconBtn icon={X} onClick={onClose} />
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: t.text, whiteSpace: 'pre-wrap' }}>{note.content}</p>
        {note.fileUrl && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: t.blue, wordBreak: 'break-all' }}>
            <FileText size={13} /> <a href={note.fileUrl} target="_blank" rel="noreferrer" style={{ color: t.blue }}>{note.fileName || note.fileUrl}</a>
          </div>
        )}
      </div>
    </Modal>
  );
}

function NotesDashboard({ notes, loading, filter, setFilter, onView, onEdit, onTogglePublish, onDelete, onNewNote, busyAction }) {
  const filtered = notes.filter(n => filter === 'all' ? true : filter === 'published' ? n.status === 'published' : n.status === 'draft');
  const stats = {
    total: notes.length,
    published: notes.filter(n => n.status === 'published').length,
    draft: notes.filter(n => n.status === 'draft').length,
  };
  return (
    <div className="td-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p className="td-heading" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text }}>Your notes</p>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: t.subtext }}>Write for a class, save as draft, then publish when ready</p>
        </div>
        <PrimaryButton icon={Plus} onClick={onNewNote}>New Note</PrimaryButton>
      </div>

      {loading ? <StatRow>{[0, 1, 2].map(i => <Skeleton key={i} w="100%" h={48} r={8} />)}</StatRow> : (
        <StatRow>
          <StatMini icon={BookOpen} value={stats.total} label="Total notes" tone="green" />
          <StatMini icon={Share2} value={stats.published} label="Published" tone="blue" />
          <StatMini icon={Pencil} value={stats.draft} label="Drafts" tone="orange" />
        </StatRow>
      )}

      {loading ? <Skeleton w={240} h={34} r={8} /> : (
        <Tabs active={filter} onChange={setFilter} tabs={[{ key: 'all', label: 'All', count: stats.total }, { key: 'published', label: 'Published', count: stats.published }, { key: 'draft', label: 'Drafts', count: stats.draft }]} />
      )}

      {loading ? <CardsSkeleton /> : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title={notes.length === 0 ? 'No notes yet' : 'Nothing here'}
          text={notes.length === 0 ? 'Create your first note for one of your classes.' : 'No notes match this filter yet.'}
          action={notes.length === 0 && <div style={{ marginTop: 12 }}><PrimaryButton icon={Plus} onClick={onNewNote}>Create your first note</PrimaryButton></div>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
          {filtered.map(n => <NoteCard key={n.id} note={n} onView={onView} onEdit={onEdit} onTogglePublish={onTogglePublish} onDelete={onDelete} busyAction={busyAction} />)}
        </div>
      )}
    </div>
  );
}

function NoteEditor({ initial, assignments, assignmentsLoading, onCancel, onSave, saving }) {
  const [title, setTitle] = useState(initial.title || '');
  const [content, setContent] = useState(initial.content || '');
  const [fileUrl, setFileUrl] = useState(initial.fileUrl || '');
  const [fileType, setFileType] = useState(initial.fileType || '');
  const [fileName, setFileName] = useState(initial.fileName || '');
  const [assignment, setAssignment] = useState(() => {
    if (!initial.classCombinationId) return null;
    return { classCombinationId: initial.classCombinationId, subject: initial.subject, className: initial.className };
  });
  const [error, setError] = useState('');

  const doSave = (status) => {
    if (!assignment) { setError('Pick a class and subject first.'); return; }
    if (!title.trim() || !content.trim()) { setError('Title and content are both required.'); return; }
    setError('');
    onSave({
      id: initial.id,
      classCombinationId: assignment.classCombinationId,
      className: assignment.className,
      subject: assignment.subject,
      title: title.trim(),
      content: content.trim(),
      status,
      fileUrl: fileUrl.trim(),
      fileType: fileUrl.trim() ? (fileType || 'file') : '',
      fileName: fileUrl.trim() ? fileName.trim() : '',
    });
  };

  return (
    <div className="td-fade td-page-pad" style={{ padding: 22, maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <IconBtn icon={ArrowLeft} onClick={onCancel} title="Back" />
        <h2 className="td-heading" style={{ margin: 0, fontSize: 16, color: t.text }}>{initial.id ? 'Edit note' : 'New note'}</h2>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: t.redSoft, color: t.red, borderRadius: 8, padding: '10px 13px', fontSize: 12.5, fontWeight: 600 }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <p className="td-heading" style={{ margin: '0 0 9px', fontSize: 12.5, fontWeight: 700, color: t.text }}>Class & subject</p>
          <AssignmentPicker assignments={assignments} loading={assignmentsLoading} value={assignment} onChange={setAssignment} />
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Note title"
          style={{ width: '100%', border: `1px solid ${t.border}`, borderRadius: 8, padding: '11px 13px', fontSize: 15, fontWeight: 700, color: t.text, background: t.panel, outline: 'none' }} />
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write the note content…" rows={9}
          style={{ width: '100%', border: `1px solid ${t.border}`, borderRadius: 8, padding: 12, fontSize: 13, resize: 'vertical', color: t.text, background: t.panel, outline: 'none' }} />
      </div>

      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18 }}>
        <p className="td-heading" style={{ margin: '0 0 11px', fontSize: 12.5, fontWeight: 700, color: t.text }}>Attach a file (optional)</p>
        <p style={{ margin: '0 0 10px', fontSize: 11.5, color: t.subtext }}>Paste a link to an image, video, or PDF that is already hosted somewhere.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
          <input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://…"
            style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 12.5, color: t.text, background: t.panel, outline: 'none' }} />
          <select value={fileType} onChange={e => setFileType(e.target.value)}
            style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 12.5, color: t.text, background: t.panel, outline: 'none' }}>
            <option value="">File type…</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="pdf">PDF</option>
            <option value="file">Other file</option>
          </select>
        </div>
        {fileUrl.trim() && (
          <input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="Display name for this file (optional)"
            style={{ width: '100%', marginTop: 8, border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 12.5, color: t.text, background: t.panel, outline: 'none' }} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingBottom: 18, flexWrap: 'wrap' }}>
        <PrimaryButton variant="outline" onClick={onCancel} disabled={!!saving}>Discard</PrimaryButton>
        <PrimaryButton variant="soft" icon={Save} busy={saving === 'draft'} disabled={!!saving} onClick={() => doSave('draft')}>Save as draft</PrimaryButton>
        <PrimaryButton icon={Share2} busy={saving === 'published'} disabled={!!saving} onClick={() => doSave('published')}>Save & publish</PrimaryButton>
      </div>
    </div>
  );
}

/* ---------------------------------- QUIZZES ---------------------------------- */

function QuizCard({ quiz, onView, onEdit, onTogglePublish, onDelete, onSchedule, busyAction }) {
  const isBusy = busyAction === quiz.id;
  const totalOptions = quiz.questions.reduce((s, q) => s + q.options.length, 0);
  return (
    <div className="td-card td-fade" style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 16, borderLeft: `3px solid ${quiz.status === 'published' ? t.green : quiz.status === 'closed' ? t.faint : t.orange}`, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div>
        <h4 className="td-heading" style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: t.text }}>{quiz.title || 'Untitled quiz'}</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, color: t.subtext, fontSize: 11, flexWrap: 'wrap' }}>
          <ListChecks size={11} /><span>{quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'}</span>
          {quiz.timeLimitMinutes ? <><span>·</span><span>{quiz.timeLimitMinutes} min</span></> : null}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge bg={quiz.status === 'published' ? t.greenSoft : quiz.status === 'closed' ? t.panel : t.orangeSoft} color={quiz.status === 'published' ? t.green : quiz.status === 'closed' ? t.subtext : t.orange}>
          {quiz.status === 'published' ? 'Published' : quiz.status === 'closed' ? 'Closed' : 'Draft'}
        </Badge>
        <Chip tone="blue">{quiz.className}</Chip>
        <Chip tone="neutral">{quiz.subject}</Chip>
      </div>
      <button onClick={() => onSchedule(quiz)} className="td-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, background: t.panel, border: `1px dashed ${t.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 11, color: t.subtext, cursor: 'pointer', textAlign: 'left' }}>
        <CalendarClock size={12} /><span>{fmtDateTime(quiz.startsAt)} → {fmtDateTime(quiz.endsAt)}</span>
      </button>
      <div style={{ display: 'flex', gap: 7, marginTop: 2, flexWrap: 'wrap' }}>
        <IconBtn icon={Eye} onClick={() => onView(quiz)} title="Preview" />
        <IconBtn icon={Pencil} onClick={() => onEdit(quiz)} title="Edit" tone="blue" disabled={isBusy} />
        {quiz.status === 'published'
          ? <IconBtn icon={EyeOff} onClick={() => onTogglePublish(quiz)} title="Unpublish" tone="orange" busy={isBusy} />
          : <IconBtn icon={Share2} onClick={() => onTogglePublish(quiz)} title="Publish to class" tone="green" busy={isBusy} />}
        <IconBtn icon={Trash2} onClick={() => onDelete(quiz)} title="Delete" tone="orange" disabled={isBusy} />
      </div>
      {totalOptions === 0 && quiz.questions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.orange, fontSize: 10.5 }}><AlertCircle size={12} /> Some questions have no options yet</div>
      )}
    </div>
  );
}

function ScheduleModal({ quiz, onCancel, onSave, saving }) {
  const [start, setStart] = useState(isoToLocalInput(quiz.startsAt));
  const [end, setEnd] = useState(isoToLocalInput(quiz.endsAt));
  return (
    <Modal onClose={onCancel} width={380}>
      <div style={{ padding: 22 }}>
        <h3 className="td-heading" style={{ margin: '0 0 4px', fontSize: 15.5, color: t.text }}>Adjust schedule</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: t.subtext }}>{quiz.title || 'Untitled quiz'} — change the window anytime.</p>
        <label style={{ fontSize: 11, fontWeight: 700, color: t.subtext }}>Starts</label>
        <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} style={{ width: '100%', marginTop: 5, marginBottom: 12, border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 12.5, color: t.text, background: t.panel, outline: 'none' }} />
        <label style={{ fontSize: 11, fontWeight: 700, color: t.subtext }}>Ends</label>
        <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} style={{ width: '100%', marginTop: 5, marginBottom: 18, border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 12.5, color: t.text, background: t.panel, outline: 'none' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <PrimaryButton variant="outline" onClick={onCancel} disabled={saving}>Cancel</PrimaryButton>
          <PrimaryButton icon={Save} busy={saving} onClick={() => onSave(localInputToIso(start), localInputToIso(end))}>Save changes</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

function QuizPreviewModal({ quiz, onClose }) {
  return (
    <Modal onClose={onClose} width={620}>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
          <div>
            <h2 className="td-heading" style={{ margin: 0, fontSize: 18, color: t.text }}>{quiz.title || 'Untitled quiz'}</h2>
            <p style={{ margin: '5px 0 0', fontSize: 11.5, color: t.subtext }}>{quiz.className} · {quiz.subject} · {fmtDateTime(quiz.startsAt)} → {fmtDateTime(quiz.endsAt)}</p>
          </div>
          <IconBtn icon={X} onClick={onClose} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
          {quiz.questions.length === 0 && <p style={{ color: t.subtext, fontSize: 13 }}>No questions added yet.</p>}
          {quiz.questions.map((q, i) => (
            <div key={q.id} style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 13 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: t.text }}>Q{i + 1}. {q.question || 'Untitled question'}</p>
              <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {q.options.length === 0 && <p style={{ margin: 0, fontSize: 11.5, color: t.orange }}>No options yet.</p>}
                {q.options.map(o => <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: o.isCorrect ? t.green : t.text }}>{o.isCorrect ? <CheckCircle2 size={13} /> : <Circle size={13} color={t.faint} />} {o.optionText || 'Option'}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function QuizzesDashboard({ quizzes, loading, filter, setFilter, onView, onEdit, onTogglePublish, onDelete, onNewQuiz, onSchedule, busyAction }) {
  const filtered = quizzes.filter(q => filter === 'all' ? true : filter === 'published' ? q.status === 'published' : filter === 'draft' ? q.status === 'draft' : q.status === 'closed');
  const stats = { total: quizzes.length, published: quizzes.filter(q => q.status === 'published').length, draft: quizzes.filter(q => q.status === 'draft').length };
  return (
    <div className="td-page-pad" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p className="td-heading" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.text }}>Your quizzes</p>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: t.subtext }}>Build a quiz for a class, then publish when ready</p>
        </div>
        <PrimaryButton icon={Plus} onClick={onNewQuiz}>New Quiz</PrimaryButton>
      </div>

      {loading ? <StatRow>{[0, 1, 2].map(i => <Skeleton key={i} w="100%" h={48} r={8} />)}</StatRow> : (
        <StatRow>
          <StatMini icon={PenLine} value={stats.total} label="Total quizzes" tone="green" />
          <StatMini icon={Share2} value={stats.published} label="Published" tone="blue" />
          <StatMini icon={Pencil} value={stats.draft} label="Drafts" tone="orange" />
        </StatRow>
      )}

      {loading ? <Skeleton w={240} h={34} r={8} /> : (
        <Tabs active={filter} onChange={setFilter} tabs={[{ key: 'all', label: 'All', count: stats.total }, { key: 'published', label: 'Published', count: stats.published }, { key: 'draft', label: 'Drafts', count: stats.draft }]} />
      )}

      {loading ? <CardsSkeleton /> : filtered.length === 0 ? (
        <EmptyState icon={PenLine} title={quizzes.length === 0 ? 'No quizzes yet' : 'Nothing here'}
          text={quizzes.length === 0 ? 'Build a quiz for one of your classes.' : 'No quizzes match this filter yet.'}
          action={quizzes.length === 0 && <div style={{ marginTop: 12 }}><PrimaryButton icon={Plus} onClick={onNewQuiz}>Build your first quiz</PrimaryButton></div>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 14 }}>
          {filtered.map(q => <QuizCard key={q.id} quiz={q} onView={onView} onEdit={onEdit} onTogglePublish={onTogglePublish} onDelete={onDelete} onSchedule={onSchedule} busyAction={busyAction} />)}
        </div>
      )}
    </div>
  );
}

function QuestionEditor({ q, index, onChange, onRemove }) {
  const setField = (patch) => onChange({ ...q, ...patch });
  const addOption = () => setField({ options: [...q.options, { id: uid(), optionText: '', isCorrect: false }] });
  const updateOption = (id, patch) => setField({ options: q.options.map(o => o.id === id ? { ...o, ...patch } : o) });
  const removeOption = (id) => setField({ options: q.options.filter(o => o.id !== id) });
  const markCorrect = (id) => setField({ options: q.options.map(o => ({ ...o, isCorrect: o.id === id })) });

  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: 15, background: t.panel }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 11 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: t.blue }}>Question {index + 1} · manual entry</span>
        <IconBtn size={26} icon={Trash2} tone="orange" onClick={onRemove} title="Remove question" />
      </div>
      <textarea value={q.question} onChange={e => setField({ question: e.target.value })} rows={2} placeholder="Write the question…"
        style={{ width: '100%', border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical', color: t.text, background: '#fff', outline: 'none' }} />
      <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {q.options.map(o => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <button type="button" onClick={() => markCorrect(o.id)} title="Mark as correct answer" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>{o.isCorrect ? <CheckCircle2 size={17} color={t.green} /> : <Circle size={17} color={t.faint} />}</button>
            <input value={o.optionText} onChange={e => updateOption(o.id, { optionText: e.target.value })} placeholder="Option text" style={{ flex: 1, border: `1px solid ${t.border}`, borderRadius: 7, padding: 8, fontSize: 12, color: t.text, background: '#fff', outline: 'none' }} />
            <IconBtn size={24} icon={X} onClick={() => removeOption(o.id)} title="Remove option" />
          </div>
        ))}
        <button type="button" onClick={addOption} className="td-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: t.green, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: '3px 0', width: 'fit-content' }}><PlusCircle size={13} /> Add option</button>
      </div>
    </div>
  );
}

function QuizEditor({ initial, assignments, assignmentsLoading, onCancel, onSave, saving }) {
  const [title, setTitle] = useState(initial.title || '');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(initial.timeLimitMinutes || '');
  const [startsAt, setStartsAt] = useState(isoToLocalInput(initial.startsAt));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(initial.endsAt));
  const [questions, setQuestions] = useState(initial.questions && initial.questions.length ? initial.questions : []);
  const [assignment, setAssignment] = useState(() => {
    if (!initial.classCombinationId) return null;
    return { classCombinationId: initial.classCombinationId, subject: initial.subject, className: initial.className };
  });
  const [error, setError] = useState('');

  const addQuestion = () => setQuestions(qs => [...qs, { id: uid(), question: '', options: [{ id: uid(), optionText: '', isCorrect: true }, { id: uid(), optionText: '', isCorrect: false }] }]);
  const updateQuestion = (id, next) => setQuestions(qs => qs.map(q => q.id === id ? next : q));
  const removeQuestion = (id) => setQuestions(qs => qs.filter(q => q.id !== id));

  const doSave = (status) => {
    if (!assignment) { setError('Pick a class and subject first.'); return; }
    if (!title.trim()) { setError('Give the quiz a title.'); return; }
    if (status === 'published' && questions.length === 0) { setError('Add at least one question before publishing.'); return; }
    setError('');
    onSave({
      id: initial.id,
      classCombinationId: assignment.classCombinationId,
      className: assignment.className,
      subject: assignment.subject,
      title: title.trim(),
      timeLimitMinutes: timeLimitMinutes ? Number(timeLimitMinutes) : null,
      startsAt: localInputToIso(startsAt),
      endsAt: localInputToIso(endsAt),
      status,
      questions,
    });
  };

  return (
    <div className="td-fade td-page-pad" style={{ padding: 22, maxWidth: 800, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <IconBtn icon={ArrowLeft} onClick={onCancel} title="Back" />
        <h2 className="td-heading" style={{ margin: 0, fontSize: 16, color: t.text }}>{initial.id ? 'Edit quiz' : 'New quiz'}</h2>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: t.redSoft, color: t.red, borderRadius: 8, padding: '10px 13px', fontSize: 12.5, fontWeight: 600 }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <p className="td-heading" style={{ margin: '0 0 9px', fontSize: 12.5, fontWeight: 700, color: t.text }}>Class & subject</p>
          <AssignmentPicker assignments={assignments} loading={assignmentsLoading} value={assignment} onChange={setAssignment} />
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Quiz title" style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: '11px 13px', fontSize: 15, fontWeight: 700, color: t.text, background: t.panel, outline: 'none' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: t.subtext }}>Time limit (min)</label>
            <input type="number" min={1} value={timeLimitMinutes} onChange={e => setTimeLimitMinutes(e.target.value)} placeholder="e.g. 20"
              style={{ width: '100%', marginTop: 5, border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 12.5, color: t.text, background: t.panel, outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: t.subtext }}>Starts</label>
            <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={{ width: '100%', marginTop: 5, border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 12.5, color: t.text, background: t.panel, outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: t.subtext }}>Ends</label>
            <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} style={{ width: '100%', marginTop: 5, border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 12.5, color: t.text, background: t.panel, outline: 'none' }} />
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${t.border}`, borderRadius: 10, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <p className="td-heading" style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: t.text }}>Questions</p>
            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: t.subtext }}>Write each question and its options by hand — mark one option as correct.</p>
          </div>
          <PrimaryButton variant="soft" icon={Plus} onClick={addQuestion}>Add question</PrimaryButton>
        </div>
        {questions.length === 0 ? (
          <EmptyState icon={ListChecks} title="No questions yet" text="Prepare your first question manually: type it in, add answer options, then pick the correct one." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{questions.map((q, i) => <QuestionEditor key={q.id} q={q} index={i} onChange={next => updateQuestion(q.id, next)} onRemove={() => removeQuestion(q.id)} />)}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingBottom: 18, flexWrap: 'wrap' }}>
        <PrimaryButton variant="outline" onClick={onCancel} disabled={!!saving}>Discard</PrimaryButton>
        <PrimaryButton variant="soft" icon={Save} busy={saving === 'draft'} disabled={!!saving} onClick={() => doSave('draft')}>Save as draft</PrimaryButton>
        <PrimaryButton icon={Share2} busy={saving === 'published'} disabled={!!saving} onClick={() => doSave('published')}>Save & publish</PrimaryButton>
      </div>
    </div>
  );
}

/* ------------------------------ PLACEHOLDER PAGES ------------------------------ */

function PlaceholderPage({ icon: Icon, title, text }) {
  return <div style={{ padding: 22 }}><EmptyState icon={Icon} title={title} text={text} /></div>;
}

/* ------------------------------------ APP ------------------------------------ */

export default function Teacher({ onSignOut }) {
  const { toasts, push: toast, dismiss: dismissToast } = useToasts();

  const [pageLoading, setPageLoading] = useState(true);
  const [teacherName, setTeacherName] = useState('');
  const [section, setSection] = useState('notes');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState('All Classes');

  const [assignments, setAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);

  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [quizzes, setQuizzes] = useState([]);
  const [quizzesLoading, setQuizzesLoading] = useState(true);

  const [notesFilter, setNotesFilter] = useState('all');
  const [quizzesFilter, setQuizzesFilter] = useState('all');

  const [editingNote, setEditingNote] = useState(null);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [previewNote, setPreviewNote] = useState(null);
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [scheduleQuiz, setScheduleQuiz] = useState(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false); // 'draft' | 'published' | false
  const [busyAction, setBusyAction] = useState(null);

  // ---- initial load (seeded from the constants above, not a server) ----
  useEffect(() => {
    let alive = true;
    (async () => {
      await delay(500);
      if (!alive) return;
      setTeacherName(TEACHER.fullName);
      setAssignments(SEED_ASSIGNMENTS);
      setAssignmentsLoading(false);
      setNotes(SEED_NOTES);
      setNotesLoading(false);
      setQuizzes(SEED_QUIZZES);
      setQuizzesLoading(false);
      setPageLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // ---- class filter options, built from assignments ----
  const filterOptions = ['All Classes', ...[...new Set(assignments.map(a => a.className))]];
  const matchesClassFilter = (className) => selectedClass === 'All Classes' || className === selectedClass;
  const visibleNotes = notes.filter(n => matchesClassFilter(n.className));
  const visibleQuizzes = quizzes.filter(q => matchesClassFilter(q.className));

  /* ---- note actions ---- */
  const blankNote = () => ({ id: null, title: '', content: '', classCombinationId: null, subject: null, className: null, fileUrl: '', fileType: '', fileName: '' });

  const openNewNote = () => { setEditingNote(blankNote()); setSection('noteEditor'); };
  const openEditNote = (note) => { setEditingNote(note); setSection('noteEditor'); };

  const saveNote = async (payload) => {
    setEditorSaving(payload.status);
    await delay();
    const stamped = { ...payload, updatedAt: new Date().toISOString() };
    if (payload.id) {
      setNotes(list => list.map(n => n.id === payload.id ? { ...n, ...stamped } : n));
    } else {
      setNotes(list => [{ ...stamped, id: uid() }, ...list]);
    }
    toast(payload.status === 'published' ? 'Note published.' : 'Note saved as draft.');
    setEditorSaving(false);
    setEditingNote(null);
    setSection('notes');
  };

  const toggleNotePublish = async (note) => {
    setBusyAction(note.id);
    await delay(300);
    const nextStatus = note.status === 'published' ? 'draft' : 'published';
    setNotes(list => list.map(n => n.id === note.id ? { ...n, status: nextStatus, updatedAt: new Date().toISOString() } : n));
    toast(nextStatus === 'published' ? 'Note published to the class.' : 'Note moved back to drafts.');
    setBusyAction(null);
  };

  /* ---- quiz actions ---- */
  const blankQuiz = () => ({ id: null, title: '', timeLimitMinutes: null, startsAt: null, endsAt: null, classCombinationId: null, subject: null, className: null, questions: [] });

  const openNewQuiz = () => { setEditingQuiz(blankQuiz()); setSection('quizEditor'); };
  const openEditQuiz = (quiz) => { setEditingQuiz(quiz); setSection('quizEditor'); };

  const saveQuiz = async (payload) => {
    setEditorSaving(payload.status);
    await delay();
    if (payload.id) {
      // No backend, so question edits persist fully here.
      setQuizzes(list => list.map(q => q.id === payload.id ? { ...q, ...payload } : q));
    } else {
      setQuizzes(list => [{ ...payload, id: uid() }, ...list]);
    }
    toast(payload.status === 'published' ? 'Quiz published.' : 'Quiz saved as draft.');
    setEditorSaving(false);
    setEditingQuiz(null);
    setSection('quizzes');
  };

  const toggleQuizPublish = async (quiz) => {
    setBusyAction(quiz.id);
    await delay(300);
    const nextStatus = quiz.status === 'published' ? 'draft' : 'published';
    setQuizzes(list => list.map(q => q.id === quiz.id ? { ...q, status: nextStatus } : q));
    toast(nextStatus === 'published' ? 'Quiz published to the class.' : 'Quiz moved back to drafts.');
    setBusyAction(null);
  };

  const saveSchedule = async (startsAt, endsAt) => {
    if (!scheduleQuiz) return;
    setScheduleSaving(true);
    await delay(300);
    setQuizzes(list => list.map(q => q.id === scheduleQuiz.id ? { ...q, startsAt, endsAt } : q));
    toast('Schedule updated.');
    setScheduleSaving(false);
    setScheduleQuiz(null);
  };

  /* ---- delete ---- */
  const runDelete = async () => {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    await delay(300);
    if (confirmDelete.type === 'note') {
      setNotes(list => list.filter(n => n.id !== confirmDelete.item.id));
      toast('Note deleted.');
    } else {
      setQuizzes(list => list.filter(q => q.id !== confirmDelete.item.id));
      toast('Quiz deleted.');
    }
    setDeleteBusy(false);
    setConfirmDelete(null);
  };

  const handleSignOut = () => {
    if (onSignOut) onSignOut();
    else window.location.assign('/');
  };

  const titles = { notes: 'Notes', noteEditor: 'Note editor', quizzes: 'Quizzes', quizEditor: 'Quiz builder', students: 'Students', progress: 'Progress', live: 'Live Activity', records: 'All Records', settings: 'Settings' };

  if (pageLoading) return <div className="td-root" style={{ minHeight: '100vh' }}><GlobalStyle /><PageSkeleton /></div>;

  return (
    <div className="td-root" style={{ minHeight: '100vh', color: t.text }}>
      <GlobalStyle />
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <div className="td-sidebar-wrap" style={{ display: 'flex' }}>
          <Sidebar section={section} go={setSection} notesCount={notes.length} quizzesCount={quizzes.length}
            teacherName={teacherName} sidebarOpen={false} setSidebarOpen={() => {}} onSignOut={handleSignOut} />
        </div>

        {sidebarOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
            <div onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,17,23,0.45)' }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0 }}>
              <Sidebar section={section} go={setSection} notesCount={notes.length} quizzesCount={quizzes.length}
                teacherName={teacherName} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onSignOut={handleSignOut} />
            </div>
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Header selectedClass={selectedClass} setSelectedClass={setSelectedClass} filterOptions={filterOptions}
            onNewNote={openNewNote} onNewQuiz={openNewQuiz} setSidebarOpen={setSidebarOpen} title={titles[section]} />

          <div className="td-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {section === 'notes' && (
              <NotesDashboard notes={visibleNotes} loading={notesLoading} filter={notesFilter} setFilter={setNotesFilter}
                onView={setPreviewNote} onEdit={openEditNote} onTogglePublish={toggleNotePublish}
                onDelete={(n) => setConfirmDelete({ type: 'note', item: n })} onNewNote={openNewNote} busyAction={busyAction} />
            )}
            {section === 'noteEditor' && editingNote && (
              <NoteEditor initial={editingNote} assignments={assignments} assignmentsLoading={assignmentsLoading}
                onCancel={() => { setEditingNote(null); setSection('notes'); }} onSave={saveNote} saving={editorSaving} />
            )}
            {section === 'quizzes' && (
              <QuizzesDashboard quizzes={visibleQuizzes} loading={quizzesLoading} filter={quizzesFilter} setFilter={setQuizzesFilter}
                onView={setPreviewQuiz} onEdit={openEditQuiz} onTogglePublish={toggleQuizPublish}
                onDelete={(q) => setConfirmDelete({ type: 'quiz', item: q })} onNewQuiz={openNewQuiz} onSchedule={setScheduleQuiz} busyAction={busyAction} />
            )}
            {section === 'quizEditor' && editingQuiz && (
              <QuizEditor initial={editingQuiz} assignments={assignments} assignmentsLoading={assignmentsLoading}
                onCancel={() => { setEditingQuiz(null); setSection('quizzes'); }} onSave={saveQuiz} saving={editorSaving} />
            )}
            {section === 'students' && <PlaceholderPage icon={Users} title="No students linked yet" text="Once students join your class, they'll be listed here with their activity." />}
            {section === 'progress' && <PlaceholderPage icon={TrendingUp} title="No progress data yet" text="Progress charts will appear once students start submitting quizzes." />}
            {section === 'live' && <PlaceholderPage icon={Wifi} title="No live session running" text="Host a quiz to see attendance and answers here in real time." />}
            {section === 'records' && <PlaceholderPage icon={ClipboardList} title="No records yet" text="Every note and quiz you publish will be logged here for reference." />}
            {section === 'settings' && <PlaceholderPage icon={Settings} title="Workspace settings" text="Preferences for your account and classes will live here." />}
          </div>
        </div>
      </div>

      {previewNote && <NotePreviewModal note={previewNote} onClose={() => setPreviewNote(null)} />}
      {previewQuiz && <QuizPreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
      {scheduleQuiz && <ScheduleModal quiz={scheduleQuiz} saving={scheduleSaving} onCancel={() => setScheduleQuiz(null)} onSave={saveSchedule} />}
      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${confirmDelete.type === 'note' ? 'note' : 'quiz'}?`}
          text={`"${confirmDelete.item.title || 'Untitled'}" will be removed from this session. This can't be undone.`}
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