/**
 * Performance Test: Cache Hit Speed Validation
 *
 * This test validates that cache hits occur within 100ms as required.
 * Tests multiple sequential cache hits and measures response times.
 *
 * TDD Approach: Tests cache performance requirements.
 *
 * Requirements:
 * - Cache hits must be < 100ms
 * - Multiple sequential cache hits should maintain performance
 * - Performance should be consistent across different parameter sets
 *
 * Run with: bun test __tests__/performance/cache-speed.test.ts
 */

// Test framework globals (describe, test, expect, beforeEach, afterEach) are available globally
import fs from 'fs/promises'
import { BacktestCacheServer } from '@/lib/backtest-cache-server'
import { BacktestParams, BacktestResult } from '@/lib/backtest-types'

// Testable version of BacktestCacheServer with custom cache directory
class TestableBacktestCacheServer extends BacktestCacheServer {
  private testCacheDir: string

  constructor(testCacheDir: string) {
    super()
    this.testCacheDir = testCacheDir
    // Override the private cacheDir property
    ;(this as any).cacheDir = testCacheDir
    ;(this as any).permanentCacheDir = testCacheDir + '/permanent'
  }

  // Get cache directory for verification
  public getCacheDirectory(): string {
    return this.testCacheDir
  }
}

describe('Cache Performance Tests - Sub-100ms Response Times', () => {
  let testCacheServer: TestableBacktestCacheServer
  let testCacheDir: string

  // Test parameters for performance testing
  const fastTestParams: BacktestParams = {
    asset: 'ETH',
    timeframe: '4h',
    leverage: 2,
    lowThreshold: 30,
    highThreshold: 70,
    strategy: 'contrarian'
  }

  const alternateParams: BacktestParams = {
    asset: 'SOL',
    timeframe: '4h',
    leverage: 3,
    lowThreshold: 25,
    highThreshold: 75,
    strategy: 'momentum'
  }

  beforeEach(async () => {
    // Create unique test cache directory for each test
    const timestamp = Date.now()
    testCacheDir = `/tmp/cache-performance-test-${timestamp}`
    await fs.mkdir(testCacheDir, { recursive: true })
    await fs.mkdir(`${testCacheDir}/permanent`, { recursive: true })

    testCacheServer = new TestableBacktestCacheServer(testCacheDir)

    console.log(`⚡ Performance test cache: ${testCacheDir}`)
  })

  afterEach(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true })
    } catch (error) {
      console.warn(`⚠️ Failed to clean up ${testCacheDir}:`, error)
    }
  })

  describe('Single Cache Hit Performance', () => {
    test('should achieve cache hit in under 100ms', async () => {
      // Prime the cache with initial execution
      await testCacheServer.runAndCache(fastTestParams)

      // Measure cache hit performance
      const startTime = Date.now()
      const result = await testCacheServer.runAndCache(fastTestParams)
      const responseTime = Date.now() - startTime

      console.log(`🎯 Single cache hit response time: ${responseTime}ms`)

      // Verify result is valid
      expect(result).toBeDefined()
      expect(result.params).toEqual(fastTestParams)
      expect(typeof result.returns).toBe('number')

      // Critical performance requirement: < 100ms
      expect(responseTime).toBeLessThan(100)
    })

    test('should achieve direct cache get in under 50ms', async () => {
      // Prime the cache
      await testCacheServer.runAndCache(fastTestParams)

      // Measure direct cache get performance
      const startTime = Date.now()
      const cachedResult = await testCacheServer.get(fastTestParams)
      const responseTime = Date.now() - startTime

      console.log(`🎯 Direct cache get response time: ${responseTime}ms`)

      // Verify result is valid
      expect(cachedResult).not.toBeNull()
      expect(cachedResult?.params).toEqual(fastTestParams)

      // Direct cache access should be even faster
      expect(responseTime).toBeLessThan(50)
    })
  })

  describe('Multiple Sequential Cache Hits Performance', () => {
    test('should maintain sub-100ms performance across 10 sequential cache hits', async () => {
      // Prime the cache
      await testCacheServer.runAndCache(fastTestParams)

      const responseTimes: number[] = []
      const results: BacktestResult[] = []

      // Execute 10 sequential cache hits
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now()
        const result = await testCacheServer.runAndCache(fastTestParams)
        const responseTime = Date.now() - startTime

        responseTimes.push(responseTime)
        results.push(result)
      }

      // Log performance stats
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      const maxResponseTime = Math.max(...responseTimes)
      const minResponseTime = Math.min(...responseTimes)

      console.log(`📊 Sequential cache hits (10x):`)
      console.log(`   Average: ${avgResponseTime.toFixed(1)}ms`)
      console.log(`   Max: ${maxResponseTime}ms`)
      console.log(`   Min: ${minResponseTime}ms`)
      console.log(`   All times: ${responseTimes.map(t => `${t}ms`).join(', ')}`)

      // Verify all results are identical (proving cache consistency)
      results.forEach((result, index) => {
        expect(result.timestamp).toBe(results[0].timestamp)
        expect(result.params).toEqual(fastTestParams)
      })

      // Performance requirements
      expect(avgResponseTime).toBeLessThan(100)
      expect(maxResponseTime).toBeLessThan(100)

      // All individual hits should be under 100ms
      responseTimes.forEach((responseTime, index) => {
        expect(responseTime).toBeLessThan(100)
      })
    })

    test('should maintain sub-100ms performance with concurrent cache hits', async () => {
      // Prime the cache
      await testCacheServer.runAndCache(fastTestParams)

      // Execute 5 concurrent cache hits
      const startTime = Date.now()
      const promises = Array.from({ length: 5 }, () =>
        testCacheServer.runAndCache(fastTestParams)
      )

      const results = await Promise.all(promises)
      const totalResponseTime = Date.now() - startTime
      const avgResponseTimePerRequest = totalResponseTime / results.length

      console.log(`🔄 Concurrent cache hits (5x):`)
      console.log(`   Total time: ${totalResponseTime}ms`)
      console.log(`   Avg per request: ${avgResponseTimePerRequest.toFixed(1)}ms`)

      // Verify all results are identical
      results.forEach(result => {
        expect(result.timestamp).toBe(results[0].timestamp)
        expect(result.params).toEqual(fastTestParams)
      })

      // Even with concurrency, average should be well under 100ms
      expect(avgResponseTimePerRequest).toBeLessThan(100)
    })
  })

  describe('Multi-Parameter Cache Performance', () => {
    test('should maintain sub-100ms performance across different parameter sets', async () => {
      // Prime cache with both parameter sets
      await testCacheServer.runAndCache(fastTestParams)
      await testCacheServer.runAndCache(alternateParams)

      const responseTimes: { params: string, time: number }[] = []

      // Test cache hits for both parameter sets alternating
      for (let i = 0; i < 6; i++) {
        const params = i % 2 === 0 ? fastTestParams : alternateParams
        const paramsLabel = i % 2 === 0 ? 'ETH-contrarian' : 'SOL-momentum'

        const startTime = Date.now()
        const result = await testCacheServer.runAndCache(params)
        const responseTime = Date.now() - startTime

        responseTimes.push({ params: paramsLabel, time: responseTime })

        expect(result).toBeDefined()
        expect(result.params).toEqual(params)
      }

      // Log performance across parameter sets
      console.log(`🎛️ Multi-parameter cache performance:`)
      responseTimes.forEach(({ params, time }) => {
        console.log(`   ${params}: ${time}ms`)
      })

      const avgTime = responseTimes.reduce((sum, entry) => sum + entry.time, 0) / responseTimes.length
      console.log(`   Average: ${avgTime.toFixed(1)}ms`)

      // All responses should be under 100ms regardless of parameters
      responseTimes.forEach(({ params, time }) => {
        expect(time).toBeLessThan(100)
      })

      expect(avgTime).toBeLessThan(100)
    })
  })

  describe('Cache Performance Stress Test', () => {
    test('should maintain performance under rapid sequential access', async () => {
      // Prime the cache
      await testCacheServer.runAndCache(fastTestParams)

      const responseTimes: number[] = []
      const iterations = 25

      // Rapid sequential access
      console.log(`🏃 Starting rapid access test (${iterations} iterations)...`)

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now()
        await testCacheServer.get(fastTestParams)
        const responseTime = Date.now() - startTime
        responseTimes.push(responseTime)
      }

      // Calculate statistics
      const avgTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      const maxTime = Math.max(...responseTimes)
      const p95Time = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)]

      console.log(`📈 Rapid access performance (${iterations}x):`)
      console.log(`   Average: ${avgTime.toFixed(1)}ms`)
      console.log(`   Max: ${maxTime}ms`)
      console.log(`   P95: ${p95Time}ms`)

      // Performance requirements under stress
      expect(avgTime).toBeLessThan(50) // Direct cache access should be very fast
      expect(maxTime).toBeLessThan(100)
      expect(p95Time).toBeLessThan(75)

      // Count responses over 50ms (should be minimal)
      const slowResponses = responseTimes.filter(time => time > 50).length
      const slowResponseRate = (slowResponses / responseTimes.length) * 100

      console.log(`   Responses > 50ms: ${slowResponses} (${slowResponseRate.toFixed(1)}%)`)
      expect(slowResponseRate).toBeLessThan(20) // Less than 20% should be over 50ms
    })
  })

  describe('Performance Regression Detection', () => {
    test('should detect any performance degradation in cache system', async () => {
      // Prime cache with multiple different parameter sets
      const testParams = [
        { ...fastTestParams, leverage: 1 },
        { ...fastTestParams, leverage: 3 },
        { ...fastTestParams, leverage: 5 },
        { ...alternateParams, lowThreshold: 20 },
        { ...alternateParams, lowThreshold: 40 }
      ]

      // Prime all caches
      for (const params of testParams) {
        await testCacheServer.runAndCache(params)
      }

      const allResponseTimes: number[] = []

      // Test each parameter set multiple times
      for (const params of testParams) {
        for (let i = 0; i < 3; i++) {
          const startTime = Date.now()
          await testCacheServer.runAndCache(params)
          const responseTime = Date.now() - startTime
          allResponseTimes.push(responseTime)
        }
      }

      // Performance regression detection
      const avgTime = allResponseTimes.reduce((sum, time) => sum + time, 0) / allResponseTimes.length
      const maxTime = Math.max(...allResponseTimes)
      const p99Time = allResponseTimes.sort((a, b) => a - b)[Math.floor(allResponseTimes.length * 0.99)]

      console.log(`🔍 Performance regression test:`)
      console.log(`   Tests run: ${allResponseTimes.length}`)
      console.log(`   Average: ${avgTime.toFixed(1)}ms`)
      console.log(`   Max: ${maxTime}ms`)
      console.log(`   P99: ${p99Time}ms`)

      // Strict performance requirements
      expect(avgTime).toBeLessThan(75) // Overall average should be well under 100ms
      expect(maxTime).toBeLessThan(100) // No individual request should exceed 100ms
      expect(p99Time).toBeLessThan(90) // 99th percentile should be under 90ms

      // Performance consistency check
      const timeVariance = allResponseTimes.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / allResponseTimes.length
      const standardDeviation = Math.sqrt(timeVariance)

      console.log(`   Std deviation: ${standardDeviation.toFixed(1)}ms`)
      expect(standardDeviation).toBeLessThan(30) // Performance should be consistent
    })
  })
})