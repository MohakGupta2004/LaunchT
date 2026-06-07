'use client'
import { useMemo } from 'react'
import { useProjects, useMarkets } from '@/hooks/useLaunchpad'
import ProjectCard from './ProjectCard'

export default function Marketplace() {
  const { projects, loading, error, refetch } = useProjects()
  const { markets } = useMarkets()

  const marketMap = useMemo(
    () => new Map(markets.map((m) => [m.tokenMint.toBase58(), m])),
    [markets]
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Marketplace</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Discover and trade tokens on the bonding curve</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900 h-56 animate-pulse"
            />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-900/40 bg-red-950/10 p-8 text-center">
          <p className="text-red-400 text-sm">Could not load projects</p>
          <p className="text-xs text-zinc-600 mt-1">
            Make sure your wallet is connected and the program is deployed
          </p>
          <button
            onClick={refetch}
            className="mt-3 text-sm text-zinc-400 hover:text-white transition-colors underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 py-20 text-center">
          <p className="text-zinc-400 font-medium">No projects yet</p>
          <p className="mt-1 text-sm text-zinc-600">
            Create a token project using the &ldquo;+ Create Token&rdquo; button above
          </p>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.publicKey.toBase58()}
              project={project}
              market={marketMap.get(project.tokenMint.toBase58())}
              onInvested={refetch}
            />
          ))}
        </div>
      )}
    </div>
  )
}
