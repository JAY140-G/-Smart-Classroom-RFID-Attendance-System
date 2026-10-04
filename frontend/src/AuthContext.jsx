import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import api from './services/api';
import { clearAccessToken, getAccessToken } from './auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return () => { active = false; };
    }
    api.currentUser()
      .then((result) => { if (active) setUser(result.data.user); })
      .catch(() => { if (active) { clearAccessToken(); setUser(null); } })
      .finally(() => { if (active) setLoading(false); });
    const expire = () => { if (active) { clearAccessToken(); setUser(null); } };
    window.addEventListener('auth:expired', expire);
    return () => {
      active = false;
      window.removeEventListener('auth:expired', expire);
    };
  }, []);

  return <AuthContext.Provider value={{ user, setUser, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

export function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <div className="state-panel loading" role="status">Checking your sign-in...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    const home = user.role === 'ADMIN' ? '/' : user.role === 'TEACHER' ? '/teacher/start-attendance' : '/student/attendance';
    return <Navigate to={home} replace />;
  }
  return children;
}
