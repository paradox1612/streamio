import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, userAPI } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sb_token');
    if (token) {
      userAPI.getProfile()
        .then(res => setUser(res.data.user))
        .catch(() => localStorage.removeItem('sb_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login(email, password);
    localStorage.setItem('sb_token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const signup = async (email, password) => {
    const res = await authAPI.signup(email, password);
    localStorage.setItem('sb_token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = async () => {
    try { await authAPI.logout(); } catch (_) {}
    localStorage.removeItem('sb_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
