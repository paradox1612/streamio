import React, { useEffect, useState } from 'react';
import { adminAPI } from '../utils/api';
import toast from 'react-hot-toast';
import { reportableError } from '../utils/reportableToast';

export default function AdminTmdb() {
  const [status, setStatus] = useState(null);
  const [matching, setMatching] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [rematching, setRematching] = useState(false);

  const load = async () => {
    try {
      const [statusRes, matchRes] = await Promise.all([
        adminAPI.getTmdbStatus(),
        adminAPI.getMatchingStats(),
      ]);
      setStatus(statusRes.data);
      setMatching(matchRes.data);
    } catch (_) { reportableError('Failed to load TMDB data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await adminAPI.syncTmdb();
      toast.success('TMDB sync started in background');
    } catch (_) { reportableError('Sync failed'); }
    finally { setSyncing(false); }
  };

  const handleRematch = async () => {
    setRematching(true);
    try {
      await adminAPI.rematch();
      toast.success('Re-matching started in background');
    } catch (_) { reportableError('Rematch failed'); }
    finally { setRematching(false); }
  };

  if (loading) return <div style={{ color: '#64748b' }}>Loading...</div>;

  const stats = matching?.globalStats || {};
  const matchRate = stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0;

  return (
    <div style={{ maxWidth: '900px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '20px' }}>TMDB Matching</h1>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'TMDB Movies', value: parseInt(status?.movieCount || 0).toLocaleString(), color: '#818cf8' },
          { label: 'TMDB Series', value: parseInt(status?.seriesCount || 0).toLocaleString(), color: '#22d3ee' },
          { label: 'Total Cached', value: parseInt(stats.total || 0).toLocaleString(), color: '#fb923c' },
          { label: 'Matched', value: parseInt(stats.matched || 0).toLocaleString(), color: '#22c55e' },
          { label: 'Unmatched', value: parseInt(stats.unmatched || 0).toLocaleString(), color: '#ef4444' },
          { label: 'Match Rate', value: `${matchRate}%`, color: '#a3e635' },
        ].map(s => (
          <div key={s.label} style={{ background: '#1e293b', borderRadius: '10px', padding: '14px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <button onClick={handleSync} disabled={syncing}
          style={{ padding: '10px 18px', borderRadius: '8px', background: '#1e3a5f', color: '#93c5fd', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: syncing ? 0.7 : 1 }}>
          {syncing ? 'Syncing...' : '⬇️ Sync TMDB Exports'}
        </button>
        <button onClick={handleRematch} disabled={rematching}
          style={{ padding: '10px 18px', borderRadius: '8px', background: '#1e4d2b', color: '#86efac', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: rematching ? 0.7 : 1 }}>
          {rematching ? 'Rematching...' : '🎯 Run Rematch'}
        </button>
      </div>

      {/* Last sync runs */}
      {status?.lastRuns?.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '14px' }}>Recent Sync Runs</h2>
          {status.lastRuns.map(run => (
            <div key={run.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #334155', fontSize: '0.82rem' }}>
              <span style={{ color: '#94a3b8' }}>{new Date(run.started_at).toLocaleString()}</span>
              <span style={{ color: run.status === 'success' ? '#86efac' : '#fca5a5' }}>{run.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Unmatched titles */}
      {matching?.unmatched?.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '14px' }}>Unmatched Titles (sample)</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {matching.unmatched.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '7px', background: '#0f172a', border: '1px solid #334155' }}>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{item.raw_title}</span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.tmdb_type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
