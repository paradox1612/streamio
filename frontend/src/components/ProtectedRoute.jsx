import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a' }}>
        <div style={{ color: '#818cf8', fontSize: '1.2rem' }}>Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
