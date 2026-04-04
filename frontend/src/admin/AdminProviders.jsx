import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Database,
  Link2Off,
  RefreshCw,
  Server,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../utils/api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import DataTableFilter from '../components/ui/data-table-filter';
import AdminDataTable from './AdminDataTable';

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString();
}

function MetricCard({ label, value, detail, icon: Icon, tone }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">{label}</p>
            <p className="mt-3 text-3xl font-bold text-white">{value}</p>
            <p className="mt-2 text-sm text-slate-300/60">{detail}</p>
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminProviders() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [hostFilter, setHostFilter] = useState([]);

  const load = async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);

    try {
      const response = await adminAPI.listProviders({ limit: 200 });
      setProviders(Array.isArray(response.data) ? response.data : []);
    } catch (_) {
      toast.error('Failed to load providers');
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
  }, []);

  const filteredProviders = useMemo(() => providers.filter((provider) => {
    const haystack = [
      provider.name,
      provider.user_email,
      provider.active_host,
      provider.status,
    ].filter(Boolean).join(' ').toLowerCase();

    const matchesSearch = haystack.includes(search.toLowerCase());
    const normalizedStatus = provider.status === 'online' ? 'online' : 'degraded';
    const hostState = provider.active_host ? 'with-host' : 'without-host';
    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(normalizedStatus);
    const matchesHost = hostFilter.length === 0 || hostFilter.includes(hostState);

    return matchesSearch && matchesStatus && matchesHost;
  }), [hostFilter, providers, search, statusFilter]);

  const metrics = useMemo(() => {
    const online = filteredProviders.filter((provider) => provider.status === 'online').length;
    const totalTitles = filteredProviders.reduce((sum, provider) => sum + parseInt(provider.vod_count || 0, 10), 0);
    const withoutHost = filteredProviders.filter((provider) => !provider.active_host).length;

    return { online, totalTitles, withoutHost };
  }, [filteredProviders]);

  const handleRefresh = async (providerId) => {
    try {
      const response = await adminAPI.refreshProvider(providerId);
      toast.success(`Refreshed: ${response.data.total} titles`);
      load();
    } catch (_) {
      toast.error('Refresh failed');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete provider "${name}"?`)) return;

    try {
      await adminAPI.deleteProvider(id);
      toast.success('Provider deleted');
      setProviders((current) => current.filter((provider) => provider.id !== id));
    } catch (_) {
      toast.error('Delete failed');
    }
  };

  const columns = [
    {
      key: 'provider',
      header: 'Provider',
      render: (provider) => (
        <div className="min-w-[16rem]">
          <div className="font-semibold text-white">{provider.name}</div>
          <div className="mt-1 text-xs text-slate-400/75">{provider.user_email}</div>
        </div>
      ),
    },
    {
      key: 'host',
      header: 'Active Host',
      render: (provider) => (
        <div className="min-w-[18rem]">
          <div className="font-mono text-xs text-slate-200/80">
            {provider.active_host || 'No active host'}
          </div>
          <div className="mt-1 text-xs text-slate-400/70">
            {provider.active_host ? 'Routing target selected' : 'Needs fallback or recovery'}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Health',
      render: (provider) => (
        <Badge variant={provider.status === 'online' ? 'success' : 'danger'} className="w-fit capitalize">
          {provider.status === 'online' ? 'Online' : provider.status}
        </Badge>
      ),
    },
    {
      key: 'titles',
      header: 'Catalog',
      render: (provider) => (
        <div>
          <div className="text-lg font-semibold text-white">{parseInt(provider.vod_count || 0, 10).toLocaleString()}</div>
          <div className="text-xs text-slate-400/70">titles indexed</div>
        </div>
      ),
    },
    {
      key: 'updated',
      header: 'Last Sync',
      render: (provider) => (
        <div>
          <div className="font-medium text-slate-100">{formatDate(provider.updated_at || provider.last_checked)}</div>
          <div className="text-xs text-slate-400/70">latest admin-visible update</div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cellClassName: 'min-w-[14rem]',
      render: (provider) => (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => handleRefresh(provider.id)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="rounded-xl"
            onClick={() => handleDelete(provider.id, provider.name)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-6 sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">Admin providers</p>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Provider health and catalog volume now sit on a single operational surface.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/65">
              Search is instant across provider name, user, host, and status. Operators can isolate degraded sources or missing hosts before they turn into browsing failures.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard
            label="Visible providers"
            value={filteredProviders.length}
            detail={`${metrics.online} online, ${metrics.withoutHost} without an active host`}
            icon={Server}
            tone="border-brand-400/20 bg-brand-500/10 text-brand-200"
          />
          <MetricCard
            label="Catalog volume"
            value={metrics.totalTitles.toLocaleString()}
            detail="Total titles across the visible provider slice."
            icon={Database}
            tone="border-sky-400/20 bg-sky-400/10 text-sky-200"
          />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Online"
          value={metrics.online}
          detail="Providers currently reporting healthy status."
          icon={Activity}
          tone="border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
        />
        <MetricCard
          label="Missing host"
          value={metrics.withoutHost}
          detail="Providers with no active host selected."
          icon={Link2Off}
          tone="border-red-400/20 bg-red-500/10 text-red-200"
        />
        <MetricCard
          label="Catalog total"
          value={metrics.totalTitles.toLocaleString()}
          detail="Titles represented in the current filtered view."
          icon={Database}
          tone="border-amber-400/20 bg-amber-400/10 text-amber-200"
        />
      </div>

      <AdminDataTable
        title="Provider directory"
        description="The table keeps refresh and delete actions intact while giving operators richer filtering for health and routing gaps."
        count={filteredProviders.length}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by provider, user, host, or status..."
        primaryAction={{
          label: 'Reload',
          icon: RefreshCw,
          onClick: () => load(),
          variant: 'outline',
        }}
        filters={[
          (
            <DataTableFilter
              label="Health state"
              options={[
                { value: 'online', label: 'Online', icon: Activity },
                { value: 'degraded', label: 'Degraded', icon: Link2Off },
              ]}
              selectedValues={statusFilter}
              onChange={setStatusFilter}
              isMultiSelect
            />
          ),
          (
            <DataTableFilter
              label="Host routing"
              options={[
                { value: 'with-host', label: 'With active host', icon: Server },
                { value: 'without-host', label: 'Missing active host', icon: Link2Off },
              ]}
              selectedValues={hostFilter}
              onChange={setHostFilter}
              isMultiSelect
            />
          ),
        ]}
        columns={columns}
        rows={filteredProviders}
        loading={loading}
        emptyMessage="No providers match the current filters."
        rowKey={(provider) => provider.id}
      />
    </div>
  );
}
