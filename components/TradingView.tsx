'use client'
import { useMemo, useState } from 'react'
import {
  useProjects,
  useMarkets,
  type MarketAccount,
  type ProjectAccount,
} from '@/hooks/useLaunchpad'
import TradeModal from './TradeModal'

function solFmt(n: number) {
  if (n === 0) return '0'
  if (n < 0.000001) return n.toExponential(4)
  if (n < 0.001) return n.toFixed(8)
  return n.toFixed(6)
}

type Tab = 'buy' | 'sell'

function MarketCard({
  project,
  market,
}: {
  project: ProjectAccount
  market: MarketAccount
}) {
  const [tradeTab, setTradeTab] = useState<Tab>('buy')
  const [showTrade, setShowTrade] = useState(false)

  const openTrade = (t: Tab) => {
    setTradeTab(t)
    setShowTrade(true)
  }

  const supplyPercent = market.totalSupply.isZero()
    ? 0
    : Math.min(
        100,
        market.tokensOutstanding
          .muln(100)
          .div(market.totalSupply)
          .toNumber()
      )

  return (
    <>
      <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 gap-4 hover:border-zinc-700 transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-white text-base truncate">{project.name}</h3>
            <span className="text-xs font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded mt-1 inline-block">
              {project.symbol}
            </span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 shrink-0 font-medium">
            Live
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Price', value: `${solFmt(market.spotPriceSol)} SOL` },
            { label: 'Mkt Cap', value: `${market.marketCapSol.toFixed(2)} SOL` },
            { label: 'Treasury', value: `${market.treasurySol.toFixed(2)} SOL` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-zinc-800/70 px-2 py-2 text-center">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-xs font-semibold text-white mt-0.5 truncate">{value}</p>
            </div>
          ))}
        </div>

        {/* Supply progress */}
        <div>
          <div className="flex justify-between text-xs text-zinc-600 mb-1">
            <span>{market.tokensOutstanding.toNumber().toLocaleString()} in circulation</span>
            <span>{supplyPercent}% of supply</span>
          </div>
          <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-500"
              style={{ width: `${supplyPercent}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          <button
            onClick={() => openTrade('buy')}
            className="flex-1 rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white hover:bg-emerald-600 active:bg-emerald-800 transition-colors"
          >
            Buy
          </button>
          <button
            onClick={() => openTrade('sell')}
            className="flex-1 rounded-lg bg-rose-700/80 py-2 text-sm font-semibold text-white hover:bg-rose-700 active:bg-rose-800 transition-colors"
          >
            Sell
          </button>
        </div>
      </div>

      <TradeModal
        project={project}
        initialTab={tradeTab}
        isOpen={showTrade}
        onClose={() => setShowTrade(false)}
        onSuccess={() => setShowTrade(false)}
      />
    </>
  )
}

export default function TradingView() {
  const { projects, loading: projectsLoading } = useProjects()
  const { markets, loading: marketsLoading, refetch } = useMarkets()

  const loading = projectsLoading || marketsLoading

  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.tokenMint.toBase58(), p])),
    [projects]
  )

  const activeMarkets = useMemo(
    () =>
      markets
        .map((m) => ({
          market: m,
          project: projectMap.get(m.tokenMint.toBase58()),
        }))
        .filter(
          (x): x is { market: MarketAccount; project: ProjectAccount } =>
            !!x.project
        ),
    [markets, projectMap]
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Trading</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Buy and sell tokens on the bonding curve
          </p>
        </div>
        <button
          onClick={refetch}
          className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
          Refresh
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900 h-56 animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && activeMarkets.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 py-20 text-center">
          <p className="text-zinc-400 font-medium">No active markets</p>
          <p className="mt-1 text-sm text-zinc-600">
            Project owners call{' '}
            <span className="font-mono text-zinc-500">initialize_market</span>{' '}
            to open trading for their token
          </p>
        </div>
      )}

      {!loading && activeMarkets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeMarkets.map(({ project, market }) => (
            <MarketCard
              key={market.publicKey.toBase58()}
              project={project}
              market={market}
            />
          ))}
        </div>
      )}
    </div>
  )
}
