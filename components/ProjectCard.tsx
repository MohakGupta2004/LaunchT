'use client'
import { useState } from 'react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import type { BN } from '@anchor-lang/core'
import type { ProjectAccount } from '@/hooks/useLaunchpad'
import InvestModal from './InvestModal'

function solFmt(bn: BN) {
  return (bn.toNumber() / LAMPORTS_PER_SOL).toFixed(2)
}

export default function ProjectCard({
  project,
  onInvested,
}: {
  project: ProjectAccount
  onInvested?: () => void
}) {
  const [showInvest, setShowInvest] = useState(false)

  return (
    <>
      <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 gap-3 hover:border-zinc-700 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-white text-base truncate">{project.name}</h3>
            <span className="text-xs font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded mt-1 inline-block">
              {project.symbol}
            </span>
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
          <button
            onClick={() => setShowInvest(true)}
            disabled={!project.isActive || !project.tokensDeposited}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 active:bg-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Invest
          </button>
        </div>
      </div>

      <InvestModal
        project={project}
        isOpen={showInvest}
        onClose={() => setShowInvest(false)}
        onSuccess={() => {
          setShowInvest(false)
          onInvested?.()
        }}
      />
    </>
  )
}
