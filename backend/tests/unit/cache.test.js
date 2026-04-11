/**
 * Unit tests for backend/src/utils/cache.js
 */

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

jest.mock('../../src/utils/logger', () => mockLogger);

// We'll mock node-cache and ioredis to test both local and redis cache paths.
const mockNodeCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  flushAll: jest.fn(),
  getStats: jest.fn(),
};

jest.mock('node-cache', () => {
  return jest.fn().mockImplementation(() => mockNodeCache);
});

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  flushdb: jest.fn(),
  scanStream: jest.fn(),
  pipeline: jest.fn(),
  on: jest.fn(),
  status: 'ready',
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
}, { virtual: true });

describe('cache utility', () => {
  let cache;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Local Cache (No REDIS_URL)', () => {
    beforeEach(() => {
      delete process.env.REDIS_URL;
      cache = require('../../src/utils/cache');
    });

    it('should set and get values from local cache', async () => {
      mockNodeCache.get.mockReturnValue('test-value');
      
      await cache.set('testNamespace', 'testKey', 'test-value');
      expect(mockNodeCache.set).toHaveBeenCalledWith('cache:testNamespace:testKey', 'test-value', 300);

      const result = await cache.get('testNamespace', 'testKey');
      expect(mockNodeCache.get).toHaveBeenCalledWith('cache:testNamespace:testKey');
      expect(result).toBe('test-value');
    });

    it('should use custom TTL if provided', async () => {
      await cache.set('testNamespace', 'testKey', 'test-value', 60);
      expect(mockNodeCache.set).toHaveBeenCalledWith('cache:testNamespace:testKey', 'test-value', 60);
    });

    it('should use namespace-specific TTL if configured', async () => {
      // epg is configured for 14400 in cache.js
      await cache.set('epg', 'someKey', 'someValue');
      expect(mockNodeCache.set).toHaveBeenCalledWith('cache:epg:someKey', 'someValue', 14400);
    });

    it('should delete keys from local cache', async () => {
      await cache.del('testNamespace', 'testKey');
      expect(mockNodeCache.del).toHaveBeenCalledWith('cache:testNamespace:testKey');
    });

    it('should flush a namespace from local cache', async () => {
      mockNodeCache.keys.mockReturnValue([
        'cache:ns1:key1',
        'cache:ns1:key2',
        'cache:ns2:key3'
      ]);

      await cache.flush('ns1');
      expect(mockNodeCache.del).toHaveBeenCalledWith(['cache:ns1:key1', 'cache:ns1:key2']);
    });

    it('should flush all keys from local cache', async () => {
      await cache.flushAll();
      expect(mockNodeCache.flushAll).toHaveBeenCalled();
    });

    it('should return local cache stats', () => {
      mockNodeCache.getStats.mockReturnValue({ hits: 10, misses: 2 });
      const stats = cache.getStats();
      expect(stats).toEqual({ type: 'local', hits: 10, misses: 2 });
    });
  });

  describe('Redis Cache (With REDIS_URL)', () => {
    beforeEach(() => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      cache = require('../../src/utils/cache');
    });

    it('should set and get values from redis', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify('redis-value'));
      
      await cache.set('testNamespace', 'testKey', 'redis-value');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'cache:testNamespace:testKey', 
        JSON.stringify('redis-value'), 
        'EX', 
        300
      );

      const result = await cache.get('testNamespace', 'testKey');
      expect(mockRedis.get).toHaveBeenCalledWith('cache:testNamespace:testKey');
      expect(result).toBe('redis-value');
    });

    it('should handle redis get error gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      
      const result = await cache.get('testNamespace', 'testKey');
      expect(mockLogger.error).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should handle redis set error gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));
      
      await cache.set('testNamespace', 'testKey', 'value');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle redis del error gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));
      
      await cache.del('testNamespace', 'testKey');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should delete keys from redis', async () => {
      await cache.del('testNamespace', 'testKey');
      expect(mockRedis.del).toHaveBeenCalledWith('cache:testNamespace:testKey');
    });

    it('should flush a namespace from redis using scanStream', async () => {
      const mockStream = {
        on: jest.fn((event, cb) => {
          if (event === 'data') {
            cb(['cache:ns1:k1', 'cache:ns1:k2']);
          }
          return mockStream;
        })
      };
      mockRedis.scanStream.mockReturnValue(mockStream);
      
      const mockPipeline = {
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      await cache.flush('ns1');
      expect(mockRedis.scanStream).toHaveBeenCalledWith({ match: 'cache:ns1:*' });
      expect(mockPipeline.del).toHaveBeenCalledWith('cache:ns1:k1');
      expect(mockPipeline.del).toHaveBeenCalledWith('cache:ns1:k2');
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should flush all keys from redis', async () => {
      await cache.flushAll();
      expect(mockRedis.flushdb).toHaveBeenCalled();
    });

    it('should return redis stats', () => {
      const stats = cache.getStats();
      expect(stats).toEqual({ type: 'redis', status: 'ready' });
    });

    it('should handle redis flush error gracefully', async () => {
      mockRedis.scanStream.mockImplementation(() => {
        throw new Error('Scan error');
      });
      
      await cache.flush('ns1');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle redis flushAll error gracefully', async () => {
      mockRedis.flushdb.mockRejectedValue(new Error('FlushAll error'));
      
      await cache.flushAll();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Initialization Errors', () => {
    it('should handle Redis initialization failure', () => {
      const ioredis = require('ioredis');
      ioredis.mockImplementationOnce(() => {
        throw new Error('Connection failed');
      });
      
      process.env.REDIS_URL = 'redis://localhost:6379';
      cache = require('../../src/utils/cache');
      
      expect(mockLogger.error).toHaveBeenCalledWith('[Cache] Failed to initialize Redis:', expect.any(Error));
    });
  });
});
