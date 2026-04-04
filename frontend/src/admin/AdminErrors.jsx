import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { reportableError } from '../utils/reportableToast';
import { AlertTriangle, Bug, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';
import { adminAPI } from '../utils/api';
import AdminDataTable from './AdminDataTable';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function statusVariant(status) {
  if (status === 'resolved') return 'success';
  if (status === 'reviewed') return 'warning';
  return 'danger';
}

function sourceVariant(source) {
  if (source === 'backend') return 'danger';
  if (source === 'admin') return 'warning';
  return 'brand';
}

export default function AdminErrors() {
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState('');

  const loadReports = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.listErrorReports({
        search,
        status: statusFilter,
        source: sourceFilter,
      });
      setReports(response.data);
      if (response.data.length && !selectedId) {
        setSelectedId(response.data[0].id);
      }
      if (!response.data.find((report) => report.id === selectedId)) {
        setSelectedId(response.data[0]?.id || null);
      }
    } catch (_) {
      reportableError('Failed to load error reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [search, statusFilter, sourceFilter]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedReport(null);
      return;
    }

    setDetailLoading(true);
    adminAPI.getErrorReport(selectedId)
      .then((response) => setSelectedReport(response.data))
      .catch(() => reportableError('Failed to load error report details'))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const stats = useMemo(() => ({
    open: reports.filter((report) => report.status === 'open').length,
    backend: reports.filter((report) => report.source === 'backend').length,
    frontend: reports.filter((report) => report.source === 'frontend').length,
    resolved: reports.filter((report) => report.status === 'resolved').length,
  }), [reports]);

  const updateStatus = async (nextStatus) => {
    if (!selectedReport || savingStatus) return;
    setSavingStatus(nextStatus);
    try {
      const response = await adminAPI.updateErrorReport(selectedReport.id, nextStatus);
      setSelectedReport(response.data);
      setReports((current) => current.map((report) => (
        report.id === response.data.id ? { ...report, ...response.data } : report
      )));
      toast.success(`Report marked ${nextStatus}`);
    } catch (error) {
      reportableError(error.response?.data?.error || 'Failed to update report');
    } finally {
      setSavingStatus('');
    }
  };

  const columns = [
    {
      key: 'message',
      header: 'Error',
      render: (report) => (
        <button
          type="button"
          onClick={() => setSelectedId(report.id)}
          className="max-w-[28rem] text-left"
        >
          <div className="font-semibold text-white">{report.message}</div>
          <div className="mt-1 text-xs text-slate-400">{report.route_path || report.request_path || report.page_url || 'No path captured'}</div>
        </button>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (report) => <Badge variant={sourceVariant(report.source)} className="capitalize">{report.source}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (report) => <Badge variant={statusVariant(report.status)} className="capitalize">{report.status}</Badge>,
    },
    {
      key: 'reporter',
      header: 'Reporter',
      render: (report) => (
        <div className="text-sm text-slate-200">
          {report.user_email || report.reporter_email || 'Anonymous'}
        </div>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (report) => <div className="text-sm text-slate-300/70">{formatDate(report.created_at)}</div>,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={AlertTriangle} label="Open" value={stats.open} tone="border-red-400/20 bg-red-500/10 text-red-100" />
        <StatCard icon={ShieldAlert} label="Backend" value={stats.backend} tone="border-amber-400/20 bg-amber-400/10 text-amber-100" />
        <StatCard icon={Bug} label="Frontend" value={stats.frontend} tone="border-brand-400/20 bg-brand-500/10 text-brand-100" />
        <StatCard icon={CheckCircle2} label="Resolved" value={stats.resolved} tone="border-emerald-400/20 bg-emerald-400/10 text-emerald-100" />
      </section>

      <AdminDataTable
        title="Error inbox"
        description="Frontend crash reports and backend unhandled exceptions land here for operator review."
        count={reports.length}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search message, route, request path, or reporter..."
        primaryAction={{
          label: 'Refresh',
          icon: RefreshCw,
          onClick: loadReports,
          variant: 'outline',
        }}
        filters={[
          (
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-100"
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="reviewed">Reviewed</option>
              <option value="resolved">Resolved</option>
            </select>
          ),
          (
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="h-10 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-100"
            >
              <option value="">All sources</option>
              <option value="frontend">Frontend</option>
              <option value="admin">Admin</option>
              <option value="backend">Backend</option>
            </select>
          ),
        ]}
        columns={columns}
        rows={reports}
        loading={loading}
        emptyMessage="No error reports matched the current filters."
        rowKey={(report) => report.id}
      />

      <Card>
        <CardHeader className="border-b border-white/[0.08]">
          <CardTitle>Report details</CardTitle>
          <CardDescription>Inspect the captured stack, route, browser data, and operator notes before marking the report resolved.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {detailLoading ? (
            <div className="text-sm text-slate-400">Loading report details...</div>
          ) : !selectedReport ? (
            <div className="text-sm text-slate-400">Select a report from the inbox.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={sourceVariant(selectedReport.source)} className="capitalize">{selectedReport.source}</Badge>
                    <Badge variant={statusVariant(selectedReport.status)} className="capitalize">{selectedReport.status}</Badge>
                    {selectedReport.admin_context ? <Badge variant="warning">admin context</Badge> : null}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedReport.message}</h2>
                    <p className="mt-2 text-sm text-slate-300/65">{formatDate(selectedReport.created_at)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={Boolean(savingStatus)} onClick={() => updateStatus('reviewed')}>
                    {savingStatus === 'reviewed' ? 'Saving...' : 'Mark reviewed'}
                  </Button>
                  <Button type="button" variant="default" disabled={Boolean(savingStatus)} onClick={() => updateStatus('resolved')}>
                    {savingStatus === 'resolved' ? 'Saving...' : 'Resolve'}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Routing</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <div><span className="text-slate-500">Route:</span> {selectedReport.route_path || 'Unknown'}</div>
                    <div><span className="text-slate-500">Page URL:</span> {selectedReport.page_url || 'Unknown'}</div>
                    <div><span className="text-slate-500">Request:</span> {selectedReport.request_method ? `${selectedReport.request_method} ${selectedReport.request_path}` : 'N/A'}</div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Reporter</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <div><span className="text-slate-500">User:</span> {selectedReport.user_email || 'Anonymous'}</div>
                    <div><span className="text-slate-500">Email:</span> {selectedReport.reporter_email || 'None provided'}</div>
                    <div><span className="text-slate-500">Type:</span> {selectedReport.error_type || 'Unknown'}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Stack trace</p>
                  <pre className="overflow-x-auto rounded-[22px] border border-white/[0.08] bg-surface-950/75 p-4 text-xs leading-6 text-slate-200">
                    {selectedReport.stack || 'No stack captured'}
                  </pre>
                </div>

                {selectedReport.component_stack ? (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Component stack</p>
                    <pre className="overflow-x-auto rounded-[22px] border border-white/[0.08] bg-surface-950/75 p-4 text-xs leading-6 text-slate-200">
                      {selectedReport.component_stack}
                    </pre>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Context payload</p>
                  <pre className="overflow-x-auto rounded-[22px] border border-white/[0.08] bg-surface-950/75 p-4 text-xs leading-6 text-slate-200">
                    {JSON.stringify(selectedReport.context || {}, null, 2)}
                  </pre>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Clock3 className="h-4 w-4" />
                  Reviewed {selectedReport.reviewed_at ? formatDate(selectedReport.reviewed_at) : 'not yet'}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
