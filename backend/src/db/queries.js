const pool = require('./pool');

// ─── Users ───────────────────────────────────────────────────────────────────

const userQueries = {
  async findByEmail(email) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await pool.query(
      'SELECT id, email, addon_token, is_active, created_at, last_seen FROM users WHERE id = $1',
      [id]
    );
    return rows[0];
  },

  async findByToken(token) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE addon_token = $1 AND is_active = true',
      [token]
    );
    return rows[0];
  },

  async findByResetToken(token) {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()`,
      [token]
    );
    return rows[0];
  },

  async create({ email, passwordHash, addonToken }) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, addon_token)
       VALUES ($1, $2, $3) RETURNING id, email, addon_token, is_active, created_at`,
      [email, passwordHash, addonToken]
    );
    return rows[0];
  },

  async updateLastSeen(id) {
    await pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [id]);
  },

  async updatePassword(id, passwordHash) {
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, id]
    );
  },

  async setResetToken(id, token, expires) {
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, expires, id]
    );
  },

  async clearResetToken(id) {
    await pool.query(
      'UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = $1',
      [id]
    );
  },

  async regenerateToken(id, newToken) {
    const { rows } = await pool.query(
      'UPDATE users SET addon_token = $1 WHERE id = $2 RETURNING addon_token',
      [newToken, id]
    );
    return rows[0];
  },

  async setActive(id, isActive) {
    await pool.query('UPDATE users SET is_active = $1 WHERE id = $2', [isActive, id]);
  },

  async deleteUser(id) {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
  },

  async listAll({ limit = 50, offset = 0, search = '' } = {}) {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.is_active, u.created_at, u.last_seen,
              COUNT(DISTINCT p.id) as provider_count
       FROM users u
       LEFT JOIN user_providers p ON p.user_id = u.id
       WHERE u.email ILIKE $1
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${search}%`, limit, offset]
    );
    return rows;
  },

  async count() {
    const { rows } = await pool.query('SELECT COUNT(*) FROM users');
    return parseInt(rows[0].count);
  },
};

// ─── Providers ───────────────────────────────────────────────────────────────

const providerQueries = {
  async create({ userId, name, hosts, username, password }) {
    const { rows } = await pool.query(
      `INSERT INTO user_providers (user_id, name, hosts, username, password)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, name, hosts, username, password]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await pool.query(
      'SELECT * FROM user_providers WHERE id = $1',
      [id]
    );
    return rows[0];
  },

  async findByIdAndUser(id, userId) {
    const { rows } = await pool.query(
      'SELECT * FROM user_providers WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return rows[0];
  },

  async findByUser(userId) {
    const { rows } = await pool.query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM user_provider_vod v WHERE v.provider_id = p.id) AS vod_count,
              (SELECT COUNT(*) FROM user_provider_vod v
               JOIN matched_content m ON m.raw_title = v.raw_title
               WHERE v.provider_id = p.id AND m.tmdb_id IS NOT NULL) AS matched_count
       FROM user_providers p
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async listAll({ limit = 100, offset = 0 } = {}) {
    const { rows } = await pool.query(
      `SELECT p.*, u.email as user_email,
              (SELECT COUNT(*) FROM user_provider_vod v WHERE v.provider_id = p.id) AS vod_count
       FROM user_providers p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows;
  },

  async update(id, userId, fields) {
    const allowed = ['name', 'hosts', 'username', 'password'];
    const updates = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = $${idx++}`);
        values.push(val);
      }
    }
    if (!updates.length) return null;
    values.push(id, userId);
    const { rows } = await pool.query(
      `UPDATE user_providers SET ${updates.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
      values
    );
    return rows[0];
  },

  async updateHealth(id, { activeHost, status }) {
    await pool.query(
      `UPDATE user_providers SET active_host = $1, status = $2, last_checked = NOW() WHERE id = $3`,
      [activeHost, status, id]
    );
  },

  async delete(id, userId) {
    await pool.query(
      'DELETE FROM user_providers WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
  },

  async count() {
    const { rows } = await pool.query('SELECT COUNT(*) FROM user_providers');
    return parseInt(rows[0].count);
  },

  async getAllForHealthCheck() {
    const { rows } = await pool.query('SELECT * FROM user_providers');
    return rows;
  },
};

// ─── VOD ─────────────────────────────────────────────────────────────────────

const vodQueries = {
  async upsertBatch(entries) {
    if (!entries.length) return;
    const values = [];
    const placeholders = entries.map((e, i) => {
      const base = i * 8;
      values.push(e.userId, e.providerId, e.streamId, e.rawTitle, e.posterUrl, e.category, e.vodType, e.containerExtension || null);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    });
    await pool.query(
      `INSERT INTO user_provider_vod (user_id, provider_id, stream_id, raw_title, poster_url, category, vod_type, container_extension)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (provider_id, stream_id, vod_type) DO UPDATE
       SET raw_title = EXCLUDED.raw_title,
           poster_url = EXCLUDED.poster_url,
           category = EXCLUDED.category,
           container_extension = EXCLUDED.container_extension`,
      values
    );
  },

  async deleteByProvider(providerId) {
    await pool.query('DELETE FROM user_provider_vod WHERE provider_id = $1', [providerId]);
  },

  async getByProvider(providerId, { type, page = 1, limit = 100, search = '', matched } = {}) {
    let query = `
      SELECT v.*, m.tmdb_id, m.tmdb_type, m.confidence_score, m.imdb_id
      FROM user_provider_vod v
      LEFT JOIN matched_content m ON m.raw_title = v.raw_title
      WHERE v.provider_id = $1
    `;
    const params = [providerId];
    let idx = 2;
    if (type) { query += ` AND v.vod_type = $${idx++}`; params.push(type); }
    if (search) { query += ` AND v.raw_title ILIKE $${idx++}`; params.push(`%${search}%`); }
    if (matched === true) { query += ` AND m.tmdb_id IS NOT NULL`; }
    if (matched === false) { query += ` AND (m.tmdb_id IS NULL AND m.id IS NOT NULL)`; }
    query += ` ORDER BY v.raw_title ASC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async getStats(providerId) {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE vod_type = 'movie') AS movie_count,
         COUNT(*) FILTER (WHERE vod_type = 'series') AS series_count,
         COUNT(DISTINCT category) AS category_count,
         COUNT(*) AS total
       FROM user_provider_vod WHERE provider_id = $1`,
      [providerId]
    );
    return rows[0];
  },

  async getMatchStats(providerId) {
    const { rows } = await pool.query(
      `SELECT
         COUNT(v.id) AS total,
         COUNT(m.tmdb_id) AS matched,
         COUNT(v.id) - COUNT(m.tmdb_id) AS unmatched
       FROM user_provider_vod v
       LEFT JOIN matched_content m ON m.raw_title = v.raw_title AND m.tmdb_id IS NOT NULL
       WHERE v.provider_id = $1`,
      [providerId]
    );
    return rows[0];
  },

  async getUnmatchedTitles(providerId) {
    const { rows } = await pool.query(
      `SELECT v.raw_title, v.vod_type
       FROM user_provider_vod v
       LEFT JOIN matched_content m ON m.raw_title = v.raw_title
       WHERE v.provider_id = $1 AND (m.id IS NULL OR m.tmdb_id IS NULL)
       ORDER BY v.raw_title ASC`,
      [providerId]
    );
    return rows;
  },

  async getCategoryBreakdown(providerId) {
    const { rows } = await pool.query(
      `SELECT category, vod_type, COUNT(*) as count
       FROM user_provider_vod
       WHERE provider_id = $1
       GROUP BY category, vod_type
       ORDER BY count DESC`,
      [providerId]
    );
    return rows;
  },

  async findByTmdbIdForUser(userId, tmdbId) {
    const { rows } = await pool.query(
      `SELECT v.*, p.active_host, p.username, p.password
       FROM user_provider_vod v
       JOIN matched_content m ON m.raw_title = v.raw_title AND m.tmdb_id = $2
       JOIN user_providers p ON p.id = v.provider_id AND p.user_id = $1
       WHERE v.user_id = $1
       LIMIT 1`,
      [userId, tmdbId]
    );
    return rows[0];
  },

  async findByInternalIdForUser(userId, internalId) {
    const { rows } = await pool.query(
      `SELECT v.*, p.active_host, p.username, p.password
       FROM user_provider_vod v
       JOIN user_providers p ON p.id = v.provider_id AND p.user_id = $1
       WHERE v.id = $2 AND v.user_id = $1
       LIMIT 1`,
      [userId, internalId]
    );
    return rows[0];
  },

  async getUnmatchedForMatching(limit = 1000) {
    const { rows } = await pool.query(
      `SELECT DISTINCT v.raw_title, v.vod_type
       FROM user_provider_vod v
       LEFT JOIN matched_content m ON m.raw_title = v.raw_title
       WHERE m.id IS NULL
       LIMIT $1`,
      [limit]
    );
    return rows;
  },

  async totalCount() {
    const { rows } = await pool.query('SELECT COUNT(*) FROM user_provider_vod');
    return parseInt(rows[0].count);
  },
};

// ─── TMDB ─────────────────────────────────────────────────────────────────────

const tmdbQueries = {
  async upsertMovie({ id, original_title, release_year, popularity, poster_path, overview, imdb_id }) {
    await pool.query(
      `INSERT INTO tmdb_movies (id, original_title, release_year, popularity, poster_path, overview, imdb_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         original_title = EXCLUDED.original_title,
         release_year = EXCLUDED.release_year,
         popularity = EXCLUDED.popularity,
         poster_path = EXCLUDED.poster_path,
         overview = EXCLUDED.overview,
         imdb_id = EXCLUDED.imdb_id`,
      [id, original_title, release_year, popularity, poster_path, overview, imdb_id]
    );
  },

  async upsertSeries({ id, original_title, first_air_year, popularity, poster_path, overview }) {
    await pool.query(
      `INSERT INTO tmdb_series (id, original_title, first_air_year, popularity, poster_path, overview)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         original_title = EXCLUDED.original_title,
         first_air_year = EXCLUDED.first_air_year,
         popularity = EXCLUDED.popularity,
         poster_path = EXCLUDED.poster_path,
         overview = EXCLUDED.overview`,
      [id, original_title, first_air_year, popularity, poster_path, overview]
    );
  },

  async fuzzyMatchMovie(cleanTitle, year) {
    let query = `
      SELECT id, original_title, imdb_id, popularity,
        similarity(original_title, $1) AS score
      FROM tmdb_movies
      WHERE similarity(original_title, $1) > 0.5
    `;
    const params = [cleanTitle];
    if (year) {
      query += ` AND ABS(release_year - $2) <= 2`;
      params.push(year);
    }
    query += ` ORDER BY score DESC, popularity DESC LIMIT 1`;
    const { rows } = await pool.query(query, params);
    return rows[0];
  },

  async fuzzyMatchSeries(cleanTitle, year) {
    let query = `
      SELECT id, original_title, popularity,
        similarity(original_title, $1) AS score
      FROM tmdb_series
      WHERE similarity(original_title, $1) > 0.5
    `;
    const params = [cleanTitle];
    if (year) {
      query += ` AND ABS(first_air_year - $2) <= 2`;
      params.push(year);
    }
    query += ` ORDER BY score DESC, popularity DESC LIMIT 1`;
    const { rows } = await pool.query(query, params);
    return rows[0];
  },

  async movieCount() {
    const { rows } = await pool.query('SELECT COUNT(*) FROM tmdb_movies');
    return parseInt(rows[0].count);
  },

  async seriesCount() {
    const { rows } = await pool.query('SELECT COUNT(*) FROM tmdb_series');
    return parseInt(rows[0].count);
  },
};

// ─── Matched Content ─────────────────────────────────────────────────────────

const matchQueries = {
  async findByRawTitle(rawTitle) {
    const { rows } = await pool.query(
      'SELECT * FROM matched_content WHERE raw_title = $1',
      [rawTitle]
    );
    return rows[0];
  },

  async upsert({ rawTitle, tmdbId, tmdbType, imdbId, confidenceScore }) {
    await pool.query(
      `INSERT INTO matched_content (raw_title, tmdb_id, tmdb_type, imdb_id, confidence_score, matched_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (raw_title) DO UPDATE SET
         tmdb_id = EXCLUDED.tmdb_id,
         tmdb_type = EXCLUDED.tmdb_type,
         imdb_id = EXCLUDED.imdb_id,
         confidence_score = EXCLUDED.confidence_score,
         matched_at = NOW()`,
      [rawTitle, tmdbId, tmdbType, imdbId, confidenceScore]
    );
  },

  async globalStats() {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE tmdb_id IS NOT NULL) AS matched,
         COUNT(*) FILTER (WHERE tmdb_id IS NULL) AS unmatched,
         AVG(confidence_score) FILTER (WHERE tmdb_id IS NOT NULL) AS avg_confidence
       FROM matched_content`
    );
    return rows[0];
  },

  async listUnmatched({ limit = 100, offset = 0 } = {}) {
    const { rows } = await pool.query(
      `SELECT * FROM matched_content WHERE tmdb_id IS NULL
       ORDER BY matched_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows;
  },
};

// ─── Host Health ─────────────────────────────────────────────────────────────

const hostHealthQueries = {
  async upsert({ providerId, hostUrl, status, responseTimeMs }) {
    await pool.query(
      `INSERT INTO host_health (provider_id, host_url, status, response_time_ms, last_checked)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (provider_id, host_url) DO UPDATE SET
         status = EXCLUDED.status,
         response_time_ms = EXCLUDED.response_time_ms,
         last_checked = NOW()`,
      [providerId, hostUrl, status, responseTimeMs]
    );
  },

  async getByProvider(providerId) {
    const { rows } = await pool.query(
      'SELECT * FROM host_health WHERE provider_id = $1 ORDER BY status ASC, response_time_ms ASC',
      [providerId]
    );
    return rows;
  },

  async getAll() {
    const { rows } = await pool.query(
      `SELECT h.*, p.name as provider_name, u.email as user_email
       FROM host_health h
       JOIN user_providers p ON p.id = h.provider_id
       JOIN users u ON u.id = p.user_id
       ORDER BY h.last_checked DESC`
    );
    return rows;
  },
};

// ─── Job Runs ─────────────────────────────────────────────────────────────────

const jobQueries = {
  async start(jobName) {
    const { rows } = await pool.query(
      `INSERT INTO job_runs (job_name, status, started_at)
       VALUES ($1, 'running', NOW()) RETURNING id`,
      [jobName]
    );
    return rows[0].id;
  },

  async finish(id, { status, errorMessage, metadata } = {}) {
    await pool.query(
      `UPDATE job_runs SET status = $1, finished_at = NOW(), error_message = $2, metadata = $3
       WHERE id = $4`,
      [status || 'success', errorMessage || null, metadata ? JSON.stringify(metadata) : null, id]
    );
  },

  async getLastRuns() {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (job_name) *
       FROM job_runs
       ORDER BY job_name, started_at DESC`
    );
    return rows;
  },

  async getHistory(jobName, limit = 10) {
    const { rows } = await pool.query(
      `SELECT * FROM job_runs WHERE job_name = $1 ORDER BY started_at DESC LIMIT $2`,
      [jobName, limit]
    );
    return rows;
  },
};

module.exports = {
  userQueries,
  providerQueries,
  vodQueries,
  tmdbQueries,
  matchQueries,
  hostHealthQueries,
  jobQueries,
  pool,
};
