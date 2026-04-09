'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  Box,
  CheckCircle2,
  ChevronRight,
  Globe,
  Key,
  Layout,
  Loader2,
  Lock,
  Plus,
  Server,
  Settings2,
  ShieldAlert,
  UserPlus,
  Wifi,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI } from '@/utils/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SkeletonCard } from '@/components/SkeletonCard'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Network {
  id: string
  name: string
  identity_key: string | null
  reseller_username: string | null
  reseller_password?: string | null
  catalog_last_refreshed_at: string | null
  updated_at: string
}

interface Bouquet {
  id: string
  bouquet_name: string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NetworksPage() {
  const [networks, setNetworks] = useState<Network[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null)
  
  // Modals
  const [showResellerModal, setShowResellerModal] = useState(false)
  const [showLineModal, setShowLineModal] = useState(false)
  
  // Reseller Form
  const [resellerForm, setResellerForm] = useState({ username: '', password: '' })
  const [savingReseller, setSavingReseller] = useState(false)
  
  // Line Creation Form
  const [lineForm, setLineForm] = useState({
    username: '',
    password: '',
    duration: '24', // hours
    maxConnections: '1',
    selectedBouquets: [] as string[]
  })
  const [bouquets, setBouquets] = useState<Bouquet[]>([])
  const [loadingBouquets, setLoadingBouquets] = useState(false)
  const [creatingLine, setCreatingLine] = useState(false)

  useEffect(() => {
    loadNetworks()
  }, [])

  async function loadNetworks() {
    try {
      const { data } = await adminAPI.listNetworks()
      setNetworks(data)
    } catch (err) {
      toast.error('Failed to load networks')
    } finally {
      setLoading(false)
    }
  }

  const openResellerConfig = (network: Network) => {
    setSelectedNetwork(network)
    setResellerForm({
      username: network.reseller_username || '',
      password: '' // Don't show password
    })
    setShowResellerModal(true)
  }

  const saveResellerConfig = async () => {
    if (!selectedNetwork) return
    setSavingReseller(true)
    try {
      await adminAPI.updateNetwork(selectedNetwork.id, {
        reseller_username: resellerForm.username,
        reseller_password: resellerForm.password || undefined
      })
      toast.success('Reseller credentials updated')
      setShowResellerModal(false)
      loadNetworks()
    } catch (err) {
      toast.error('Failed to update credentials')
    } finally {
      setSavingReseller(false)
    }
  }

  const openLineCreation = async (network: Network) => {
    if (!network.reseller_username) {
      toast.error('Configure reseller credentials first')
      return
    }
    setSelectedNetwork(network)
    setShowLineModal(true)
    setLoadingBouquets(true)
    try {
      const { data } = await adminAPI.getNetworkBouquets(network.id)
      setBouquets(Array.isArray(data) ? data : [])
    } catch (err) {
      toast.error('Failed to load bouquets')
    } finally {
      setLoadingBouquets(false)
    }
  }

  const handleCreateLine = async () => {
    if (!selectedNetwork) return
    setCreatingLine(true)
    try {
      const expDate = Math.floor(Date.now() / 1000) + (parseInt(lineForm.duration) * 3600)
      const payload = {
        username: lineForm.username,
        password: lineForm.password,
        maxConnections: parseInt(lineForm.maxConnections),
        expDate,
        bouquetIds: lineForm.selectedBouquets
      }
      const { data } = await adminAPI.createResellerLine(selectedNetwork.id, payload)
      
      if (data.result === 'success' || data.status === 'success') {
        toast.success('Line created successfully!')
        setShowLineModal(false)
      } else {
        toast.error(data.message || 'Failed to create line')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Creation failed')
    } finally {
      setCreatingLine(false)
    }
  }

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Managed Networks</h1>
          <p className="mt-1 text-sm text-slate-400">Configure IPTV reseller panels and automate line creation</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          [1, 2, 3].map(i => <SkeletonCard key={i} />)
        ) : networks.map(network => (
          <Card key={network.id} className="border-white/[0.08] bg-surface-900/50 transition-all hover:bg-surface-900/80">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                  <Wifi className="h-5 w-5" />
                </div>
                {network.reseller_username ? (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Managed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-500">Unmanaged</Badge>
                )}
              </div>
              <CardTitle className="mt-4 text-xl">{network.name}</CardTitle>
              <CardDescription className="line-clamp-1 font-mono text-xs">
                {network.id}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Reseller API</span>
                <span className="text-white">
                  {network.reseller_username ? (
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <Lock className="h-3 w-3" /> {network.reseller_username}
                    </span>
                  ) : (
                    <span className="text-slate-500 italic">Not configured</span>
                  )}
                </span>
              </div>
              
              <div className="flex flex-col gap-2 pt-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-between rounded-xl border-white/10"
                  onClick={() => openResellerConfig(network)}
                >
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-slate-400" />
                    Reseller Credentials
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-600" />
                </Button>
                
                <Button 
                  className="w-full gap-2 rounded-xl bg-brand-600 hover:bg-brand-500"
                  disabled={!network.reseller_username}
                  onClick={() => openLineCreation(network)}
                >
                  <UserPlus className="h-4 w-4" />
                  Create User Line
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reseller Credentials Modal */}
      <Dialog open={showResellerModal} onOpenChange={setShowResellerModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reseller Configuration</DialogTitle>
            <DialogDescription>
              Enter the credentials for your Xtream Codes / UI panel reseller account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reseller Username</Label>
              <Input 
                value={resellerForm.username}
                onChange={e => setResellerForm({...resellerForm, username: e.target.value})}
                placeholder="admin_reseller"
              />
            </div>
            <div className="space-y-2">
              <Label>Reseller Password</Label>
              <Input 
                type="password"
                value={resellerForm.password}
                onChange={e => setResellerForm({...resellerForm, password: e.target.value})}
                placeholder="••••••••"
              />
              <p className="text-[10px] text-slate-500 italic">Leave blank to keep existing password</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowResellerModal(false)}>Cancel</Button>
            <Button onClick={saveResellerConfig} disabled={savingReseller}>
              {savingReseller ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Credentials'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Line Modal */}
      <Dialog open={showLineModal} onOpenChange={setShowLineModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create User Line</DialogTitle>
            <DialogDescription>
              Programmatically create a new account on {selectedNetwork?.name}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Line Username</Label>
                <Input 
                  value={lineForm.username}
                  onChange={e => setLineForm({...lineForm, username: e.target.value})}
                  placeholder="leave empty for auto"
                />
              </div>
              <div className="space-y-2">
                <Label>Line Password</Label>
                <Input 
                  value={lineForm.password}
                  onChange={e => setLineForm({...lineForm, password: e.target.value})}
                  placeholder="leave empty for auto"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <select 
                    className="w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-sm"
                    value={lineForm.duration}
                    onChange={e => setLineForm({...lineForm, duration: e.target.value})}
                  >
                    <option value="24">24 Hours (Trial)</option>
                    <option value="720">1 Month</option>
                    <option value="2160">3 Months</option>
                    <option value="8760">1 Year</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Connections</Label>
                  <Input 
                    type="number"
                    value={lineForm.maxConnections}
                    onChange={e => setLineForm({...lineForm, maxConnections: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Selected Bouquets (Packages)</Label>
              <div className="h-[200px] overflow-y-auto rounded-lg border border-white/5 bg-black/20 p-2">
                {loadingBouquets ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
                  </div>
                ) : bouquets.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500 italic">
                    No bouquets found or API error
                  </div>
                ) : bouquets.map(b => (
                  <label key={b.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 transition-colors hover:bg-white/5">
                    <input 
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/10 bg-slate-900"
                      checked={lineForm.selectedBouquets.includes(b.id)}
                      onChange={e => {
                        const next = e.target.checked 
                          ? [...lineForm.selectedBouquets, b.id]
                          : lineForm.selectedBouquets.filter(id => id !== b.id)
                        setLineForm({...lineForm, selectedBouquets: next})
                      }}
                    />
                    <span className="text-sm text-slate-300">{b.bouquet_name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowLineModal(false)}>Cancel</Button>
            <Button 
              className="gap-2 bg-emerald-600 hover:bg-emerald-500" 
              onClick={handleCreateLine}
              disabled={creatingLine}
            >
              {creatingLine ? <Loader2 className="h-4 w-4 animate-spin" /> : <Box className="h-4 w-4" />}
              Generate Line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
