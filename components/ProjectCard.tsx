'use client'
import { useState } from 'react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import type { BN } from '@anchor-lang/core'
import type { ProjectAccount, MarketAccount } from '@/hooks/useLaunchpad'
import TradeModal from './TradeModal'
import TokenAnalyticsModal from './TokenAnalyticsModal'

function solFmt(bn: BN) {
  return (bn.toNumber() / LAMPORTS_PER_SOL).toFixed(2)
}

export default function ProjectCard({
  project,
  market,
  onInvested,
}: {
  project: ProjectAccount
  market?: MarketAccount
  onInvested?: () => void
}) {
  const [showTrade, setShowTrade] = useState(false)
  const [tradeTab, setTradeTab] = useState<'buy' | 'sell'>('buy')
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = project.imageUrl && !imageFailed

  return (
    <>
      <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 gap-3 hover:border-zinc-700 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
              {showImage ? (
                <img
                  src={project.imageUrl}
                  alt={`${project.name} token`}
                  className="h-full w-full object-cover"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-sm font-semibold text-zinc-400">
                  {project.symbol.slice(0, 3).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-white text-base truncate">{project.name}</h3>
              <span className="text-xs font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded mt-1 inline-block">
                {project.symbol}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                project.isActive
                  ? 'bg-green-900/40 text-green-400'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {project.isActive ? 'Active' : 'Inactive'}
            </span>
            {!project.tokensDeposited && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/30 text-yellow-500">
                Awaiting Deposit
              </span>
            )}
          </div>
        </div>

        {project.description && (
          <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed">
            {project.description}
          </p>
        )}

        <div>
          <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
            <span>{solFmt(project.raisedAmount)} SOL raised</span>
            <span>Goal: {solFmt(project.targetRaise)} SOL</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-500"
              style={{ width: `${project.progressPercent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-600">{project.progressPercent}% funded</p>
        </div>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-zinc-800">
          <div>
            <p className="text-xs text-zinc-500">Price per unit</p>
            <p className="text-sm font-medium text-white mt-0.5">
              {project.tokenPrice.toNumber().toLocaleString()} lam
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setTradeTab('buy'); setShowTrade(true) }}
              disabled={!project.isActive || !project.tokensDeposited}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Buy
            </button>
            <button
              onClick={() => { setTradeTab('sell'); setShowTrade(true) }}
              disabled={!project.isActive || !project.tokensDeposited}
              className="rounded-lg bg-rose-700/80 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 active:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Sell
            </button>
            {market && (
              <button
                onClick={() => setShowAnalytics(true)}
                title="View analytics"
                className="rounded-lg border border-zinc-700 px-2.5 py-2 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <TradeModal
        project={project}
        initialTab={tradeTab}
        isOpen={showTrade}
        onClose={() => setShowTrade(false)}
        onSuccess={() => {
          setShowTrade(false)
          onInvested?.()
        }}
      />
      {market && (
        <TokenAnalyticsModal
          project={project}
          market={market}
          isOpen={showAnalytics}
          onClose={() => setShowAnalytics(false)}
        />
      )}
    </>
  )
}
