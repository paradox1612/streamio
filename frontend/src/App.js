import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

// User pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Providers from './pages/Providers';
import ProviderDetail from './pages/ProviderDetail';
import VodBrowser from './pages/VodBrowser';
import LiveTV from './pages/LiveTV';
import AddonSettings from './pages/AddonSettings';
import Account from './pages/Account';
import ForgotPassword from './pages/ForgotPassword';

// Admin pages
import AdminLogin from './admin/AdminLogin';
import AdminLayout from './admin/AdminLayout';
import AdminOverview from './admin/AdminOverview';
import AdminUsers from './admin/AdminUsers';
import AdminProviders from './admin/AdminProviders';
import AdminFreeAccess from './admin/AdminFreeAccess';
import AdminHealth from './admin/AdminHealth';
import AdminTmdb from './admin/AdminTmdb';
import AdminSystem from './admin/AdminSystem';

function UserLayout({ children }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

function AdminRoute({ children }) {
  const adminToken = localStorage.getItem('sb_admin_token');
  if (!adminToken) return <Navigate to="/admin/login" replace />;
  return <AdminLayout>{children}</AdminLayout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: 'rgba(8, 16, 31, 0.92)', color: '#edf4ff', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)' },
            success: { iconTheme: { primary: '#22c55e', secondary: '#f1f5f9' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' } },
          }}
        />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/" element={<Landing />} />

          {/* User Dashboard */}
          <Route path="/dashboard" element={<UserLayout><Dashboard /></UserLayout>} />
          <Route path="/providers" element={<UserLayout><Providers /></UserLayout>} />
          <Route path="/providers/:id" element={<UserLayout><ProviderDetail /></UserLayout>} />
          <Route path="/vod" element={<UserLayout><VodBrowser /></UserLayout>} />
          <Route path="/live" element={<UserLayout><LiveTV /></UserLayout>} />
          <Route path="/addon" element={<UserLayout><AddonSettings /></UserLayout>} />
          <Route path="/account" element={<UserLayout><Account /></UserLayout>} />

          {/* Admin */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<AdminRoute><AdminOverview /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
          <Route path="/admin/providers" element={<AdminRoute><AdminProviders /></AdminRoute>} />
          <Route path="/admin/free-access" element={<AdminRoute><AdminFreeAccess /></AdminRoute>} />
          <Route path="/admin/health" element={<AdminRoute><AdminHealth /></AdminRoute>} />
          <Route path="/admin/tmdb" element={<AdminRoute><AdminTmdb /></AdminRoute>} />
          <Route path="/admin/system" element={<AdminRoute><AdminSystem /></AdminRoute>} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
