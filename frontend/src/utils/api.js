import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const adminToken = localStorage.getItem('sb_admin_token');
  if (adminToken) config.headers['x-admin-token'] = adminToken;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const isAdmin = window.location.pathname.startsWith('/admin');
      localStorage.removeItem(isAdmin ? 'sb_admin_token' : 'sb_token');
      window.location.href = isAdmin ? '/admin/login' : '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  signup: (email, password) => api.post('/api/auth/signup', { email, password }),
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  logout: () => api.post('/api/auth/logout'),
  forgotPassword: (email) => api.post('/api/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/api/auth/reset-password', { token, password }),
  changePassword: (currentPassword, newPassword) =>
    api.patch('/api/auth/change-password', { currentPassword, newPassword }),
};

// ─── User ─────────────────────────────────────────────────────────────────────
export const userAPI = {
  getProfile: () => api.get('/api/user/profile'),
  updateProfile: (data) => api.patch('/api/user/profile', data),
  getAddonUrl: () => api.get('/api/user/addon-url'),
  getWatchHistory: (params) => api.get('/api/user/watch-history', { params }),
  regenerateAddonUrl: () => api.post('/api/user/addon-url/regenerate'),
  deleteAccount: () => api.delete('/api/user/account'),
};

export const freeAccessAPI = {
  getStatus: () => api.get('/api/free-access/status'),
  start: () => api.post('/api/free-access/start'),
  extend: () => api.post('/api/free-access/extend'),
};

// ─── Providers ────────────────────────────────────────────────────────────────
export const providerAPI = {
  create: (data) => api.post('/api/providers', data),
  list: () => api.get('/api/providers'),
  get: (id) => api.get(`/api/providers/${id}`),
  update: (id, data) => api.patch(`/api/providers/${id}`, data),
  delete: (id) => api.delete(`/api/providers/${id}`),
  test: (id) => api.post(`/api/providers/${id}/test`),
  refresh: (id) => api.post(`/api/providers/${id}/refresh`),
  getHealth: (id) => api.get(`/api/providers/${id}/health`),
  recheckHealth: (id) => api.post(`/api/providers/${id}/health/recheck`),
  getStats: (id) => api.get(`/api/providers/${id}/stats`),
  getVod: (id, params) => api.get(`/api/providers/${id}/vod`, { params }),
  getUnmatched: (id) => api.get(`/api/providers/${id}/unmatched`),
  getLive: (id, params) => api.get(`/api/providers/${id}/live`, { params }),
  getEpg: (id) => api.get(`/api/providers/${id}/epg`),
  refreshEpg: (id) => api.post(`/api/providers/${id}/epg/refresh`),
  // Manual match override
  tmdbSearch: (id, q, type) => api.get(`/api/providers/${id}/tmdb-search`, { params: { q, type } }),
  manualMatch: (id, data) => api.post(`/api/providers/${id}/manual-match`, data),
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminAPI = {
  login: (username, password) => api.post('/admin/auth/login', { username, password }),
  logout: () => api.post('/admin/auth/logout'),

  // Users
  listUsers: (params) => api.get('/admin/users', { params }),
  getUser: (id) => api.get(`/admin/users/${id}`),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  suspendUser: (id, suspend) => api.patch(`/admin/users/${id}/suspend`, { suspend }),

  // Providers
  listProviders: (params) => api.get('/admin/providers', { params }),
  getProvider: (id) => api.get(`/admin/providers/${id}`),
  deleteProvider: (id) => api.delete(`/admin/providers/${id}`),
  refreshProvider: (id) => api.post(`/admin/providers/${id}/refresh`),

  // Stats
  getOverview: () => api.get('/admin/stats/overview'),
  getMatchingStats: () => api.get('/admin/stats/matching'),
  getHealthStats: () => api.get('/admin/stats/health'),
  listErrorReports: (params) => api.get('/admin/error-reports', { params }),
  getErrorReport: (id) => api.get(`/admin/error-reports/${id}`),
  updateErrorReport: (id, status) => api.patch(`/admin/error-reports/${id}`, { status }),

  // TMDB
  syncTmdb: () => api.post('/admin/tmdb/sync'),
  getTmdbStatus: () => api.get('/admin/tmdb/status'),
  rematch: () => api.post('/admin/tmdb/rematch'),

  // System
  refreshAll: () => api.post('/admin/system/refresh-all'),
  runJob: (jobName) => api.post(`/admin/system/run-job/${jobName}`),
  getJobs: () => api.get('/admin/system/jobs'),
  getDbStats: () => api.get('/admin/system/db'),

  // Free access admin
  listFreeAccessGroups: () => api.get('/admin/free-access/groups'),
  getFreeAccessGroup: (id) => api.get(`/admin/free-access/groups/${id}`),
  createFreeAccessGroup: (data) => api.post('/admin/free-access/groups', data),
  updateFreeAccessGroup: (id, data) => api.patch(`/admin/free-access/groups/${id}`, data),
  deleteFreeAccessGroup: (id) => api.delete(`/admin/free-access/groups/${id}`),
  addFreeAccessHost: (id, data) => api.post(`/admin/free-access/groups/${id}/hosts`, data),
  deleteFreeAccessHost: (groupId, hostId) => api.delete(`/admin/free-access/groups/${groupId}/hosts/${hostId}`),
  addFreeAccessAccount: (id, data) => api.post(`/admin/free-access/groups/${id}/accounts`, data),
  deleteFreeAccessAccount: (groupId, accountId) => api.delete(`/admin/free-access/groups/${groupId}/accounts/${accountId}`),
  refreshFreeAccessGroup: (id) => api.post(`/admin/free-access/groups/${id}/refresh`),
  listFreeAccessAssignments: (params) => api.get('/admin/free-access/assignments', { params }),
};

// ─── Public Preview (no auth) ─────────────────────────────────────────────────
export const previewAPI = {
  check: (host, username, password) =>
    api.post('/api/preview', { host, username, password }),
};

export const errorReportAPI = {
  create: (data) => api.post('/api/error-reports', data),
};

export default api;
