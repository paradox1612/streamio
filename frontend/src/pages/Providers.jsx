import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { providerAPI } from '../utils/api';
import {
  Plus, Check, RefreshCw, Signal, Trash2, ArrowRight,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import toast from 'react-hot-toast';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';

function AddProviderModal({ open, onClose, onAdded }) {
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
      setForm({ name: '', hostsInput: '', username: '', password: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add provider');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="mb-1">
            <Badge variant="brand" className="mb-3">New Source</Badge>
          </div>
          <DialogTitle>Add IPTV provider</DialogTitle>
          <DialogDescription>
            Paste one host per line. StreamBridge will track health and switch to the best host automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-5 mt-2">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider name</Label>
              <Input
                required
                placeholder="My IPTV"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                required
                placeholder="xtream_username"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Host URLs</Label>
            <textarea
              className="flex min-h-[120px] w-full resize-y rounded-2xl border border-white/10 bg-surface-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-400/55 transition-all duration-200 focus:outline-none focus:border-brand-500/40 focus:shadow-[0_0_0_3px_rgba(20,145,255,0.15)]"
              required
              placeholder={'http://provider1.com\nhttp://provider2.com'}
              value={form.hostsInput}
              onChange={e => setForm(f => ({ ...f, hostsInput: e.target.value }))}
            />
            <p className="text-xs text-slate-300/50">One URL per line. StreamBridge will automatically route to the healthiest host.</p>
          </div>

          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              required
              placeholder="xtream_password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Adding…
                </span>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Provider
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    } catch (_) { toast.error('Test failed'); }
    finally { setLoading(''); }
  };

  const handleRefresh = async () => {
    setLoading('refresh');
    try {
      const res = await providerAPI.refresh(provider.id);
      toast.success(`Refreshed ${res.data.total} titles`);
      onRefresh();
    } catch (_) { toast.error('Refresh failed'); }
    finally { setLoading(''); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-bold text-white">{provider.name}</h3>
              <StatusBadge status={provider.status} pulse={online} />
            </div>
            <p className="break-all text-sm text-slate-300/60">{provider.active_host || 'No active host available yet'}</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="metric-label mb-1">Titles</p>
                <p className="text-2xl font-bold text-white">{parseInt(provider.vod_count || 0, 10).toLocaleString()}</p>
              </div>
              <div>
                <p className="metric-label mb-1">Match rate</p>
                <p className="text-2xl font-bold text-brand-300">{matchRate}%</p>
              </div>
              <div>
                <p className="metric-label mb-1">Last checked</p>
                <p className="text-sm font-medium text-slate-200">
                  {provider.last_checked ? new Date(provider.last_checked).toLocaleDateString() : 'Not checked yet'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end">
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link to={`/providers/${provider.id}`}>
                Details
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button onClick={handleTest} disabled={!!loading} variant="outline" size="sm" className="w-full sm:w-auto">
              <Signal className="h-3.5 w-3.5" />
              {loading === 'test' ? 'Testing…' : 'Test'}
            </Button>
            <Button onClick={handleRefresh} disabled={!!loading} variant="outline" size="sm" className="w-full sm:w-auto">
              <RefreshCw className={`h-3.5 w-3.5 ${loading === 'refresh' ? 'animate-spin' : ''}`} />
              {loading === 'refresh' ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button onClick={() => onDelete(provider)} variant="destructive" size="sm" className="col-span-2 w-full sm:col-span-1 sm:w-auto">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>

        <div className="mt-6 border-t border-white/[0.07] pt-5">
          <p className="metric-label mb-3">Hosts</p>
          <div className="flex flex-wrap gap-2">
            {(provider.hosts || []).map(host => (
              <Badge
                key={host}
                variant={host === provider.active_host ? 'success' : 'default'}
                className="font-mono text-[11px]"
              >
                {host === provider.active_host && <Check className="h-3 w-3" />}
                <span className="break-all">{host.replace(/^https?:\/\//, '')}</span>
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    </motion.div>
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
    } catch (_) { toast.error('Delete failed'); }
    finally { setDeleting(false); }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl">
        <Card className="p-8 text-center text-slate-300/60">Loading providers…</Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card className="overflow-hidden p-5 sm:p-7 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge variant="default" className="mb-4">Sources</Badge>
              <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
                Manage the providers feeding your library.
              </h1>
              <p className="hero-copy mt-3">
                Keep credentials current, monitor active hosts, test connectivity, and refresh catalogs without losing the operational view.
              </p>
            </div>
            <Button onClick={() => setShowAdd(true)} size="lg" className="w-full sm:w-auto flex-shrink-0">
              <Plus className="h-5 w-5" />
              Add Provider
            </Button>
          </div>
        </Card>
      </motion.section>

      {providers.length === 0 ? (
        <EmptyState
          icon={Plus}
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

      <AddProviderModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={(provider) => {
          setProviders(prev => [provider, ...prev]);
          setShowAdd(false);
        }}
      />

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
