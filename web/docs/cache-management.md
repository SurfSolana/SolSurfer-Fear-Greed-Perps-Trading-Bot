# Backtest Results Cache Management

This document provides comprehensive information about the Lifeguard Token Vault backtest caching system, including structure, file formats, maintenance procedures, and operational guidance.

## Overview

The backtest cache system provides instant interactive feedback for the split sea visualization by caching computationally expensive backtesting results. The system uses file-based JSON storage with both temporary and permanent cache tiers.

## Cache Directory Structure

### Primary Cache Locations

```
web/.cache/backtests/
├── permanent/                    # Permanent cache for historical data
│   ├── ETH-4h-3x-25-75-contrarian-2024-01-01-2024-03-31.json
│   └── SOL-4h-5x-30-70-momentum-2024-01-01-2024-03-31.json
└── temporary/                    # Temporary cache (24hr TTL)
    ├── ETH-4h-2x-30-70-contrarian.json
    └── BTC-4h-1x-45-55-momentum.json
```

### Cache Key Pattern

Cache keys follow the pattern:
```
{asset}-{timeframe}-{leverage}x-{lowThreshold}-{highThreshold}-{strategy}[-{dateRange}]
```

**Examples:**
- `ETH-4h-3x-25-75-contrarian` - Current data cache
- `SOL-4h-5x-30-70-momentum-2024-01-01-2024-03-31` - Historical data cache

## Cache File Format

Each cache file contains a JSON object with the following structure:

```json
{
  "key": "ETH-4h-3x-25-75-contrarian",
  "result": {
    "returns": 45.2,
    "maxDrawdown": 12.5,
    "winRate": 68.3,
    "sharpeRatio": 1.85,
    "trades": 142,
    "fees": 1.5,
    "liquidated": false,
    "timestamp": 1694612345678,
    "params": {
      "asset": "ETH",
      "timeframe": "4h",
      "leverage": 3,
      "lowThreshold": 25,
      "highThreshold": 75,
      "strategy": "contrarian"
    },
    "executionTime": 2340,
    "profitFactor": 3.62,
    "avgWin": 0.85,
    "avgLoss": -0.23
  },
  "computedAt": 1694612345678,
  "accessCount": 15,
  "lastAccessed": 1694612445678,
  "isPermanent": false,
  "version": "1.0"
}
```

### Field Descriptions

#### Cache Entry Fields
- **key**: Unique identifier for the cache entry
- **result**: Complete backtest result object
- **computedAt**: Unix timestamp when the backtest was computed
- **accessCount**: Number of times this cache entry has been accessed
- **lastAccessed**: Unix timestamp of last access
- **isPermanent**: Boolean indicating if entry persists permanently
- **version**: Cache entry format version

#### Backtest Result Fields
- **returns**: Percentage returns over the backtesting period
- **maxDrawdown**: Maximum drawdown percentage experienced
- **winRate**: Win rate percentage (successful trades / total trades)
- **sharpeRatio**: Risk-adjusted return metric
- **trades**: Total number of trades executed
- **fees**: Total fees paid during backtesting
- **liquidated**: Boolean indicating if position was liquidated
- **timestamp**: Unix timestamp when backtest was computed
- **params**: Original parameters used for the backtest
- **executionTime**: Time in milliseconds taken to compute the backtest
- **profitFactor**: Gross profit divided by gross loss
- **avgWin**: Average size of winning trades
- **avgLoss**: Average size of losing trades

## Cache Behavior

### Cache Hit Priority
1. **Permanent Cache** - Checked first for historical data
2. **Temporary Cache** - Checked if permanent cache misses
3. **Fresh Computation** - Only if no valid cache exists

### Cache TTL (Time To Live)
- **Permanent Cache**: Never expires (historical data)
- **Temporary Cache**: 24 hours (86,400,000 milliseconds)

### Automatic Promotion to Permanent
Cache entries are automatically promoted to permanent storage when:
- `params.dateRange` is defined (historical backtests)
- `permanent` flag is explicitly set to `true`

## Performance Characteristics

### Cache Hit Performance
- **Target Response Time**: < 100ms
- **Typical Response Time**: 10-50ms
- **Direct Cache Access**: < 50ms

### Cache Miss Performance
- **Full Backtest Execution**: 1,000-5,000ms
- **Fallback Estimate**: 100-200ms

### Logging Output
The system provides detailed logging for monitoring performance:

```
[CACHE HIT] Permanent cache hit for ETH-4h-3x-25-75-contrarian in 15ms
[CACHE MISS] No cache entry found for SOL-4h-5x-30-70-momentum
[BACKTEST FLOW] Starting runAndCache for BTC-4h-2x-40-60-contrarian
[BACKTEST EXEC] Starting backtest execution for BTC-4h-2x-40-60-contrarian
[BACKTEST EXEC] Backtest execution completed for BTC-4h-2x-40-60-contrarian in 2340ms
[BACKTEST FLOW] Complete flow (miss + execution + cache) for BTC-4h-2x-40-60-contrarian in 2355ms
```

## Cache Management Operations

### Clearing Cache

#### Clear All Temporary Cache
```bash
rm -rf web/.cache/backtests/*.json
```

#### Clear All Cache (Including Permanent)
```bash
rm -rf web/.cache/backtests/
```

#### Clear Specific Asset Cache
```bash
rm -f web/.cache/backtests/ETH-*
rm -f web/.cache/backtests/permanent/ETH-*
```

#### Clear Stale Cache Only
The system provides built-in stale cache cleanup:

```typescript
import { backtestCacheServer } from '@/lib/backtest-cache-server'

// Removes entries older than 24 hours from temporary cache
await backtestCacheServer.cleanStale()
```

### Warming Cache

#### Warm Cache for Common Parameters
Use the cache warmer script to pre-populate cache:

```bash
cd web/
bun run scripts/cache-warmer.ts
```

#### Warm Cache via API Endpoint
```bash
curl -X POST http://localhost:3000/api/backtest/warm-cache
```

#### Programmatic Cache Warming
```typescript
import { backtestCacheServer } from '@/lib/backtest-cache-server'

const commonParams = {
  asset: 'ETH' as const,
  timeframe: '4h' as const,
  leverage: 3,
  lowThreshold: 25,
  highThreshold: 75,
  strategy: 'contrarian' as const
}

// Warm cache with permanent storage
await backtestCacheServer.runAndCache(commonParams, true)
```

## Maintenance Procedures

### Daily Maintenance

1. **Monitor Cache Size**
   ```bash
   du -sh web/.cache/backtests/
   ```

2. **Clean Stale Entries**
   ```typescript
   await backtestCacheServer.cleanStale()
   ```

3. **Check Cache Hit Rates** - Monitor application logs for cache performance

### Weekly Maintenance

1. **Archive Old Permanent Cache** (if needed)
   ```bash
   # Move old permanent cache entries to archive
   mkdir -p web/.cache/backtests/archive/$(date +%Y-%m-%d)
   find web/.cache/backtests/permanent/ -name "*2024-*" -mtime +30 \
     -exec mv {} web/.cache/backtests/archive/$(date +%Y-%m-%d)/ \;
   ```

2. **Regenerate Cache for Changed Parameters**
   ```bash
   # Force refresh of commonly used parameter sets
   curl -X POST http://localhost:3000/api/backtest/execute \
     -H "Content-Type: application/json" \
     -d '{"params": {...}, "forceRefresh": true}'
   ```

### Emergency Procedures

#### Cache Corruption Recovery
1. Stop the application
2. Remove corrupted cache files
3. Restart application (cache will rebuild automatically)

```bash
# Example: Remove all cache and rebuild
rm -rf web/.cache/backtests/
mkdir -p web/.cache/backtests/permanent
# Application will recreate cache structure on restart
```

#### Performance Degradation
1. Check cache hit rates in logs
2. Clear temporary cache if hit rates are low
3. Warm cache with common parameter sets
4. Monitor response times with performance tests

## Monitoring and Diagnostics

### Performance Testing
Run the performance test suite to validate cache performance:

```bash
cd web/
bun test __tests__/performance/cache-speed.test.ts
```

### Cache Statistics
Monitor cache performance with built-in methods:

```typescript
import { backtestCacheServer } from '@/lib/backtest-cache-server'

// Get all cached results for an asset
const ethResults = await backtestCacheServer.getAllForAsset('ETH', '4h')
console.log(`ETH 4h cache entries: ${ethResults.length}`)
```

### Log Analysis
Monitor application logs for cache performance patterns:

```bash
# Filter cache-related logs
grep "CACHE\|BACKTEST" application.log | tail -100

# Monitor cache hit rates
grep "CACHE HIT" application.log | wc -l
grep "CACHE MISS" application.log | wc -l
```

## Configuration

### Cache Directory Configuration
The cache directory can be configured in the BacktestCacheServer constructor:

```typescript
class BacktestCacheServer {
  private cacheDir = '/Users/alexnewman/Scripts/lifeguard-token-vault/web/.cache/backtests'
  private permanentCacheDir = '/Users/alexnewman/Scripts/lifeguard-token-vault/web/.cache/backtests/permanent'
  // ...
}
```

### Stale Threshold Configuration
Adjust cache TTL by modifying the stale threshold:

```typescript
private staleThreshold = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
```

## Best Practices

### Development
1. **Use temporary cache** for development and testing
2. **Clear cache regularly** when changing backtest logic
3. **Monitor performance tests** to detect regressions
4. **Use fallback estimates** for quick UI responses

### Production
1. **Pre-warm cache** with common parameter sets
2. **Monitor cache hit rates** and response times
3. **Archive old permanent cache** entries periodically
4. **Set up automated stale cache cleanup**

### Performance Optimization
1. **Batch similar requests** to improve cache utilization
2. **Use permanent cache** for historical data that won't change
3. **Monitor and optimize** cache key patterns
4. **Regular performance testing** to maintain sub-100ms cache hits

## Troubleshooting

### Common Issues

#### Slow Cache Performance
- **Symptoms**: Cache hits > 100ms
- **Solutions**:
  - Check disk I/O performance
  - Verify cache directory permissions
  - Run performance tests to identify bottlenecks

#### Cache Misses Despite Recent Computation
- **Symptoms**: Unexpected cache misses
- **Solutions**:
  - Verify parameter matching (case-sensitive)
  - Check stale threshold configuration
  - Ensure cache directory permissions

#### Cache Directory Growing Too Large
- **Symptoms**: High disk usage
- **Solutions**:
  - Run cleanStale() method
  - Archive old permanent entries
  - Reduce stale threshold if appropriate

### Emergency Contacts

For critical cache issues affecting production:
1. Check application logs for specific error messages
2. Restart application (cache rebuilds automatically)
3. Consider temporary fallback to estimates only
4. Contact development team with specific log entries

---

*This documentation covers the complete backtest cache management system. For implementation details, see `/web/lib/backtest-cache-server.ts`. For performance validation, see `/web/__tests__/performance/cache-speed.test.ts`.*