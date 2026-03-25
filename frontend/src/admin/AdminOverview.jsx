import React, { useEffect, useState } from 'react';
import { adminAPI } from '../utils/api';
import toast from 'react-hot-toast';

function StatCard({ label, value, sub, color = '#818cf8' }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: '10px', padding: '18px', border: '1px solid #334155' }}>
      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px' }}>{sub}</div>}
    </div>
  );
}

function JobRow({ job }) {
  const statusColor = job.status === 'success' ? '#86efac' : job.status === 'failed' ? '#fca5a5' : '#fde68a';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #334155' }}>
      <div>
        <div style={{ fontSize: '0.85rem', color: '#f1f5f9', fontWeight: 500 }}>{job.job_name}</div>
        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{job.started_at ? new Date(job.started_at).toLocaleString() : 'Never'}</div>
      </div>
      <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '20px', background: '#1e293b', color: statusColor, border: `1px solid ${statusColor}40` }}>
        {job.status}
      </span>
    </div>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.getOverview()
      .then(res => setData(res.data))
      .catch(() => toast.error('Failed to load overview'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#64748b' }}>Loading...</div>;

  const matchRate = data?.matchStats?.total > 0
    ? Math.round((data.matchStats.matched / data.matchStats.total) * 100) : 0;

  return (
    <div style={{ maxWidth: '900px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '20px' }}>System Overview</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <StatCard label="Users" value={data?.userCount} color="#818cf8" />
        <StatCard label="Providers" value={data?.providerCount} color="#22d3ee" />
        <StatCard label="Total Titles" value={data?.vodCount?.toLocaleString()} color="#a3e635" />
        <StatCard label="Match Rate" value={`${matchRate}%`} sub={`${parseInt(data?.matchStats?.matched || 0).toLocaleString()} matched`} color="#fb923c" />
      </div>

      {/* Job status */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>Last Job Runs</h2>
        {data?.lastRuns?.length > 0 ? (
          data.lastRuns.map(job => <JobRow key={job.id} job={job} />)
        ) : (
          <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No jobs run yet</div>
        )}
      </div>
    </div>
  );
}
