'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Zap, Crown, Bot, BarChart3 } from '@/components/icons'
import { cn } from '@/lib/utils'

interface ModelStat {
  model: string
  tier: string
  messageCount: number
  inputTokens: number
  outputTokens: number
  totalCredits: number
  avgLatencyMs: number
  escalationCount: number
  avgCriticScore: number | null
  criticCount: number
}

interface TierStat {
  tier: string
  messageCount: number
  totalCredits: number
  totalTokens: number
}

interface PipelineStats {
  totalMessages: number
  classified: number
  criticEvaluated: number
  escalated: number
  avgCriticScore: number | null
}

interface DailyStat {
  date: string
  messages: number
  credits: number
  tokens: number
}

interface StatsData {
  period: string
  totals: {
    messages: number
    inputTokens: number
    outputTokens: number
    credits: number
    maestroCost: number
    costSaved: number
    savingsPercent: number
    avgLatencyMs: number
  }
  modelStats: ModelStat[]
  tierStats: TierStat[]
  pipelineStats: PipelineStats
  daily: DailyStat[]
}

const TIER_CONFIG = {
  direct: { label: 'Direct', icon: Zap, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', bar: 'bg-green-500' },
  maestro: { label: 'Maestro', icon: Crown, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', bar: 'bg-amber-500' },
  cheap: { label: 'Budget', icon: Zap, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', bar: 'bg-green-500' },
  mid: { label: 'Quality', icon: Bot, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', bar: 'bg-blue-500' },
  premium: { label: 'Premium', icon: Crown, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', bar: 'bg-purple-500' },
  unknown: { label: 'Other', icon: BarChart3, color: 'text-gray-600', bg: 'bg-gray-50 dark:bg-gray-800', bar: 'bg-gray-400' },
} as const

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function shortModel(model: string): string {
  return model.split('/').pop() || model
}

export default function StatsPage() {
  const router = useRouter()
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week')
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/stats?period=${period}`)
      .then(res => {
        if (!res.ok) { router.push('/login'); return null }
        return res.json()
      })
      .then(d => { if (d) setData(d); setLoading(false) })
  }, [period, router])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <button
            onClick={() => router.push('/vibecoder')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Usage Stats</h1>
          <div className="ml-auto flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            {(['day', 'week', 'month'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  period === p
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                {p === 'day' ? '24h' : p === 'week' ? '7d' : '30d'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          </div>
        ) : !data || data.totals.messages === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-lg font-medium">No usage data yet</p>
            <p className="text-sm mt-1">Start chatting to see your stats here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label="Messages" value={String(data.totals.messages)} />
              <SummaryCard label="Total Tokens" value={formatTokens(data.totals.inputTokens + data.totals.outputTokens)} sub={`${formatTokens(data.totals.inputTokens)} in / ${formatTokens(data.totals.outputTokens)} out`} />
              <SummaryCard label="Credits Used" value={data.totals.credits.toFixed(1)} sub={`If all Maestro: ${data.totals.maestroCost.toFixed(1)}`} />
              <SummaryCard label="Credits Saved" value={data.totals.costSaved.toFixed(1)} sub={`${data.totals.savingsPercent.toFixed(0)}% saved vs Maestro`} highlight={data.totals.costSaved > 0 ? 'green' : undefined} />
            </div>

            {/* Pipeline Breakdown */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Pipeline Breakdown</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <PipelineStep label="Classified" value={data.pipelineStats.classified} total={data.pipelineStats.totalMessages} color="bg-brand-500" />
                <PipelineStep label="Critic Evaluated" value={data.pipelineStats.criticEvaluated} total={data.pipelineStats.totalMessages} color="bg-yellow-500" />
                <PipelineStep label="Escalated to Maestro" value={data.pipelineStats.escalated} total={data.pipelineStats.totalMessages} color="bg-amber-500" />
                <div>
                  <p className="text-xs text-gray-500 mb-1">Avg Critic Score</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {data.pipelineStats.avgCriticScore !== null
                      ? data.pipelineStats.avgCriticScore.toFixed(2)
                      : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Tier Distribution */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Usage by Tier</h2>
              <div className="space-y-3">
                {data.tierStats.map(t => {
                  const cfg = TIER_CONFIG[t.tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.unknown
                  const TierIcon = cfg.icon
                  const pct = data.totals.messages > 0 ? (t.messageCount / data.totals.messages) * 100 : 0
                  return (
                    <div key={t.tier} className="flex items-center gap-3">
                      <div className={cn('p-1.5 rounded', cfg.bg)}>
                        <TierIcon className={cn('w-4 h-4', cfg.color)} />
                      </div>
                      <div className="w-20 text-sm font-medium text-gray-700 dark:text-gray-300">{cfg.label}</div>
                      <div className="flex-1">
                        <div className="h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', cfg.bar)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="w-24 text-right text-sm text-gray-600 dark:text-gray-400">
                        {t.messageCount} <span className="text-xs">({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="w-20 text-right text-xs text-gray-500">{t.totalCredits.toFixed(1)} cr</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Model Usage Table */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="p-5 pb-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Model Usage (sorted by most used)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-5 py-2 font-medium text-gray-500">Model</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Tier</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Messages</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Tokens</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Credits</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Avg Latency</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Critic</th>
                      <th className="text-right px-5 py-2 font-medium text-gray-500">Escalated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.modelStats.map((m, i) => {
                      const cfg = TIER_CONFIG[m.tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.unknown
                      const TierIcon = cfg.icon
                      return (
                        <tr key={m.model} className={cn('border-b border-gray-100 dark:border-gray-700/50', i % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-800/30')}>
                          <td className="px-5 py-3">
                            <div className="font-medium text-gray-900 dark:text-white">{shortModel(m.model)}</div>
                            <div className="text-xs text-gray-400 truncate max-w-[200px]">{m.model}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.bg, cfg.color)}>
                              <TierIcon className="w-3 h-3" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-gray-900 dark:text-white">{m.messageCount}</td>
                          <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">
                            {formatTokens(m.inputTokens + m.outputTokens)}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">{m.totalCredits.toFixed(2)}</td>
                          <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">
                            {m.avgLatencyMs > 0 ? `${(m.avgLatencyMs / 1000).toFixed(1)}s` : '—'}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {m.avgCriticScore !== null ? (
                              <span className={cn('font-medium', m.avgCriticScore >= 0.7 ? 'text-green-600' : m.avgCriticScore >= 0.5 ? 'text-yellow-600' : 'text-red-600')}>
                                {m.avgCriticScore.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {m.escalationCount > 0 ? (
                              <span className="text-amber-600 font-medium">{m.escalationCount}</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Daily Activity */}
            {data.daily.length > 1 && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Daily Activity</h2>
                <div className="flex items-end gap-1 h-32">
                  {data.daily.map(d => {
                    const maxMsgs = Math.max(...data.daily.map(x => x.messages))
                    const pct = maxMsgs > 0 ? (d.messages / maxMsgs) * 100 : 0
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div
                          className="w-full bg-brand-500 rounded-t transition-all min-h-[2px]"
                          style={{ height: `${Math.max(pct, 2)}%` }}
                        />
                        <span className="text-[9px] text-gray-400 truncate w-full text-center">
                          {d.date.slice(5)}
                        </span>
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-10 shadow-lg">
                          <div className="font-medium">{d.date}</div>
                          <div>{d.messages} msgs · {d.credits.toFixed(1)} cr · {formatTokens(d.tokens)} tokens</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'green' }) {
  return (
    <div className={cn(
      'border rounded-xl p-4',
      highlight === 'green'
        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    )}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={cn('text-2xl font-bold', highlight === 'green' ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white')}>{value}</p>
      {sub && <p className={cn('text-xs mt-0.5', highlight === 'green' ? 'text-green-500 dark:text-green-400' : 'text-gray-400')}>{sub}</p>}
    </div>
  )
}

function PipelineStep({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <div className="mt-1.5 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-0.5">{pct.toFixed(0)}% of total</p>
    </div>
  )
}
