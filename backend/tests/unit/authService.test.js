/**
 * Unit tests for authService
 *
 * Run: npm test
 */

// JWT_SECRET must be set before authService is required (it's read at module load time)
process.env.JWT_SECRET = 'test_secret';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── Mock the DB queries ──────────────────────────────────────────────────────
jest.mock('../../src/db/queries', () => ({
  userQueries: {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findByToken: jest.fn(),
    findByResetToken: jest.fn(),
    create: jest.fn(),
    updateLastSeen: jest.fn(),
    updatePassword: jest.fn(),
    setResetToken: jest.fn(),
    clearResetToken: jest.fn(),
    regenerateToken: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/services/emailService', () => ({
  sendPasswordReset: jest.fn().mockResolvedValue({}),
}));

const { userQueries } = require('../../src/db/queries');
const authService = require('../../src/services/authService');

describe('authService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── signup ───────────────────────────────────────────────────────────────

  describe('signup', () => {
    it('creates a new user and returns a JWT', async () => {
      userQueries.findByEmail.mockResolvedValue(null);
      userQueries.create.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        addon_token: 'tok123',
        is_active: true,
        created_at: new Date(),
      });

      const result = await authService.signup('TEST@EXAMPLE.COM', 'password123');

      expect(userQueries.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(userQueries.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com' })
      );
      expect(result.user.email).toBe('test@example.com');
      expect(typeof result.token).toBe('string');

      const decoded = jwt.verify(result.token, 'test_secret');
      expect(decoded.userId).toBe('user-1');
    });

    it('throws 409 if email already registered', async () => {
      userQueries.findByEmail.mockResolvedValue({ id: 'existing' });

      await expect(authService.signup('taken@example.com', 'pass')).rejects.toMatchObject({
        status: 409,
        message: 'Email already registered',
      });
    });
  });

  // ─── login ────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns user + token for valid credentials', async () => {
      const hash = await bcrypt.hash('correctpassword', 10);
      userQueries.findByEmail.mockResolvedValue({
        id: 'user-2',
        email: 'user@example.com',
        password_hash: hash,
        is_active: true,
        addon_token: 'tok456',
        created_at: new Date(),
        last_seen: null,
      });
      userQueries.updateLastSeen.mockResolvedValue();

      const result = await authService.login('user@example.com', 'correctpassword');
      expect(result.user.email).toBe('user@example.com');
      expect(result.token).toBeTruthy();
      expect(userQueries.updateLastSeen).toHaveBeenCalledWith('user-2');
    });

    it('throws 401 for wrong password', async () => {
      const hash = await bcrypt.hash('correctpassword', 10);
      userQueries.findByEmail.mockResolvedValue({
        id: 'user-2',
        email: 'user@example.com',
        password_hash: hash,
        is_active: true,
      });

      await expect(authService.login('user@example.com', 'wrongpassword')).rejects.toMatchObject({
        status: 401,
      });
    });

    it('throws 401 for unknown email', async () => {
      userQueries.findByEmail.mockResolvedValue(null);
      await expect(authService.login('nobody@example.com', 'pass')).rejects.toMatchObject({
        status: 401,
      });
    });

    it('throws 403 for suspended account', async () => {
      const hash = await bcrypt.hash('pass', 10);
      userQueries.findByEmail.mockResolvedValue({
        id: 'user-3',
        email: 'suspended@example.com',
        password_hash: hash,
        is_active: false,
      });

      await expect(authService.login('suspended@example.com', 'pass')).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  // ─── forgotPassword ───────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('returns a reset token for known email', async () => {
      userQueries.findByEmail.mockResolvedValue({ id: 'user-4', email: 'known@example.com' });
      userQueries.setResetToken.mockResolvedValue();

      const token = await authService.forgotPassword('known@example.com');
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(10);
      expect(userQueries.setResetToken).toHaveBeenCalled();
    });

    it('returns undefined for unknown email (silent)', async () => {
      userQueries.findByEmail.mockResolvedValue(null);
      const token = await authService.forgotPassword('nobody@example.com');
      expect(token).toBeUndefined();
    });
  });

  // ─── resetPassword ────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('updates password when token is valid', async () => {
      userQueries.findByResetToken.mockResolvedValue({ id: 'user-5', email: 'u@e.com' });
      userQueries.updatePassword.mockResolvedValue();
      userQueries.clearResetToken.mockResolvedValue();

      await authService.resetPassword('valid-token', 'newpassword123');
      expect(userQueries.updatePassword).toHaveBeenCalled();
      expect(userQueries.clearResetToken).toHaveBeenCalledWith('user-5');
    });

    it('throws 400 for invalid/expired token', async () => {
      userQueries.findByResetToken.mockResolvedValue(null);
      await expect(authService.resetPassword('bad-token', 'newpass')).rejects.toMatchObject({
        status: 400,
      });
    });
  });

  // ─── verifyJwt ────────────────────────────────────────────────────────────

  describe('verifyJwt', () => {
    it('verifies a valid JWT', () => {
      const token = jwt.sign({ userId: 'u1' }, 'test_secret', { expiresIn: '1h' });
      const payload = authService.verifyJwt(token);
      expect(payload.userId).toBe('u1');
    });

    it('throws on invalid JWT', () => {
      expect(() => authService.verifyJwt('not.a.token')).toThrow();
    });
  });
});
