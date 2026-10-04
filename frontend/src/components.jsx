import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import api from './services/api';
import { clearAccessToken } from './auth';

const navGroups = [
  { label: 'Overview', items: [{ label: 'Command center', to: '/' }] },
  { label: 'Admin', items: [
    { label: 'Setup center', to: '/admin/setup' }, { label: 'Students', to: '/admin/students' }, { label: 'Teachers', to: '/admin/teachers' },
    { label: 'Subjects', to: '/admin/subjects' }, { label: 'Classes', to: '/admin/classes' },
  { label: 'Timetable', to: '/admin/timetable' }, { label: 'Start attendance', to: '/admin/start-attendance' }, { label: 'Live attendance', to: '/admin/live-attendance' },
  { label: 'Face enrollment', to: '/admin/face-enrollment' }, { label: 'Verification test', to: '/admin/face-verification-test' }, { label: 'Reports', to: '/admin/reports' }
  ] },
  { label: 'Teaching', items: [
    { label: 'Overview', to: '/teacher' }, { label: 'Start attendance', to: '/teacher/start-attendance' }, { label: 'Live attendance', to: '/teacher/live-attendance' },
    { label: 'Register', to: '/teacher/attendance-register' }, { label: 'Subject reports', to: '/teacher/subject-reports' }
  ] },
  { label: 'Student', items: [
    { label: 'Profile', to: '/student/profile' }, { label: 'Attendance', to: '/student/attendance' }, { label: 'History', to: '/student/history' }
  ] }
];

export function Shell({ children }) {
  const location = useLocation();
  const { user, setUser } = useAuth();
  const homePath = user?.role === 'TEACHER' ? '/teacher' : user?.role === 'STUDENT' ? '/student/attendance' : '/';
  const [signOutError, setSignOutError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => setSidebarOpen(false), [location.pathname]);
  const current = navGroups.flatMap((group) => group.items).find((item) => location.pathname === item.to)
    || (location.pathname === '/' ? { label: 'Command center' } : null);
  const visibleGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.to === '/') return user?.role === 'ADMIN';
      if (item.to.startsWith('/admin')) return user?.role === 'ADMIN';
      if (item.to.startsWith('/teacher')) return user?.role === 'TEACHER';
      if (item.to.startsWith('/student')) return user?.role === 'STUDENT';
      return false;
    })
  })).filter((group) => group.items.length);
  const signOut = async () => {
    setSignOutError('');
    try {
      await api.logout();
    } catch (error) {
      setSignOutError(error.message);
    } finally {
      clearAccessToken();
      setUser(null);
    }
  };
  return <div className="app-shell">
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`} id="primary-navigation">
      <Link className="brand" to={homePath}><span className="brand-mark">CP</span><span>Classroom<br /><strong>Pulse</strong></span></Link>
      <div className="sidebar-scroll">{visibleGroups.map((group) => <div className="nav-group" key={group.label}>
        <p>{group.label}</p>{group.items.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}><span className="nav-dot" />{item.label}</NavLink>)}
      </div>)}</div>
      <div className="sidebar-foot"><span className="status-dot online" /> API integration configured</div>
    </aside>
    <main className="main-shell">
      <header className="topbar"><div className="topbar-title"><button className="mobile-menu" aria-label="Open navigation" aria-expanded={sidebarOpen} aria-controls="primary-navigation" onClick={() => setSidebarOpen(true)}>☰</button><div><p className="eyebrow">SMART CLASSROOM / OPERATIONS</p><h1>{current?.label || 'Classroom workspace'}</h1>{signOutError && <small role="alert">{signOutError} · signed out locally.</small>}</div></div><div className="top-actions"><span className="role-chip">{user?.role}</span><div className="profile-chip"><span>{user?.name?.slice(0, 2).toUpperCase()}</span><b>{user?.name}</b><small>{user?.email}</small></div><button className="button secondary" onClick={signOut}>Sign out</button></div></header>
      <div className="content"><Outlet /></div>
    </main>
  </div>;
}

export function PageIntro({ eyebrow, title, children, action }) { return <div className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{children && <p className="intro-copy">{children}</p>}</div>{action}</div>; }
export function StatCard({ label, value, detail, tone = '' }) { return <div className={`stat-card ${tone}`}><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{detail && <div className="stat-detail">{detail}</div>}</div>; }
export function StatusBadge({ value }) { const normalized = String(value || 'NOT AVAILABLE').replace('_', ' '); return <span className={`status-badge ${String(value || '').toLowerCase()}`}>{normalized}</span>; }
export function LoadingState({ label = 'Loading live data' }) { return <div className="state-panel loading"><span className="loader" />{label}</div>; }
export function ErrorState({ error, onRetry }) { return <div className="state-panel error-state"><strong>Could not load this view</strong><span>{error}</span>{onRetry && <button className="button secondary" onClick={onRetry}>Try again</button>}</div>; }
export function EmptyState({ title, children }) { return <div className="state-panel empty-state"><span className="empty-icon">--</span><strong>{title}</strong><span>{children}</span></div>; }
export function Unavailable({ title = 'Management API not available' }) { return <EmptyState title={title}>The backend does not currently expose this CRUD surface. This page is ready for its future API.</EmptyState>; }
export function DataTable({ columns, rows, empty = 'No records found.' }) { return rows?.length ? <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row._id || row.id || index}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key] ?? '--'}</td>)}</tr>)}</tbody></table></div> : <EmptyState title={empty}>Data will appear here when the connected backend returns records.</EmptyState>; }
export function Modal({ title, children, onClose }) { return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h3>{title}</h3><button className="icon-button" onClick={onClose}>×</button></div>{children}</div></div>; }
