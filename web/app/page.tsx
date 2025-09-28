'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AppShell,
  Container,
  Grid,
  Card,
  Group,
  Text,
  Button,
  Badge,
  Stack,
  Paper,
  SegmentedControl,
  NumberInput,
  Select,
  Slider,
  Switch,
  ActionIcon,
  Indicator,
  Progress,
  ThemeIcon,
  Tabs,
  LoadingOverlay,
  Title,
  Divider,
  RingProgress,
  Center,
  Box,
  Tooltip,
  Modal,
  Alert,
  Anchor
} from '@mantine/core'
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconDeviceFloppy,
  IconChartLine,
  IconTrendingUp,
  IconTrendingDown,
  IconActivity,
  IconCoin,
  IconRefresh,
  IconAlertCircle,
  IconInfoCircle,
  IconChartCandle,
  IconAdjustmentsHorizontal,
  IconCurrencyBitcoin,
  IconCurrencyEthereum,
  IconCurrencySolana,
  IconMoodSmile,
  IconMoodSad,
  IconMoodNeutral,
  IconMoodCrazy,
  IconChevronRight,
  IconExternalLink
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useDisclosure } from '@mantine/hooks'
import { TradingParameters, TradingStatus } from '@/lib/types'
import { BacktestEquityChart } from '@/components/backtest-equity-chart'
import { StrategyCarousel } from '@/components/strategy-carousel'

interface RollingEquityPoint {
  timestamp: string
  price: number
  balance: number
  pnl: number
  drawdown: number
  fgi: number
  score: number
}

interface RollingSummary {
  startBalance: number
  endBalance: number
  totalReturnPct: number
  totalPnl: number
  maxDrawdown: number
  trades: number
  winRate: number
  periodStart: string
  periodEnd: string
}

interface RollingTradeSummary {
  direction: 'long' | 'short'
  entryTimestamp: string
  exitTimestamp?: string
  entryPrice: number
  exitPrice?: number
  entryFgi: number
  exitFgi?: number
  pnl?: number
  returnPct?: number
  leverage: number
  durationMinutes?: number
}

const assetIcons = {
  BTC: IconCurrencyBitcoin,
  ETH: IconCurrencyEthereum,
  SOL: IconCurrencySolana
}

const getFGIIcon = (value: number) => {
  if (value <= 25) return IconMoodSad
  if (value <= 50) return IconMoodNeutral
  if (value <= 75) return IconMoodSmile
  return IconMoodCrazy
}

const getFGIColor = (value: number) => {
  if (value <= 25) return 'red'
  if (value <= 45) return 'orange'
  if (value <= 55) return 'gray'
  if (value <= 75) return 'teal'
  return 'yellow'
}

const getFGILabel = (value: number) => {
  if (value <= 25) return 'EXTREME FEAR'
  if (value <= 45) return 'FEAR'
  if (value <= 55) return 'NEUTRAL'
  if (value <= 75) return 'GREED'
  return 'EXTREME GREED'
}

export default function TradingDashboard() {
  const [parameters, setParameters] = useState<TradingParameters>({
    asset: 'ETH',
    lowThreshold: 25,
    highThreshold: 75,
    leverage: 3,
    strategy: 'momentum'
  })

  const [botStatus, setBotStatus] = useState<TradingStatus>({
    isActive: false,
    mode: 'paper',
    connectionState: 'disconnected',
    lastUpdate: new Date().toISOString()
  })

  const [currentFGI, setCurrentFGI] = useState<number>(50)
  const [currentPnL, setCurrentPnL] = useState<number>(0)
  const [balance, setBalance] = useState<number | undefined>(undefined)
  const [dataInterval, setDataInterval] = useState<string>('4h')

  // Backtest states
  const [estimatedPnL, setEstimatedPnL] = useState(0)
  const [projectedBalance, setProjectedBalance] = useState(10000)
  const [backtestResult, setBacktestResult] = useState<any>(null)
  const [rollingSummary, setRollingSummary] = useState<RollingSummary | null>(null)
  const [rollingCurve, setRollingCurve] = useState<RollingEquityPoint[]>([])
  const [rollingTrades, setRollingTrades] = useState<RollingTradeSummary[]>([])
  const [rollingLoading, setRollingLoading] = useState(false)
  const [rollingError, setRollingError] = useState<string | null>(null)

  // Modal states
  const [startModalOpened, { open: openStartModal, close: closeStartModal }] = useDisclosure(false)
  const [stopModalOpened, { open: openStopModal, close: closeStopModal }] = useDisclosure(false)

  // Fetch current FGI
  const fetchFGI = useCallback(async () => {
    try {
      const res = await fetch('/api/fgi/current', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setCurrentFGI(Number(data.value) || 50)
      }
    } catch (e) {
      console.error('FGI fetch failed', e)
    }
  }, [])

  // Fetch bot status
  const fetchBotStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/bot/status', { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        setBotStatus({
          isActive: !!data.isRunning,
          mode: 'paper',
          connectionState: 'connected',
          lastUpdate: data.lastUpdate || new Date().toISOString()
        })
        setCurrentPnL(Number(data.currentPnL) || 0)
        if (typeof data.balance === 'number') setBalance(data.balance)
      }
    } catch (error) {
      console.error('Failed to fetch bot status:', error)
    }
  }, [])

  useEffect(() => {
    fetchFGI()
    fetchBotStatus()
    const i = setInterval(() => {
      fetchFGI()
      fetchBotStatus()
    }, 30000)
    return () => clearInterval(i)
  }, [fetchFGI, fetchBotStatus])

  // Estimate 30d rolling PnL
  const fetchEstimate = useCallback(async () => {
    try {
      const res = await fetch(`/api/backtest/sqlite?asset=${parameters.asset || 'ETH'}&strategy=${parameters.strategy || 'momentum'}&fgi=${parameters.lowThreshold ?? 25}&leverage=${parameters.leverage}`)

      if (res.ok) {
        const json = await res.json()
        if (json.success && json.data) {
          setBacktestResult(json.data)
          const monthlyReturnPct = Number(json.data.monthlyReturn) || 0
          const base = balance || 10000
          const pnl = (monthlyReturnPct / 100) * base
          setEstimatedPnL(pnl)
          setProjectedBalance(base + pnl)
        }
      }
    } catch (e) {
      console.error('estimate fetch failed', e)
    }
  }, [parameters, balance])

  useEffect(() => {
    const t = setTimeout(fetchEstimate, 50)
    return () => clearTimeout(t)
  }, [fetchEstimate])

  // Handlers
  const handleParametersChange = useCallback((p: Partial<TradingParameters>) => {
    setParameters(prev => ({ ...prev, ...p }))
  }, [])

  const handleStart = useCallback(async () => {
    try {
      const response = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parameters)
      })
      if (response.ok) {
        setBotStatus(prev => ({ ...prev, isActive: true }))
        notifications.show({
          title: 'Bot Started',
          message: 'Trading bot has been activated',
          color: 'green',
          icon: <IconPlayerPlay />
        })
        closeStartModal()
      }
    } catch (e) {
      console.error(e)
      notifications.show({
        title: 'Error',
        message: 'Failed to start trading bot',
        color: 'red'
      })
    }
  }, [parameters, closeStartModal])

  const handleStop = useCallback(async () => {
    try {
      const response = await fetch('/api/bot/stop', { method: 'POST' })
      if (response.ok) {
        setBotStatus(prev => ({ ...prev, isActive: false }))
        setCurrentPnL(0)
        notifications.show({
          title: 'Bot Stopped',
          message: 'Trading bot has been deactivated',
          color: 'orange',
          icon: <IconPlayerStop />
        })
        closeStopModal()
      }
    } catch (e) {
      console.error(e)
      notifications.show({
        title: 'Error',
        message: 'Failed to stop trading bot',
        color: 'red'
      })
    }
  }, [closeStopModal])

  const handleApplyStrategy = useCallback((strategy: any) => {
    setParameters({
      ...parameters,
      asset: strategy.asset.replace('-PERP', ''),
      strategy: strategy.strategy,
      lowThreshold: strategy.shortThreshold,
      highThreshold: strategy.longThreshold,
      leverage: strategy.leverage
    })
    notifications.show({
      title: 'Strategy Applied',
      message: `Applied ${strategy.strategy} strategy for ${strategy.asset}`,
      color: 'blue'
    })
  }, [parameters])

  const handleSave = useCallback(async () => {
    try {
      const response = await fetch('/api/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: parameters.asset || 'ETH',
          leverage: parameters.leverage,
          lowThreshold: parameters.lowThreshold ?? 49,
          highThreshold: parameters.highThreshold ?? 50,
          maxPositionRatio: 1.0,
          strategy: parameters.strategy || 'momentum',
          enabled: botStatus.isActive,
          timeframe: dataInterval || '4h'
        })
      })

      if (response.ok) {
        notifications.show({
          title: 'Settings Saved',
          message: 'Configuration has been saved successfully',
          color: 'green',
          icon: <IconDeviceFloppy />
        })
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
      notifications.show({
        title: 'Error',
        message: 'Failed to save configuration',
        color: 'red'
      })
    }
  }, [parameters, botStatus.isActive, dataInterval])

  const handleRun30DayBacktest = useCallback(async () => {
    setRollingLoading(true)
    setRollingError(null)
    try {
      const response = await fetch('/api/backtest/rolling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: parameters.asset || 'ETH',
          strategy: parameters.strategy || 'momentum',
          lowThreshold: parameters.lowThreshold ?? 25,
          highThreshold: parameters.highThreshold ?? 75,
          leverage: parameters.leverage,
          timeframe: dataInterval
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Failed to run backtest')
      }

      const json = await response.json()
      if (!json.success || !json.data) {
        throw new Error(json.error || 'Backtest response incomplete')
      }

      setRollingSummary(json.data.summary || null)
      setRollingCurve(json.data.equityCurve || [])
      setRollingTrades(json.data.trades || [])
    } catch (error: any) {
      console.error('Rolling backtest failed:', error)
      setRollingError(error?.message || 'Failed to run backtest')
      setRollingSummary(null)
      setRollingCurve([])
      setRollingTrades([])
    } finally {
      setRollingLoading(false)
    }
  }, [parameters, dataInterval])

  // Auto-run backtest on initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      handleRun30DayBacktest()
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const AssetIcon = assetIcons[parameters.asset as keyof typeof assetIcons] || IconCoin
  const FGIIcon = getFGIIcon(currentFGI)

  return (
    <AppShell
      header={{ height: 70 }}
      padding="md"
      style={{ background: 'var(--mantine-color-dark-8)' }}
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Group style={{ flex: 1 }}>
            <Title order={3}>Wave Trader</Title>
            <Badge size="sm" color="blue" variant="dot">
              Lifeguard Token Vault
            </Badge>
          </Group>

          <Group>
            <Indicator
              color={botStatus.isActive ? 'green' : 'gray'}
              processing={botStatus.isActive}
              size={10}
            >
              <Badge
                size="lg"
                color={botStatus.isActive ? 'green' : 'gray'}
                variant="filled"
              >
                {botStatus.isActive ? 'ACTIVE' : 'INACTIVE'}
              </Badge>
            </Indicator>

            <Button.Group>
              {!botStatus.isActive ? (
                <Button
                  leftSection={<IconPlayerPlay size={16} />}
                  color="green"
                  variant="filled"
                  onClick={openStartModal}
                >
                  Start Bot
                </Button>
              ) : (
                <Button
                  leftSection={<IconPlayerStop size={16} />}
                  color="red"
                  variant="filled"
                  onClick={openStopModal}
                >
                  Stop Bot
                </Button>
              )}
              <Button
                leftSection={<IconDeviceFloppy size={16} />}
                variant="light"
                onClick={handleSave}
              >
                Save Config
              </Button>
            </Button.Group>

            <Anchor href="/docs" size="sm" fw={600}>
              <Group gap={4}>
                Docs
                <IconExternalLink size={14} />
              </Group>
            </Anchor>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="xl" py="md">
          <Stack gap="lg">
            {/* Status Cards Row */}
            <Grid>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <Card shadow="sm" radius="md" withBorder>
                  <Group justify="space-between">
                    <div>
                      <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
                        Current P&L
                      </Text>
                      <Text
                        size="xl"
                        fw={700}
                        c={currentPnL >= 0 ? 'green' : 'red'}
                      >
                        {currentPnL >= 0 ? '+' : ''}{currentPnL.toFixed(2)}
                      </Text>
                    </div>
                    <ThemeIcon
                      color={currentPnL >= 0 ? 'green' : 'red'}
                      variant="light"
                      radius="md"
                      size="xl"
                    >
                      {currentPnL >= 0 ? <IconTrendingUp /> : <IconTrendingDown />}
                    </ThemeIcon>
                  </Group>
                </Card>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 3 }}>
                <Card shadow="sm" radius="md" withBorder>
                  <Group justify="space-between">
                    <div>
                      <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
                        Balance
                      </Text>
                      <Text size="xl" fw={700}>
                        ${balance?.toLocaleString() || '—'}
                      </Text>
                    </div>
                    <ThemeIcon color="blue" variant="light" radius="md" size="xl">
                      <IconCoin />
                    </ThemeIcon>
                  </Group>
                </Card>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 3 }}>
                <Card shadow="sm" radius="md" withBorder>
                  <Group justify="space-between">
                    <div>
                      <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
                        Fear & Greed
                      </Text>
                      <Group gap="xs">
                        <Text size="xl" fw={700}>
                          {currentFGI}
                        </Text>
                        <Badge color={getFGIColor(currentFGI)} size="sm">
                          {getFGILabel(currentFGI)}
                        </Badge>
                      </Group>
                    </div>
                    <RingProgress
                      size={50}
                      thickness={4}
                      roundCaps
                      sections={[
                        { value: currentFGI, color: getFGIColor(currentFGI) }
                      ]}
                      label={
                        <Center>
                          <FGIIcon size={20} />
                        </Center>
                      }
                    />
                  </Group>
                </Card>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 3 }}>
                <Card shadow="sm" radius="md" withBorder>
                  <Group justify="space-between">
                    <div>
                      <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
                        Est. Monthly
                      </Text>
                      <Text
                        size="xl"
                        fw={700}
                        c={estimatedPnL >= 0 ? 'green' : 'red'}
                      >
                        {estimatedPnL >= 0 ? '+' : ''}${Math.abs(estimatedPnL).toFixed(0)}
                      </Text>
                    </div>
                    <ThemeIcon color="violet" variant="light" radius="md" size="xl">
                      <IconChartLine />
                    </ThemeIcon>
                  </Group>
                </Card>
              </Grid.Col>
            </Grid>

            {/* Main Content Tabs */}
            <Tabs defaultValue="trading" variant="pills">
              <Tabs.List>
                <Tabs.Tab value="trading" leftSection={<IconChartCandle size={16} />}>
                  Trading
                </Tabs.Tab>
                <Tabs.Tab value="backtest" leftSection={<IconChartLine size={16} />}>
                  Backtest
                </Tabs.Tab>
                <Tabs.Tab value="strategies" leftSection={<IconAdjustmentsHorizontal size={16} />}>
                  Strategies
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="trading" pt="md">
                <Stack gap="md">
                  {/* Trading Parameters */}
                  <Paper shadow="xs" radius="md" p="lg" withBorder>
                    <Title order={4} mb="md">Trading Parameters</Title>
                    <Grid>
                      <Grid.Col span={{ base: 12, md: 6 }}>
                        <Stack gap="md">
                          <Select
                            label="Asset"
                            leftSection={<AssetIcon size={16} />}
                            value={parameters.asset}
                            onChange={(value) => handleParametersChange({ asset: value as 'BTC' | 'ETH' | 'SOL' })}
                            data={[
                              { value: 'BTC', label: 'Bitcoin' },
                              { value: 'ETH', label: 'Ethereum' },
                              { value: 'SOL', label: 'Solana' }
                            ]}
                          />

                          <SegmentedControl
                            label="Strategy"
                            value={parameters.strategy || 'momentum'}
                            onChange={(value) => handleParametersChange({ strategy: value as 'momentum' | 'contrarian' })}
                            data={[
                              { label: 'Momentum', value: 'momentum' },
                              { label: 'Contrarian', value: 'contrarian' }
                            ]}
                            color={parameters.strategy === 'momentum' ? 'cyan' : 'violet'}
                          />

                          <Select
                            label="Data Interval"
                            value={dataInterval}
                            onChange={setDataInterval}
                            data={[
                              { value: '15min', label: '15 minutes' },
                              { value: '1h', label: '1 hour' },
                              { value: '4h', label: '4 hours' }
                            ]}
                          />
                        </Stack>
                      </Grid.Col>

                      <Grid.Col span={{ base: 12, md: 6 }}>
                        <Stack gap="md">
                          <Box>
                            <Text size="sm" fw={500} mb={8}>
                              FGI Thresholds
                            </Text>
                            <Group gap="xs">
                              <NumberInput
                                label="Low"
                                value={parameters.lowThreshold}
                                onChange={(value) => handleParametersChange({
                                  lowThreshold: Number(value),
                                  highThreshold: Math.max(parameters.highThreshold ?? 75, Number(value) + 1)
                                })}
                                min={5}
                                max={50}
                                step={5}
                                styles={{ input: { width: 80 } }}
                              />
                              <Text mt="xl">—</Text>
                              <NumberInput
                                label="High"
                                value={parameters.highThreshold}
                                onChange={(value) => handleParametersChange({
                                  highThreshold: Number(value),
                                  lowThreshold: Math.min(parameters.lowThreshold ?? 25, Number(value) - 1)
                                })}
                                min={50}
                                max={95}
                                step={5}
                                styles={{ input: { width: 80 } }}
                              />
                            </Group>
                          </Box>

                          <Box>
                            <Text size="sm" fw={500} mb={8}>
                              Leverage: {parameters.leverage}x
                            </Text>
                            <Slider
                              value={parameters.leverage}
                              onChange={(value) => handleParametersChange({ leverage: value })}
                              min={1}
                              max={10}
                              marks={[
                                { value: 1, label: '1x' },
                                { value: 5, label: '5x' },
                                { value: 10, label: '10x' }
                              ]}
                              color="pink"
                            />
                          </Box>
                        </Stack>
                      </Grid.Col>
                    </Grid>
                  </Paper>

                  {/* Quick Stats */}
                  <Grid>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                      <Paper shadow="xs" radius="md" p="md" withBorder>
                        <Group justify="space-between">
                          <Text c="dimmed" size="sm">Win Rate</Text>
                          <Text fw={600}>{rollingSummary?.winRate?.toFixed(1) || '—'}%</Text>
                        </Group>
                      </Paper>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                      <Paper shadow="xs" radius="md" p="md" withBorder>
                        <Group justify="space-between">
                          <Text c="dimmed" size="sm">Total Trades</Text>
                          <Text fw={600}>{rollingSummary?.trades || '—'}</Text>
                        </Group>
                      </Paper>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                      <Paper shadow="xs" radius="md" p="md" withBorder>
                        <Group justify="space-between">
                          <Text c="dimmed" size="sm">Max Drawdown</Text>
                          <Text fw={600} c="red">
                            {rollingSummary?.maxDrawdown ? `${rollingSummary.maxDrawdown.toFixed(1)}%` : '—'}
                          </Text>
                        </Group>
                      </Paper>
                    </Grid.Col>
                  </Grid>
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="backtest" pt="md">
                <Paper shadow="xs" radius="md" p="lg" withBorder>
                  <Group justify="space-between" mb="md">
                    <div>
                      <Title order={4}>30 Day Backtest</Title>
                      {rollingSummary && (
                        <Text size="xs" c="dimmed">
                          {new Date(rollingSummary.periodStart).toLocaleDateString()} — {new Date(rollingSummary.periodEnd).toLocaleDateString()}
                        </Text>
                      )}
                    </div>
                    <Button
                      onClick={handleRun30DayBacktest}
                      loading={rollingLoading}
                      leftSection={<IconRefresh size={16} />}
                    >
                      Refresh Backtest
                    </Button>
                  </Group>

                  {rollingError && (
                    <Alert icon={<IconAlertCircle />} color="red" mb="md">
                      {rollingError}
                    </Alert>
                  )}

                  <Box pos="relative" style={{ minHeight: 400 }}>
                    <LoadingOverlay visible={rollingLoading} />
                    <BacktestEquityChart
                      data={rollingCurve}
                      summary={rollingSummary || undefined}
                      loading={rollingLoading}
                      trades={rollingTrades}
                      thresholds={{
                        low: parameters.lowThreshold ?? 25,
                        high: parameters.highThreshold ?? 75
                      }}
                      strategy={(parameters.strategy as 'momentum' | 'contrarian') || 'momentum'}
                    />
                  </Box>

                  {rollingSummary && (
                    <Grid mt="md">
                      <Grid.Col span={{ base: 6, md: 3 }}>
                        <Paper p="xs" withBorder>
                          <Text size="xs" c="dimmed" tt="uppercase">Total Return</Text>
                          <Text size="lg" fw={700} c={rollingSummary.totalReturnPct >= 0 ? 'green' : 'red'}>
                            {rollingSummary.totalReturnPct.toFixed(2)}%
                          </Text>
                        </Paper>
                      </Grid.Col>
                      <Grid.Col span={{ base: 6, md: 3 }}>
                        <Paper p="xs" withBorder>
                          <Text size="xs" c="dimmed" tt="uppercase">Total P&L</Text>
                          <Text size="lg" fw={700} c={rollingSummary.totalPnl >= 0 ? 'green' : 'red'}>
                            ${rollingSummary.totalPnl.toFixed(2)}
                          </Text>
                        </Paper>
                      </Grid.Col>
                      <Grid.Col span={{ base: 6, md: 3 }}>
                        <Paper p="xs" withBorder>
                          <Text size="xs" c="dimmed" tt="uppercase">Win Rate</Text>
                          <Text size="lg" fw={700}>
                            {rollingSummary.winRate.toFixed(1)}%
                          </Text>
                        </Paper>
                      </Grid.Col>
                      <Grid.Col span={{ base: 6, md: 3 }}>
                        <Paper p="xs" withBorder>
                          <Text size="xs" c="dimmed" tt="uppercase">Max Drawdown</Text>
                          <Text size="lg" fw={700} c="red">
                            -{rollingSummary.maxDrawdown.toFixed(1)}%
                          </Text>
                        </Paper>
                      </Grid.Col>
                    </Grid>
                  )}
                </Paper>
              </Tabs.Panel>

              <Tabs.Panel value="strategies" pt="md">
                <Paper shadow="xs" radius="md" p="lg" withBorder>
                  <Title order={4} mb="md">Top Performing Strategies</Title>
                  <StrategyCarousel
                    onApplyStrategy={handleApplyStrategy}
                    currentAsset={parameters.asset}
                  />
                </Paper>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        </Container>
      </AppShell.Main>

      {/* Confirmation Modals */}
      <Modal
        opened={startModalOpened}
        onClose={closeStartModal}
        title="Start Trading Bot"
        centered
      >
        <Stack>
          <Alert icon={<IconInfoCircle />} color="blue">
            The bot will start trading with the following parameters:
          </Alert>
          <Paper p="md" withBorder>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">Asset:</Text>
                <Text size="sm" fw={600}>{parameters.asset}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">Strategy:</Text>
                <Text size="sm" fw={600}>{parameters.strategy}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">Leverage:</Text>
                <Text size="sm" fw={600}>{parameters.leverage}x</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">FGI Range:</Text>
                <Text size="sm" fw={600}>{parameters.lowThreshold} - {parameters.highThreshold}</Text>
              </Group>
            </Stack>
          </Paper>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeStartModal}>
              Cancel
            </Button>
            <Button color="green" leftSection={<IconPlayerPlay size={16} />} onClick={handleStart}>
              Start Trading
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={stopModalOpened}
        onClose={closeStopModal}
        title="Stop Trading Bot"
        centered
      >
        <Stack>
          <Alert icon={<IconAlertCircle />} color="orange">
            Are you sure you want to stop the trading bot? Any open positions will remain open.
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeStopModal}>
              Cancel
            </Button>
            <Button color="red" leftSection={<IconPlayerStop size={16} />} onClick={handleStop}>
              Stop Bot
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppShell>
  )
}