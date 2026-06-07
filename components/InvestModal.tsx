'use client'
import { useState } from 'react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { toast } from 'sonner'
import { useInvest, type ProjectAccount } from '@/hooks/useLaunchpad'
import Modal from './Modal'

export default function InvestModal({
  project,
  isOpen,
  onClose,
  onSuccess,
}: {
  project: ProjectAccount
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}) {
  const { invest, loading } = useInvest()
  const [amountSol, setAmountSol] = useState('')

  const tokenPrice = project.tokenPrice.toNumber()
  const tokensEstimate =
    amountSol && tokenPrice > 0
      ? Math.floor((parseFloat(amountSol) * LAMPORTS_PER_SOL) / tokenPrice)
      : 0

  const handleInvest = async () => {
    const sol = parseFloat(amountSol)
    if (!sol || sol <= 0) {
      toast.error('Enter a valid SOL amount')
      return
    }
    try {
      await invest(project.tokenMint, sol)
      toast.success(`Invested ${sol} SOL!`)
      setAmountSol('')
      onSuccess?.()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Investment failed'
      toast.error(msg)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Invest in ${project.name}`}>
      <div className="space-y-4">
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
          <div className="flex justify-between px-4 py-3 text-sm">
            <span className="text-zinc-500">Token</span>
            <span className="text-white font-medium">
              {project.name}{' '}
              <span className="text-zinc-400 font-normal">({project.symbol})</span>
            </span>
          </div>
          <div className="flex justify-between px-4 py-3 text-sm">
            <span className="text-zinc-500">Price per unit</span>
            <span className="text-white">{tokenPrice.toLocaleString()} lamports</span>
          </div>
          <div className="flex justify-between px-4 py-3 text-sm">
            <span className="text-zinc-500">Raised</span>
            <span className="text-white">{project.progressPercent}% of goal</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Amount (SOL)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amountSol}
            onChange={(e) => setAmountSol(e.target.value)}
            placeholder="0.1"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20"
          />
        </div>

        {tokensEstimate > 0 && (
          <div className="rounded-lg border border-violet-900/50 bg-violet-950/20 px-4 py-3">
            <p className="text-xs text-zinc-500">You will receive approximately</p>
            <p className="text-xl font-semibold text-violet-300 mt-0.5">
              {tokensEstimate.toLocaleString()}{' '}
              <span className="text-sm font-normal text-zinc-500">raw units</span>
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleInvest}
            disabled={loading || !amountSol}
            className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Investing…' : 'Invest'}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
