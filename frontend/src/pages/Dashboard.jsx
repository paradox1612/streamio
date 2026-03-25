import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { userAPI, providerAPI } from '../utils/api';
import toast from 'react-hot-toast';

function formatExpiry(expiresAt) {
  if (!expiresAt) return 'No expiry provided';
  const end = new Date(expiresAt);
  if (Number.isNaN(end.getTime())) return 'No expiry provided';
  const diffDays = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Expired ${Math.abs(diffDays)}d ago`;
  if (diffDays === 0) return 'Expires today';
  return `${diffDays}d left`;
}

function formatLastChecked(lastChecked) {
  if (!lastChecked) return 'Never checked';
  return new Date(lastChecked).toLocaleString();
}

function StatCard({ label, value, sub, color = '#818cf8' }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
      <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function ProviderStatusCard({ provider }) {
  const online = provider.status === 'online';
  const matchRate = provider.totalTitles ? Math.round((provider.matchedTitles / provider.totalTitles) * 100) : 0;
  const usageLabel = provider.accountInfo?.maxConnections
    ? `${provider.accountInfo.activeConnections || 0}/${provider.accountInfo.maxConnections} connections`
    : 'Connection limit unavailable';
  const formats = provider.accountInfo?.allowedOutputFormats?.length
    ? provider.accountInfo.allowedOutputFormats.join(', ')
    : 'Formats unavailable';

  return (
    <Link
      to={`/providers/${provider.id}`}
      style={{ background: '#1e293b', borderRadius: '10px', padding: '16px', border: `1px solid ${online ? '#166534' : '#7f1d1d'}`, display: 'block', textDecoration: 'none' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '4px' }}>{provider.name}</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
            {provider.active_host || 'No active host'} · {provider.totalTitles.toLocaleString()} titles
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: online ? '#22c55e' : '#ef4444' }} />
          <span style={{ fontSize: '0.8rem', color: online ? '#86efac' : '#fca5a5' }}>
            {online ? 'Online' : provider.status === 'offline' ? 'Offline' : 'Unknown'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '12px' }}>
        {[
          { label: 'Movies', value: provider.movieCount.toLocaleString() },
          { label: 'Series', value: provider.seriesCount.toLocaleString() },
          { label: 'Match Rate', value: `${matchRate}%` },
          { label: 'Expiry', value: formatExpiry(provider.accountInfo?.expiresAt) },
        ].map(item => (
          <div key={item.label} style={{ borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
            <div style={{ fontSize: '0.92rem', color: '#e2e8f0', fontWeight: 600 }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: '6px' }}>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
          {usageLabel} {provider.accountInfo?.status ? `· ${provider.accountInfo.status}` : ''} {provider.accountInfo?.isTrial ? '· Trial account' : ''}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
          Formats: {formats}
        </div>
        <div style={{ fontSize: '0.78rem', color: '#475569' }}>
          Last health check: {formatLastChecked(provider.last_checked)}
          {provider.accountInfoError ? ` · Live account info unavailable` : ''}
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [addonUrl, setAddonUrl] = useState('');
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    Promise.all([userAPI.getAddonUrl(), providerAPI.list()])
      .then(async ([urlRes, provsRes]) => {
        setAddonUrl(urlRes.data.addonUrl);

        const providerStats = await Promise.all(
          provsRes.data.map(async (provider) => {
            try {
              const { data } = await providerAPI.getStats(provider.id);
              return {
                ...provider,
                totalTitles: parseInt(data.vodStats?.total || provider.vod_count || 0, 10),
                movieCount: parseInt(data.vodStats?.movie_count || 0, 10),
                seriesCount: parseInt(data.vodStats?.series_count || 0, 10),
                matchedTitles: parseInt(data.matchStats?.matched || provider.matched_count || 0, 10),
                unmatchedTitles: parseInt(data.matchStats?.unmatched || 0, 10),
                accountInfo: data.accountInfo,
                accountInfoError: data.accountInfoError,
              };
            } catch (_) {
              return {
                ...provider,
                totalTitles: parseInt(provider.vod_count || 0, 10),
                movieCount: 0,
                seriesCount: 0,
                matchedTitles: parseInt(provider.matched_count || 0, 10),
                unmatchedTitles: 0,
                accountInfo: null,
                accountInfoError: 'Stats unavailable',
              };
            }
          })
        );

        setProviders(providerStats);
      })
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const copyUrl = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(addonUrl);
      toast.success('Addon URL copied!');
    } catch (_) { toast.error('Copy failed'); }
    setTimeout(() => setCopying(false), 1500);
  };

  const installInStremio = () => {
    window.open(`stremio://${addonUrl.replace(/^https?:\/\//, '')}`, '_blank');
  };

  const totalTitles = providers.reduce((sum, p) => sum + p.totalTitles, 0);
  const totalMatched = providers.reduce((sum, p) => sum + p.matchedTitles, 0);
  const matchRate = totalTitles ? Math.round((totalMatched / totalTitles) * 100) : 0;
  const onlineCount = providers.filter(p => p.status === 'online').length;
  const expiringSoonCount = providers.filter((p) => {
    if (!p.accountInfo?.expiresAt) return false;
    const diffDays = Math.ceil((new Date(p.accountInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  if (loading) {
    return <div style={{ color: '#64748b', padding: '40px' }}>Loading dashboard...</div>;
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px' }}>Overview</h1>
      <p style={{ color: '#64748b', marginBottom: '28px' }}>Your StreamBridge addon at a glance</p>

      {/* Addon URL Card */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', marginBottom: '28px' }}>
        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Addon URL</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            readOnly value={addonUrl}
            style={{ flex: 1, minWidth: 0, padding: '10px 14px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', fontSize: '0.85rem', outline: 'none' }}
          />
          <button onClick={copyUrl}
            style={{ padding: '10px 18px', borderRadius: '8px', background: copying ? '#16a34a' : '#334155', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            {copying ? '✓ Copied' : 'Copy'}
          </button>
          <button onClick={installInStremio}
            style={{ padding: '10px 18px', borderRadius: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            Install in Stremio
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <StatCard label="Providers" value={providers.length} sub={`${onlineCount} online`} />
        <StatCard label="Total Titles" value={totalTitles.toLocaleString()} color="#22d3ee" />
        <StatCard label="Match Rate" value={`${matchRate}%`} sub={`${totalMatched.toLocaleString()} matched`} color="#a3e635" />
        <StatCard label="Expiring Soon" value={expiringSoonCount} sub="next 7 days" color="#f59e0b" />
      </div>

      {/* Provider Status Cards */}
      {providers.length > 0 ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Provider Status</h2>
            <Link to="/providers" style={{ fontSize: '0.85rem', color: '#818cf8', textDecoration: 'none' }}>View all →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
            {providers.map(p => <ProviderStatusCard key={p.id} provider={p} />)}
          </div>
        </div>
      ) : (
        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '32px', border: '1px solid #334155', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔌</div>
          <div style={{ color: '#94a3b8', marginBottom: '16px' }}>No providers yet. Add your first IPTV provider to get started.</div>
          <Link to="/providers" style={{ padding: '10px 20px', borderRadius: '8px', background: '#4f46e5', color: '#fff', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>
            Add Provider
          </Link>
        </div>
      )}

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Link to="/providers" style={{ padding: '10px 18px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>
          + Add Provider
        </Link>
        <Link to="/addon" style={{ padding: '10px 18px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>
          🔗 Addon Settings
        </Link>
      </div>
    </div>
  );
}
