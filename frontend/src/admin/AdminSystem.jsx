import React, { useEffect, useState } from 'react';
import { adminAPI } from '../utils/api';
import toast from 'react-hot-toast';
import { reportableError } from '../utils/reportableToast';
import { Badge } from '../components/ui/badge';

const JOB_LABELS = {
  healthCheckJob: { label: 'Host Health Check', schedule: 'Every 5 minutes', icon: '🩺' },
  tmdbSyncJob: { label: 'TMDB Export Sync', schedule: 'Daily at 2:00 AM', icon: '⬇️' },
  freeAccessCatalogRefreshJob: { label: 'Free Catalog Refresh', schedule: 'Daily at 3:00 AM', icon: '🎁' },
  catalogRefreshJob: { label: 'Catalog Refresh', schedule: 'Daily at 4:00 AM', icon: '🔄' },
  matchingJob: { label: 'TMDB Matching', schedule: 'Daily at 5:00 AM', icon: '🎯' },
  epgRefreshJob: { label: 'EPG Refresh', schedule: 'Every 4 hours', icon: '📺' },
  freeAccessExpiryJob: { label: 'Free Access Expiry', schedule: 'Every hour', icon: '⏳' },
};

export default function AdminSystem() {
  const [jobData, setJobData] = useState(null);
  const [dbStats, setDbStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState('');

  const load = async () => {
    try {
      const [jobRes, dbRes] = await Promise.all([
        adminAPI.getJobs(),
        adminAPI.getDbStats(),
      ]);
      setJobData(jobRes.data);
      setDbStats(dbRes.data);
    } catch (_) { reportableError('Failed to load system info'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleRunJob = async (jobName) => {
    setRunning(jobName);
    try {
      await adminAPI.runJob(jobName);
      toast.success(`${JOB_LABELS[jobName]?.label || jobName} started`);
    } catch (err) {
      reportableError(err.response?.data?.error || 'Failed to run job');
    } finally {
      setTimeout(() => setRunning(''), 2000);
    }
  };

  const handleRefreshAll = async () => {
    setRunning('refreshAll');
    try {
      await adminAPI.refreshAll();
      toast.success('Catalog refresh for all providers started');
    } catch (_) { reportableError('Failed'); }
    finally { setTimeout(() => setRunning(''), 2000); }
  };

  if (loading) return <div style={{ color: '#64748b' }}>Loading...</div>;

  const lastRunsMap = {};
  (jobData?.lastRuns || []).forEach(r => { lastRunsMap[r.job_name] = r; });

  return (
    <div style={{ maxWidth: '900px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '20px' }}>System</h1>

      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px' }}>Current Runtime</h2>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Host {jobData?.runtime?.hostname || 'unknown'} · PID {jobData?.runtime?.pid || 'n/a'} · Node env {jobData?.runtime?.nodeEnv || 'n/a'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Badge variant={jobData?.runtime?.appRole === 'web' ? 'brand' : 'warning'} className="uppercase">
              {jobData?.runtime?.appRole || 'unknown'}
            </Badge>
            <Badge variant={jobData?.runtime?.httpServerEnabled ? 'success' : 'outline'}>
              http {jobData?.runtime?.httpServerEnabled ? 'enabled' : 'disabled'}
            </Badge>
            <Badge variant={jobData?.runtime?.schedulerEnabled ? 'success' : 'outline'}>
              scheduler {jobData?.runtime?.schedulerEnabled ? 'enabled' : 'disabled'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Jobs */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Background Jobs</h2>
          <button onClick={handleRefreshAll} disabled={!!running}
            style={{ padding: '8px 14px', borderRadius: '8px', background: '#1e4d2b', color: '#86efac', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, opacity: running === 'refreshAll' ? 0.7 : 1 }}>
            {running === 'refreshAll' ? 'Running...' : '⟳ Refresh All Providers'}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(jobData?.jobs || []).map(jobName => {
            const info = JOB_LABELS[jobName] || { label: jobName, schedule: '', icon: '⚙️' };
            const lastRun = lastRunsMap[jobName];
            const statusColor = lastRun?.status === 'success' ? '#86efac' : lastRun?.status === 'failed' ? '#fca5a5' : '#fde68a';
            return (
              <div key={jobName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: '10px', background: '#0f172a', border: '1px solid #334155', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{info.icon}</span>
                    <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.9rem' }}>{info.label}</span>
                    {lastRun && (
                      <span style={{ fontSize: '0.7rem', padding: '1px 7px', borderRadius: '20px', background: '#1e293b', color: statusColor, border: `1px solid ${statusColor}30` }}>
                        {lastRun.status}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px' }}>
                    {info.schedule}
                    {lastRun?.started_at && ` · Last: ${new Date(lastRun.started_at).toLocaleString()}`}
                  </div>
                  {lastRun?.metadata && (
                    <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Runner: {lastRun.metadata.runnerRole || 'unknown'} on {lastRun.metadata.runnerHostname || 'unknown'}
                    </div>
                  )}
                </div>
                <button onClick={() => handleRunJob(jobName)} disabled={!!running}
                  style={{ padding: '7px 14px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, opacity: running === jobName ? 0.7 : 1 }}>
                  {running === jobName ? 'Running...' : 'Run Now'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* DB Stats */}
      {dbStats.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '14px' }}>Database Tables</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ color: '#64748b', borderBottom: '1px solid #334155' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500 }}>Table</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 500 }}>Size</th>
                </tr>
              </thead>
              <tbody>
                {dbStats.map(row => (
                  <tr key={row.tablename} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{row.tablename}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b', textAlign: 'right' }}>{row.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
