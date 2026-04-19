import axios from 'axios'
import { reportApplicationError } from '@/context/ErrorReportingContext'
import { persistAdminToken, persistUserToken } from '@/lib/auth-cookies'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  withCredentials: true, // send httpOnly cookies automatically
})

// Attach JWT token for client-side requests (falls back to cookie auth on server)
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('sb_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    const adminToken = localStorage.getItem('sb_admin_token')
    if (adminToken) config.headers['x-admin-token'] = adminToken
  }
  return config
})

// Handle 401 globally (client side only)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (typeof window !== 'undefined' && err.response?.status === 401) {
      const isAdmin = window.location.pathname.startsWith('/admin')
      localStorage.removeItem(isAdmin ? 'sb_admin_token' : 'sb_token')
      if (isAdmin) persistAdminToken(null)
      else persistUserToken(null)
      window.location.href = isAdmin ? '/admin/login' : '/login'
    } else if (
      typeof window !== 'undefined' &&
      !err.config?.skipErrorReport &&
      (!err.response || err.response.status >= 500)
    ) {
      reportApplicationError(err, {
        source: window.location.pathname.startsWith('/admin') ? 'admin' : 'frontend',
        errorType: 'ApiError',
        message: err.response?.data?.error || err.message || 'Request failed',
        context: {
          httpStatus: err.response?.status || null,
          method: err.config?.method || null,
          url: err.config?.url || null,
        },
      })
    }
    return Promise.reject(err)
  }
)

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  signup: (email: string, password: string) => api.post('/api/auth/signup', { email, password }),
  login: (email: string, password: string) => api.post('/api/auth/login', { email, password }),
  logout: () => api.post('/api/auth/logout'),
  forgotPassword: (email: string) => api.post('/api/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => api.post('/api/auth/reset-password', { token, password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch('/api/auth/change-password', { currentPassword, newPassword }),
  googleAuth: (accessToken: string) => api.post('/api/auth/google', { accessToken }),
}

// ─── User ─────────────────────────────────────────────────────────────────────
export const userAPI = {
  getProfile: () => api.get('/api/user/profile'),
  updateProfile: (data: Record<string, unknown>) => api.patch('/api/user/profile', data),
  getAddonUrl: () => api.get('/api/user/addon-url'),
  getWatchHistory: (params?: Record<string, unknown>) => api.get('/api/user/watch-history', { params }),
  updateWatchHistory: (data: {
    vodId?: string
    rawTitle: string
    tmdbId?: number
    imdbId?: string
    vodType?: string
    progressPct?: number
  }) => api.post('/api/user/watch-history', data),
  regenerateAddonUrl: () => api.post('/api/user/addon-url/regenerate'),
  listSupportTickets: () => api.get('/api/user/support-tickets'),
  getSupportTicketMessages: (id: string) => api.get(`/api/user/support-tickets/${id}/messages`),
  replyToSupportTicket: (id: string, body: string) => api.post(`/api/user/support-tickets/${id}/messages`, { body }),
  deleteAccount: () => api.delete('/api/user/account'),
}

export const freeAccessAPI = {
  getStatus: () => api.get('/api/free-access/status'),
  start: () => api.post('/api/free-access/start'),
  extend: () => api.post('/api/free-access/extend'),
}

export const marketplaceAPI = {
  listOfferings: () => api.get('/api/marketplace/offerings'),
  getOffering: (id: string) => api.get(`/api/marketplace/offerings/${id}`),
  getPaymentProviders: () => api.get('/api/marketplace/payment-providers'),
  createCheckout: (
    offeringId: string,
    paymentProvider: string = 'stripe',
    confirmDuplicate = false,
    options?: { plan_code?: string; auto_renew?: boolean }
  ) =>
    api.post('/api/marketplace/checkout', {
      offering_id: offeringId,
      payment_provider: paymentProvider,
      confirm_duplicate: confirmDuplicate,
      plan_code: options?.plan_code,
      auto_renew: options?.auto_renew,
    }),
  getPaygateStatus: (addressIn: string) => api.get(`/api/marketplace/paygate/status/${addressIn}`),
  getSubscriptions: () => api.get('/api/subscriptions'),
  getPortalUrl: () => api.get('/api/subscriptions/portal'),
  cancelSubscription: (id: string) => api.post(`/api/subscriptions/${id}/cancel`),
  getPaymentHistory: (params?: { limit?: number; offset?: number }) =>
    api.get('/api/payments/history', { params }),
  getProvisionStatus: (subscriptionId: string) =>
    api.get(`/api/subscriptions/${subscriptionId}/provision-status`),
  resolveStripeSession: (stripeSessionId: string) =>
    api.get('/api/subscriptions/resolve', { params: { stripe_session_id: stripeSessionId } }),
}

export const creditsAPI = {
  getBalance: () => api.get('/api/credits/balance'),
  getTransactions: (params?: { limit?: number; offset?: number }) =>
    api.get('/api/credits/transactions', { params }),
  getCreditsConfig: () => api.get('/api/credits/config'),
  topup: (amountCents: number, paymentProvider: string = 'paygate') =>
    api.post('/api/credits/topup', { amount_cents: amountCents, payment_provider: paymentProvider }),
  getTopupStatus: (creditTxId: string) => api.get(`/api/credits/topup/status/${creditTxId}`),
}

// ─── Providers ────────────────────────────────────────────────────────────────
export const providerAPI = {
  create: (data: Record<string, unknown>) => api.post('/api/providers', data),
  list: () => api.get('/api/providers'),
  get: (id: string) => api.get(`/api/providers/${id}`),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/api/providers/${id}`, data),
  delete: (id: string) => api.delete(`/api/providers/${id}`),
  test: (id: string) => api.post(`/api/providers/${id}/test`),
  refresh: (id: string) => api.post(`/api/providers/${id}/refresh`),
  getRefreshStatus: (id: string) => api.get(`/api/providers/${id}/refresh-status`),
  listActiveRefreshes: () => api.get('/api/providers/refresh-status/all'),
  getHealth: (id: string) => api.get(`/api/providers/${id}/health`),
  recheckHealth: (id: string) => api.post(`/api/providers/${id}/health/recheck`),
  getStats: (id: string) => api.get(`/api/providers/${id}/stats`),
  getVod: (id: string, params?: Record<string, unknown>) => api.get(`/api/providers/${id}/vod`, { params }),
  getUnmatched: (id: string) => api.get(`/api/providers/${id}/unmatched`),
  getLive: (id: string, params?: Record<string, unknown>) => api.get(`/api/providers/${id}/live`, { params }),
  getEpg: (id: string) => api.get(`/api/providers/${id}/epg`),
  refreshEpg: (id: string) => api.post(`/api/providers/${id}/epg/refresh`),
  tmdbSearch: (id: string, q: string, type: string) =>
    api.get(`/api/providers/${id}/tmdb-search`, { params: { q, type } }),
  manualMatch: (id: string, data: Record<string, unknown>) => api.post(`/api/providers/${id}/manual-match`, data),
  getEpisodes: (id: string, seriesId: string, tmdbId?: number) => 
    api.get(`/api/providers/${id}/series/${seriesId}/episodes`, { params: { tmdbId } }),
  getWatchUrl: (id: string, vodType: string, streamId: string) => api.get(`/api/providers/${id}/watch/${vodType}/${streamId}`),
}

export const vodAPI = {
  getDetails: (tmdbId: number, type: string) => api.get('/api/vod/details', { params: { tmdbId, type } }),
  getSimilar: (tmdbId: number, type: string) => api.get('/api/vod/similar', { params: { tmdbId, type } }),
  getBrowse: (providerId: string) => api.get('/api/vod/browse', { params: { providerId } }),
}

// ─── Home / Trending / Favorites ─────────────────────────────────────────────
export const homeAPI = {
  getSections: () => api.get('/api/home/sections'),
  getTrending: (type: 'movie' | 'tv') => api.get('/api/home/trending', { params: { type } }),
  getFavorites: (type?: string) => api.get('/api/home/favorites', { params: type ? { type } : {} }),
  addFavorite: (data: {
    itemType: string
    itemId: string
    itemName: string
    posterUrl?: string
    providerId?: string
    metadata?: Record<string, unknown>
  }) => api.post('/api/home/favorites', data),
  removeFavorite: (id: string) => api.delete(`/api/home/favorites/${id}`),
}

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminAPI = {
  login: (username: string, password: string) => api.post('/api/admin/auth/login', { username, password }),
  logout: () => api.post('/api/admin/auth/logout'),
  listUsers: (params?: Record<string, unknown>) => api.get('/api/admin/users', { params }),
  getUser: (id: string) => api.get(`/api/admin/users/${id}`),
  deleteUser: (id: string) => api.delete(`/api/admin/users/${id}`),
  suspendUser: (id: string, suspend: boolean) => api.patch(`/api/admin/users/${id}/suspend`, { suspend }),
  impersonateUser: (id: string) => api.post(`/api/admin/users/${id}/impersonate`),
  adjustUserCredits: (id: string, data: { direction: 'add' | 'deduct'; amount_cents: number; note?: string }) =>
    api.post(`/api/admin/users/${id}/credits-adjust`, data),
  listProviders: (params?: Record<string, unknown>) => api.get('/api/admin/providers', { params }),
  getProvider: (id: string) => api.get(`/api/admin/providers/${id}`),
  deleteProvider: (id: string) => api.delete(`/api/admin/providers/${id}`),
  refreshProvider: (id: string) => api.post(`/api/admin/providers/${id}/refresh`),
  getOverview: () => api.get('/api/admin/stats/overview'),
  getMatchingStats: () => api.get('/api/admin/stats/matching'),
  getHealthStats: () => api.get('/api/admin/stats/health'),
  listErrorReports: (params?: Record<string, unknown>) => api.get('/api/admin/error-reports', { params }),
  getErrorReport: (id: string) => api.get(`/api/admin/error-reports/${id}`),
  updateErrorReport: (id: string, status: string) => api.patch(`/api/admin/error-reports/${id}`, { status }),
  getErrorReportMessages: (id: string) => api.get(`/api/admin/error-reports/${id}/messages`),
  replyToErrorReport: (id: string, body: string) => api.post(`/api/admin/error-reports/${id}/messages`, { body }),
  syncTmdb: () => api.post('/api/admin/tmdb/sync'),
  getTmdbStatus: () => api.get('/api/admin/tmdb/status'),
  rematch: () => api.post('/api/admin/tmdb/rematch'),
  refreshAll: () => api.post('/api/admin/system/refresh-all'),
  runJob: (jobName: string) => api.post(`/api/admin/system/run-job/${jobName}`),
  getJobs: () => api.get('/api/admin/system/jobs'),
  getDbStats: () => api.get('/api/admin/system/db'),
  listFreeAccessGroups: () => api.get('/api/admin/free-access/groups'),
  getFreeAccessGroup: (id: string) => api.get(`/api/admin/free-access/groups/${id}`),
  createFreeAccessGroup: (data: Record<string, unknown>) => api.post('/api/admin/free-access/groups', data),
  updateFreeAccessGroup: (id: string, data: Record<string, unknown>) => api.patch(`/api/admin/free-access/groups/${id}`, data),
  deleteFreeAccessGroup: (id: string) => api.delete(`/api/admin/free-access/groups/${id}`),
  addFreeAccessHost: (id: string, data: Record<string, unknown>) => api.post(`/api/admin/free-access/groups/${id}/hosts`, data),
  deleteFreeAccessHost: (groupId: string, hostId: string) => api.delete(`/api/admin/free-access/groups/${groupId}/hosts/${hostId}`),
  addFreeAccessAccount: (id: string, data: Record<string, unknown>) => api.post(`/api/admin/free-access/groups/${id}/accounts`, data),
  deleteFreeAccessAccount: (groupId: string, accountId: string) => api.delete(`/api/admin/free-access/groups/${groupId}/accounts/${accountId}`),
  refreshFreeAccessGroup: (id: string) => api.post(`/api/admin/free-access/groups/${id}/refresh`),
  listFreeAccessAssignments: (params?: Record<string, unknown>) => api.get('/api/admin/free-access/assignments', { params }),
  listBlogPosts: () => api.get('/api/admin/blog-posts'),
  createBlogPost: (data: Record<string, unknown>) => api.post('/api/admin/blog-posts', data),
  // Marketplace
  getMarketplace: () => api.get('/api/admin/marketplace'),
  createOffering: (data: Record<string, unknown>) => api.post('/api/admin/marketplace', data),
  updateOffering: (id: string, data: Record<string, unknown>) => api.patch(`/api/admin/marketplace/${id}`, data),
  deleteOffering: (id: string) => api.delete(`/api/admin/marketplace/${id}`),
  // Provider Networks (Reseller)
  listNetworks: () => api.get('/api/admin/networks'),
  createNetwork: (name: string) => api.post('/api/admin/networks', { name }),
  deleteNetwork: (id: string) => api.delete(`/api/admin/networks/${id}`),
  getNetwork: (id: string) => api.get(`/api/admin/networks/${id}`),
  updateNetwork: (id: string, data: Record<string, unknown>) => api.patch(`/api/admin/networks/${id}`, data),
  getNetworkBouquets: (id: string) => api.get(`/api/admin/networks/${id}/bouquets`),
  createResellerLine: (id: string, data: Record<string, unknown>) => api.post(`/api/admin/networks/${id}/create-line`, data),
  testNetworkSession: (id: string) => api.post(`/api/admin/networks/${id}/test-session`),
  refreshNetworkSession: (id: string) => api.post(`/api/admin/networks/${id}/refresh-session`),
  // CRM
  getCrmStatus: () => api.get('/api/admin/crm/status'),
  getCrmCoverage: () => api.get('/api/admin/crm/provider-access-coverage'),
  syncAllToCrm: () => api.post('/api/admin/crm/sync-all'),
  getCrmPeople: (params?: { limit?: number; cursor?: string }) => api.get('/api/admin/crm/people', { params }),
  getCrmTasks: (params?: { limit?: number; cursor?: string }) => api.get('/api/admin/crm/tasks', { params }),
  // System Settings
  getCreditsSettings: () => api.get('/api/admin/settings/credits'),
  updateCreditsSettings: (data: object) => api.put('/api/admin/settings/credits', data),
  getPaymentProviderSettings: () => api.get('/api/admin/settings/payment-providers'),
  updatePaymentProviderSettings: (data: object) => api.put('/api/admin/settings/payment-providers', data),
}

export const blogAPI = {
  list: () => api.get('/api/blog'),
  listFeatured: (limit = 3) => api.get('/api/blog/featured', { params: { limit } }),
  getBySlug: (slug: string) => api.get(`/api/blog/${slug}`),
}

// ─── Public Preview ───────────────────────────────────────────────────────────
export const previewAPI = {
  check: (host: string, username: string, password: string) =>
    api.post('/api/preview', { host, username, password }),
}

export const errorReportAPI = {
  create: (data: Record<string, unknown>) => api.post('/api/error-reports', data),
}

export default api
