import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  Link2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../utils/api';
import { reportableError } from '../utils/reportableToast';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import DataTableFilter from '../components/ui/data-table-filter';
import AdminDataTable from './AdminDataTable';

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

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatExpiry(provider) {
  if (!provider.account_expires_at) return 'No expiry';
  if (provider.days_until_expiry === null || provider.days_until_expiry === undefined) return 'Unknown';
  if (provider.days_until_expiry < 0) return `Expired ${Math.abs(provider.days_until_expiry)}d ago`;
  if (provider.days_until_expiry === 0) return 'Expires today';
  return `${provider.days_until_expiry}d left`;
}

function getRiskBadge(provider) {
  if (provider.expiry_risk === 'critical') return { variant: 'danger', label: 'Critical' };
  if (provider.expiry_risk === 'warning') return { variant: 'warning', label: 'Warning' };
  if (provider.expiry_risk === 'expired') return { variant: 'danger', label: 'Expired' };
  if (provider.expiry_risk === 'healthy') return { variant: 'success', label: 'Healthy' };
  return { variant: 'outline', label: 'Unknown' };
}

export default function AdminCrm() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState([]);
  const [coverageFilter, setCoverageFilter] = useState([]);

  const load = async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const [statusRes, coverageRes] = await Promise.all([
        adminAPI.getCrmStatus(),
        adminAPI.getCrmCoverage(),
      ]);
      setData({
        status: statusRes.data,
        summary: coverageRes.data.summary,
        providers: coverageRes.data.providers || [],
      });
    } catch (_) {
      reportableError('Failed to load CRM coverage');
    } finally {
      if (initial) setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
  }, []);

  const filteredProviders = useMemo(() => {
    const providers = data?.providers || [];
    return providers.filter((provider) => {
      const haystack = [
        provider.name,
        provider.user_email,
        provider.network_name,
        provider.active_host,
        provider.source_type,
      ].filter(Boolean).join(' ').toLowerCase();

      const coverageState = provider.sync_state.personLinked
        && provider.sync_state.companyLinked
        && provider.sync_state.providerAccessLinked
        ? 'linked'
        : 'missing-links';

      const matchesSearch = haystack.includes(search.toLowerCase());
      const matchesRisk = riskFilter.length === 0 || riskFilter.includes(provider.expiry_risk);
      const matchesCoverage = coverageFilter.length === 0 || coverageFilter.includes(coverageState);

      return matchesSearch && matchesRisk && matchesCoverage;
    });
  }, [coverageFilter, data?.providers, riskFilter, search]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await adminAPI.syncCrmAll();
      toast.success('CRM sync started');
      setTimeout(() => load(), 1500);
    } catch (err) {
      reportableError(err.response?.data?.error || 'Failed to start CRM sync');
    } finally {
      setSyncing(false);
    }
  };

  const columns = [
    {
      key: 'provider',
      header: 'Provider Access',
      render: (provider) => (
        <div className="min-w-[16rem]">
          <div className="font-semibold text-white">{provider.name}</div>
          <div className="mt-1 text-xs text-slate-400/75">{provider.user_email}</div>
          <div className="mt-1 text-xs text-slate-500">{provider.network_name || 'No network linked'}</div>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (provider) => (
        <div>
          <Badge variant={provider.source_type === 'MARKETPLACE' ? 'success' : 'brand'} className="w-fit">
            {provider.source_type}
          </Badge>
          <div className="mt-2 text-xs text-slate-400/75">{provider.active_host || 'No active host'}</div>
        </div>
      ),
    },
    {
      key: 'coverage',
      header: 'CRM Coverage',
      cellClassName: 'min-w-[14rem]',
      render: (provider) => (
        <div className="space-y-1 text-xs">
          <div className={provider.sync_state.personLinked ? 'text-emerald-300' : 'text-red-300'}>
            Person {provider.sync_state.personLinked ? 'linked' : 'missing'}
          </div>
          <div className={provider.sync_state.companyLinked ? 'text-emerald-300' : 'text-red-300'}>
            Company {provider.sync_state.companyLinked ? 'linked' : 'missing'}
          </div>
          <div className={provider.sync_state.providerAccessLinked ? 'text-emerald-300' : 'text-red-300'}>
            Access {provider.sync_state.providerAccessLinked ? 'linked' : 'missing'}
          </div>
        </div>
      ),
    },
    {
      key: 'expiry',
      header: 'Expiry Risk',
      render: (provider) => {
        const badge = getRiskBadge(provider);
        return (
          <div>
            <Badge variant={badge.variant} className="w-fit">{badge.label}</Badge>
            <div className="mt-2 font-medium text-slate-100">{formatExpiry(provider)}</div>
            <div className="text-xs text-slate-400/75">{formatDateTime(provider.account_expires_at)}</div>
          </div>
        );
      },
    },
    {
      key: 'sync',
      header: 'Last Account Sync',
      render: (provider) => (
        <div>
          <div className="font-medium text-slate-100">{formatDateTime(provider.account_last_synced_at)}</div>
          <div className="text-xs text-slate-400/75">
            Health {provider.status || 'unknown'} · Account {provider.account_status || 'unknown'}
          </div>
        </div>
      ),
    },
  ];

  const summary = data?.summary || {
    totalProviders: 0,
    peopleLinked: 0,
    companiesLinked: 0,
    providerAccessLinked: 0,
    criticalExpiry: 0,
    warningExpiry: 0,
    expired: 0,
    unknownExpiry: 0,
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-6 sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">Admin CRM</p>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Provider access coverage and expiry risk sit in one operator view.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/65">
              This view is driven by local StreamBridge linkage state so you can spot missing Twenty IDs, expiry gaps, and sync fallout before duplicates spread again.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Badge variant={data?.status?.connected ? 'success' : 'danger'}>
                Twenty {data?.status?.connected ? 'connected' : 'disconnected'}
              </Badge>
              <Badge variant="outline">
                API {data?.status?.status || 'unknown'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard
            label="Provider access linked"
            value={`${summary.providerAccessLinked}/${summary.totalProviders}`}
            detail="Local provider rows with a persisted Twenty provider access ID."
            icon={Link2}
            tone="border-brand-400/20 bg-brand-500/10 text-brand-200"
          />
          <MetricCard
            label="Critical expiry"
            value={summary.criticalExpiry + summary.expired}
            detail="Providers already expired or expiring within 3 days."
            icon={ShieldAlert}
            tone="border-red-400/20 bg-red-500/10 text-red-200"
          />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="People linked"
          value={summary.peopleLinked}
          detail="Providers whose user is linked to a Twenty person."
          icon={CheckCircle2}
          tone="border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
        />
        <MetricCard
          label="Companies linked"
          value={summary.companiesLinked}
          detail="Providers whose network is linked to a Twenty company."
          icon={DatabaseZap}
          tone="border-sky-400/20 bg-sky-400/10 text-sky-200"
        />
        <MetricCard
          label="Warning window"
          value={summary.warningExpiry}
          detail="Providers expiring in 4 to 7 days."
          icon={AlertTriangle}
          tone="border-amber-400/20 bg-amber-400/10 text-amber-200"
        />
        <MetricCard
          label="Unknown expiry"
          value={summary.unknownExpiry}
          detail="Providers with no usable expiry date yet."
          icon={ShieldAlert}
          tone="border-white/[0.15] bg-white/[0.04] text-slate-200"
        />
      </div>

      <AdminDataTable
        title="CRM provider coverage"
        description="Use this table to find missing Twenty links and provider accounts that need refresh before expiry tasks can become reliable."
        count={filteredProviders.length}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by provider, user, network, host, or source..."
        primaryAction={{
          label: syncing ? 'Syncing...' : 'Run CRM Sync',
          icon: RefreshCw,
          onClick: handleSync,
          variant: 'outline',
        }}
        filters={[
          (
            <DataTableFilter
              label="Expiry risk"
              options={[
                { value: 'critical', label: 'Critical', icon: ShieldAlert },
                { value: 'warning', label: 'Warning', icon: AlertTriangle },
                { value: 'expired', label: 'Expired', icon: ShieldAlert },
                { value: 'unknown', label: 'Unknown', icon: DatabaseZap },
                { value: 'healthy', label: 'Healthy', icon: CheckCircle2 },
              ]}
              selectedValues={riskFilter}
              onChange={setRiskFilter}
              isMultiSelect
            />
          ),
          (
            <DataTableFilter
              label="Coverage"
              options={[
                { value: 'linked', label: 'All linked', icon: CheckCircle2 },
                { value: 'missing-links', label: 'Missing links', icon: Link2 },
              ]}
              selectedValues={coverageFilter}
              onChange={setCoverageFilter}
              isMultiSelect
            />
          ),
        ]}
        columns={columns}
        rows={filteredProviders}
        loading={loading}
        emptyMessage="No provider access rows match the current CRM filters."
        rowKey={(provider) => provider.id}
      />
    </div>
  );
}
