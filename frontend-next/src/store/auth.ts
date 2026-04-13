'use client'

import { create } from 'zustand'
import { clearAllAuthCookies, persistUserToken } from '@/lib/auth-cookies'

export interface User {
  id: string
  email: string
  createdAt?: string
  created_at?: string
  last_seen?: string
  is_active?: boolean
  preferred_languages?: string[]
  excluded_languages?: string[]
  has_byo_providers?: boolean
  free_access_status?: string
  provider_count?: number
  can_use_live_tv?: boolean
  canBrowseWebCatalog?: boolean
  can_browse_web_catalog?: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  login: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('sb_token') : null,

  setUser: (user) => set({ user }),

  setToken: (token) => {
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('sb_token', token)
      else localStorage.removeItem('sb_token')
      persistUserToken(token)
    }
    set({ token })
  },

  login: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sb_token', token)
      persistUserToken(token)
    }
    set({ user, token })
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sb_token')
      localStorage.removeItem('sb_admin_token')
      clearAllAuthCookies()
    }
    set({ user: null, token: null })
  },
}))
