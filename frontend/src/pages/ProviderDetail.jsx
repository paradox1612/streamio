import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { providerAPI } from '../utils/api';
import { ArrowLeftIcon, ArrowPathIcon, PencilSquareIcon, SignalIcon } from '@heroicons/react/24/outline';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import toast from 'react-hot-toast';

export default function ProviderDetail() {
  const { id } = useParams();
  const [provider, setProvider] = useState(null);
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: '', hostsInput: '', username: '', password: '' });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    try {
      const [provRes, statsRes, healthRes] = await Promise.all([
        providerAPI.get(id),
        providerAPI.getStats(id),
        providerAPI.getHealth(id),
      ]);
      setProvider(provRes.data);
      setForm({
        name: provRes.data.name || '',
        hostsInput: (provRes.data.hosts || []).join('\n'),
        username: provRes.data.username || '',
        password: '',
      });
      setStats(statsRes.data);
      setHealth(healthRes.data);
      setCategories(statsRes.data.categories || []);
    } catch (_) {
      toast.error('Failed to load provider details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async (e) => {
    e.preventDefault();
    const hosts = form.hostsInput.split('\n').map(host => host.trim().replace(/\/+$/, '')).filter(Boolean);
    if (!form.name.trim()) return toast.error('Provider name is required');
    if (!hosts.length) return toast.error('Enter at least one host URL');
    if (!form.username.trim()) return toast.error('Username is required');

    const payload = {
      name: form.name.trim(),
      hosts,
      username: form.username.trim(),
    };
    if (form.password.trim()) payload.password = form.password;

    setSaving(true);
    try {
      await providerAPI.update(id, payload);
      await load();
      setEditing(false);
      toast.success('Provider updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setForm({
      name: provider?.name || '',
      hostsInput: (provider?.hosts || []).join('\n'),
      username: provider?.username || '',
      password: '',
    });
    setEditing(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await providerAPI.refresh(id);
      toast.success(`Refreshed ${res.data.total} titles`);
      await load();
    } catch (_) {
      toast.error('Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const handleRecheck = async () => {
    setRechecking(true);
    try {
      const res = await providerAPI.recheckHealth(id);
      setHealth(res.data);
      toast.success('Health recheck complete');
    } catch (_) {
      toast.error('Recheck failed');
    } finally {
      setRechecking(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-7xl"><div className="panel p-8 text-center text-slate-300/70">Loading provider details...</div></div>;
  if (!provider) return <div className="mx-auto max-w-7xl"><div className="panel p-8 text-center text-slate-300/70">Provider not found</div></div>;

  const vodStats = stats?.vodStats || {};
  const matchStats = stats?.matchStats || {};
  const matchRate = matchStats.total > 0 ? Math.round((matchStats.matched / matchStats.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <Link to="/providers" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300/[0.72] transition-colors hover:text-white">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Providers
      </Link>

      <section className="panel overflow-hidden p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="kicker mb-5">Provider Detail</div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="hero-title !max-w-none">{provider.name}</h1>
              <StatusBadge status={provider.status} pulse={provider.status === 'online'} />
            </div>
            <p className="hero-copy mt-4">{provider.active_host || 'No active host selected yet'}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {!editing && (
              <button onClick={() => setEditing(true)} className="btn-secondary">
                <PencilSquareIcon className="h-4 w-4" />
                Edit
              </button>
            )}
            <button onClick={handleRecheck} disabled={rechecking} className="btn-secondary">
              <SignalIcon className="h-4 w-4" />
              {rechecking ? 'Checking...' : 'Recheck Health'}
            </button>
            <button onClick={handleRefresh} disabled={refreshing} className="btn-primary">
              <ArrowPathIcon className="h-4 w-4" />
              {refreshing ? 'Refreshing...' : 'Refresh Catalog'}
            </button>
          </div>
        </div>
      </section>

      {editing && (
        <section className="panel-soft p-6 sm:p-8">
          <p className="eyebrow mb-2">Edit Configuration</p>
          <h2 className="section-title">Provider credentials and hosts</h2>
          <form onSubmit={handleSave} className="mt-6 grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="field-label">Provider Name</label>
                <input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} className="field-input" />
              </div>
              <div>
                <label className="field-label">Username</label>
                <input value={form.username} onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))} className="field-input" />
              </div>
            </div>
            <div>
              <label className="field-label">Host URLs</label>
              <textarea value={form.hostsInput} onChange={(e) => setForm(prev => ({ ...prev, hostsInput: e.target.value }))} className="field-input min-h-[140px] resize-y" />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))} placeholder="Leave blank to keep current password" className="field-input" />
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" onClick={handleCancelEdit} disabled={saving} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Movies', value: parseInt(vodStats.movie_count || 0, 10).toLocaleString() },
          { label: 'Series', value: parseInt(vodStats.series_count || 0, 10).toLocaleString() },
          { label: 'Categories', value: vodStats.category_count || 0 },
          { label: 'Match Rate', value: `${matchRate}%` },
          { label: 'Unmatched', value: parseInt(matchStats.unmatched || 0, 10).toLocaleString() },
        ].map(s => (
          <div key={s.label} className="panel-soft p-5">
            <p className="metric-label mb-2">{s.label}</p>
            <p className="text-3xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="panel-soft p-6 sm:p-8">
          <p className="eyebrow mb-2">Matching</p>
          <h2 className="section-title">Catalog confidence</h2>
          <div className="mt-6">
            <ProgressBar value={matchRate} max={100} color="bg-brand-500" label="Matched Titles" showLabel />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-300/[0.68]">
            {parseInt(matchStats.matched || 0, 10).toLocaleString()} matched out of {parseInt(matchStats.total || 0, 10).toLocaleString()} titles.
          </p>
        </div>

        <div className="panel-soft p-6 sm:p-8">
          <p className="eyebrow mb-2">Hosts</p>
          <h2 className="section-title">Health status</h2>
          <div className="mt-5 space-y-3">
            {health.length === 0 ? (
              <p className="text-sm text-slate-300/[0.68]">No health data yet. Run a recheck to populate response times and status.</p>
            ) : health.map(h => (
              <div key={h.id} className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{h.host_url}</p>
                    <p className="mt-1 text-xs text-slate-300/55">
                      {h.last_checked ? new Date(h.last_checked).toLocaleString() : 'Not checked yet'}
                    </p>
                  </div>
                  <StatusBadge status={h.status} />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-slate-300/[0.68]">
                  <span>{h.response_time_ms ? `${h.response_time_ms}ms response` : 'No response time'}</span>
                  <span>{h.host_url === provider.active_host ? 'Active host' : 'Standby host'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="panel-soft p-6 sm:p-8">
          <p className="eyebrow mb-2">Catalog Layout</p>
          <h2 className="section-title">Category breakdown</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {categories.slice(0, 30).map(cat => (
              <div key={`${cat.category}-${cat.vod_type}`} className="flex items-center justify-between rounded-[20px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200/[0.82]">
                  {cat.category} <span className="text-xs text-slate-300/50">({cat.vod_type})</span>
                </span>
                <span className="ml-3 text-sm font-bold text-brand-300">{parseInt(cat.count, 10).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
