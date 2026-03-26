import React, { useState, useEffect } from 'react';
import { userAPI } from '../utils/api';
import {
  CheckIcon,
  DocumentDuplicateIcon,
  SparklesIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
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
    try {
      await navigator.clipboard.writeText(addonUrl);
      toast.success('Copied');
    } catch (_) {
      toast.error('Copy failed');
    }
    setTimeout(() => setCopying(false), 1500);
  };

  const regenerate = async () => {
    if (!window.confirm('This will invalidate your current addon URL and require reinstalling it in Stremio. Continue?')) return;
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

  if (loading) {
    return <div className="mx-auto max-w-4xl"><div className="panel p-8 text-center text-slate-300/70">Loading addon settings...</div></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="panel overflow-hidden p-6 sm:p-8 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <div className="kicker mb-5">Personal Addon</div>
            <h1 className="hero-title">Install the private StreamBridge endpoint for your account.</h1>
            <p className="hero-copy mt-4">
              This addon URL is scoped to your account and pulls in the providers you have configured. Keep it private and reinstall it if you regenerate the token.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={copyUrl} className="btn-primary">
                {copying ? <CheckIcon className="h-4 w-4" /> : <DocumentDuplicateIcon className="h-4 w-4" />}
                {copying ? 'Copied URL' : 'Copy URL'}
              </button>
              <button onClick={installInStremio} className="btn-secondary">
                <SparklesIcon className="h-4 w-4" />
                Install in Stremio
              </button>
            </div>
          </div>

          <div className="panel-soft p-5">
            <p className="metric-label mb-1">Installation Tip</p>
            <p className="text-lg font-semibold text-white">Use the direct install button first.</p>
            <p className="mt-2 text-sm leading-6 text-slate-300/[0.68]">
              If your device does not catch the protocol automatically, copy the URL and paste it in Stremio under Add Addon.
            </p>
          </div>
        </div>
      </section>

      <section className="panel-soft p-6 sm:p-8">
        <p className="eyebrow mb-2">Addon URL</p>
        <h2 className="section-title">Current endpoint</h2>
        <div className="mt-5 overflow-x-auto rounded-[22px] border border-white/[0.08] bg-surface-950/75 p-4 font-mono text-sm text-slate-200/[0.82]">
          {addonUrl}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="panel-soft p-6 sm:p-8">
          <p className="eyebrow mb-2">Private Token</p>
          <h2 className="section-title">Keep this secret</h2>
          <div className="mt-5 overflow-x-auto rounded-[22px] border border-white/[0.08] bg-surface-950/75 p-4 font-mono text-xs text-slate-200/[0.78]">
            {token}
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-300/[0.68]">
            Your token identifies the personalized addon route. Anyone with it can access your manifest, so treat it like a password.
          </p>
        </div>

        <div className="panel-soft border-red-400/[0.15] bg-red-500/5 p-6 sm:p-8">
          <p className="eyebrow mb-2 text-red-100/60">Security Reset</p>
          <h2 className="section-title">Regenerate addon URL</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300/[0.72]">
            Use this only if the current URL has been shared or compromised. The old route stops working immediately.
          </p>
          <button onClick={regenerate} disabled={regenerating} className="btn-danger mt-6">
            <ArrowPathIcon className="h-4 w-4" />
            {regenerating ? 'Regenerating...' : 'Regenerate URL'}
          </button>
        </div>
      </section>
    </div>
  );
}
