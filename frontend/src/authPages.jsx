import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './services/api';
import { useAuth } from './AuthContext';

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
        : result.data.user.role === 'TEACHER' ? '/teacher'
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
