const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { userQueries } = require('../db/queries');
const logger = require('../utils/logger');
const eventBus = require('../utils/eventBus');
const { sendPasswordReset } = require('./emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const JWT_EXPIRES = '7d';
const SALT_ROUNDS = 12;

function generateAddonToken() {
  return uuidv4().replace(/-/g, '');
}

function signJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyJwt(token) {
  return jwt.verify(token, JWT_SECRET);
}

const authService = {
  async signup(email, password) {
    const existing = await userQueries.findByEmail(email.toLowerCase());
    if (existing) {
      const err = new Error('Email already registered');
      err.status = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const addonToken = generateAddonToken();
    const user = await userQueries.create({
      email: email.toLowerCase(),
      passwordHash,
      addonToken,
    });

    const jwtToken = signJwt({ userId: user.id, email: user.email });
    logger.info(`New user registered: ${user.email}`);
    return { user, token: jwtToken };
  },

  async login(email, password) {
    const user = await userQueries.findByEmail(email.toLowerCase());
    if (!user) {
      const err = new Error('Invalid credentials');
      err.status = 401;
      throw err;
    }

    if (!user.is_active) {
      const err = new Error('Account suspended');
      err.status = 403;
      throw err;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const err = new Error('Invalid credentials');
      err.status = 401;
      throw err;
    }

    await userQueries.updateLastSeen(user.id);
    const jwtToken = signJwt({ userId: user.id, email: user.email });
    const publicUser = await userQueries.findById(user.id) || {
      id: user.id,
      email: user.email,
      addon_token: user.addon_token,
      is_active: user.is_active,
      created_at: user.created_at,
      last_seen: user.last_seen,
    };
    logger.info(`User logged in: ${user.email}`);
    return {
      user: publicUser,
      token: jwtToken,
    };
  },

  async forgotPassword(email) {
    const user = await userQueries.findByEmail(email.toLowerCase());
    if (!user) return undefined; // Silent — don't reveal whether email exists

    const resetToken = uuidv4();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await userQueries.setResetToken(user.id, resetToken, expires);
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await sendPasswordReset(user.email, resetLink);
    return resetToken;
  },

  async resetPassword(resetToken, newPassword) {
    const user = await userQueries.findByResetToken(resetToken);
    if (!user) {
      const err = new Error('Invalid or expired reset token');
      err.status = 400;
      throw err;
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userQueries.updatePassword(user.id, passwordHash);
    await userQueries.clearResetToken(user.id);
    logger.info(`Password reset for user: ${user.email}`);
  },

  async changePassword(userId, currentPassword, newPassword) {
    const user = await userQueries.findById(userId);
    const fullUser = await userQueries.findByEmail(user.email);
    const valid = await bcrypt.compare(currentPassword, fullUser.password_hash);
    if (!valid) {
      const err = new Error('Current password incorrect');
      err.status = 400;
      throw err;
    }
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userQueries.updatePassword(userId, passwordHash);
  },

  async googleLogin(accessToken) {
    // Verify the access token with Google and retrieve user info
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const err = new Error('Invalid Google token');
      err.status = 401;
      throw err;
    }
    const { sub: oauthId, email } = await response.json();
    if (!email || !oauthId) {
      const err = new Error('Google did not return required user info');
      err.status = 401;
      throw err;
    }

    // 1. Find by oauth_id (returning user who signed up with Google)
    let user = await userQueries.findByOAuthId('google', oauthId);

    if (!user) {
      // 2. Find by email (existing email/password account — link it)
      const existing = await userQueries.findByEmail(email.toLowerCase());
      if (existing) {
        await userQueries.linkOAuth(existing.id, 'google', oauthId);
        user = await userQueries.findById(existing.id);
      } else {
        // 3. New user — create OAuth account
        const addonToken = generateAddonToken();
        user = await userQueries.createOAuth({
          email: email.toLowerCase(),
          oauthId,
          provider: 'google',
          addonToken,
        });
        eventBus.emit('user.created', user);
      }
    }

    if (!user.is_active) {
      const err = new Error('Account suspended');
      err.status = 403;
      throw err;
    }

    await userQueries.updateLastSeen(user.id);
    const jwtToken = signJwt({ userId: user.id, email: user.email });
    logger.info(`Google login: ${user.email}`);
    return { user, token: jwtToken };
  },

  async regenerateAddonToken(userId) {
    const newToken = generateAddonToken();
    return userQueries.regenerateToken(userId, newToken);
  },

  verifyJwt,
  generateAddonToken,
};

module.exports = authService;
