import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { providerAPI } from '../utils/api';
import {
  PlusIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon,
  SignalIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import toast from 'react-hot-toast';

function AddProviderModal({ onClose, onAdded }) {
  const [form, setForm] = useState({ name: '', hostsInput: '', username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const hosts = form.hostsInput.split('\n').map(h => h.trim()).filter(Boolean);
    if (!hosts.length) return toast.error('Enter at least one host URL');
    setLoading(true);
    try {
      const res = await providerAPI.create({ name: form.name, hosts, username: form.username, password: form.password });
      toast.success('Provider added');
      onAdded(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add provider');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="panel max-h-[calc(100svh-2rem)] w-full max-w-2xl overflow-y-auto p-4 sm:p-8">
        <div className="mb-5 flex items-start justify-between gap-4 sm:mb-6">
          <div>
            <p className="eyebrow mb-2">New Source</p>
            <h2 className="section-title">Add IPTV provider</h2>
            <p className="section-copy mt-2">Paste one host per line. StreamBridge will track health and switch to the best host automatically.</p>
          </div>
          <button onClick={onClose} className="btn-secondary !rounded-2xl !px-3 !py-3">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="field-label">Provider Name</label>
              <input className="field-input" required placeholder="My IPTV" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Username</label>
              <input className="field-input" required placeholder="xtream_username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="field-label">Host URLs</label>
            <textarea
              className="field-input min-h-[140px] resize-y"
              required
              placeholder={'http://provider1.com\nhttp://provider2.com'}
              value={form.hostsInput}
              onChange={e => setForm(f => ({ ...f, hostsInput: e.target.value }))}
            />
          </div>

          <div>
            <label className="field-label">Password</label>
            <input className="field-input" type="password" required placeholder="xtream_password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>

          <div className="grid gap-3 pt-2 sm:flex sm:flex-wrap sm:justify-end">
            <button type="button" onClick={onClose} className="btn-secondary w-full sm:w-auto">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto">
              {loading ? 'Adding provider...' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProviderRow({ provider, onRefresh, onDelete }) {
  const [loading, setLoading] = useState('');
  const online = provider.status === 'online';
  const matchRate = provider.vod_count && provider.matched_count
    ? Math.round((parseInt(provider.matched_count, 10) / parseInt(provider.vod_count, 10)) * 100)
    : 0;

  const handleTest = async () => {
    setLoading('test');
    try {
      await providerAPI.test(provider.id);
      toast.success('Connection tested');
      onRefresh();
    } catch (_) {
      toast.error('Test failed');
    } finally {
      setLoading('');
    }
  };

  const handleRefresh = async () => {
    setLoading('refresh');
    try {
      const res = await providerAPI.refresh(provider.id);
      toast.success(`Refreshed ${res.data.total} titles`);
      onRefresh();
    } catch (_) {
      toast.error('Refresh failed');
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="panel-soft p-4 sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-bold text-white">{provider.name}</h3>
            <StatusBadge status={provider.status} pulse={online} />
          </div>
          <p className="break-all text-sm text-slate-300/70">{provider.active_host || 'No active host available yet'}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="metric-label mb-1">Titles</p>
              <p className="text-2xl font-bold text-white">{parseInt(provider.vod_count || 0, 10).toLocaleString()}</p>
            </div>
            <div>
              <p className="metric-label mb-1">Match Rate</p>
              <p className="text-2xl font-bold text-brand-300">{matchRate}%</p>
            </div>
            <div>
              <p className="metric-label mb-1">Last Checked</p>
              <p className="text-sm font-medium text-slate-200">{provider.last_checked ? new Date(provider.last_checked).toLocaleDateString() : 'Not checked yet'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end">
          <Link to={`/providers/${provider.id}`} className="btn-secondary w-full sm:w-auto">
            Details
          </Link>
          <button onClick={handleTest} disabled={!!loading} className="btn-secondary w-full sm:w-auto">
            <SignalIcon className="h-4 w-4" />
            {loading === 'test' ? 'Testing...' : 'Test'}
          </button>
          <button onClick={handleRefresh} disabled={!!loading} className="btn-secondary w-full sm:w-auto">
            <ArrowPathIcon className="h-4 w-4" />
            {loading === 'refresh' ? 'Refreshing...' : 'Refresh'}
          </button>
          <button onClick={() => onDelete(provider)} className="btn-danger col-span-2 w-full sm:col-span-1 sm:w-auto">
            <TrashIcon className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="mt-6 border-t border-white/[0.08] pt-5">
        <p className="metric-label mb-3">Hosts</p>
        <div className="flex flex-wrap gap-2">
          {(provider.hosts || []).map(host => (
            <span
              key={host}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${
                host === provider.active_host
                  ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
                  : 'border-white/10 bg-white/[0.04] text-slate-200/[0.78]'
              }`}
            >
              {host === provider.active_host && <CheckIcon className="h-3.5 w-3.5" />}
              <span className="break-all">{host.replace(/^https?:\/\//, '')}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Providers() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    providerAPI.list()
      .then(res => setProviders(res.data))
      .catch(() => toast.error('Failed to load providers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDeleteProvider = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await providerAPI.delete(deleteTarget.id);
      toast.success('Provider deleted');
      setProviders(prev => prev.filter(x => x.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (_) {
      toast.error('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="panel p-8 text-center text-slate-300/70">Loading providers...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="panel overflow-hidden p-5 sm:p-7 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="kicker mb-4">Sources</div>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">Manage the providers feeding your library.</h1>
            <p className="hero-copy mt-3">
              Keep credentials current, monitor active hosts, test connectivity, and refresh catalogs without losing the operational view.
            </p>
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary w-full sm:w-auto">
            <PlusIcon className="h-5 w-5" />
            Add Provider
          </button>
        </div>
      </section>

      {providers.length === 0 ? (
        <EmptyState
          icon={PlusIcon}
          heading="No providers connected"
          description="Connect your first IPTV source to start loading VOD titles, live channels, and account-specific addon content."
          action={() => setShowAdd(true)}
          actionLabel="Add Your First Provider"
        />
      ) : (
        <section className="space-y-4">
          {providers.map(p => (
            <ProviderRow key={p.id} provider={p} onRefresh={load} onDelete={setDeleteTarget} />
          ))}
        </section>
      )}

      {showAdd && (
        <AddProviderModal
          onClose={() => setShowAdd(false)}
          onAdded={(provider) => {
            setProviders(prev => [provider, ...prev]);
            setShowAdd(false);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : 'Delete provider?'}
        description="This removes the provider, its hosts, and its routed catalog from your account."
        confirmLabel="Delete Provider"
        danger
        loading={deleting}
        onConfirm={handleDeleteProvider}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
