import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './services/api';
import { useAuth } from './AuthContext';
import { clearAccessToken } from './auth';
import { DataTable, EmptyState, ErrorState, LoadingState, PageIntro } from './components';

export function Login() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await api.login({ email, password });
      setUser(result.data.user);
      const destination = result.data.user.role === 'ADMIN' ? '/'
        : result.data.user.role === 'TEACHER' ? '/teacher/start-attendance'
          : '/student/attendance';
      navigate(destination, { replace: true });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="login-page">
    <div className="login-art"><span className="brand-mark">CP</span><p className="eyebrow">SMART CLASSROOM / SECURE ACCESS</p><h2>A clearer pulse<br />for every room.</h2><p>Sign in with your school account to access the workspace assigned to your role.</p></div>
    <form className="login-card" onSubmit={submit}>
      <p className="eyebrow">WELCOME BACK</p><h1>Sign in</h1>
      <label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button primary wide" disabled={submitting}>{submitting ? 'Signing in...' : 'Sign in'}</button>
    </form>
  </div>;
}

export function StudentDashboard({ history = false }) {
  const data = useAuth();
  const [attendance, setAttendance] = useState({ loading: true, error: '', data: [] });
  useEffect(() => {
    let active = true;
    api.myAttendance()
      .then((result) => { if (active) setAttendance({ loading: false, error: '', data: result.data || [] }); })
      .catch((error) => {
        if (error.message === 'Authentication required') clearAccessToken();
        if (active) setAttendance({ loading: false, error: error.message, data: [] });
      });
    return () => { active = false; };
  }, []);
  if (attendance.loading) return <LoadingState label="Loading student attendance" />;
  if (attendance.error) return <ErrorState error={attendance.error} onRetry={() => window.location.reload()} />;
  return <>
    <PageIntro eyebrow={`STUDENT / ${history ? 'HISTORY' : 'ATTENDANCE'}`} title={history ? 'Attendance history' : 'My attendance'}>
      <span>Signed in as {data.user?.name}. Your attendance is resolved from your account.</span>
    </PageIntro>
    {history
      ? <DataTable columns={[
        { key: 'subject', label: 'Subject', render: (row) => row.subject?.name || row.subject?.code },
        { key: 'presentCount', label: 'Present' },
        { key: 'completedClassCount', label: 'Completed' },
        { key: 'attendancePercentage', label: 'Percentage', render: (row) => <strong>{row.attendancePercentage}%</strong> }
      ]} rows={attendance.data} empty="No attendance history" />
      : attendance.data.length
        ? <div className="report-grid">{attendance.data.map((item) => <article className="report-card" key={item.subject?._id}><p>{item.subject?.name || item.subject?.code}</p><strong>{item.attendancePercentage}%</strong><span>{item.presentCount} present / {item.completedClassCount} completed</span></article>)}</div>
        : <EmptyState title="No attendance yet">Completed subject records will appear here.</EmptyState>}
  </>;
}

export function StudentProfile() {
  const { user } = useAuth();
  return <>
    <PageIntro eyebrow="STUDENT / PROFILE" title="Student profile">
      <span>Your profile is linked to your authenticated account.</span>
    </PageIntro>
    <div className="panel">
      <p><strong>Name</strong> · {user.name}</p>
      <p><strong>Email</strong> · {user.email}</p>
      <p><strong>Role</strong> · {user.role}</p>
    </div>
  </>;
}
