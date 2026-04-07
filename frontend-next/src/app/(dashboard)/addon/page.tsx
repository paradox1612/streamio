'use client'

import { useState, useEffect } from 'react'
import { userAPI } from '@/utils/api'
import { Check, Copy, Sparkles, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmDialog from '@/components/ConfirmDialog'

const LANGUAGE_OPTIONS = [
  'arabic', 'bangla', 'english', 'french', 'german', 'hindi',
  'italian', 'kannada', 'malayalam', 'persian', 'punjabi', 'spanish',
  'tamil', 'telugu', 'turkish', 'urdu',
]

export default function AddonSettingsPage() {
  const [addonUrl, setAddonUrl] = useState('')
  const [token, setToken] = useState('')
  const [languageMode, setLanguageMode] = useState('all')
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [copying, setCopying] = useState(false)
  const [savingLanguages, setSavingLanguages] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)

  useEffect(() => {
    Promise.all([userAPI.getAddonUrl(), userAPI.getProfile()])
      .then(([addonRes, profileRes]) => {
        setAddonUrl(addonRes.data.addonUrl)
        setToken(addonRes.data.token)
        const user = profileRes.data.user || {}
        const preferred: string[] = user.preferred_languages || []
        const excluded: string[] = user.excluded_languages || []
        if (preferred.length) {
          setLanguageMode('include')
          setSelectedLanguages(preferred)
        } else if (excluded.length) {
          setLanguageMode('exclude')
          setSelectedLanguages(excluded)
        } else {
          setLanguageMode('all')
          setSelectedLanguages([])
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const copyUrl = async () => {
    setCopying(true)
    try {
      await navigator.clipboard.writeText(addonUrl)
      toast.success('Copied')
    } catch {
      toast.error('Copy failed')
    }
    setTimeout(() => setCopying(false), 1500)
  }

  const regenerate = async () => {
    setRegenerating(true)
    try {
      const res = await userAPI.regenerateAddonUrl()
      setAddonUrl(res.data.addonUrl)
      setToken(res.data.token)
      toast.success('Addon URL regenerated')
      setConfirmRegenerate(false)
    } catch {
      toast.error('Failed to regenerate URL')
    } finally {
      setRegenerating(false)
    }
  }

  const installInStremio = () => {
    window.open(`stremio://${addonUrl.replace(/^https?:\/\//, '')}`, '_blank')
  }

  const toggleLanguage = (language: string) => {
    setSelectedLanguages((current) =>
      current.includes(language) ? current.filter((item) => item !== language) : [...current, language]
    )
  }

  const saveLanguagePreferences = async () => {
    setSavingLanguages(true)
    try {
      await userAPI.updateProfile({
        preferredLanguages: languageMode === 'include' ? selectedLanguages : [],
        excludedLanguages: languageMode === 'exclude' ? selectedLanguages : [],
      })
      toast.success('Language filter saved')
    } catch {
      toast.error('Failed to save language filter')
    } finally {
      setSavingLanguages(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="panel p-8 text-center text-slate-300/70">Loading addon settings...</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="panel overflow-hidden p-5 sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <div className="kicker mb-4">Personal Addon</div>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Install the private StreamBridge endpoint for your account.
            </h1>
            <p className="hero-copy mt-3">
              This addon URL is scoped to your account and pulls in the providers you have configured. Keep it private
              and reinstall it if you regenerate the token.
            </p>
            <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
              <button onClick={copyUrl} className="btn-primary w-full sm:w-auto">
                {copying ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copying ? 'Copied URL' : 'Copy URL'}
              </button>
              <button onClick={installInStremio} className="btn-secondary w-full sm:w-auto">
                <Sparkles className="h-4 w-4" />
                Install in Stremio
              </button>
            </div>
          </div>

          <div className="panel-soft p-5">
            <p className="metric-label mb-1">Installation Tip</p>
            <p className="text-lg font-semibold text-white">Use the direct install button first.</p>
            <p className="mt-2 text-sm leading-6 text-slate-300/[0.68]">
              If your device does not catch the protocol automatically, copy the URL and paste it in Stremio under Add
              Addon.
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
        <div className="panel-soft p-5 sm:p-8">
          <p className="eyebrow mb-2">Private Token</p>
          <h2 className="section-title">Keep this secret</h2>
          <div className="mt-5 overflow-x-auto rounded-[22px] border border-white/[0.08] bg-surface-950/75 p-4 font-mono text-xs text-slate-200/[0.78]">
            {token}
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-300/[0.68]">
            Your token identifies the personalized addon route. Anyone with it can access your manifest, so treat it
            like a password.
          </p>
        </div>

        <div className="panel-soft border-red-400/[0.15] bg-red-500/5 p-5 sm:p-8">
          <p className="eyebrow mb-2 text-red-100/60">Security Reset</p>
          <h2 className="section-title">Regenerate addon URL</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300/[0.72]">
            Use this only if the current URL has been shared or compromised. The old route stops working immediately.
          </p>
          <button
            onClick={() => setConfirmRegenerate(true)}
            disabled={regenerating}
            className="btn-danger mt-6 w-full sm:w-auto"
          >
            <RefreshCw className="h-4 w-4" />
            {regenerating ? 'Regenerating...' : 'Regenerate URL'}
          </button>
        </div>
      </section>

      <section className="panel-soft p-6 sm:p-8">
        <p className="eyebrow mb-2">Stream Languages</p>
        <h2 className="section-title">Filter which language variants appear in Stremio</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300/[0.72]">
          Default is all variants. Switch to only selected languages or hide selected languages if your providers carry
          multiple dubbed versions.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {([
            ['all', 'Show all', 'Do not filter stream variants.'],
            ['include', 'Only selected', 'Only show variants tagged with the selected languages.'],
            ['exclude', 'Hide selected', 'Hide variants tagged with the selected languages.'],
          ] as const).map(([value, label, description]) => (
            <button
              key={value}
              type="button"
              onClick={() => setLanguageMode(value)}
              className={`rounded-[22px] border p-4 text-left transition ${
                languageMode === value
                  ? 'border-cyan-300/60 bg-cyan-400/10 text-white'
                  : 'border-white/[0.08] bg-surface-950/60 text-slate-300/72'
              }`}
            >
              <div className="text-sm font-semibold">{label}</div>
              <div className="mt-2 text-xs leading-5">{description}</div>
            </button>
          ))}
        </div>

        <div className={`mt-6 ${languageMode === 'all' ? 'opacity-50' : ''}`}>
          <div className="mb-3 text-sm font-medium text-white">Languages</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LANGUAGE_OPTIONS.map((language) => (
              <label
                key={language}
                className="flex items-center gap-3 rounded-[18px] border border-white/[0.08] bg-surface-950/65 px-4 py-3 text-sm text-slate-200"
              >
                <input
                  type="checkbox"
                  disabled={languageMode === 'all'}
                  checked={selectedLanguages.includes(language)}
                  onChange={() => toggleLanguage(language)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent text-cyan-300 focus:ring-cyan-300"
                />
                <span className="capitalize">{language}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap sm:items-center">
          <button onClick={saveLanguagePreferences} disabled={savingLanguages} className="btn-primary w-full sm:w-auto">
            {savingLanguages ? 'Saving...' : 'Save Language Filter'}
          </button>
          <button
            type="button"
            onClick={() => {
              setLanguageMode('all')
              setSelectedLanguages([])
            }}
            className="btn-secondary w-full sm:w-auto"
          >
            Reset to All
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmRegenerate}
        title="Regenerate addon URL?"
        description="The current addon URL will stop working immediately and you will need to reinstall the new one in Stremio."
        confirmLabel="Regenerate URL"
        danger
        loading={regenerating}
        onConfirm={regenerate}
        onCancel={() => !regenerating && setConfirmRegenerate(false)}
      />
    </div>
  )
}
