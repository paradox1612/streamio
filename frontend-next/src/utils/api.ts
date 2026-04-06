import axios from 'axios'

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
      window.location.href = isAdmin ? '/admin/login' : '/login'
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
}

// ─── User ─────────────────────────────────────────────────────────────────────
export const userAPI = {
  getProfile: () => api.get('/api/user/profile'),
  updateProfile: (data: Record<string, unknown>) => api.patch('/api/user/profile', data),
  getAddonUrl: () => api.get('/api/user/addon-url'),
  getWatchHistory: (params?: Record<string, unknown>) => api.get('/api/user/watch-history', { params }),
  regenerateAddonUrl: () => api.post('/api/user/addon-url/regenerate'),
  deleteAccount: () => api.delete('/api/user/account'),
}

export const freeAccessAPI = {
  getStatus: () => api.get('/api/free-access/status'),
  start: () => api.post('/api/free-access/start'),
  extend: () => api.post('/api/free-access/extend'),
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
}

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminAPI = {
  login: (username: string, password: string) => api.post('/api/admin/auth/login', { username, password }),
  logout: () => api.post('/api/admin/auth/logout'),
  listUsers: (params?: Record<string, unknown>) => api.get('/api/admin/users', { params }),
  getUser: (id: string) => api.get(`/api/admin/users/${id}`),
  deleteUser: (id: string) => api.delete(`/api/admin/users/${id}`),
  suspendUser: (id: string, suspend: boolean) => api.patch(`/api/admin/users/${id}/suspend`, { suspend }),
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
