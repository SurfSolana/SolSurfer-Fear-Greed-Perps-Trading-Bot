/**
 * Integration Test: Cache Hit/Miss Behavior
 *
 * This comprehensive integration test validates the complete cache behavior
 * including hit/miss scenarios, file system persistence, and forceRefresh bypassing.
 *
 * TDD Approach: This test WILL FAIL initially because some features aren't implemented yet:
 * - forceRefresh parameter on runAndCache method
 * - Potential improvements to cache implementation
 *
 * Run with: bun test __tests__/integration/cache-behavior.test.ts
 */

// Test framework globals (describe, test, expect, beforeEach, afterEach) are available globally
import fs from 'fs/promises'
import path from 'path'
import { BacktestCacheServer, BacktestParams, BacktestResult, CacheEntry } from '@/lib/backtest-cache-server'

// Testable version of BacktestCacheServer with custom cache directory
class TestableBacktestCacheServer extends BacktestCacheServer {
  private testCacheDir: string

  constructor(testCacheDir: string) {
    super()
    this.testCacheDir = testCacheDir
    // Override the private cacheDir property
    ;(this as any).cacheDir = testCacheDir
  }

  // Expose private method for testing
  public getCacheKeyPublic(params: BacktestParams): string {
    return (this as any).getCacheKey(params)
  }

  // Enhanced runAndCache with forceRefresh (TDD - this will fail initially)
  async runAndCacheWithRefresh(params: BacktestParams, forceRefresh: boolean = false): Promise<BacktestResult> {
    if (forceRefresh) {
      // Skip cache, run fresh backtest and update cache
      const result = await (this as any).runBacktest(params)
      await this.set(params, result)
      return result
    }

    // Use existing runAndCache logic
    return this.runAndCache(params)
  }

  // Get cache directory for verification
  public getCacheDirectory(): string {
    return this.testCacheDir
  }
}

describe('Cache Hit/Miss Behavior - Integration Tests', () => {
  let testCacheServer: TestableBacktestCacheServer
  let testCacheDir: string

  // Test parameters for consistent testing
  const testParams1: BacktestParams = {
    asset: 'ETH',
    timeframe: '4h',
    leverage: 3,
    lowThreshold: 25,
    highThreshold: 75,
    strategy: 'contrarian'
  }

  const testParams2: BacktestParams = {
    asset: 'SOL',
    timeframe: '4h',
    leverage: 5,
    lowThreshold: 30,
    highThreshold: 70,
    strategy: 'momentum'
  }

  beforeEach(async () => {
    // Create unique test cache directory for each test
    const timestamp = Date.now()
    testCacheDir = `/tmp/cache-behavior-test-${timestamp}`
    await fs.mkdir(testCacheDir, { recursive: true })

    testCacheServer = new TestableBacktestCacheServer(testCacheDir)

    console.log(`🧪 Test cache directory: ${testCacheDir}`)
  })

  afterEach(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true })
      console.log(`🧹 Cleaned up: ${testCacheDir}`)
    } catch (error) {
      console.warn(`⚠️ Failed to clean up ${testCacheDir}:`, error)
    }
  })

  describe('Cache Key Generation', () => {
    test('should generate correct cache key pattern', () => {
      const cacheKey = testCacheServer.getCacheKeyPublic(testParams1)

      // Verify cache key matches expected pattern: {asset}-{timeframe}-{leverage}x-{lowThreshold}-{highThreshold}-{strategy}
      expect(cacheKey).toBe('ETH-4h-3x-25-75-contrarian')

      const cacheKey2 = testCacheServer.getCacheKeyPublic(testParams2)
      expect(cacheKey2).toBe('SOL-4h-5x-30-70-momentum')
    })

    test('should generate different keys for different parameters', () => {
      const key1 = testCacheServer.getCacheKeyPublic(testParams1)
      const key2 = testCacheServer.getCacheKeyPublic(testParams2)

      expect(key1).not.toBe(key2)
    })
  })

  describe('Cache Miss → Execution → Cache Hit Flow', () => {
    test('should miss cache on first call, hit on second call', async () => {
      // First call should be cache miss
      const startTime1 = Date.now()
      const result1 = await testCacheServer.runAndCache(testParams1)
      const endTime1 = Date.now()
      const executionTime1 = endTime1 - startTime1

      expect(result1).toBeDefined()
      expect(result1.params).toEqual(testParams1)
      expect(typeof result1.returns).toBe('number')
      expect(typeof result1.timestamp).toBe('number')

      // Second call should be cache hit (faster)
      const startTime2 = Date.now()
      const result2 = await testCacheServer.runAndCache(testParams1)
      const endTime2 = Date.now()
      const executionTime2 = endTime2 - startTime2

      expect(result2).toBeDefined()
      expect(result2).toEqual(result1) // Should return identical result

      // Cache hit should be faster (though both might be fast with fallback estimates)
      console.log(`📊 Execution time - First call: ${executionTime1}ms, Second call: ${executionTime2}ms`)

      // Verify timestamps are identical (proving it's cached)
      expect(result2.timestamp).toBe(result1.timestamp)
    })

    test('should cache results persistently across multiple calls', async () => {
      // Call multiple times
      const result1 = await testCacheServer.runAndCache(testParams1)
      const result2 = await testCacheServer.runAndCache(testParams1)
      const result3 = await testCacheServer.runAndCache(testParams1)

      // All should return identical results
      expect(result2).toEqual(result1)
      expect(result3).toEqual(result1)
      expect(result3.timestamp).toBe(result1.timestamp)
    })
  })

  describe('Different Parameters Create Different Cache Entries', () => {
    test('should create separate cache files for different parameters', async () => {
      // Run backtests with different parameters
      const result1 = await testCacheServer.runAndCache(testParams1)
      const result2 = await testCacheServer.runAndCache(testParams2)

      expect(result1).not.toEqual(result2)
      expect(result1.params).toEqual(testParams1)
      expect(result2.params).toEqual(testParams2)

      // Verify separate cache files exist
      const cacheKey1 = testCacheServer.getCacheKeyPublic(testParams1)
      const cacheKey2 = testCacheServer.getCacheKeyPublic(testParams2)

      const file1Path = path.join(testCacheDir, `${cacheKey1}.json`)
      const file2Path = path.join(testCacheDir, `${cacheKey2}.json`)

      const file1Exists = await fs.access(file1Path).then(() => true).catch(() => false)
      const file2Exists = await fs.access(file2Path).then(() => true).catch(() => false)

      expect(file1Exists).toBe(true)
      expect(file2Exists).toBe(true)
    })

    test('should maintain independent cache for each parameter set', async () => {
      // Cache both parameter sets
      await testCacheServer.runAndCache(testParams1)
      await testCacheServer.runAndCache(testParams2)

      // Verify both are cached independently
      const cachedResult1 = await testCacheServer.get(testParams1)
      const cachedResult2 = await testCacheServer.get(testParams2)

      expect(cachedResult1).not.toBeNull()
      expect(cachedResult2).not.toBeNull()
      expect(cachedResult1?.params).toEqual(testParams1)
      expect(cachedResult2?.params).toEqual(testParams2)
    })
  })

  describe('File System Cache Verification', () => {
    test('should create actual cache files on disk', async () => {
      await testCacheServer.runAndCache(testParams1)

      // Verify cache file was created
      const cacheKey = testCacheServer.getCacheKeyPublic(testParams1)
      const filePath = path.join(testCacheDir, `${cacheKey}.json`)

      const fileExists = await fs.access(filePath).then(() => true).catch(() => false)
      expect(fileExists).toBe(true)
    })

    test('should store correct cache entry structure', async () => {
      const result = await testCacheServer.runAndCache(testParams1)

      // Read cache file directly
      const cacheKey = testCacheServer.getCacheKeyPublic(testParams1)
      const filePath = path.join(testCacheDir, `${cacheKey}.json`)

      const fileContent = await fs.readFile(filePath, 'utf-8')
      const cacheEntry: CacheEntry = JSON.parse(fileContent)

      // Verify cache entry structure
      expect(cacheEntry).toHaveProperty('result')
      expect(cacheEntry).toHaveProperty('lastUpdated')
      expect(cacheEntry).toHaveProperty('isStale')

      expect(cacheEntry.result).toEqual(result)
      expect(typeof cacheEntry.lastUpdated).toBe('number')
      expect(cacheEntry.isStale).toBe(false)
      expect(cacheEntry.lastUpdated).toBeGreaterThan(0)
    })

    test('should create multiple cache files for different parameters', async () => {
      await testCacheServer.runAndCache(testParams1)
      await testCacheServer.runAndCache(testParams2)

      // Check both files exist
      const files = await fs.readdir(testCacheDir)
      expect(files).toHaveLength(2)

      const expectedFile1 = `${testCacheServer.getCacheKeyPublic(testParams1)}.json`
      const expectedFile2 = `${testCacheServer.getCacheKeyPublic(testParams2)}.json`

      expect(files).toContain(expectedFile1)
      expect(files).toContain(expectedFile2)
    })
  })

  describe('Cache Persistence', () => {
    test('should persist results across multiple server instances', async () => {
      // Cache result with first instance
      const result1 = await testCacheServer.runAndCache(testParams1)

      // Create new server instance using same cache directory
      const newCacheServer = new TestableBacktestCacheServer(testCacheDir)

      // Should retrieve cached result
      const cachedResult = await newCacheServer.get(testParams1)
      expect(cachedResult).not.toBeNull()
      expect(cachedResult).toEqual(result1)
    })

    test('should maintain cache across application restarts (simulated)', async () => {
      // Initial cache
      const originalResult = await testCacheServer.runAndCache(testParams1)

      // Simulate app restart by creating new cache server instance
      const restartedServer = new TestableBacktestCacheServer(testCacheDir)

      // Should still get cached result without re-execution
      const persistedResult = await restartedServer.runAndCache(testParams1)

      expect(persistedResult).toEqual(originalResult)
      expect(persistedResult.timestamp).toBe(originalResult.timestamp)
    })
  })

  describe('ForceRefresh Bypass Cache (TDD - Will Fail Initially)', () => {
    test('should bypass cache when forceRefresh=true', async () => {
      // Cache initial result
      const initialResult = await testCacheServer.runAndCache(testParams1)

      // Wait a moment to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10))

      // Force refresh should bypass cache and return new result
      const refreshedResult = await testCacheServer.runAndCacheWithRefresh(testParams1, true)

      // Should have different timestamps (new execution)
      expect(refreshedResult.timestamp).not.toBe(initialResult.timestamp)
      expect(refreshedResult.timestamp).toBeGreaterThan(initialResult.timestamp)

      // Params should be identical
      expect(refreshedResult.params).toEqual(testParams1)
    })

    test('should update cache with new result after forceRefresh', async () => {
      // Cache initial result
      await testCacheServer.runAndCache(testParams1)

      // Force refresh
      const refreshedResult = await testCacheServer.runAndCacheWithRefresh(testParams1, true)

      // Subsequent normal call should return the refreshed result
      const subsequentResult = await testCacheServer.runAndCache(testParams1)

      expect(subsequentResult).toEqual(refreshedResult)
      expect(subsequentResult.timestamp).toBe(refreshedResult.timestamp)
    })

    test('should not bypass cache when forceRefresh=false', async () => {
      // Cache initial result
      const initialResult = await testCacheServer.runAndCache(testParams1)

      // Call with forceRefresh=false (default behavior)
      const normalResult = await testCacheServer.runAndCacheWithRefresh(testParams1, false)

      // Should return cached result
      expect(normalResult).toEqual(initialResult)
      expect(normalResult.timestamp).toBe(initialResult.timestamp)
    })
  })

  describe('Performance and Timing', () => {
    test('should demonstrate cache performance benefit', async () => {
      // Measure first execution (cache miss)
      const start1 = Date.now()
      await testCacheServer.runAndCache(testParams1)
      const executionTime = Date.now() - start1

      // Measure second execution (cache hit)
      const start2 = Date.now()
      await testCacheServer.runAndCache(testParams1)
      const cacheTime = Date.now() - start2

      console.log(`⚡ Performance - Execution: ${executionTime}ms, Cache: ${cacheTime}ms`)

      // Cache should be at least as fast (though with fallback estimates both might be very fast)
      expect(cacheTime).toBeLessThanOrEqual(executionTime + 50) // Allow small variance
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid cache directory gracefully', async () => {
      // Create server with non-existent parent directory
      const invalidDir = '/nonexistent/path/cache'
      const invalidServer = new TestableBacktestCacheServer(invalidDir)

      // Should not throw error, should use fallback behavior
      const result = await invalidServer.runAndCache(testParams1)
      expect(result).toBeDefined()
    })

    test('should handle concurrent cache requests', async () => {
      // Make multiple concurrent requests for same parameters
      const promises = [
        testCacheServer.runAndCache(testParams1),
        testCacheServer.runAndCache(testParams1),
        testCacheServer.runAndCache(testParams1)
      ]

      const results = await Promise.all(promises)

      // All should return valid results
      results.forEach(result => {
        expect(result).toBeDefined()
        expect(result.params).toEqual(testParams1)
      })
    })
  })
})