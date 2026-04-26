const pool = require('./pool');
const { from } = require('pg-copy-streams');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { normalizeTitle } = require('../utils/titleNormalization');

/**
 * Resolves hosts for a user_providers row aliased as `p`.
 * - Network-attached providers (p.network_id IS NOT NULL): always read live
 *   from provider_network_hosts so admin host changes propagate instantly.
 * - BYO / legacy providers (p.network_id IS NULL): use the stored hosts[] column.
 * Falls back to stored hosts[] if the network has no active hosts configured yet.
 */
const PROVIDER_HOSTS_EXPR = `
  CASE WHEN p.network_id IS NOT NULL THEN
    COALESCE(
      NULLIF(
        ARRAY(
          SELECT h.host_url::TEXT
          FROM   provider_network_hosts h
          WHERE  h.provider_network_id = p.network_id
            AND  h.is_active = true
          ORDER BY h.id
        ),
        ARRAY[]::TEXT[]
      ),
      p.hosts::TEXT[]
    )
  ELSE p.hosts::TEXT[] END
`;

/**
 * Full column list for user_providers (alias p) with live host resolution.
 * Use this instead of p.* in any query that needs host data to ensure
 * network-managed providers always return up-to-date hosts.
 */
const PROVIDER_COLS = `
  p.id,
  p.user_id,
  p.name,
  ${PROVIDER_HOSTS_EXPR} AS hosts,
  p.username,
  p.password,
  p.active_host,
  p.status,
  p.last_checked,
  p.created_at,
  p.network_id,
  p.catalog_variant,
  p.network_attached_at,
  p.app_portal_config,
  p.twenty_provider_access_id,
  p.account_status,
  p.account_expires_at,
  p.account_is_trial,
  p.account_max_connections,
  p.account_active_connections,
  p.account_last_synced_at
`;

function pickFirstDefined(entry, ...keys) {
  for (const key of keys) {
    if (entry[key] !== undefined) return entry[key];
  }
  return undefined;
}

function buildIsDistinctClause(targetAlias, sourceAlias, columns) {
  return columns
    .map((column) => `${targetAlias}.${column} IS DISTINCT FROM ${sourceAlias}.${column}`)
    .join('\n            OR ');
}

let contentAliasesLookupColumnPromise = null;

async function getContentAliasesLookupColumn() {
  const shouldCache = !process.env.JEST_WORKER_ID;
  if (!contentAliasesLookupColumnPromise || !shouldCache) {
    const lookupPromise = (async () => {
      const { rows } = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'content_aliases'`
      );
      const columns = new Set(rows.map((row) => row.column_name));
      if (columns.has('normalized_alias')) return 'normalized_alias';
      if (columns.has('normalized_title')) return 'normalized_title';
      return 'canonical_normalized_title';
    })().catch((error) => {
      if (shouldCache) {
        contentAliasesLookupColumnPromise = null;
      }
      throw error;
    });
    if (shouldCache) {
      contentAliasesLookupColumnPromise = lookupPromise;
    }
    return lookupPromise;
  }
  return contentAliasesLookupColumnPromise;
}

const USER_PUBLIC_SELECT = `
  SELECT
    u.id,
    u.email,
    u.addon_token,
    u.preferred_languages,
    u.excluded_languages,
    u.is_active,
    u.credit_balance_cents,
    u.created_at,
    u.last_seen,
    EXISTS(
      SELECT 1
      FROM user_providers p
      WHERE p.user_id = u.id
    ) AS has_byo_providers,
    CASE
      WHEN fa.status = 'active' AND fa.expires_at <= NOW() THEN 'expired'
      ELSE COALESCE(fa.status, 'inactive')
    END AS free_access_status,
    fa.expires_at AS free_access_expires_at,
    (fa.status = 'active' AND fa.expires_at > NOW()) AS has_active_free_access,
    EXISTS(
      SELECT 1
      FROM user_free_access_assignments ufa
      WHERE ufa.user_id = u.id
        AND ufa.status = 'expired'
    ) AS has_expired_free_access,
    EXISTS(
      SELECT 1
      FROM user_providers p
      WHERE p.user_id = u.id
    ) AS can_use_live_tv
  FROM users u
  LEFT JOIN LATERAL (
    SELECT status, expires_at
    FROM user_free_access_assignments ufa
    WHERE ufa.user_id = u.id
    ORDER BY
      CASE ufa.status WHEN 'active' THEN 0 WHEN 'expired' THEN 1 ELSE 2 END,
      ufa.expires_at DESC NULLS LAST,
      ufa.started_at DESC
    LIMIT 1
  ) fa ON true
`;

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
      `${USER_PUBLIC_SELECT}
       WHERE u.id = $1`,
      [id]
    );
    return rows[0];
  },

  async findByToken(token) {
    const { rows } = await pool.query(
      `${USER_PUBLIC_SELECT}
       WHERE u.addon_token = $1 AND u.is_active = true`,
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
       VALUES ($1, $2, $3) RETURNING id`,
      [email, passwordHash, addonToken]
    );
    return this.findById(rows[0].id);
  },

  async updateLanguagePreferences(id, { preferredLanguages, excludedLanguages }) {
    await pool.query(
      `UPDATE users
       SET preferred_languages = $1, excluded_languages = $2
       WHERE id = $3`,
      [preferredLanguages, excludedLanguages, id]
    );
    return this.findById(id);
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

  async findByOAuthId(provider, oauthId) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_id = $2',
      [provider, oauthId]
    );
    return rows[0];
  },

  async createOAuth({ email, oauthId, provider, addonToken }) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, addon_token, oauth_provider, oauth_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [email, addonToken, provider, oauthId]
    );
    return this.findById(rows[0].id);
  },

  async linkOAuth(userId, provider, oauthId) {
    await pool.query(
      'UPDATE users SET oauth_provider = $1, oauth_id = $2 WHERE id = $3',
      [provider, oauthId, userId]
    );
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
              COUNT(DISTINCT p.id) as provider_count,
              CASE
                WHEN fa.status = 'active' AND fa.expires_at <= NOW() THEN 'expired'
                ELSE COALESCE(fa.status, 'inactive')
              END AS free_access_status,
              fa.expires_at AS free_access_expires_at
       FROM users u
       LEFT JOIN user_providers p ON p.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT status, expires_at
         FROM user_free_access_assignments ufa
         WHERE ufa.user_id = u.id
         ORDER BY
           CASE ufa.status WHEN 'active' THEN 0 WHEN 'expired' THEN 1 ELSE 2 END,
           ufa.expires_at DESC NULLS LAST
         LIMIT 1
       ) fa ON true
       WHERE u.email ILIKE $1
       GROUP BY u.id, fa.status, fa.expires_at
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

// ─── Blog Posts ─────────────────────────────────────────────────────────────

const blogPostQueries = {
  async listPublished() {
    const { rows } = await pool.query(
      `SELECT *
       FROM blog_posts
       WHERE is_published = true
       ORDER BY published_at DESC, created_at DESC`
    );
    return rows;
  },

  async listAll() {
    const { rows } = await pool.query(
      `SELECT *
       FROM blog_posts
       ORDER BY published_at DESC, created_at DESC`
    );
    return rows;
  },

  async listFeatured(limit = 3) {
    const { rows } = await pool.query(
      `SELECT *
       FROM blog_posts
       WHERE is_published = true
       ORDER BY featured DESC, published_at DESC, created_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  },

  async findBySlug(slug, { includeDrafts = false } = {}) {
    const { rows } = await pool.query(
      `SELECT *
       FROM blog_posts
       WHERE slug = $1
         AND ($2::boolean = true OR is_published = true)
       LIMIT 1`,
      [slug, includeDrafts]
    );
    return rows[0];
  },

  async create({ slug, title, description, content, author, tags = [], featured = false, isPublished = true, publishedAt }) {
    const { rows } = await pool.query(
      `INSERT INTO blog_posts (
        slug, title, description, content, author, tags, featured, is_published, published_at, updated_at
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [slug, title, description, content, author, tags, featured, isPublished, publishedAt]
    );
    return rows[0];
  },
};

// ─── Provider Networks / Providers ───────────────────────────────────────────

const providerNetworkQueries = {
  async create({ name, identityKey = null, legacyProviderId = null }) {
    const { rows } = await pool.query(
      `INSERT INTO provider_networks (name, identity_key, legacy_provider_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [name, identityKey, legacyProviderId]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await pool.query(
      'SELECT * FROM provider_networks WHERE id = $1',
      [id]
    );
    return rows[0];
  },

  async listAll() {
    const { rows } = await pool.query(
      'SELECT * FROM provider_networks ORDER BY name ASC'
    );
    return rows;
  },

  async update(id, fields) {
    const allowed = [
      'name',
      'identity_key',
      'legacy_provider_id',
      'reseller_portal_url',
      'catalog_last_refreshed_at',
      'twenty_company_id',
      'reseller_username',
      'reseller_password',
      'reseller_api_key',
      'xtream_ui_scraped',
      'reseller_session_cookie',
      'adapter_type',
      'gold_package_catalog',
    ];
    const sets = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }

    if (!sets.length) return null;

    sets.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE provider_networks
       SET ${sets.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async addHosts(providerNetworkId, hosts) {
    if (!providerNetworkId || !Array.isArray(hosts) || hosts.length === 0) return;
    const values = [];
    const placeholders = hosts.map((host, index) => {
      const base = index * 2;
      values.push(providerNetworkId, host);
      return `($${base + 1}, $${base + 2})`;
    });
    await pool.query(
      `INSERT INTO provider_network_hosts (provider_network_id, host_url)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (provider_network_id, host_url) DO NOTHING`,
      values
    );
  },

  async listHosts(providerNetworkId) {
    const { rows } = await pool.query(
      `SELECT *
       FROM provider_network_hosts
       WHERE provider_network_id = $1
       ORDER BY created_at ASC`,
      [providerNetworkId]
    );
    return rows;
  },

  async replaceHosts(providerNetworkId, hosts) {
    await pool.query(
      'DELETE FROM provider_network_hosts WHERE provider_network_id = $1',
      [providerNetworkId]
    );

    if (!Array.isArray(hosts) || hosts.length === 0) return;
    await this.addHosts(providerNetworkId, hosts);
  },

  async listAllHosts() {
    const { rows } = await pool.query(
      `SELECT h.*, n.name AS network_name
       FROM provider_network_hosts h
       JOIN provider_networks n ON n.id = h.provider_network_id
       WHERE h.is_active = true
       ORDER BY h.created_at ASC`
    );
    return rows;
  },

  async delete(id) {
    await pool.query('DELETE FROM provider_networks WHERE id = $1', [id]);
  },

  async touchCatalogRefresh(providerNetworkId) {
    await pool.query(
      `UPDATE provider_networks
       SET catalog_last_refreshed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [providerNetworkId]
    );
  },
};

const providerQueries = {
  async create({ userId, name, hosts, username, password, networkId = null, catalogVariant = false }) {
    const networkAttachedAt = networkId ? new Date() : null;
    const { rows } = await pool.query(
      `INSERT INTO user_providers (user_id, name, hosts, username, password, network_id, catalog_variant, network_attached_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, name, hosts, username, password, networkId, catalogVariant, networkAttachedAt]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT ${PROVIDER_COLS}, n.name AS network_name, n.adapter_type AS network_adapter_type
       FROM user_providers p
       LEFT JOIN provider_networks n ON n.id = p.network_id
       WHERE p.id = $1`,
      [id]
    );
    return rows[0];
  },

  async findByIdAndUser(id, userId) {
    const { rows } = await pool.query(
      `SELECT ${PROVIDER_COLS}, n.name AS network_name, n.adapter_type AS network_adapter_type
       FROM user_providers p
       LEFT JOIN provider_networks n ON n.id = p.network_id
       WHERE p.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    return rows[0];
  },

  async findByIdForCrm(id) {
    const { rows } = await pool.query(
      `SELECT p.*,
              u.email AS user_email,
              u.twenty_person_id,
              n.name AS network_name,
              n.twenty_company_id,
              EXISTS(
                SELECT 1
                FROM provider_subscriptions ps
                WHERE ps.user_provider_id = p.id
                  AND ps.status != 'cancelled'
              ) AS is_marketplace_managed
       FROM user_providers p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN provider_networks n ON n.id = p.network_id
       WHERE p.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByUser(userId) {
    const { rows } = await pool.query(
      `SELECT ${PROVIDER_COLS},
              n.name AS network_name,
              n.adapter_type AS network_adapter_type,
              COALESCE(
                (SELECT COUNT(*) FROM network_vod nv WHERE nv.provider_network_id = p.network_id),
                (SELECT COUNT(*) FROM user_provider_vod v WHERE v.provider_id = p.id)
              ) AS vod_count,
              COALESCE(
                (SELECT COUNT(*)
                 FROM network_vod nv
                 LEFT JOIN canonical_content cc ON cc.id = nv.canonical_content_id
                 LEFT JOIN matched_content m ON m.raw_title = nv.raw_title
                 WHERE nv.provider_network_id = p.network_id
                   AND (cc.tmdb_id IS NOT NULL OR m.tmdb_id IS NOT NULL)),
                (SELECT COUNT(*)
                 FROM user_provider_vod v
                 LEFT JOIN matched_content m ON m.raw_title = v.raw_title
                 WHERE v.provider_id = p.id AND m.tmdb_id IS NOT NULL)
              ) AS matched_count
       FROM user_providers p
       LEFT JOIN provider_networks n ON n.id = p.network_id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async listAll({ limit = 100, offset = 0 } = {}) {
    const { rows } = await pool.query(
      `SELECT ${PROVIDER_COLS}, u.email AS user_email, n.name AS network_name,
              COALESCE(
                (SELECT COUNT(*) FROM network_vod nv WHERE nv.provider_network_id = p.network_id),
                (SELECT COUNT(*) FROM user_provider_vod v WHERE v.provider_id = p.id)
              ) AS vod_count
       FROM user_providers p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN provider_networks n ON n.id = p.network_id
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows;
  },

  async listAllForCrm() {
    const { rows } = await pool.query(
      `SELECT p.*,
              u.email AS user_email,
              u.twenty_person_id,
              n.name AS network_name,
              n.twenty_company_id,
              EXISTS(
                SELECT 1
                FROM provider_subscriptions ps
                WHERE ps.user_provider_id = p.id
                  AND ps.status != 'cancelled'
              ) AS is_marketplace_managed
       FROM user_providers p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN provider_networks n ON n.id = p.network_id
       ORDER BY p.created_at ASC`
    );
    return rows;
  },

  /**
   * All lines provisioned for a specific network (admin view).
   * Returns provider row + linked user + active subscription info.
   */
  async findNetworkLines(networkId, { limit = 200, offset = 0 } = {}) {
    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.username,
         p.password,
         p.status,
         p.created_at,
         p.account_expires_at,
         p.account_max_connections,
         u.id   AS user_id,
         u.email AS user_email,
         ps.id   AS subscription_id,
         ps.selected_plan_name,
         ps.current_period_end,
         ps.status AS subscription_status,
         ps.provisioning_status,
         ps.payment_provider
       FROM user_providers p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN provider_subscriptions ps ON ps.user_provider_id = p.id
                                          AND ps.status NOT IN ('cancelled')
       WHERE p.network_id = $1
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [networkId, limit, offset]
    );
    return rows;
  },

  /**
   * All lines across ALL networks (admin global view).
   */
  async findAllNetworkLines({ limit = 200, offset = 0, networkId = null } = {}) {
    const conditions = ['p.network_id IS NOT NULL'];
    const values = [];
    let idx = 1;
    if (networkId) {
      conditions.push(`p.network_id = $${idx++}`);
      values.push(networkId);
    }
    values.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.username,
         p.password,
         p.status,
         p.created_at,
         p.account_expires_at,
         p.account_max_connections,
         n.id   AS network_id,
         n.name AS network_name,
         u.id   AS user_id,
         u.email AS user_email,
         ps.id   AS subscription_id,
         ps.selected_plan_name,
         ps.current_period_end,
         ps.status AS subscription_status,
         ps.provisioning_status,
         ps.payment_provider
       FROM user_providers p
       JOIN provider_networks n ON n.id = p.network_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN provider_subscriptions ps ON ps.user_provider_id = p.id
                                          AND ps.status NOT IN ('cancelled')
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
    );
    return rows;
  },

  async update(id, userId, fields) {
    const allowed = ['name', 'hosts', 'username', 'password', 'catalog_variant', 'incremental_sync'];
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
      `UPDATE user_providers
       SET ${updates.join(', ')}
       WHERE id = $${idx} AND user_id = $${idx + 1}
       RETURNING *`,
      values
    );
    return rows[0];
  },

  async updateByAdmin(id, fields) {
    const allowed = [
      'name',
      'hosts',
      'username',
      'password',
      'catalog_variant',
      'incremental_sync',
      'app_portal_config',
    ];
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

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE user_providers
       SET ${updates.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async updateSyncWatermark(id, userId, watermark) {
    await pool.query(
      `UPDATE user_providers SET last_sync_watermark = $1 WHERE id = $2 AND user_id = $3`,
      [watermark, id, userId]
    );
  },

  async attachNetwork(id, userId, { networkId, catalogVariant = false }) {
    const { rows } = await pool.query(
      `UPDATE user_providers
       SET network_id = $1,
           catalog_variant = $2,
           network_attached_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [networkId, catalogVariant, id, userId]
    );
    return rows[0];
  },

  async updateHealth(id, { activeHost, status }) {
    await pool.query(
      `UPDATE user_providers SET active_host = $1, status = $2, last_checked = NOW() WHERE id = $3`,
      [activeHost, status, id]
    );
  },

  async updateCrmSync(id, fields) {
    const allowed = [
      'twenty_provider_access_id',
      'account_status',
      'account_expires_at',
      'account_is_trial',
      'account_max_connections',
      'account_active_connections',
      'account_last_synced_at',
      'active_host',
      'status',
      'last_checked',
    ];
    const sets = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }

    if (!sets.length) return null;

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE user_providers
       SET ${sets.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      values
    );
    return rows[0] || null;
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

  async getAllForHealthCheck({ activeWithinDays = parseInt(process.env.ACTIVE_USER_LOOKBACK_DAYS || '14', 10) } = {}) {
    const { rows } = await pool.query(
      `SELECT p.*, n.name AS network_name
       FROM user_providers p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN provider_networks n ON n.id = p.network_id
       WHERE u.is_active = true
         AND (
           u.last_seen >= NOW() - ($1::int * INTERVAL '1 day')
           OR u.created_at >= NOW() - ($1::int * INTERVAL '1 day')
         )`,
      [activeWithinDays]
    );
    return rows;
  },
};

// ─── VOD ─────────────────────────────────────────────────────────────────────

const vodQueries = {
  async getProviderCatalogContext(providerId) {
    return providerQueries.findById(providerId);
  },

  async upsertBatch(entries) {
    if (!entries.length) return;
    const dedupedEntries = Array.from(
      new Map(
        entries.map((entry) => [
          [
            entry.providerId,
            entry.streamId,
            entry.vodType,
          ].join('::'),
          entry,
        ])
      ).values()
    );
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TEMP TABLE temp_user_provider_vod (LIKE user_provider_vod INCLUDING DEFAULTS) ON COMMIT DROP;
      `);

      const stream = client.query(from(`COPY temp_user_provider_vod (user_id, provider_id, stream_id, raw_title, normalized_title, canonical_title, canonical_normalized_title, title_year, content_languages, quality_tags, poster_url, category, vod_type, container_extension, epg_channel_id, canonical_content_id) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')`));

      const transformStream = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          const titleYear = pickFirstDefined(chunk, 'titleYear', 'title_year', 'year');
          const contentLanguages = pickFirstDefined(chunk, 'contentLanguages', 'content_languages', 'languages');
          const qualityTags = pickFirstDefined(chunk, 'qualityTags', 'quality_tags');

          const formatArray = (arr) => {
            if (!arr || arr.length === 0) return '{}';
            return '{' + arr.map(a => `"${String(a).replace(/"/g, '""')}"`).join(',') + '}';
          };

          const escape = (val) => {
            if (val === null || val === undefined) return '\\N';
            return String(val).replace(/[\t\n\r\\]/g, (c) => ({ '\t': '\\t', '\n': '\\n', '\r': '\\r', '\\': '\\\\' }[c] || c));
          };

          const row = [
            escape(chunk.userId), escape(chunk.providerId), escape(chunk.streamId), escape(chunk.rawTitle),
            escape(chunk.normalizedTitle || null), escape(chunk.canonicalTitle || null), escape(chunk.canonicalNormalizedTitle || null),
            escape(titleYear || null), escape(formatArray(contentLanguages || [])), escape(formatArray(qualityTags || [])),
            escape(chunk.posterUrl || null), escape(chunk.category || null), escape(chunk.vodType),
            escape(chunk.containerExtension || null), escape(chunk.epgChannelId || null), escape(chunk.canonicalContentId || null)
          ].join('\t') + '\n';
          
          callback(null, row);
        }
      });

      const sourceStream = require('stream').Readable.from(dedupedEntries);
      await pipeline(sourceStream, transformStream, stream);

      const changedColumns = [
        'user_id',
        'raw_title',
        'normalized_title',
        'canonical_title',
        'canonical_normalized_title',
        'title_year',
        'content_languages',
        'quality_tags',
        'poster_url',
        'category',
        'container_extension',
        'epg_channel_id',
        'canonical_content_id',
      ];

      await client.query(`
        INSERT INTO user_provider_vod (user_id, provider_id, stream_id, raw_title, normalized_title, canonical_title, canonical_normalized_title, title_year, content_languages, quality_tags, poster_url, category, vod_type, container_extension, epg_channel_id, canonical_content_id)
        SELECT user_id, provider_id, stream_id, raw_title, normalized_title, canonical_title, canonical_normalized_title, title_year, content_languages, quality_tags, poster_url, category, vod_type, container_extension, epg_channel_id, canonical_content_id
        FROM temp_user_provider_vod
        ON CONFLICT (provider_id, stream_id, vod_type) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            raw_title = EXCLUDED.raw_title,
            normalized_title = EXCLUDED.normalized_title,
            canonical_title = EXCLUDED.canonical_title,
            canonical_normalized_title = EXCLUDED.canonical_normalized_title,
            title_year = EXCLUDED.title_year,
            content_languages = EXCLUDED.content_languages,
            quality_tags = EXCLUDED.quality_tags,
            poster_url = EXCLUDED.poster_url,
            category = EXCLUDED.category,
            container_extension = EXCLUDED.container_extension,
            epg_channel_id = EXCLUDED.epg_channel_id,
            canonical_content_id = COALESCE(EXCLUDED.canonical_content_id, user_provider_vod.canonical_content_id)
        WHERE ${buildIsDistinctClause('user_provider_vod', 'EXCLUDED', changedColumns)}
      `);
      await client.query(`
        DELETE FROM user_provider_vod existing
        WHERE existing.provider_id IN (
          SELECT DISTINCT provider_id
          FROM temp_user_provider_vod
        )
          AND NOT EXISTS (
            SELECT 1
            FROM temp_user_provider_vod incoming
            WHERE incoming.provider_id = existing.provider_id
              AND incoming.stream_id = existing.stream_id
              AND incoming.vod_type = existing.vod_type
          )
      `);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async upsertNetworkBatch(entries) {
    if (!entries.length) return;
    const dedupedEntries = Array.from(
      new Map(
        entries.map((entry) => [
          [
            entry.providerNetworkId,
            entry.streamId,
            entry.vodType,
          ].join('::'),
          entry,
        ])
      ).values()
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TEMP TABLE temp_network_vod (LIKE network_vod INCLUDING DEFAULTS) ON COMMIT DROP;
      `);

      const stream = client.query(from(`COPY temp_network_vod (provider_network_id, stream_id, raw_title, normalized_title, canonical_title, canonical_normalized_title, title_year, content_languages, quality_tags, poster_url, category, vod_type, container_extension, epg_channel_id, canonical_content_id) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')`));

      const transformStream = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          const titleYear = pickFirstDefined(chunk, 'titleYear', 'title_year', 'year');
          const contentLanguages = pickFirstDefined(chunk, 'contentLanguages', 'content_languages', 'languages');
          const qualityTags = pickFirstDefined(chunk, 'qualityTags', 'quality_tags');

          const formatArray = (arr) => {
            if (!arr || arr.length === 0) return '{}';
            return '{' + arr.map(a => `"${String(a).replace(/"/g, '""')}"`).join(',') + '}';
          };

          const escape = (val) => {
            if (val === null || val === undefined) return '\\N';
            return String(val).replace(/[\t\n\r\\]/g, (c) => ({ '\t': '\\t', '\n': '\\n', '\r': '\\r', '\\': '\\\\' }[c] || c));
          };

          const row = [
            escape(chunk.providerNetworkId), escape(chunk.streamId), escape(chunk.rawTitle),
            escape(chunk.normalizedTitle || null), escape(chunk.canonicalTitle || null), escape(chunk.canonicalNormalizedTitle || null),
            escape(titleYear || null), escape(formatArray(contentLanguages || [])), escape(formatArray(qualityTags || [])),
            escape(chunk.posterUrl || null), escape(chunk.category || null), escape(chunk.vodType),
            escape(chunk.containerExtension || null), escape(chunk.epgChannelId || null), escape(chunk.canonicalContentId || null)
          ].join('\t') + '\n';
          
          callback(null, row);
        }
      });

      const sourceStream = require('stream').Readable.from(dedupedEntries);
      await pipeline(sourceStream, transformStream, stream);

      const changedColumns = [
        'raw_title',
        'normalized_title',
        'canonical_title',
        'canonical_normalized_title',
        'title_year',
        'content_languages',
        'quality_tags',
        'poster_url',
        'category',
        'container_extension',
        'epg_channel_id',
        'canonical_content_id',
      ];

      await client.query(`
        INSERT INTO network_vod (provider_network_id, stream_id, raw_title, normalized_title, canonical_title, canonical_normalized_title, title_year, content_languages, quality_tags, poster_url, category, vod_type, container_extension, epg_channel_id, canonical_content_id)
        SELECT provider_network_id, stream_id, raw_title, normalized_title, canonical_title, canonical_normalized_title, title_year, content_languages, quality_tags, poster_url, category, vod_type, container_extension, epg_channel_id, canonical_content_id
        FROM temp_network_vod
        ON CONFLICT (provider_network_id, stream_id, vod_type) DO UPDATE
        SET raw_title = EXCLUDED.raw_title,
            normalized_title = EXCLUDED.normalized_title,
            canonical_title = EXCLUDED.canonical_title,
            canonical_normalized_title = EXCLUDED.canonical_normalized_title,
            title_year = EXCLUDED.title_year,
            content_languages = EXCLUDED.content_languages,
            quality_tags = EXCLUDED.quality_tags,
            poster_url = EXCLUDED.poster_url,
            category = EXCLUDED.category,
            container_extension = EXCLUDED.container_extension,
            epg_channel_id = EXCLUDED.epg_channel_id,
            canonical_content_id = COALESCE(EXCLUDED.canonical_content_id, network_vod.canonical_content_id)
        WHERE ${buildIsDistinctClause('network_vod', 'EXCLUDED', changedColumns)}
      `);
      await client.query(`
        DELETE FROM network_vod existing
        WHERE existing.provider_network_id IN (
          SELECT DISTINCT provider_network_id
          FROM temp_network_vod
        )
          AND NOT EXISTS (
            SELECT 1
            FROM temp_network_vod incoming
            WHERE incoming.provider_network_id = existing.provider_network_id
              AND incoming.stream_id = existing.stream_id
              AND incoming.vod_type = existing.vod_type
          )
      `);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async deleteByProvider(providerId) {
    await pool.query('DELETE FROM user_provider_vod WHERE provider_id = $1', [providerId]);
  },

  async deleteByNetwork(providerNetworkId) {
    await pool.query('DELETE FROM network_vod WHERE provider_network_id = $1', [providerNetworkId]);
  },

  async resolveByExternalIdForUser(userId, externalId, { single = true, onlyOnline = false } = {}) {
    const isImdb = typeof externalId === 'string' && externalId.startsWith('tt');
    const externalField = isImdb ? 'imdb_id' : 'tmdb_id';
    let normalizedValue = externalId;
    if (typeof externalId === 'string' && externalId.startsWith('tmdb:')) {
      normalizedValue = parseInt(externalId.slice(5), 10);
    } else if (!isImdb && typeof externalId === 'string' && /^\d+$/.test(externalId)) {
      normalizedValue = parseInt(externalId, 10);
    }
    const limitClause = single ? 'LIMIT 1' : '';
    const onlineClauseA = onlyOnline ? `AND p.status = 'online'` : '';
    const onlineClauseB = onlyOnline ? `AND p.status = 'online'` : '';

    // Two tight queries UNION'd. Each filters directly on the indexed
    // v.imdb_id / nv.imdb_id column OR the matched_content join.
    // The canonical_content join is only used to enrich the narrowed rows.
    const sql = `
      SELECT * FROM (
        SELECT
          v.id,
          v.stream_id,
          v.raw_title,
          v.normalized_title,
          v.canonical_title,
          v.canonical_normalized_title,
          v.title_year,
          v.content_languages,
          v.quality_tags,
          v.poster_url,
          v.category,
          v.vod_type,
          v.container_extension,
          v.epg_channel_id,
          p.id AS provider_id,
          p.network_id,
          p.catalog_variant,
          p.active_host,
          p.username,
          p.password,
          COALESCE(v.tmdb_id, cc.tmdb_id, m.tmdb_id) AS tmdb_id,
          COALESCE(v.imdb_id, cc.imdb_id, m.imdb_id) AS imdb_id,
          cc.confidence_score AS confidence_score
        FROM user_provider_vod v
        JOIN user_providers p ON p.id = v.provider_id
        LEFT JOIN canonical_content cc ON cc.id = v.canonical_content_id
        LEFT JOIN matched_content m ON m.raw_title = v.raw_title
        WHERE p.user_id = $1
          AND (v.${externalField} = $2 OR m.${externalField} = $2)
          AND (p.catalog_variant = true OR p.network_id IS NULL)
          ${onlineClauseA}

        UNION ALL

        SELECT
          nv.id,
          nv.stream_id,
          nv.raw_title,
          nv.normalized_title,
          nv.canonical_title,
          nv.canonical_normalized_title,
          nv.title_year,
          nv.content_languages,
          nv.quality_tags,
          nv.poster_url,
          nv.category,
          nv.vod_type,
          nv.container_extension,
          nv.epg_channel_id,
          p.id AS provider_id,
          p.network_id,
          p.catalog_variant,
          p.active_host,
          p.username,
          p.password,
          COALESCE(nv.tmdb_id, cc.tmdb_id, m.tmdb_id) AS tmdb_id,
          COALESCE(nv.imdb_id, cc.imdb_id, m.imdb_id) AS imdb_id,
          cc.confidence_score AS confidence_score
        FROM network_vod nv
        JOIN user_providers p ON p.network_id = nv.provider_network_id
        LEFT JOIN canonical_content cc ON cc.id = nv.canonical_content_id
        LEFT JOIN matched_content m ON m.raw_title = nv.raw_title
        WHERE p.user_id = $1
          AND (nv.${externalField} = $2 OR m.${externalField} = $2)
          AND p.catalog_variant = false
          ${onlineClauseB}
      ) matches
      ORDER BY raw_title ASC, provider_id ASC
      ${limitClause}
    `;
    const { rows } = await pool.query(sql, [userId, normalizedValue]);
    return single ? (rows[0] || null) : rows;
  },

  async getByProvider(providerId, { userId, type, page = 1, limit = 100, search = '', matched, category, sort } = {}) {
    const provider = await this.getProviderCatalogContext(providerId);
    const useNetwork = Boolean(provider?.network_id && !provider?.catalog_variant);
    const sourceTable = useNetwork ? 'network_vod' : 'user_provider_vod';
    const sourceAlias = 'v';
    const providerFilterColumn = useNetwork ? 'v.provider_network_id' : 'v.provider_id';
    const providerFilterValue = useNetwork ? provider.network_id : providerId;
    let query = `
      SELECT
        v.*,
        COALESCE(cc.tmdb_id, m.tmdb_id) AS tmdb_id,
        COALESCE(cc.imdb_id, m.imdb_id) AS imdb_id,
        COALESCE(m.tmdb_type, CASE WHEN cc.vod_type = 'series' THEN 'series' ELSE 'movie' END) AS tmdb_type,
        COALESCE(cc.confidence_score, m.confidence_score) AS confidence_score,
        wh.progress_pct AS watch_progress_pct,
        wh.last_watched_at,
        (wh.id IS NOT NULL) AS is_watched
      FROM ${sourceTable} ${sourceAlias}
      LEFT JOIN canonical_content cc ON cc.id = v.canonical_content_id
      LEFT JOIN matched_content m ON m.raw_title = v.raw_title
      LEFT JOIN watch_history wh
        ON wh.user_id = $2
       AND wh.raw_title = v.raw_title
      WHERE ${providerFilterColumn} = $1
    `;
    const params = [providerFilterValue, userId || null];
    let idx = 3;
    if (type) { query += ` AND v.vod_type = $${idx++}`; params.push(type); }
    if (search) {
      const normalizedSearch = normalizeTitle(search);
      query += ` AND (
        v.raw_title ILIKE $${idx} OR
        v.normalized_title ILIKE $${idx} OR
        m.raw_title ILIKE $${idx} OR
        cc.canonical_normalized_title ILIKE $${idx++}
      )`;
      params.push(`%${normalizedSearch || search}%`);
    }
    if (matched === true) { query += ` AND (m.tmdb_id IS NOT NULL OR cc.tmdb_id IS NOT NULL)`; }
    if (matched === false) { query += ` AND (m.tmdb_id IS NULL AND cc.tmdb_id IS NULL AND m.id IS NOT NULL)`; }
    if (category) { query += ` AND v.category = $${idx++}`; params.push(category); }

    let orderBy = `
      v.canonical_normalized_title ASC NULLS LAST,
      v.normalized_title ASC NULLS LAST,
      v.raw_title ASC,
      v.stream_id ASC`;

    if (sort === 'newest') {
      orderBy = `v.created_at DESC, ${orderBy}`;
    } else if (sort === 'rating') {
      orderBy = `COALESCE(cc.confidence_score, m.confidence_score) DESC NULLS LAST, ${orderBy}`;
    }

    query += ` ORDER BY ${orderBy} LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async countByProvider(providerId, { type, search = '', matched, category } = {}) {
    const provider = await this.getProviderCatalogContext(providerId);
    const useNetwork = Boolean(provider?.network_id && !provider?.catalog_variant);
    const sourceTable = useNetwork ? 'network_vod' : 'user_provider_vod';
    const providerFilterColumn = useNetwork ? 'provider_network_id' : 'provider_id';
    const providerFilterValue = useNetwork ? provider.network_id : providerId;
    let query = `
      SELECT COUNT(*) AS total
      FROM ${sourceTable} v
      LEFT JOIN canonical_content cc ON cc.id = v.canonical_content_id
      LEFT JOIN matched_content m ON m.raw_title = v.raw_title
      WHERE ${providerFilterColumn} = $1
    `;
    const params = [providerFilterValue];
    let idx = 2;

    if (type) { query += ` AND v.vod_type = $${idx++}`; params.push(type); }
    if (search) {
      const normalizedSearch = normalizeTitle(search);
      query += ` AND (
        v.raw_title ILIKE $${idx} OR
        v.normalized_title ILIKE $${idx} OR
        m.raw_title ILIKE $${idx} OR
        cc.canonical_normalized_title ILIKE $${idx++}
      )`;
      params.push(`%${normalizedSearch || search}%`);
    }
    if (matched === true) { query += ' AND (m.tmdb_id IS NOT NULL OR cc.tmdb_id IS NOT NULL)'; }
    if (matched === false) { query += ' AND ((m.tmdb_id IS NULL AND cc.tmdb_id IS NULL) AND m.id IS NOT NULL)'; }
    if (category) { query += ` AND v.category = $${idx++}`; params.push(category); }

    const { rows } = await pool.query(query, params);
    return parseInt(rows[0]?.total || 0, 10);
  },

  async getCategoriesByProvider(providerId, { type } = {}) {
    const provider = await this.getProviderCatalogContext(providerId);
    const useNetwork = Boolean(provider?.network_id && !provider?.catalog_variant);
    const sourceTable = useNetwork ? 'network_vod' : 'user_provider_vod';
    const providerFilterColumn = useNetwork ? 'provider_network_id' : 'provider_id';
    const providerFilterValue = useNetwork ? provider.network_id : providerId;
    let query = `
      SELECT DISTINCT category
      FROM ${sourceTable}
      WHERE ${providerFilterColumn} = $1
    `;
    const params = [providerFilterValue];

    if (type) {
      query += ' AND vod_type = $2';
      params.push(type);
    }

    query += ' ORDER BY category ASC';

    const { rows } = await pool.query(query, params);
    return rows
      .map((row) => row.category)
      .filter((value) => typeof value === 'string' && value.trim());
  },

  async getStats(providerId) {
    const provider = await this.getProviderCatalogContext(providerId);
    const useNetwork = Boolean(provider?.network_id && !provider?.catalog_variant);
    const sourceTable = useNetwork ? 'network_vod' : 'user_provider_vod';
    const providerFilterColumn = useNetwork ? 'provider_network_id' : 'provider_id';
    const providerFilterValue = useNetwork ? provider.network_id : providerId;
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE vod_type = 'movie') AS movie_count,
         COUNT(*) FILTER (WHERE vod_type = 'series') AS series_count,
         COUNT(DISTINCT category) AS category_count,
         COUNT(*) AS total
       FROM ${sourceTable} WHERE ${providerFilterColumn} = $1`,
      [providerFilterValue]
    );
    return rows[0];
  },

  async getMatchStats(providerId) {
    const provider = await this.getProviderCatalogContext(providerId);
    const useNetwork = Boolean(provider?.network_id && !provider?.catalog_variant);
    const sourceTable = useNetwork ? 'network_vod' : 'user_provider_vod';
    const providerFilterColumn = useNetwork ? 'provider_network_id' : 'provider_id';
    const providerFilterValue = useNetwork ? provider.network_id : providerId;
    const { rows } = await pool.query(
      `SELECT
         COUNT(v.id) AS total,
         COUNT(*) FILTER (WHERE v.tmdb_id IS NOT NULL) AS matched,
         COUNT(v.id) - COUNT(*) FILTER (WHERE v.tmdb_id IS NOT NULL) AS unmatched
       FROM ${sourceTable} v
       WHERE ${providerFilterColumn} = $1
         AND v.vod_type IN ('movie', 'series')`,
      [providerFilterValue]
    );
    return rows[0];
  },

  async getUnmatchedTitles(providerId) {
    const provider = await this.getProviderCatalogContext(providerId);
    const useNetwork = Boolean(provider?.network_id && !provider?.catalog_variant);
    const sourceTable = useNetwork ? 'network_vod' : 'user_provider_vod';
    const providerFilterColumn = useNetwork ? 'provider_network_id' : 'provider_id';
    const providerFilterValue = useNetwork ? provider.network_id : providerId;
    const { rows } = await pool.query(
      `SELECT v.raw_title, v.vod_type
       FROM ${sourceTable} v
       WHERE ${providerFilterColumn} = $1
         AND v.vod_type IN ('movie', 'series')
         AND v.tmdb_id IS NULL
       ORDER BY v.raw_title ASC`,
      [providerFilterValue]
    );
    return rows;
  },
  async getCategoryBreakdown(providerId) {
    const provider = await this.getProviderCatalogContext(providerId);
    const useNetwork = Boolean(provider?.network_id && !provider?.catalog_variant);
    const sourceTable = useNetwork ? 'network_vod' : 'user_provider_vod';
    const providerFilterColumn = useNetwork ? 'provider_network_id' : 'provider_id';
    const providerFilterValue = useNetwork ? provider.network_id : providerId;
    const { rows } = await pool.query(
      `SELECT category, vod_type, COUNT(*) as count
       FROM ${sourceTable}
       WHERE ${providerFilterColumn} = $1
       GROUP BY category, vod_type
       ORDER BY count DESC`,
      [providerFilterValue]
    );
    return rows;
  },

  async findByTmdbIdForUser(userId, tmdbId) {
    const { rows } = await pool.query(
      `SELECT
          COALESCE(nv.id, v.id) AS id,
          COALESCE(nv.stream_id, v.stream_id) AS stream_id,
          COALESCE(nv.raw_title, v.raw_title) AS raw_title,
          COALESCE(nv.normalized_title, v.normalized_title) AS normalized_title,
          COALESCE(nv.canonical_title, v.canonical_title) AS canonical_title,
          COALESCE(nv.canonical_normalized_title, v.canonical_normalized_title) AS canonical_normalized_title,
          COALESCE(nv.title_year, v.title_year) AS title_year,
          COALESCE(nv.content_languages, v.content_languages) AS content_languages,
          COALESCE(nv.quality_tags, v.quality_tags) AS quality_tags,
          COALESCE(nv.poster_url, v.poster_url) AS poster_url,
          COALESCE(nv.category, v.category) AS category,
          COALESCE(nv.vod_type, v.vod_type) AS vod_type,
          COALESCE(nv.container_extension, v.container_extension) AS container_extension,
          COALESCE(nv.epg_channel_id, v.epg_channel_id) AS epg_channel_id,
          p.id AS provider_id,
          p.active_host,
          p.username,
          p.password,
          COALESCE(nv.tmdb_id, v.tmdb_id) AS tmdb_id,
          COALESCE(nv.imdb_id, v.imdb_id) AS imdb_id
        FROM user_providers p
        LEFT JOIN network_vod nv
          ON nv.provider_network_id = p.network_id
         AND p.catalog_variant = false
         AND nv.tmdb_id = $2
        LEFT JOIN user_provider_vod v
          ON v.provider_id = p.id
         AND (p.catalog_variant = true OR p.network_id IS NULL)
         AND v.tmdb_id = $2
        WHERE p.user_id = $1
          AND (nv.tmdb_id = $2 OR v.tmdb_id = $2)
        LIMIT 1`,
      [userId, tmdbId]
    );
    return rows[0];
  },
  async findByInternalIdForUser(userId, internalId) {
    let { rows } = await pool.query(
      `SELECT nv.*, p.id AS provider_id, p.active_host, p.username, p.password
       FROM network_vod nv
       JOIN user_providers p
         ON p.network_id = nv.provider_network_id
        AND p.user_id = $1
        AND p.catalog_variant = false
       WHERE nv.id = $2
       LIMIT 1`,
      [userId, internalId]
    );
    if (!rows[0]) {
      ({ rows } = await pool.query(
        `SELECT v.*, p.active_host, p.username, p.password
         FROM user_provider_vod v
         JOIN user_providers p ON p.id = v.provider_id AND p.user_id = $1
         WHERE v.id = $2 AND v.user_id = $1
         LIMIT 1`,
        [userId, internalId]
      ));
    }
    return rows[0];
  },

  async findOnDemandCandidateForUser(userId, { vodType, normalizedTitle, year, tmdbId, imdbId }) {
    let query = `
      SELECT v.*, p.active_host, p.username, p.password,
             m.tmdb_id, m.imdb_id, m.confidence_score
      FROM user_provider_vod v
      JOIN user_providers p ON p.id = v.provider_id AND p.user_id = $1 AND p.status = 'online'
      LEFT JOIN matched_content m ON m.raw_title = v.raw_title
      WHERE v.user_id = $1
        AND v.vod_type = $2
    `;
    const params = [userId, vodType];
    let idx = 3;

    if (normalizedTitle) {
      const titleVariants = Array.from(new Set(
        [normalizedTitle, year ? `${normalizedTitle} ${year}` : null]
          .filter(Boolean)
      ));
      query += ` AND (
        COALESCE(v.canonical_normalized_title, v.normalized_title) = ANY($${idx})
        OR v.normalized_title = ANY($${idx})
      )`;
      query += ` ORDER BY
        CASE WHEN m.imdb_id = $${idx + 2} THEN 0 ELSE 1 END,
        CASE WHEN m.tmdb_id = $${idx + 3} THEN 0 ELSE 1 END,
        CASE WHEN COALESCE(v.canonical_normalized_title, v.normalized_title) = $${idx + 4} THEN 0 ELSE 1 END,
        CASE WHEN v.normalized_title = $${idx + 5} THEN 0 ELSE 1 END,
        CASE WHEN v.title_year = $${idx + 1} THEN 0 ELSE 1 END,
        ABS(COALESCE(v.title_year, $${idx + 1}) - $${idx + 1}) ASC,
        v.raw_title ASC
        LIMIT 100`;
      params.push(titleVariants);
      params.push(year || null);
      params.push(imdbId || null);
      params.push(tmdbId || null);
      params.push(normalizedTitle);
      params.push(year ? `${normalizedTitle} ${year}` : normalizedTitle);
    } else {
      query += ` ORDER BY
        CASE WHEN m.imdb_id = $${idx} THEN 0 ELSE 1 END,
        CASE WHEN m.tmdb_id = $${idx + 1} THEN 0 ELSE 1 END,
        v.created_at DESC
        LIMIT 100`;
      params.push(imdbId || null);
      params.push(tmdbId || null);
    }

    const { rows } = await pool.query(query, params);
    return rows;
  },

  async getUnmatchedForMatching(limit = 1000, { enrichMissingImdb = true } = {}) {
    const missingMatchClause = enrichMissingImdb
      ? '(m.id IS NULL OR (m.tmdb_id IS NOT NULL AND m.imdb_id IS NULL))'
      : '(m.id IS NULL OR m.tmdb_id IS NULL)';
    const { rows } = await pool.query(
      `SELECT DISTINCT v.raw_title,
              COALESCE(m.tmdb_type, v.vod_type) AS vod_type,
              m.tmdb_id,
              m.imdb_id,
              m.confidence_score
       FROM user_provider_vod v
       LEFT JOIN matched_content m ON m.raw_title = v.raw_title
       WHERE ${missingMatchClause}
         AND (m.manually_matched IS NULL OR m.manually_matched = false)
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

// ─── Canonical Content ───────────────────────────────────────────────────────

const canonicalContentQueries = {
  async findOrCreate({ vodType, canonicalTitle, canonicalNormalizedTitle, titleYear, tmdbId = null, imdbId = null, confidenceScore = null }) {
    const { rows } = await pool.query(
      `INSERT INTO canonical_content (
         vod_type,
         canonical_title,
         canonical_normalized_title,
         title_year,
         tmdb_id,
         imdb_id,
         confidence_score,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (vod_type, canonical_normalized_title, title_year) DO UPDATE SET
         canonical_title = EXCLUDED.canonical_title,
         tmdb_id = COALESCE(canonical_content.tmdb_id, EXCLUDED.tmdb_id),
         imdb_id = COALESCE(canonical_content.imdb_id, EXCLUDED.imdb_id),
         confidence_score = COALESCE(EXCLUDED.confidence_score, canonical_content.confidence_score),
         updated_at = NOW()
       RETURNING *`,
      [vodType, canonicalTitle, canonicalNormalizedTitle, titleYear || null, tmdbId, imdbId, confidenceScore]
    );
    return rows[0];
  },

  async upsertAlias({ providerNetworkId, providerId, rawTitle, normalizedTitle, canonicalTitle, canonicalNormalizedTitle, titleYear, vodType, canonicalContentId = null, confidenceScore = null }) {
    const { rows } = await pool.query(
      `INSERT INTO content_aliases (
         provider_network_id,
         provider_id,
         raw_title,
         normalized_alias,
         normalized_title,
         canonical_title,
         canonical_normalized_title,
         title_year,
         vod_type,
         canonical_content_id,
         confidence_score,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (provider_network_id, raw_title, vod_type) DO UPDATE SET
         provider_id = EXCLUDED.provider_id,
         normalized_alias = EXCLUDED.normalized_alias,
         normalized_title = EXCLUDED.normalized_title,
         canonical_title = EXCLUDED.canonical_title,
         canonical_normalized_title = EXCLUDED.canonical_normalized_title,
         title_year = EXCLUDED.title_year,
         canonical_content_id = COALESCE(EXCLUDED.canonical_content_id, content_aliases.canonical_content_id),
         confidence_score = COALESCE(EXCLUDED.confidence_score, content_aliases.confidence_score),
         updated_at = NOW()
       RETURNING *`,
      [
        providerNetworkId,
        providerId,
        rawTitle,
        normalizedTitle || canonicalNormalizedTitle || null,
        normalizedTitle || null,
        canonicalTitle || null,
        canonicalNormalizedTitle || null,
        titleYear || null,
        vodType,
        canonicalContentId,
        confidenceScore,
      ]
    );
    return rows[0];
  },

  async resolveEntries(entries, { providerNetworkId, providerId }) {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    const valid = entries.filter(e => e?.vodType && e?.rawTitle);
    if (!valid.length) return [];

    // Process in chunks to stay well under the 65535 pg parameter limit.
    // Each canonical row uses 4 params; each alias row uses 10 params.
    // 500 rows × 10 params = 5000 — safe headroom.
    const CHUNK = 500;
    const globalIdMap = new Map(); // canonical key → canonical_content.id

    for (let i = 0; i < valid.length; i += CHUNK) {
      const chunk = valid.slice(i, i + CHUNK);

      // ── Step 1: bulk-upsert canonical_content ──────────────────────────────
      // Deduplicate by the unique key so a single VALUES list never has two
      // rows that would conflict with each other (Postgres would reject it).
      const canonicalByKey = new Map();
      for (const e of chunk) {
        const key = `${e.vodType}::${e.canonicalNormalizedTitle || e.normalizedTitle || ''}::${e.titleYear ?? ''}`;
        if (!canonicalByKey.has(key)) {
          canonicalByKey.set(key, {
            vodType: e.vodType,
            canonicalTitle: e.canonicalTitle || e.rawTitle,
            canonicalNormalizedTitle: e.canonicalNormalizedTitle || e.normalizedTitle || '',
            titleYear: e.titleYear || null,
          });
        }
      }

      const uniqCanonicals = [...canonicalByKey.values()];
      const cVals = [];
      const cParams = [];
      let ci = 1;
      for (const c of uniqCanonicals) {
        cVals.push(`($${ci++},$${ci++},$${ci++},$${ci++})`);
        cParams.push(c.vodType, c.canonicalTitle, c.canonicalNormalizedTitle, c.titleYear);
      }

      const { rows: canonicalRows } = await pool.query(
        `INSERT INTO canonical_content (vod_type, canonical_title, canonical_normalized_title, title_year)
         VALUES ${cVals.join(',')}
         ON CONFLICT (vod_type, canonical_normalized_title, title_year) DO UPDATE SET
           canonical_title = EXCLUDED.canonical_title,
           updated_at = NOW()
         RETURNING id, vod_type, canonical_normalized_title, title_year`,
        cParams
      );

      for (const row of canonicalRows) {
        const key = `${row.vod_type}::${row.canonical_normalized_title}::${row.title_year ?? ''}`;
        globalIdMap.set(key, row.id);
      }

      // ── Step 2: bulk-upsert content_aliases ───────────────────────────────
      if (providerNetworkId) {
        const aliasByKey = new Map();
        for (const e of chunk) {
          const aliasKey = `${e.vodType}::${e.rawTitle}`;
          if (!aliasByKey.has(aliasKey)) {
            const canonicalKey = `${e.vodType}::${e.canonicalNormalizedTitle || e.normalizedTitle || ''}::${e.titleYear ?? ''}`;
            aliasByKey.set(aliasKey, {
              rawTitle: e.rawTitle,
              normalizedTitle: e.normalizedTitle || null,
              canonicalTitle: e.canonicalTitle || e.rawTitle,
              canonicalNormalizedTitle: e.canonicalNormalizedTitle || e.normalizedTitle || null,
              titleYear: e.titleYear || null,
              vodType: e.vodType,
              canonicalContentId: globalIdMap.get(canonicalKey) || null,
            });
          }
        }

        const uniqAliases = [...aliasByKey.values()];
        const aVals = [];
        const aParams = [];
        let ai = 1;
        for (const a of uniqAliases) {
          aVals.push(`($${ai++},$${ai++},$${ai++},$${ai++},$${ai++},$${ai++},$${ai++},$${ai++},$${ai++},$${ai++})`);
          aParams.push(
            providerNetworkId, providerId,
            a.rawTitle, a.normalizedTitle || a.canonicalNormalizedTitle, a.normalizedTitle, a.canonicalTitle,
            a.canonicalNormalizedTitle, a.titleYear, a.vodType, a.canonicalContentId
          );
        }

        await pool.query(
          `INSERT INTO content_aliases
             (provider_network_id, provider_id, raw_title, normalized_alias, normalized_title, canonical_title,
              canonical_normalized_title, title_year, vod_type, canonical_content_id)
           VALUES ${aVals.join(',')}
           ON CONFLICT (provider_network_id, raw_title, vod_type) DO UPDATE SET
             provider_id                = EXCLUDED.provider_id,
             normalized_alias           = EXCLUDED.normalized_alias,
             normalized_title           = EXCLUDED.normalized_title,
             canonical_title            = EXCLUDED.canonical_title,
             canonical_normalized_title = EXCLUDED.canonical_normalized_title,
             title_year                 = EXCLUDED.title_year,
             canonical_content_id       = COALESCE(EXCLUDED.canonical_content_id, content_aliases.canonical_content_id),
             updated_at                 = NOW()`,
          aParams
        );
      }
    }

    // Attach canonical IDs to the original entry objects
    return valid.map(e => {
      const key = `${e.vodType}::${e.canonicalNormalizedTitle || e.normalizedTitle || ''}::${e.titleYear ?? ''}`;
      return { ...e, canonicalContentId: globalIdMap.get(key) || null };
    });
  },

  async getCoverage() {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) AS canonical_count,
         COUNT(*) FILTER (WHERE tmdb_id IS NOT NULL OR imdb_id IS NOT NULL) AS externally_matched_count
       FROM canonical_content`
    );
    return rows[0];
  },
};

// ─── Watch History ───────────────────────────────────────────────────────────

const watchHistoryQueries = {
  async upsertFromVod({ userId, vodId, rawTitle, tmdbId, imdbId, vodType, progressPct = 0 }) {
    await pool.query(
      `INSERT INTO watch_history (user_id, vod_id, raw_title, tmdb_id, imdb_id, vod_type, progress_pct, last_watched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, raw_title) DO UPDATE SET
         vod_id = EXCLUDED.vod_id,
         tmdb_id = EXCLUDED.tmdb_id,
         imdb_id = EXCLUDED.imdb_id,
         vod_type = EXCLUDED.vod_type,
         progress_pct = GREATEST(COALESCE(watch_history.progress_pct, 0), EXCLUDED.progress_pct),
         last_watched_at = NOW()`,
      [userId, vodId || null, rawTitle, tmdbId || null, imdbId || null, vodType || null, progressPct]
    );
  },

  async getRecentForUser(userId, { limit = 12 } = {}) {
    const { rows } = await pool.query(
      `SELECT
         wh.id,
         wh.raw_title,
         wh.tmdb_id,
         wh.imdb_id,
         wh.vod_type,
         wh.progress_pct,
         wh.last_watched_at,
         v.id AS vod_id,
         v.provider_id,
         v.poster_url,
         v.category,
         p.name AS provider_name
       FROM watch_history wh
       LEFT JOIN LATERAL (
         SELECT v.id, v.provider_id, v.poster_url, v.category
         FROM user_provider_vod v
         WHERE v.user_id = wh.user_id
           AND v.raw_title = wh.raw_title
         ORDER BY CASE WHEN wh.vod_id IS NOT NULL AND v.id = wh.vod_id THEN 0 ELSE 1 END, v.created_at DESC
         LIMIT 1
       ) v ON true
       LEFT JOIN user_providers p ON p.id = v.provider_id
       WHERE wh.user_id = $1
       ORDER BY wh.last_watched_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return rows;
  },
};

// ─── TMDB ─────────────────────────────────────────────────────────────────────

const tmdbQueries = {
  async upsertMovie({ id, original_title, normalized_title, release_year, popularity, poster_path, overview, imdb_id }) {
    await pool.query(
      `INSERT INTO tmdb_movies (id, original_title, normalized_title, release_year, popularity, poster_path, overview, imdb_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         original_title = EXCLUDED.original_title,
         normalized_title = EXCLUDED.normalized_title,
         release_year = EXCLUDED.release_year,
         popularity = EXCLUDED.popularity,
         poster_path = EXCLUDED.poster_path,
         overview = EXCLUDED.overview,
         imdb_id = EXCLUDED.imdb_id`,
      [id, original_title, normalized_title, release_year, popularity, poster_path, overview, imdb_id]
    );
  },

  async upsertMovieBatch(entries) {
    if (!entries.length) return;
    const values = [];
    const placeholders = entries.map((e, i) => {
      const base = i * 8;
      values.push(
        e.id,
        e.original_title,
        e.normalized_title || null,
        e.release_year || null,
        e.popularity || 0,
        e.poster_path || null,
        e.overview || null,
        e.imdb_id || null
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    });
    await pool.query(
      `INSERT INTO tmdb_movies (id, original_title, normalized_title, release_year, popularity, poster_path, overview, imdb_id)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (id) DO UPDATE SET
         original_title = EXCLUDED.original_title,
         normalized_title = EXCLUDED.normalized_title,
         release_year = EXCLUDED.release_year,
         popularity = EXCLUDED.popularity,
         poster_path = EXCLUDED.poster_path,
         overview = EXCLUDED.overview,
         imdb_id = EXCLUDED.imdb_id`,
      values
    );
  },

  async upsertSeries({ id, original_title, normalized_title, first_air_year, popularity, poster_path, overview, imdb_id }) {
    await pool.query(
      `INSERT INTO tmdb_series (id, original_title, normalized_title, first_air_year, popularity, poster_path, overview, imdb_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         original_title = EXCLUDED.original_title,
         normalized_title = EXCLUDED.normalized_title,
         first_air_year = EXCLUDED.first_air_year,
         popularity = EXCLUDED.popularity,
         poster_path = EXCLUDED.poster_path,
         overview = EXCLUDED.overview,
         imdb_id = COALESCE(tmdb_series.imdb_id, EXCLUDED.imdb_id)`,
      [id, original_title, normalized_title, first_air_year, popularity, poster_path, overview, imdb_id || null]
    );
  },

  async upsertSeriesBatch(entries) {
    if (!entries.length) return;
    const values = [];
    const placeholders = entries.map((e, i) => {
      const base = i * 8;
      values.push(
        e.id,
        e.original_title,
        e.normalized_title || null,
        e.first_air_year || null,
        e.popularity || 0,
        e.poster_path || null,
        e.overview || null,
        e.imdb_id || null
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    });
    await pool.query(
      `INSERT INTO tmdb_series (id, original_title, normalized_title, first_air_year, popularity, poster_path, overview, imdb_id)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (id) DO UPDATE SET
         original_title = EXCLUDED.original_title,
         normalized_title = EXCLUDED.normalized_title,
         first_air_year = EXCLUDED.first_air_year,
         popularity = EXCLUDED.popularity,
         poster_path = EXCLUDED.poster_path,
         overview = EXCLUDED.overview,
         imdb_id = COALESCE(tmdb_series.imdb_id, EXCLUDED.imdb_id)`,
      values
    );
  },

  async exactMatchMovie(normalizedTitle, year) {
    let query = `
      SELECT id, original_title, imdb_id, popularity, 1 AS score
      FROM tmdb_movies
      WHERE normalized_title = $1
    `;
    const params = [normalizedTitle];
    if (year) {
      query += ` AND (release_year IS NULL OR ABS(release_year - $2) <= 1)`;
      params.push(year);
    }
    query += ` ORDER BY popularity DESC LIMIT 1`;
    const { rows } = await pool.query(query, params);
    return rows[0];
  },

  // Strict exact match: requires year within ±1 when provided; returns 0 or 1
  // candidates. No fuzzy, no similarity scoring — matcher v2 guarantees this
  // is only ever called with a normalized title from the release parser.
  async strictMatchMovie(normalizedTitle, year) {
    if (!normalizedTitle) return null;
    let query = `
      SELECT id, original_title, imdb_id, popularity, release_year, 1 AS score
      FROM tmdb_movies
      WHERE normalized_title = $1
    `;
    const params = [normalizedTitle];
    if (year) {
      query += ` AND release_year IS NOT NULL AND ABS(release_year - $2) <= 1`;
      params.push(year);
    }
    query += ` ORDER BY popularity DESC LIMIT 2`;
    const { rows } = await pool.query(query, params);
    // Ambiguous: >1 candidate at the same normalized title / year window.
    // Return null so the caller treats it as unmatched rather than guessing.
    if (rows.length !== 1) return null;
    return rows[0];
  },

  async strictMatchSeries(normalizedTitle, year) {
    if (!normalizedTitle) return null;
    let query = `
      SELECT id, original_title, popularity, first_air_year, 1 AS score
      FROM tmdb_series
      WHERE normalized_title = $1
    `;
    const params = [normalizedTitle];
    if (year) {
      query += ` AND first_air_year IS NOT NULL AND ABS(first_air_year - $2) <= 1`;
      params.push(year);
    }
    query += ` ORDER BY popularity DESC LIMIT 2`;
    const { rows } = await pool.query(query, params);
    if (rows.length !== 1) return null;
    return rows[0];
  },

  // Alias match — resolves localized titles and scene-name remappings via the
  // content_aliases table. Returns the canonical_content row with the
  // tmdb_id/imdb_id already resolved.
  async aliasMatch(normalizedTitle, vodType, year) {
    if (!normalizedTitle) return null;
    const lookupColumn = await getContentAliasesLookupColumn();
    let query = `
      SELECT cc.id AS canonical_id,
             cc.canonical_title AS original_title,
             cc.tmdb_id AS id,
             cc.imdb_id,
             cc.title_year AS year,
             1 AS score
      FROM content_aliases a
      JOIN canonical_content cc ON cc.id = a.canonical_content_id
      WHERE a.${lookupColumn} = $1
        AND cc.vod_type = $2
    `;
    const params = [normalizedTitle, vodType === 'series' ? 'series' : 'movie'];
    if (year) {
      query += ` AND (cc.title_year IS NULL OR ABS(cc.title_year - $3) <= 1)`;
      params.push(year);
    }
    query += ` ORDER BY cc.confidence_score DESC NULLS LAST LIMIT 2`;
    const { rows } = await pool.query(query, params);
    if (rows.length !== 1) return null;
    return rows[0];
  },

  async fuzzyMatchMovie(normalizedTitle, year) {
    let query = `
      SELECT id, original_title, imdb_id, popularity,
             GREATEST(similarity(normalized_title, $1), word_similarity($1, normalized_title)) AS score
      FROM (
        SELECT id, original_title, imdb_id, popularity, normalized_title
        FROM tmdb_movies
    `;
    const params = [normalizedTitle];
    if (year) {
      query += ` WHERE release_year IS NULL OR ABS(release_year - $2) <= 2`;
      params.push(year);
    }
    query += ` ORDER BY normalized_title <-> $1 ASC, popularity DESC LIMIT 5
      ) candidates
      ORDER BY score DESC, popularity DESC
      LIMIT 1`;
    const { rows } = await pool.query(query, params);
    return rows[0];
  },

  async exactMatchSeries(normalizedTitle, year) {
    let query = `
      SELECT id, original_title, popularity, 1 AS score
      FROM tmdb_series
      WHERE normalized_title = $1
    `;
    const params = [normalizedTitle];
    if (year) {
      query += ` AND ABS(first_air_year - $2) <= 1`;
      params.push(year);
    }
    query += ` ORDER BY popularity DESC LIMIT 1`;
    const { rows } = await pool.query(query, params);
    return rows[0];
  },

  async fuzzyMatchSeries(normalizedTitle, year) {
    let query = `
      SELECT id, original_title, popularity,
             GREATEST(similarity(normalized_title, $1), word_similarity($1, normalized_title)) AS score
      FROM (
        SELECT id, original_title, popularity, normalized_title
        FROM tmdb_series
    `;
    const params = [normalizedTitle];
    if (year) {
      query += ` WHERE ABS(first_air_year - $2) <= 2`;
      params.push(year);
    }
    query += ` ORDER BY normalized_title <-> $1 ASC, popularity DESC LIMIT 5
      ) candidates
      ORDER BY score DESC, popularity DESC
      LIMIT 1`;
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
         matched_at = NOW()
       WHERE matched_content.tmdb_id IS DISTINCT FROM EXCLUDED.tmdb_id
          OR matched_content.tmdb_type IS DISTINCT FROM EXCLUDED.tmdb_type
          OR matched_content.imdb_id IS DISTINCT FROM EXCLUDED.imdb_id
          OR matched_content.confidence_score IS DISTINCT FROM EXCLUDED.confidence_score`,
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
  async start(jobName, metadata = null) {
    const { rows } = await pool.query(
      `INSERT INTO job_runs (job_name, status, started_at, metadata)
       VALUES ($1, 'running', NOW(), $2) RETURNING id`,
      [jobName, metadata ? JSON.stringify(metadata) : null]
    );
    return rows[0].id;
  },

  async update(id, { status, errorMessage, metadata, finished = false } = {}) {
    const assignments = [];
    const values = [];
    let index = 1;

    if (status !== undefined) {
      assignments.push(`status = $${index++}`);
      values.push(status);
    }
    if (errorMessage !== undefined) {
      assignments.push(`error_message = $${index++}`);
      values.push(errorMessage);
    }
    if (metadata !== undefined) {
      assignments.push(`metadata = $${index++}`);
      values.push(metadata ? JSON.stringify(metadata) : null);
    }
    if (finished) {
      assignments.push('finished_at = NOW()');
    }

    if (!assignments.length) return;

    values.push(id);
    await pool.query(
      `UPDATE job_runs
       SET ${assignments.join(', ')}
       WHERE id = $${index}`,
      values
    );
  },

  async finish(id, { status, errorMessage, metadata } = {}) {
    await this.update(id, {
      status: status || 'success',
      errorMessage: errorMessage || null,
      metadata: metadata !== undefined ? metadata : null,
      finished: true,
    });
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

  async findRunningProviderRefresh(providerId, userId) {
    const { rows } = await pool.query(
      `SELECT *
       FROM job_runs
       WHERE job_name = 'providerCatalogRefresh'
         AND status = 'running'
         AND metadata->>'providerId' = $1
         AND metadata->>'userId' = $2
       ORDER BY started_at DESC
       LIMIT 1`,
      [providerId, userId]
    );
    return rows[0] || null;
  },

  async getProviderRefreshStatus(providerId, userId) {
    const { rows } = await pool.query(
      `SELECT *
       FROM job_runs
       WHERE job_name = 'providerCatalogRefresh'
         AND metadata->>'providerId' = $1
         AND metadata->>'userId' = $2
       ORDER BY started_at DESC
       LIMIT 1`,
      [providerId, userId]
    );
    return rows[0] || null;
  },

  async listActiveProviderRefreshes(userId) {
    const { rows } = await pool.query(
      `SELECT *
       FROM job_runs
       WHERE job_name = 'providerCatalogRefresh'
         AND status = 'running'
         AND metadata->>'userId' = $1
       ORDER BY started_at DESC`,
      [userId]
    );
    return rows;
  },
};

// ─── Error Reports ───────────────────────────────────────────────────────────

const errorReportQueries = {
  async create({
    reportKind = 'error',
    ticketCategory = null,
    source = 'frontend',
    status = 'open',
    severity = 'error',
    message,
    errorType = null,
    stack = null,
    componentStack = null,
    fingerprint = null,
    pageUrl = null,
    routePath = null,
    requestMethod = null,
    requestPath = null,
    userAgent = null,
    reporterEmail = null,
    userId = null,
    adminContext = false,
    context = {},
  }) {
    const { rows } = await pool.query(
      `INSERT INTO error_reports (
        report_kind,
        ticket_category,
        source,
        status,
        severity,
        message,
        error_type,
        stack,
        component_stack,
        fingerprint,
        page_url,
        route_path,
        request_method,
        request_path,
        user_agent,
        reporter_email,
        user_id,
        admin_context,
        context
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
      )
      RETURNING *`,
      [
        reportKind,
        ticketCategory,
        source,
        status,
        severity,
        message,
        errorType,
        stack,
        componentStack,
        fingerprint,
        pageUrl,
        routePath,
        requestMethod,
        requestPath,
        userAgent,
        reporterEmail,
        userId,
        adminContext,
        JSON.stringify(context || {}),
      ]
    );
    return rows[0];
  },

  async list({ search = '', status = '', source = '', reportKind = '', ticketCategory = '', limit = 100, offset = 0 } = {}) {
    const { rows } = await pool.query(
      `SELECT
         er.id,
         er.report_kind,
         er.ticket_category,
         er.source,
         er.status,
         er.severity,
         er.message,
         er.error_type,
         er.route_path,
         er.request_method,
         er.request_path,
         er.page_url,
         er.reporter_email,
         er.user_id,
         er.admin_context,
         er.reviewed_at,
         er.resolved_at,
         er.created_at,
         u.email AS user_email
       FROM error_reports er
       LEFT JOIN users u ON u.id = er.user_id
       WHERE (
         $1 = ''
         OR er.message ILIKE $1
         OR COALESCE(er.route_path, '') ILIKE $1
         OR COALESCE(er.request_path, '') ILIKE $1
         OR COALESCE(er.reporter_email, '') ILIKE $1
         OR COALESCE(u.email, '') ILIKE $1
       )
         AND ($2 = '' OR er.status = $2)
         AND ($3 = '' OR er.source = $3)
         AND ($4 = '' OR er.report_kind = $4)
         AND ($5 = '' OR er.ticket_category = $5)
       ORDER BY er.created_at DESC
       LIMIT $6 OFFSET $7`,
      [`%${search}%`, status, source, reportKind, ticketCategory, limit, offset]
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT er.*, u.email AS user_email
       FROM error_reports er
       LEFT JOIN users u ON u.id = er.user_id
       WHERE er.id = $1`,
      [id]
    );
    return rows[0];
  },

  async listTicketsForUser(userId) {
    const { rows } = await pool.query(
      `SELECT er.*, u.email AS user_email
       FROM error_reports er
       LEFT JOIN users u ON u.id = er.user_id
       WHERE er.report_kind = 'ticket'
         AND er.user_id = $1
       ORDER BY er.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async findTicketForUser(id, userId) {
    const { rows } = await pool.query(
      `SELECT er.*, u.email AS user_email
       FROM error_reports er
       LEFT JOIN users u ON u.id = er.user_id
       WHERE er.id = $1
         AND er.report_kind = 'ticket'
         AND er.user_id = $2
       LIMIT 1`,
      [id, userId]
    );
    return rows[0];
  },

  async updateStatus(id, status) {
    const resolvedAt = status === 'resolved' ? 'NOW()' : 'NULL';
    const { rows } = await pool.query(
      `UPDATE error_reports
       SET status = $1,
           reviewed_at = COALESCE(reviewed_at, NOW()),
           resolved_at = ${resolvedAt}
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );
    if (!rows[0]) return null;
    return this.findById(id);
  },
};

const supportReportMessageQueries = {
  async listForReport(reportId) {
    const { rows } = await pool.query(
      `SELECT id, report_id, author_type, author_email, body, created_at
       FROM support_report_messages
       WHERE report_id = $1
       ORDER BY created_at ASC`,
      [reportId]
    );
    return rows;
  },

  async create({ reportId, authorType, authorEmail = null, body }) {
    const { rows } = await pool.query(
      `INSERT INTO support_report_messages (
        report_id,
        author_type,
        author_email,
        body
      ) VALUES ($1, $2, $3, $4)
      RETURNING id, report_id, author_type, author_email, body, created_at`,
      [reportId, authorType, authorEmail, body]
    );
    return rows[0];
  },
};

// ─── Free Access ─────────────────────────────────────────────────────────────

const freeAccessQueries = {
  async listProviderGroups() {
    const { rows } = await pool.query(
      `SELECT g.*,
              COUNT(DISTINCT h.id) AS host_count,
              COUNT(DISTINCT a.id) AS account_count,
              COUNT(DISTINCT c.id) AS catalog_count
       FROM free_access_provider_groups g
       LEFT JOIN free_access_provider_hosts h ON h.provider_group_id = g.id
       LEFT JOIN free_access_provider_accounts a ON a.provider_group_id = g.id
       LEFT JOIN free_access_catalog c ON c.provider_group_id = g.id
       GROUP BY g.id
       ORDER BY g.created_at DESC`
    );
    return rows;
  },

  async findProviderGroupById(id) {
    const { rows } = await pool.query(
      'SELECT * FROM free_access_provider_groups WHERE id = $1',
      [id]
    );
    return rows[0];
  },

  async createProviderGroup({ name, trialDays = 7, notes = null, isActive = true }) {
    const { rows } = await pool.query(
      `INSERT INTO free_access_provider_groups (name, trial_days, notes, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, trialDays, notes, isActive]
    );
    return rows[0];
  },

  async updateProviderGroup(id, fields) {
    const allowed = { name: 'name', trialDays: 'trial_days', notes: 'notes', isActive: 'is_active' };
    const updates = [];
    const values = [];
    let idx = 1;
    for (const [key, column] of Object.entries(allowed)) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        updates.push(`${column} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (!updates.length) return this.findProviderGroupById(id);
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE free_access_provider_groups
       SET ${updates.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      values
    );
    return rows[0];
  },

  async deleteProviderGroup(id) {
    const { rows } = await pool.query(
      `DELETE FROM free_access_provider_groups
       WHERE id = $1
       RETURNING id`,
      [id]
    );
    return rows[0];
  },

  async listHostsByGroup(providerGroupId) {
    const { rows } = await pool.query(
      `SELECT *
       FROM free_access_provider_hosts
       WHERE provider_group_id = $1
       ORDER BY priority ASC, host ASC`,
      [providerGroupId]
    );
    return rows;
  },

  async addHost({ providerGroupId, host, priority = 100, isActive = true }) {
    const { rows } = await pool.query(
      `INSERT INTO free_access_provider_hosts (provider_group_id, host, priority, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider_group_id, host) DO UPDATE SET
         priority = EXCLUDED.priority,
         is_active = EXCLUDED.is_active
       RETURNING *`,
      [providerGroupId, host, priority, isActive]
    );
    return rows[0];
  },

  async updateHostStatus(id, fields) {
    const { rows } = await pool.query(
      `UPDATE free_access_provider_hosts
       SET is_active = COALESCE($2, is_active),
           last_checked_at = COALESCE($3, last_checked_at),
           last_status = COALESCE($4, last_status),
           last_response_ms = COALESCE($5, last_response_ms),
           priority = COALESCE($6, priority)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        Object.prototype.hasOwnProperty.call(fields, 'isActive') ? fields.isActive : null,
        fields.lastCheckedAt || null,
        fields.lastStatus || null,
        Object.prototype.hasOwnProperty.call(fields, 'lastResponseMs') ? fields.lastResponseMs : null,
        Object.prototype.hasOwnProperty.call(fields, 'priority') ? fields.priority : null,
      ]
    );
    return rows[0];
  },

  async deleteHost(id, providerGroupId) {
    const { rows } = await pool.query(
      `DELETE FROM free_access_provider_hosts
       WHERE id = $1 AND provider_group_id = $2
       RETURNING id`,
      [id, providerGroupId]
    );
    return rows[0];
  },

  async listAccountsByGroup(providerGroupId) {
    const { rows } = await pool.query(
      `SELECT *
       FROM free_access_provider_accounts
       WHERE provider_group_id = $1
       ORDER BY created_at DESC`,
      [providerGroupId]
    );
    return rows;
  },

  async addAccount({ providerGroupId, username, password, status = 'available' }) {
    const { rows } = await pool.query(
      `INSERT INTO free_access_provider_accounts (provider_group_id, username, password, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider_group_id, username) DO UPDATE SET
         password = EXCLUDED.password,
         status = EXCLUDED.status
       RETURNING *`,
      [providerGroupId, username, password, status]
    );
    return rows[0];
  },

  async updateAccountStatus(id, fields) {
    const { rows } = await pool.query(
      `UPDATE free_access_provider_accounts
       SET status = COALESCE($2, status),
           max_connections = COALESCE($3, max_connections),
           last_active_connections = COALESCE($4, last_active_connections),
           last_expiration_at = COALESCE($5, last_expiration_at),
           last_checked_at = COALESCE($6, last_checked_at),
           last_assigned_at = COALESCE($7, last_assigned_at)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        fields.status || null,
        Object.prototype.hasOwnProperty.call(fields, 'maxConnections') ? fields.maxConnections : null,
        Object.prototype.hasOwnProperty.call(fields, 'lastActiveConnections') ? fields.lastActiveConnections : null,
        fields.lastExpirationAt || null,
        fields.lastCheckedAt || null,
        fields.lastAssignedAt || null,
      ]
    );
    return rows[0];
  },

  async deleteAccount(id, providerGroupId) {
    const { rows } = await pool.query(
      `DELETE FROM free_access_provider_accounts
       WHERE id = $1 AND provider_group_id = $2
       RETURNING id`,
      [id, providerGroupId]
    );
    return rows[0];
  },

  async findReusableAssignmentForUser(userId) {
    const { rows } = await pool.query(
      `SELECT ufa.*, g.name AS provider_group_name, g.trial_days
       FROM user_free_access_assignments ufa
       JOIN free_access_provider_groups g ON g.id = ufa.provider_group_id
       WHERE ufa.user_id = $1
       ORDER BY ufa.started_at DESC
       LIMIT 1`,
      [userId]
    );
    return rows[0];
  },

  async findActiveAssignmentForUser(userId) {
    const { rows } = await pool.query(
      `SELECT ufa.*,
              g.name AS provider_group_name,
              g.trial_days,
              g.catalog_last_refreshed_at,
              a.username,
              a.password
       FROM user_free_access_assignments ufa
       JOIN free_access_provider_groups g ON g.id = ufa.provider_group_id
       JOIN free_access_provider_accounts a ON a.id = ufa.account_id
       WHERE ufa.user_id = $1
         AND ufa.status = 'active'
         AND ufa.expires_at > NOW()
       ORDER BY ufa.started_at DESC
       LIMIT 1`,
      [userId]
    );
    return rows[0];
  },

  async findLatestAssignmentForUser(userId) {
    const { rows } = await pool.query(
      `SELECT ufa.*,
              g.name AS provider_group_name,
              g.trial_days,
              a.username,
              a.password
       FROM user_free_access_assignments ufa
       JOIN free_access_provider_groups g ON g.id = ufa.provider_group_id
       JOIN free_access_provider_accounts a ON a.id = ufa.account_id
       WHERE ufa.user_id = $1
       ORDER BY
         CASE ufa.status WHEN 'active' THEN 0 WHEN 'expired' THEN 1 ELSE 2 END,
         ufa.expires_at DESC NULLS LAST,
         ufa.started_at DESC
       LIMIT 1`,
      [userId]
    );
    return rows[0];
  },

  async createAssignment({ userId, providerGroupId, accountId, expiresAt, renewalNumber = 0 }) {
    const { rows } = await pool.query(
      `INSERT INTO user_free_access_assignments (user_id, provider_group_id, account_id, status, expires_at, renewal_number)
       VALUES ($1, $2, $3, 'active', $4, $5)
       RETURNING *`,
      [userId, providerGroupId, accountId, expiresAt, renewalNumber]
    );
    return rows[0];
  },

  async markAssignmentExpired(id) {
    const { rows } = await pool.query(
      `UPDATE user_free_access_assignments
       SET status = 'expired',
           expired_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return rows[0];
  },

  async touchAssignmentStream(id) {
    await pool.query(
      `UPDATE user_free_access_assignments
       SET last_stream_at = NOW()
       WHERE id = $1`,
      [id]
    );
  },

  async listAssignments({ limit = 100, offset = 0 } = {}) {
    const { rows } = await pool.query(
      `SELECT ufa.*, u.email, g.name AS provider_group_name, a.username
       FROM user_free_access_assignments ufa
       JOIN users u ON u.id = ufa.user_id
       JOIN free_access_provider_groups g ON g.id = ufa.provider_group_id
       JOIN free_access_provider_accounts a ON a.id = ufa.account_id
       ORDER BY ufa.started_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows;
  },

  async listExpiredActiveAssignments() {
    const { rows } = await pool.query(
      `SELECT ufa.*, a.id AS account_id
       FROM user_free_access_assignments ufa
       JOIN free_access_provider_accounts a ON a.id = ufa.account_id
       WHERE ufa.status = 'active'
         AND ufa.expires_at <= NOW()`
    );
    return rows;
  },

  async getEligibleAccounts() {
    const { rows } = await pool.query(
      `SELECT a.*, g.name AS provider_group_name, g.trial_days
       FROM free_access_provider_accounts a
       JOIN free_access_provider_groups g ON g.id = a.provider_group_id
       WHERE g.is_active = true
         AND a.status IN ('available', 'expired')
       ORDER BY a.last_assigned_at ASC NULLS FIRST, a.created_at ASC`
    );
    return rows;
  },

  async listRuntimeEligibleAccounts({ providerGroupId = null } = {}) {
    const params = [];
    let where = `
      WHERE g.is_active = true
        AND a.status <> 'suspended'
    `;

    if (providerGroupId) {
      params.push(providerGroupId);
      where += ` AND a.provider_group_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT a.*, g.name AS provider_group_name, g.trial_days
       FROM free_access_provider_accounts a
       JOIN free_access_provider_groups g ON g.id = a.provider_group_id
       ${where}
       ORDER BY a.last_assigned_at ASC NULLS FIRST, a.last_checked_at ASC NULLS FIRST, a.created_at ASC`,
      params
    );
    return rows;
  },

  async getHostsForGroup(providerGroupId) {
    const { rows } = await pool.query(
      `SELECT *
       FROM free_access_provider_hosts
       WHERE provider_group_id = $1
         AND is_active = true
       ORDER BY priority ASC, host ASC`,
      [providerGroupId]
    );
    return rows;
  },

  async setCatalogRefreshed(providerGroupId) {
    await pool.query(
      `UPDATE free_access_provider_groups
       SET catalog_last_refreshed_at = NOW()
       WHERE id = $1`,
      [providerGroupId]
    );
  },

  async getCatalogCountByGroup(providerGroupId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS total
       FROM free_access_catalog
       WHERE provider_group_id = $1`,
      [providerGroupId]
    );
    return parseInt(rows[0]?.total || 0, 10);
  },

  async deleteCatalogByGroup(providerGroupId) {
    await pool.query(
      'DELETE FROM free_access_catalog WHERE provider_group_id = $1',
      [providerGroupId]
    );
  },

  async upsertCatalogBatch(entries) {
    if (!entries.length) return;

    const dedupedEntries = Array.from(
      new Map(
        entries.map((entry) => [
          [
            entry.providerGroupId,
            entry.streamId,
            entry.vodType,
          ].join('::'),
          entry,
        ])
      ).values()
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TEMP TABLE temp_free_access_catalog (LIKE free_access_catalog INCLUDING DEFAULTS) ON COMMIT DROP;
      `);

      const stream = client.query(from(`COPY temp_free_access_catalog (provider_group_id, stream_id, raw_title, normalized_title, canonical_title, canonical_normalized_title, title_year, content_languages, quality_tags, poster_url, category, vod_type, container_extension) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')`));

      const transformStream = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          const titleYear = pickFirstDefined(chunk, 'titleYear', 'title_year', 'year');
          const contentLanguages = pickFirstDefined(chunk, 'contentLanguages', 'content_languages', 'languages');
          const qualityTags = pickFirstDefined(chunk, 'qualityTags', 'quality_tags');

          const formatArray = (arr) => {
            if (!arr || arr.length === 0) return '{}';
            return '{' + arr.map(a => `"${String(a).replace(/"/g, '""')}"`).join(',') + '}';
          };

          const escape = (val) => {
            if (val === null || val === undefined) return '\\N';
            return String(val).replace(/[\t\n\r\\]/g, (c) => ({ '\t': '\\t', '\n': '\\n', '\r': '\\r', '\\': '\\\\' }[c] || c));
          };

          const row = [
            escape(chunk.providerGroupId), escape(chunk.streamId), escape(chunk.rawTitle),
            escape(chunk.normalizedTitle || null), escape(chunk.canonicalTitle || null), escape(chunk.canonicalNormalizedTitle || null),
            escape(titleYear || null), escape(formatArray(contentLanguages || [])), escape(formatArray(qualityTags || [])),
            escape(chunk.posterUrl || null), escape(chunk.category || null), escape(chunk.vodType),
            escape(chunk.containerExtension || null)
          ].join('\t') + '\n';
          
          callback(null, row);
        }
      });

      const sourceStream = require('stream').Readable.from(dedupedEntries);
      await pipeline(sourceStream, transformStream, stream);

      await client.query(`
        INSERT INTO free_access_catalog (provider_group_id, stream_id, raw_title, normalized_title, canonical_title, canonical_normalized_title, title_year, content_languages, quality_tags, poster_url, category, vod_type, container_extension)
        SELECT provider_group_id, stream_id, raw_title, normalized_title, canonical_title, canonical_normalized_title, title_year, content_languages, quality_tags, poster_url, category, vod_type, container_extension
        FROM temp_free_access_catalog
        ON CONFLICT (provider_group_id, stream_id, vod_type) DO UPDATE SET
          raw_title = EXCLUDED.raw_title,
          normalized_title = EXCLUDED.normalized_title,
          canonical_title = EXCLUDED.canonical_title,
          canonical_normalized_title = EXCLUDED.canonical_normalized_title,
          title_year = EXCLUDED.title_year,
          content_languages = EXCLUDED.content_languages,
          quality_tags = EXCLUDED.quality_tags,
          poster_url = EXCLUDED.poster_url,
          category = EXCLUDED.category,
          container_extension = EXCLUDED.container_extension
      `);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async findCatalogItemsByTmdbId(providerGroupId, tmdbId) {
    const { rows } = await pool.query(
      `SELECT c.*, m.tmdb_id, m.imdb_id, m.confidence_score
       FROM free_access_catalog c
       JOIN matched_content m ON m.raw_title = c.raw_title AND m.tmdb_id = $2
       WHERE c.provider_group_id = $1
       ORDER BY c.raw_title ASC, c.stream_id ASC`,
      [providerGroupId, tmdbId]
    );
    return rows;
  },

  async findCatalogByTmdbId(providerGroupId, tmdbId) {
    const rows = await this.findCatalogItemsByTmdbId(providerGroupId, tmdbId);
    return rows[0];
  },

  async findCatalogItemsByImdbId(providerGroupId, imdbId) {
    const { rows } = await pool.query(
      `SELECT c.*, m.tmdb_id, m.imdb_id, m.confidence_score
       FROM free_access_catalog c
       JOIN matched_content m ON m.raw_title = c.raw_title AND m.imdb_id = $2
       WHERE c.provider_group_id = $1
       ORDER BY c.raw_title ASC, c.stream_id ASC`,
      [providerGroupId, imdbId]
    );
    return rows;
  },

  async findCatalogByImdbId(providerGroupId, imdbId) {
    const rows = await this.findCatalogItemsByImdbId(providerGroupId, imdbId);
    return rows[0];
  },

  async findOnDemandCandidateForGroup(providerGroupId, { vodType, normalizedTitle, year, tmdbId, imdbId }) {
    let query = `
      SELECT c.*, m.tmdb_id, m.imdb_id, m.confidence_score
      FROM free_access_catalog c
      LEFT JOIN matched_content m ON m.raw_title = c.raw_title
      WHERE c.provider_group_id = $1
        AND c.vod_type = $2
    `;
    const params = [providerGroupId, vodType];
    let idx = 3;

    if (normalizedTitle) {
      query += ` AND COALESCE(c.canonical_normalized_title, c.normalized_title) IS NOT NULL`;
      query += ` ORDER BY
        CASE WHEN m.imdb_id = $${idx + 2} THEN 0 ELSE 1 END,
        CASE WHEN m.tmdb_id = $${idx + 3} THEN 0 ELSE 1 END,
        CASE WHEN COALESCE(c.canonical_normalized_title, c.normalized_title) = $${idx} THEN 0 ELSE 1 END,
        CASE WHEN COALESCE(c.canonical_normalized_title, c.normalized_title) % $${idx} THEN 0 ELSE 1 END,
        CASE WHEN c.title_year = $${idx + 1} THEN 0 ELSE 1 END,
        COALESCE(c.canonical_normalized_title, c.normalized_title) <-> $${idx} ASC,
        ABS(COALESCE(c.title_year, $${idx + 1}) - $${idx + 1}) ASC,
        c.raw_title ASC
        LIMIT 100`;
      params.push(normalizedTitle);
      params.push(year || null);
      params.push(imdbId || null);
      params.push(tmdbId || null);
    } else {
      query += ` ORDER BY
        CASE WHEN m.imdb_id = $${idx} THEN 0 ELSE 1 END,
        CASE WHEN m.tmdb_id = $${idx + 1} THEN 0 ELSE 1 END,
        c.created_at DESC
        LIMIT 100`;
      params.push(imdbId || null);
      params.push(tmdbId || null);
    }

    const { rows } = await pool.query(query, params);
    return rows;
  },

};

// ─── Marketplace: Provider Offerings ─────────────────────────────────────────

const offeringQueries = {
  async list() {
    const { rows } = await pool.query(
      `SELECT o.*, pn.name AS network_name,
        (SELECT COUNT(*) FROM network_vod WHERE provider_network_id = o.provider_network_id AND vod_type = 'live') as live_count,
        (SELECT COUNT(*) FROM network_vod WHERE provider_network_id = o.provider_network_id AND (vod_type = 'movie' OR vod_type = 'series')) as vod_count
       FROM provider_offerings o
       LEFT JOIN provider_networks pn ON pn.id = o.provider_network_id
       WHERE o.is_active = true
       ORDER BY o.is_featured DESC, o.created_at ASC`
    );
    return rows;
  },

  async listAll() {
    const { rows } = await pool.query(
      `SELECT o.*, pn.name AS network_name,
        (SELECT COUNT(*) FROM network_vod WHERE provider_network_id = o.provider_network_id AND vod_type = 'live') as live_count,
        (SELECT COUNT(*) FROM network_vod WHERE provider_network_id = o.provider_network_id AND (vod_type = 'movie' OR vod_type = 'series')) as vod_count
       FROM provider_offerings o
       LEFT JOIN provider_networks pn ON pn.id = o.provider_network_id
       ORDER BY o.is_featured DESC, o.created_at ASC`
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT o.*, pn.name AS network_name,
        (SELECT COUNT(*) FROM network_vod WHERE provider_network_id = o.provider_network_id AND vod_type = 'live') as live_count,
        (SELECT COUNT(*) FROM network_vod WHERE provider_network_id = o.provider_network_id AND (vod_type = 'movie' OR vod_type = 'series')) as vod_count
       FROM provider_offerings o
       LEFT JOIN provider_networks pn ON pn.id = o.provider_network_id
       WHERE o.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async create({ name, description, price_cents, currency, billing_period, billing_interval_count, trial_days, max_connections, features, plan_options, catalog_tags, country_codes, provider_stats, provisioning_mode, reseller_bouquet_ids, reseller_notes, stripe_price_id, stripe_product_id, provider_network_id, is_featured, group_id, is_trial, trial_ticket_enabled, trial_ticket_message }) {
    const { rows } = await pool.query(
      `INSERT INTO provider_offerings
         (name, description, price_cents, currency, billing_period, billing_interval_count, trial_days, max_connections, features, plan_options, catalog_tags, country_codes, provider_stats, provisioning_mode, reseller_bouquet_ids, reseller_notes, stripe_price_id, stripe_product_id, provider_network_id, is_featured, group_id, is_trial, trial_ticket_enabled, trial_ticket_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [
        name,
        description || null,
        price_cents,
        currency || 'usd',
        billing_period || 'month',
        billing_interval_count || 1,
        trial_days || 0,
        max_connections || 1,
        JSON.stringify(features || []),
        JSON.stringify(plan_options || []),
        catalog_tags || [],
        country_codes || [],
        JSON.stringify(provider_stats || {}),
        provisioning_mode || 'pooled_account',
        reseller_bouquet_ids || [],
        reseller_notes || null,
        stripe_price_id || null,
        stripe_product_id || null,
        provider_network_id || null,
        is_featured || false,
        group_id || null,
        is_trial || false,
        trial_ticket_enabled || false,
        trial_ticket_message || null,
      ]
    );
    return rows[0];
  },

  async update(id, fields) {
    const allowed = ['name', 'description', 'price_cents', 'currency', 'billing_period', 'billing_interval_count', 'trial_days', 'max_connections', 'features', 'plan_options', 'catalog_tags', 'country_codes', 'provider_stats', 'provisioning_mode', 'reseller_bouquet_ids', 'reseller_notes', 'stripe_price_id', 'stripe_product_id', 'provider_network_id', 'is_featured', 'is_active', 'group_id', 'is_trial', 'trial_ticket_enabled', 'trial_ticket_message', 'countries', 'tags'];
    const sets = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${key} = $${idx++}`);
        values.push(['features', 'plan_options', 'provider_stats'].includes(key) ? JSON.stringify(fields[key]) : fields[key]);
      }
    }
    if (!sets.length) return null;
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE provider_offerings SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async deactivate(id) {
    const { rows } = await pool.query(
      `UPDATE provider_offerings SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },

  async delete(id) {
    const { rows } = await pool.query(
      'DELETE FROM provider_offerings WHERE id = $1 RETURNING *',
      [id]
    );
    return rows[0] || null;
  },
};

// ─── Marketplace: Provider Subscriptions ─────────────────────────────────────

const subscriptionQueries = {
  async create({ user_id, offering_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, trial_end, payment_provider, paygate_address_in, auto_renew, selected_plan_code, selected_plan_name, selected_price_cents, selected_currency, selected_billing_period, selected_interval_count }) {
    const { rows } = await pool.query(
      `INSERT INTO provider_subscriptions
         (user_id, offering_id, stripe_customer_id, stripe_subscription_id, status,
          current_period_start, current_period_end, trial_end, payment_provider, paygate_address_in,
          auto_renew, selected_plan_code, selected_plan_name, selected_price_cents, selected_currency,
          selected_billing_period, selected_interval_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        user_id, offering_id,
        stripe_customer_id || null, stripe_subscription_id || null,
        status || 'active',
        current_period_start || null, current_period_end || null, trial_end || null,
        payment_provider || 'stripe', paygate_address_in || null,
        auto_renew !== false,
        selected_plan_code || null,
        selected_plan_name || null,
        selected_price_cents || null,
        selected_currency || null,
        selected_billing_period || null,
        selected_interval_count || null,
      ]
    );
    return rows[0];
  },

  async update(id, fields) {
    const allowed = ['status', 'current_period_start', 'current_period_end', 'cancel_at_period_end', 'cancelled_at', 'trial_end', 'user_provider_id', 'twenty_subscription_id', 'auto_renew', 'selected_plan_code', 'selected_plan_name', 'selected_price_cents', 'selected_currency', 'selected_billing_period', 'selected_interval_count', 'provisioning_status', 'provisioning_error', 'paygate_address_in', 'helcim_checkout_token', 'helcim_transaction_id', 'square_order_id', 'square_payment_link_id'];
    const sets = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (!sets.length) return null;
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE provider_subscriptions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async updateProvisioningStatus(id, status, error = null) {
    const { rows } = await pool.query(
      `UPDATE provider_subscriptions
       SET provisioning_status = $1,
           provisioning_error   = $2,
           updated_at           = NOW()
       WHERE id = $3
       RETURNING id, provisioning_status, provisioning_error, user_provider_id`,
      [status, error || null, id]
    );
    return rows[0] || null;
  },

  async findProvisionStatus(id, userId) {
    const { rows } = await pool.query(
      `SELECT ps.id,
              ps.provisioning_status,
              ps.provisioning_error,
              ps.status AS subscription_status,
              ps.user_provider_id,
              ps.payment_provider,
              ps.selected_plan_name,
              ps.current_period_end
       FROM provider_subscriptions ps
       WHERE ps.id = $1 AND ps.user_id = $2`,
      [id, userId]
    );
    return rows[0] || null;
  },

  async findByPaygateAddressIn(paygate_address_in) {
    const { rows } = await pool.query(
      `SELECT ps.*, po.name AS offering_name, po.provider_network_id, po.billing_period,
              po.billing_interval_count, po.price_cents, u.email AS user_email, u.twenty_person_id
       FROM provider_subscriptions ps
       JOIN provider_offerings po ON po.id = ps.offering_id
       JOIN users u ON u.id = ps.user_id
       WHERE ps.paygate_address_in = $1`,
      [paygate_address_in]
    );
    return rows[0] || null;
  },

  async findBySquareOrderId(square_order_id) {
    const { rows } = await pool.query(
      `SELECT ps.*, po.name AS offering_name, po.provider_network_id, po.billing_period,
              po.billing_interval_count, po.price_cents, u.email AS user_email, u.twenty_person_id
       FROM provider_subscriptions ps
       JOIN provider_offerings po ON po.id = ps.offering_id
       JOIN users u ON u.id = ps.user_id
       WHERE ps.square_order_id = $1`,
      [square_order_id]
    );
    return rows[0] || null;
  },

  async updateByStripeId(stripe_subscription_id, fields) {
    const allowed = ['status', 'current_period_start', 'current_period_end', 'cancel_at_period_end', 'cancelled_at', 'trial_end', 'user_provider_id', 'twenty_subscription_id', 'auto_renew', 'selected_plan_code', 'selected_plan_name', 'selected_price_cents', 'selected_currency', 'selected_billing_period', 'selected_interval_count'];
    const sets = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (!sets.length) return null;
    sets.push(`updated_at = NOW()`);
    values.push(stripe_subscription_id);
    const { rows } = await pool.query(
      `UPDATE provider_subscriptions SET ${sets.join(', ')} WHERE stripe_subscription_id = $${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async findByStripeSubscriptionId(stripe_subscription_id) {
    const { rows } = await pool.query(
      `SELECT ps.*, po.name AS offering_name, po.provider_network_id, u.email AS user_email, u.twenty_person_id
       FROM provider_subscriptions ps
       JOIN provider_offerings po ON po.id = ps.offering_id
       JOIN users u ON u.id = ps.user_id
       WHERE ps.stripe_subscription_id = $1`,
      [stripe_subscription_id]
    );
    return rows[0] || null;
  },

  async findByUserId(user_id) {
    const { rows } = await pool.query(
      `SELECT ps.*, po.name AS offering_name, po.description AS offering_description,
              po.price_cents, po.currency, po.billing_period, po.billing_interval_count, po.features,
              po.plan_options, po.catalog_tags, po.country_codes, po.provider_stats
       FROM provider_subscriptions ps
       LEFT JOIN provider_offerings po ON po.id = ps.offering_id
       WHERE ps.user_id = $1
       ORDER BY ps.created_at DESC`,
      [user_id]
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT ps.*, po.name AS offering_name, po.provider_network_id, u.email AS user_email, u.twenty_person_id
       FROM provider_subscriptions ps
       LEFT JOIN provider_offerings po ON po.id = ps.offering_id
       JOIN users u ON u.id = ps.user_id
       WHERE ps.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByStripeCustomerId(stripe_customer_id) {
    const { rows } = await pool.query(
      `SELECT * FROM provider_subscriptions WHERE stripe_customer_id = $1 AND status != 'cancelled'`,
      [stripe_customer_id]
    );
    return rows;
  },

  async getAnalytics() {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active') AS active_count,
         COUNT(*) FILTER (WHERE status = 'trialing') AS trialing_count,
         COUNT(*) FILTER (WHERE status = 'past_due') AS past_due_count,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
         SUM(COALESCE(ps.selected_price_cents, po.price_cents, 0)) FILTER (WHERE ps.status IN ('active','trialing')) AS mrr_cents
       FROM provider_subscriptions ps
       LEFT JOIN provider_offerings po ON po.id = ps.offering_id`
    );
    return rows[0];
  },
};

// ─── Marketplace: Payment Transactions ───────────────────────────────────────

const paymentQueries = {
  async insert({ user_id, subscription_id, amount_cents, currency, status, stripe_payment_intent_id, stripe_invoice_id, failure_reason, payment_provider, paygate_address_in, helcim_transaction_id, square_payment_id }) {
    // Stripe payments de-dup on stripe_payment_intent_id; PayGate/Helcim payments always insert
    if (stripe_payment_intent_id) {
      const { rows } = await pool.query(
        `INSERT INTO payment_transactions
           (user_id, subscription_id, amount_cents, currency, status, stripe_payment_intent_id, stripe_invoice_id, failure_reason, payment_provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (stripe_payment_intent_id) DO NOTHING
         RETURNING *`,
        [user_id, subscription_id || null, amount_cents, currency || 'usd', status,
         stripe_payment_intent_id, stripe_invoice_id || null, failure_reason || null,
         payment_provider || 'stripe']
      );
      return rows[0] || null;
    }
    if (helcim_transaction_id) {
      const { rows } = await pool.query(
        `INSERT INTO payment_transactions
           (user_id, subscription_id, amount_cents, currency, status, failure_reason, payment_provider, helcim_transaction_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (helcim_transaction_id) DO NOTHING
         RETURNING *`,
        [user_id, subscription_id || null, amount_cents, currency || 'usd', status,
         failure_reason || null, payment_provider || 'helcim', helcim_transaction_id]
      );
      return rows[0] || null;
    }
    if (square_payment_id) {
      const { rows } = await pool.query(
        `INSERT INTO payment_transactions
           (user_id, subscription_id, amount_cents, currency, status, failure_reason, payment_provider, square_payment_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (square_payment_id) DO NOTHING
         RETURNING *`,
        [user_id, subscription_id || null, amount_cents, currency || 'usd', status,
         failure_reason || null, payment_provider || 'square', square_payment_id]
      );
      return rows[0] || null;
    }
    const { rows } = await pool.query(
      `INSERT INTO payment_transactions
         (user_id, subscription_id, amount_cents, currency, status, failure_reason, payment_provider, paygate_address_in)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [user_id, subscription_id || null, amount_cents, currency || 'usd', status,
       failure_reason || null, payment_provider || 'paygate', paygate_address_in || null]
    );
    return rows[0] || null;
  },

  async listByUser(user_id, { limit = 20, offset = 0 } = {}) {
    const { rows } = await pool.query(
      `SELECT pt.*, ps.stripe_subscription_id, po.name AS offering_name
       FROM payment_transactions pt
       LEFT JOIN provider_subscriptions ps ON ps.id = pt.subscription_id
       LEFT JOIN provider_offerings po ON po.id = ps.offering_id
       WHERE pt.user_id = $1
       ORDER BY pt.created_at DESC
       LIMIT $2 OFFSET $3`,
      [user_id, limit, offset]
    );
    return rows;
  },
};

const systemSettingQueries = {
  async get(key) {
    const { rows } = await pool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
    return rows[0]?.value;
  },
  async set(key, value) {
    const { rows } = await pool.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING *`,
      [key, value]
    );
    return rows[0].value;
  },
};

module.exports = {
  userQueries,
  blogPostQueries,
  providerNetworkQueries,
  providerQueries,
  vodQueries,
  canonicalContentQueries,
  watchHistoryQueries,
  tmdbQueries,
  matchQueries,
  hostHealthQueries,
  jobQueries,
  errorReportQueries,
  supportReportMessageQueries,
  freeAccessQueries,
  offeringQueries,
  subscriptionQueries,
  paymentQueries,
  systemSettingQueries,
  pool,
};
