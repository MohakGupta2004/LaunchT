'use client'
import { type PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import type { BN } from '@anchor-lang/core'
import { toast } from 'sonner'
import { useInvestments, useClaimTokens, useProjects } from '@/hooks/useLaunchpad'

function solFmt(bn: BN) {
  return (bn.toNumber() / LAMPORTS_PER_SOL).toFixed(4)
}

export default function MyInvestments() {
  const { investments, loading, refetch } = useInvestments()
  const { projects } = useProjects()
  const { claimTokens, loading: claiming } = useClaimTokens()

  const projectMap = new Map(projects.map((p) => [p.publicKey.toBase58(), p]))

  const handleClaim = async (tokenMint: PublicKey) => {
    try {
      await claimTokens(tokenMint)
      toast.success('Tokens claimed!')
      refetch()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Claim failed'
      toast.error(msg)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">My Investments</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Track and claim your token allocations</p>
        </div>
        <button
          onClick={refetch}
          className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
          Refresh
        </button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900 h-28 animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && investments.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 py-20 text-center">
          <p className="text-zinc-400 font-medium">No investments yet</p>
          <p className="mt-1 text-sm text-zinc-600">
            Head to the Marketplace to invest in a project
          </p>
        </div>
      )}

      {!loading && investments.length > 0 && (
        <div className="space-y-3">
          {investments.map((inv) => {
            const proj = projectMap.get(inv.project.toBase58())
            const unclaimed = inv.tokensAllocated.sub(inv.tokensClaimed)
            const hasClaim = unclaimed.gtn(0)

            return (
              <div
                key={inv.publicKey.toBase58()}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-medium text-white">
                      {proj ? (
                        <>
                          {proj.name}{' '}
                          <span className="text-zinc-500 font-normal text-sm">
                            ({proj.symbol})
                          </span>
                        </>
                      ) : (
                        'Unknown Project'
                      )}
                    </h3>
                    <p className="text-xs text-zinc-600 mt-0.5 font-mono truncate">
                      {inv.project.toBase58()}
                    </p>
                  </div>
                  {hasClaim ? (
                    <button
                      onClick={() => proj && handleClaim(proj.tokenMint)}
                      disabled={claiming || !proj}
                      className="shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {claiming ? 'Claiming…' : 'Claim Tokens'}
                    </button>
                  ) : (
                    <span className="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-500">
                      Fully Claimed
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-zinc-800/60 p-3">
                    <p className="text-xs text-zinc-500">Invested</p>
                    <p className="text-sm font-semibold text-white mt-0.5">
                      {solFmt(inv.amountInvested)} SOL
                    </p>
                  </div>
                  <div className="rounded-lg bg-zinc-800/60 p-3">
                    <p className="text-xs text-zinc-500">Allocated</p>
                    <p className="text-sm font-semibold text-white mt-0.5">
                      {inv.tokensAllocated.toNumber().toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-zinc-800/60 p-3">
                    <p className="text-xs text-zinc-500">Unclaimed</p>
                    <p
                      className={`text-sm font-semibold mt-0.5 ${
                        hasClaim ? 'text-green-400' : 'text-zinc-500'
                      }`}
                    >
                      {unclaimed.toNumber().toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
