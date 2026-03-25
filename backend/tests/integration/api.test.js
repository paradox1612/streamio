/**
 * Integration tests — Express routes
 *
 * These tests run against the actual Express app with mocked DB.
 * They verify routing, middleware, and HTTP response shapes.
 *
 * Run: npm test
 */

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/streambridge_test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'testpass';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── Mock all DB calls ────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  addon_token: 'abc123token',
  is_active: true,
  created_at: new Date().toISOString(),
  last_seen: null,
};

jest.mock('../../src/db/pool', () => ({
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
  on: jest.fn(),
}));

jest.mock('../../src/db/queries', () => {
  const bcrypt = require('bcryptjs');
  const mockHash = bcrypt.hashSync('testpassword', 10);
  return {
    userQueries: {
      findByEmail: jest.fn().mockImplementation(email => {
        if (email === 'test@example.com') return Promise.resolve({ ...mockUser, password_hash: mockHash });
        return Promise.resolve(null);
      }),
      findById: jest.fn().mockResolvedValue(mockUser),
      findByToken: jest.fn().mockImplementation(token => {
        if (token === 'abc123token') return Promise.resolve(mockUser);
        return Promise.resolve(null);
      }),
      create: jest.fn().mockResolvedValue(mockUser),
      updateLastSeen: jest.fn().mockResolvedValue(),
      setResetToken: jest.fn().mockResolvedValue(),
      findByResetToken: jest.fn().mockResolvedValue(null),
      clearResetToken: jest.fn().mockResolvedValue(),
      regenerateToken: jest.fn().mockResolvedValue({ addon_token: 'newtoken456' }),
      deleteUser: jest.fn().mockResolvedValue(),
      setActive: jest.fn().mockResolvedValue(),
      listAll: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    providerQueries: {
      findByUser: jest.fn().mockResolvedValue([]),
      findByIdAndUser: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'prov-1', name: 'Test' }),
      update: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(),
      updateHealth: jest.fn().mockResolvedValue(),
      listAll: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      getAllForHealthCheck: jest.fn().mockResolvedValue([]),
    },
    vodQueries: {
      getByProvider: jest.fn().mockResolvedValue([]),
      getStats: jest.fn().mockResolvedValue({ movie_count: 0, series_count: 0, category_count: 0, total: 0 }),
      getMatchStats: jest.fn().mockResolvedValue({ total: 0, matched: 0, unmatched: 0 }),
      getUnmatchedTitles: jest.fn().mockResolvedValue([]),
      getCategoryBreakdown: jest.fn().mockResolvedValue([]),
      totalCount: jest.fn().mockResolvedValue(0),
      findByInternalIdForUser: jest.fn().mockResolvedValue(null),
      findByTmdbIdForUser: jest.fn().mockResolvedValue(null),
    },
    tmdbQueries: { movieCount: jest.fn().mockResolvedValue(0), seriesCount: jest.fn().mockResolvedValue(0) },
    matchQueries: { globalStats: jest.fn().mockResolvedValue({ total: 0, matched: 0, unmatched: 0 }), listUnmatched: jest.fn().mockResolvedValue([]) },
    hostHealthQueries: { getByProvider: jest.fn().mockResolvedValue([]), getAll: jest.fn().mockResolvedValue([]) },
    jobQueries: {
      start: jest.fn().mockResolvedValue('job-id'),
      finish: jest.fn().mockResolvedValue(),
      getLastRuns: jest.fn().mockResolvedValue([]),
      getHistory: jest.fn().mockResolvedValue([]),
    },
    pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
  };
});

jest.mock('../../src/services/providerService', () => ({
  getSeriesEpisodes: jest.fn().mockResolvedValue({}),
  testConnection: jest.fn().mockResolvedValue({ ok: true }),
  testProvider: jest.fn().mockResolvedValue([]),
  refreshCatalog: jest.fn().mockResolvedValue({ movies: 0, series: 0, total: 0 }),
  create: jest.fn().mockResolvedValue({ id: 'prov-1', name: 'Test' }),
  getStats: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/jobs/scheduler', () => ({
  startScheduler: jest.fn(),
  jobs: {
    healthCheckJob: jest.fn().mockResolvedValue(),
    tmdbSyncJob: jest.fn().mockResolvedValue(),
    catalogRefreshJob: jest.fn().mockResolvedValue(),
    matchingJob: jest.fn().mockResolvedValue(),
  },
}));

jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const app = require('../../src/index');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUserToken(userId = 'user-123') {
  return jwt.sign({ userId, email: 'test@example.com' }, 'test_jwt_secret', { expiresIn: '1h' });
}

function makeAdminToken() {
  return jwt.sign({ admin: true, username: 'admin' }, 'test_jwt_secret', { expiresIn: '1h' });
}

// ─── Health ───────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeTruthy();
  });
});

// ─── Auth Routes ─────────────────────────────────────────────────────────────

describe('POST /api/auth/signup', () => {
  it('returns 201 with user and token', async () => {
    const { userQueries } = require('../../src/db/queries');
    userQueries.findByEmail.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toBeTruthy();
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'notanemail', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for short password', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'ok@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('returns 200 with token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'testpassword' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'pass' });
    expect(res.status).toBe(401);
  });
});

// ─── User Routes ─────────────────────────────────────────────────────────────

describe('GET /api/user/profile', () => {
  it('returns user profile with valid JWT', async () => {
    const token = makeUserToken();
    const res = await request(app)
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeTruthy();
  });

  it('returns 401 without auth header', async () => {
    const res = await request(app).get('/api/user/profile');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/user/profile')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/user/addon-url', () => {
  it('returns addon URL for authenticated user', async () => {
    const token = makeUserToken();
    const res = await request(app)
      .get('/api/user/addon-url')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.addonUrl).toContain('manifest.json');
    expect(res.body.addonUrl).toContain('abc123token');
  });
});

// ─── Provider Routes ─────────────────────────────────────────────────────────

describe('GET /api/providers', () => {
  it('returns empty array when no providers', async () => {
    const token = makeUserToken();
    const res = await request(app)
      .get('/api/providers')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/providers', () => {
  it('creates provider with valid data', async () => {
    const token = makeUserToken();
    const res = await request(app)
      .post('/api/providers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Provider', hosts: ['http://host.com'], username: 'user', password: 'pass' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'prov-1', name: 'Test' });
  });

  it('returns 400 if hosts is missing', async () => {
    const token = makeUserToken();
    const res = await request(app)
      .post('/api/providers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Provider', username: 'user', password: 'pass' });

    expect(res.status).toBe(400);
  });
});

// ─── Stremio Addon Routes ─────────────────────────────────────────────────────

describe('GET /addon/:token/manifest.json', () => {
  it('returns manifest for valid token', async () => {
    const res = await request(app).get('/addon/abc123token/manifest.json');
    expect(res.status).toBe(200);
    expect(res.body.id).toContain('streambridge');
    expect(Array.isArray(res.body.catalogs)).toBe(true);
    expect(res.body.resources).toContain('catalog');
  });

  it('returns 401 for invalid token', async () => {
    const res = await request(app).get('/addon/badtoken/manifest.json');
    expect(res.status).toBe(401);
  });
});

describe('GET /addon/:token/catalog/:type/:id.json', () => {
  it('returns empty metas for valid token + unknown catalog id', async () => {
    const res = await request(app).get('/addon/abc123token/catalog/movie/sb_unknownprovider_movies.json');
    expect(res.status).toBe(200);
    expect(res.body.metas).toBeDefined();
    expect(Array.isArray(res.body.metas)).toBe(true);
  });
});

describe('GET /addon/:token/stream/:type/:id.json', () => {
  it('returns empty streams for valid token + missing item', async () => {
    const res = await request(app).get('/addon/abc123token/stream/movie/sb_nonexistent.json');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.streams)).toBe(true);
  });
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────

describe('POST /admin/auth/login', () => {
  it('returns admin token with valid credentials', async () => {
    const res = await request(app)
      .post('/admin/auth/login')
      .send({ username: 'admin', password: 'testpass' });

    expect(res.status).toBe(200);
    expect(res.body.adminToken).toBeTruthy();
  });

  it('returns 401 with wrong credentials', async () => {
    const res = await request(app)
      .post('/admin/auth/login')
      .send({ username: 'admin', password: 'wrong' });

    expect(res.status).toBe(401);
  });
});

describe('GET /admin/users', () => {
  it('returns users list with admin token', async () => {
    // First get an admin token
    const loginRes = await request(app)
      .post('/admin/auth/login')
      .send({ username: 'admin', password: 'testpass' });
    const adminToken = loginRes.body.adminToken;

    const res = await request(app)
      .get('/admin/users')
      .set('x-admin-token', adminToken);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 401 without admin token', async () => {
    const res = await request(app).get('/admin/users');
    expect(res.status).toBe(401);
  });
});

describe('GET /admin/stats/overview', () => {
  it('returns overview stats with admin token', async () => {
    const loginRes = await request(app)
      .post('/admin/auth/login')
      .send({ username: 'admin', password: 'testpass' });

    const res = await request(app)
      .get('/admin/stats/overview')
      .set('x-admin-token', loginRes.body.adminToken);

    expect(res.status).toBe(200);
    expect(res.body.userCount).toBeDefined();
    expect(res.body.providerCount).toBeDefined();
  });
});
