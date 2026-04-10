'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react'
import {
  Coins,
  Loader2,
  Plus,
  Save,
  Trash2,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface CreditPreset {
  label: string
  cents: number
}

interface CreditConfig {
  min_topup_cents: number
  max_topup_cents: number
  presets: CreditPreset[]
  allow_custom_amount: boolean
}

export default function AdminCreditsSettingsPage() {
  const [config, setConfig] = useState<CreditConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      const { data } = await adminAPI.getCreditsSettings()
      // Ensure data has the expected structure even if not set in DB yet
      setConfig(data || {
        min_topup_cents: 500,
        max_topup_cents: 100000,
        presets: [
          { label: '$10', cents: 1000 },
          { label: '$25', cents: 2500 },
          { label: '$50', cents: 5000 },
          { label: '$100', cents: 10000 },
        ],
        allow_custom_amount: true
      })
    } catch {
      toast.error('Failed to load credit settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      await adminAPI.updateCreditsSettings(config)
      toast.success('Credit configuration updated')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  const addPreset = () => {
    if (!config) return
    const newPresets = [...config.presets, { label: '$20', cents: 2000 }]
    setConfig({ ...config, presets: newPresets })
  }

  const removePreset = (index: number) => {
    if (!config) return
    const newPresets = config.presets.filter((_, i) => i !== index)
    setConfig({ ...config, presets: newPresets })
  }

  const updatePreset = (index: number, field: keyof CreditPreset, value: string | number) => {
    if (!config) return
    const newPresets = [...config.presets]
    newPresets[index] = { ...newPresets[index], [field]: value }
    setConfig({ ...config, presets: newPresets })
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Credit Settings</h1>
          <p className="mt-1 text-sm text-slate-400">Configure top-up limits, presets, and custom amount rules</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Configuration
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Limits */}
        <Card className="border-white/[0.08] bg-surface-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-400" />
              Transaction Limits
            </CardTitle>
            <CardDescription>Minimum and maximum amounts per top-up transaction</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Minimum (cents)</Label>
                <Input
                  type="number"
                  value={config.min_topup_cents}
                  onChange={(e) => setConfig({ ...config, min_topup_cents: parseInt(e.target.value) || 0 })}
                />
                <p className="text-[10px] text-slate-500 italic">e.g. 500 = $5.00</p>
              </div>
              <div className="space-y-2">
                <Label>Maximum (cents)</Label>
                <Input
                  type="number"
                  value={config.max_topup_cents}
                  onChange={(e) => setConfig({ ...config, max_topup_cents: parseInt(e.target.value) || 0 })}
                />
                <p className="text-[10px] text-slate-500 italic">e.g. 100000 = $1,000.00</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Allow Custom Amount</Label>
                <p className="text-xs text-slate-400">Enable a free-text input for users to enter any amount within limits</p>
              </div>
              <Switch
                checked={config.allow_custom_amount}
                onCheckedChange={(checked) => setConfig({ ...config, allow_custom_amount: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Presets */}
        <Card className="border-white/[0.08] bg-surface-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-indigo-400" />
              Top-up Presets
            </CardTitle>
            <CardDescription>Pre-defined amount buttons shown in the top-up modal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {config.presets.map((preset, index) => (
                <div key={index} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 p-3">
                  <div className="grid flex-1 grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-slate-500">Label</Label>
                      <Input
                        className="h-8 text-sm"
                        value={preset.label}
                        onChange={(e) => updatePreset(index, 'label', e.target.value)}
                        placeholder="$10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-slate-500">Amount (cents)</Label>
                      <Input
                        className="h-8 text-sm"
                        type="number"
                        value={preset.cents}
                        onChange={(e) => updatePreset(index, 'cents', parseInt(e.target.value) || 0)}
                        placeholder="1000"
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-4 h-8 w-8 text-slate-500 hover:text-red-400"
                    onClick={() => removePreset(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="outline" className="w-full gap-2 border-dashed" onClick={addPreset}>
              <Plus className="h-4 w-4" />
              Add Preset
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
        <h3 className="text-sm font-semibold text-blue-400">Live Preview</h3>
        <p className="mt-1 text-xs text-slate-400 mb-4">How it looks for users:</p>
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          {config.presets.map((p, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 text-center opacity-60">
              <p className="font-bold text-white text-sm">{p.label}</p>
              <p className="text-[10px] text-slate-400">{p.cents / 100 * 100} credits</p>
            </div>
          ))}
          {config.allow_custom_amount && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center opacity-60">
              <p className="font-bold text-white text-sm">Custom</p>
              <p className="text-[10px] text-slate-400">Any amount</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
