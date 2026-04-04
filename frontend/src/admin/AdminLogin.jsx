import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../utils/api';
import toast from 'react-hot-toast';
import { Shield } from 'lucide-react';
import { ModernStunningSignIn } from '../components/ui/modern-stunning-sign-in';

export default function AdminLogin() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await adminAPI.login(form.username, form.password);
      localStorage.setItem('sb_admin_token', res.data.adminToken);
      toast.success('Admin logged in');
      navigate('/admin/dashboard');
    } catch (err) {
      const nextError = err.response?.data?.error || 'Invalid admin credentials';
      setError(nextError);
      toast.error(nextError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModernStunningSignIn
      brandName="StreamBridge Admin"
      logo={(
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-400/20 bg-brand-500/12 text-brand-100">
          <Shield className="h-5 w-5" />
        </div>
      )}
      title="Admin control plane"
      subtitle="Use your admin username and password. SSO is not enabled for admin access yet."
      identifierMode="username"
      identifierValue={form.username}
      passwordValue={form.password}
      onIdentifierChange={(e) => setForm((current) => ({ ...current, username: e.target.value }))}
      onPasswordChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
      onSubmit={handleSubmit}
      submitLabel="Sign In as Admin"
      loadingLabel="Signing in..."
      loading={loading}
      error={error}
      badge="Restricted access"
      asideTitle="Operate users, providers, and system health from the same visual system."
      asideCopy="The admin side now shares the same premium shell direction as the user workspace, but keeps a tighter control-plane tone."
      asidePoints={[
        'Admin routes stay isolated behind a dedicated token',
        'Same dashboard visual language as the user workspace',
        'Focused operational actions without extra auth providers',
      ]}
    />
  );
}
