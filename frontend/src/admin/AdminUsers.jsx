import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock3,
  Gift,
  Shield,
  UserRoundCog,
  UserRoundX,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { reportableError } from '../utils/reportableToast';
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

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [accessFilter, setAccessFilter] = useState([]);

  const load = async (term, isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);

    try {
      const response = await adminAPI.listUsers({ search: term, limit: 100 });
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (_) {
      reportableError('Failed to load users');
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load(search, loading);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [loading, search]);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const matchesStatus = statusFilter.length === 0
      || statusFilter.includes(user.is_active ? 'active' : 'suspended');
    const matchesAccess = accessFilter.length === 0
      || accessFilter.includes(user.free_access_status || 'inactive');
    return matchesStatus && matchesAccess;
  }), [accessFilter, statusFilter, users]);

  const metrics = useMemo(() => {
    const active = filteredUsers.filter((user) => user.is_active).length;
    const suspended = filteredUsers.length - active;
    const freeAccessActive = filteredUsers.filter((user) => user.free_access_status === 'active').length;
    const withProviders = filteredUsers.filter((user) => Number(user.provider_count || 0) > 0).length;

    return { active, suspended, freeAccessActive, withProviders };
  }, [filteredUsers]);

  const handleSuspend = async (user) => {
    try {
      await adminAPI.suspendUser(user.id, user.is_active);
      toast.success(user.is_active ? 'User suspended' : 'User activated');
      load(search);
    } catch (_) {
      reportableError('Action failed');
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user ${user.email}? This is permanent.`)) return;

    try {
      await adminAPI.deleteUser(user.id);
      toast.success('User deleted');
      setUsers((current) => current.filter((entry) => entry.id !== user.id));
    } catch (_) {
      reportableError('Delete failed');
    }
  };

  const columns = [
    {
      key: 'email',
      header: 'Identity',
      render: (user) => (
        <div className="min-w-[15rem]">
          <div className="font-semibold text-white">{user.email}</div>
          <div className="mt-1 text-xs text-slate-400/75">Created {formatDate(user.created_at)}</div>
        </div>
      ),
    },
    {
      key: 'providers',
      header: 'Providers',
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      render: (user) => (
        <div>
          <div className="text-lg font-semibold text-white">{Number(user.provider_count || 0).toLocaleString()}</div>
          <div className="text-xs text-slate-400/70">linked sources</div>
        </div>
      ),
    },
    {
      key: 'freeAccess',
      header: 'Free Access',
      render: (user) => {
        const status = user.free_access_status || 'inactive';
        const variant = status === 'active' ? 'success' : status === 'expired' ? 'warning' : 'outline';

        return (
          <Badge variant={variant} className="w-fit capitalize">
            {status}
          </Badge>
        );
      },
    },
    {
      key: 'status',
      header: 'Account Status',
      render: (user) => (
        <Badge variant={user.is_active ? 'success' : 'danger'} className="w-fit">
          {user.is_active ? 'Active' : 'Suspended'}
        </Badge>
      ),
    },
    {
      key: 'lastSeen',
      header: 'Last Seen',
      render: (user) => (
        <div>
          <div className="font-medium text-slate-100">{formatDate(user.last_seen)}</div>
          <div className="text-xs text-slate-400/70">recent activity</div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cellClassName: 'min-w-[15rem]',
      render: (user) => (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-xl">
            <Link to={`/admin/users/${user.id}`}>View</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => handleSuspend(user)}
          >
            {user.is_active ? 'Suspend' : 'Activate'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="rounded-xl"
            onClick={() => handleDelete(user)}
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200/70">Admin users</p>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">User access, provider usage, and free-access state in one table.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/65">
              Search remains backed by the API, while status and free-access filters run instantly client-side so operators can narrow down action lists without extra network churn.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard
            label="Visible users"
            value={filteredUsers.length}
            detail={`${metrics.active} active, ${metrics.suspended} suspended`}
            icon={Users}
            tone="border-brand-400/20 bg-brand-500/10 text-brand-200"
          />
          <MetricCard
            label="Free access"
            value={metrics.freeAccessActive}
            detail={`${metrics.withProviders} users have providers linked`}
            icon={Gift}
            tone="border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
          />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Healthy accounts"
          value={metrics.active}
          detail="Currently allowed to sign in and operate."
          icon={Shield}
          tone="border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
        />
        <MetricCard
          label="Suspended"
          value={metrics.suspended}
          detail="Accounts currently blocked from access."
          icon={UserRoundX}
          tone="border-red-400/20 bg-red-500/10 text-red-200"
        />
        <MetricCard
          label="Free access active"
          value={metrics.freeAccessActive}
          detail="Users inside a current trial window."
          icon={Gift}
          tone="border-amber-400/20 bg-amber-400/10 text-amber-200"
        />
        <MetricCard
          label="With providers"
          value={metrics.withProviders}
          detail="Accounts that already configured catalog sources."
          icon={UserRoundCog}
          tone="border-sky-400/20 bg-sky-400/10 text-sky-200"
        />
      </div>

      <AdminDataTable
        title="User directory"
        description="The table keeps existing admin actions intact while making state and access slices easier to scan."
        count={filteredUsers.length}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search users by email..."
        filters={[
          (
            <DataTableFilter
              label="Account status"
              options={[
                { value: 'active', label: 'Active', icon: Shield },
                { value: 'suspended', label: 'Suspended', icon: UserRoundX },
              ]}
              selectedValues={statusFilter}
              onChange={setStatusFilter}
              isMultiSelect
            />
          ),
          (
            <DataTableFilter
              label="Free access"
              options={[
                { value: 'active', label: 'Active', icon: Gift },
                { value: 'expired', label: 'Expired', icon: Clock3 },
                { value: 'inactive', label: 'Inactive', icon: UserRoundX },
              ]}
              selectedValues={accessFilter}
              onChange={setAccessFilter}
              isMultiSelect
            />
          ),
        ]}
        columns={columns}
        rows={filteredUsers}
        loading={loading}
        emptyMessage="No users match the current search and filters."
        rowKey={(user) => user.id}
      />
    </div>
  );
}
