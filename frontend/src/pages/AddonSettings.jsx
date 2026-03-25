import React, { useState, useEffect } from 'react';
import { userAPI } from '../utils/api';
import toast from 'react-hot-toast';

export default function AddonSettings() {
  const [addonUrl, setAddonUrl] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    userAPI.getAddonUrl()
      .then(res => { setAddonUrl(res.data.addonUrl); setToken(res.data.token); })
      .finally(() => setLoading(false));
  }, []);

  const copyUrl = async () => {
    setCopying(true);
    try { await navigator.clipboard.writeText(addonUrl); toast.success('Copied!'); }
    catch (_) { toast.error('Copy failed'); }
    setTimeout(() => setCopying(false), 1500);
  };

  const regenerate = async () => {
    if (!window.confirm('⚠️ This will invalidate your current addon URL. You will need to re-add the addon in Stremio. Continue?')) return;
    setRegenerating(true);
    try {
      const res = await userAPI.regenerateAddonUrl();
      setAddonUrl(res.data.addonUrl);
      setToken(res.data.token);
      toast.success('Addon URL regenerated');
    } catch (_) {
      toast.error('Failed to regenerate URL');
    } finally {
      setRegenerating(false);
    }
  };

  const installInStremio = () => {
    window.open(`stremio://${addonUrl.replace(/^https?:\/\//, '')}`, '_blank');
  };

  if (loading) return <div style={{ color: '#64748b', padding: '40px' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px' }}>Addon Settings</h1>
      <p style={{ color: '#64748b', marginBottom: '28px' }}>Configure and install your personalized Stremio addon</p>

      {/* Addon URL */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', border: '1px solid #334155', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '16px' }}>Your Addon URL</h2>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input readOnly value={addonUrl}
            style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', fontSize: '0.82rem', outline: 'none' }} />
          <button onClick={copyUrl}
            style={{ padding: '10px 16px', borderRadius: '8px', background: copying ? '#14532d' : '#334155', color: copying ? '#86efac' : '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            {copying ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        <button onClick={installInStremio}
          style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', marginBottom: '8px' }}>
          🎬 Install in Stremio
        </button>

        <div style={{ fontSize: '0.78rem', color: '#64748b', textAlign: 'center' }}>
          Click the button above or paste the URL manually into Stremio → Add Addon
        </div>
      </div>

      {/* Token info */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '12px' }}>Addon Token</h2>
        <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b', background: '#0f172a', padding: '10px 12px', borderRadius: '8px', wordBreak: 'break-all', border: '1px solid #334155' }}>
          {token}
        </div>
        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '8px' }}>
          This token uniquely identifies your addon. Keep it private.
        </div>
      </div>

      {/* Regenerate */}
      <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #7f1d1d' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>⚠️ Regenerate URL</h2>
        <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '16px' }}>
          This creates a new unique addon URL. Your old URL will stop working immediately, and you'll need to re-add the addon in Stremio.
        </p>
        <button onClick={regenerate} disabled={regenerating}
          style={{ padding: '10px 18px', borderRadius: '8px', background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', opacity: regenerating ? 0.7 : 1 }}>
          {regenerating ? 'Regenerating...' : 'Regenerate Addon URL'}
        </button>
      </div>
    </div>
  );
}
