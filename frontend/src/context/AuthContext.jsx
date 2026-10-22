import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, post } from '../api/client.js';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem('clinic_token');
    if (!token) { setReady(true); return; }
    api('/auth/me').then((data) => setUser(data.user)).catch(() => localStorage.removeItem('clinic_token')).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    const expire = () => { localStorage.removeItem('clinic_token'); setUser(null); };
    window.addEventListener('clinic:expired', expire);
    return () => window.removeEventListener('clinic:expired', expire);
  }, []);
  const value = useMemo(() => ({ user, ready, async login(email, password) { const data = await post('/auth/login', { email, password }); localStorage.setItem('clinic_token', data.token); setUser(data.user); return data.user; }, logout() { localStorage.removeItem('clinic_token'); setUser(null); } }), [user, ready]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
