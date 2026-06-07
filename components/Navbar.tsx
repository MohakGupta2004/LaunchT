'use client'
import { useState } from 'react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import CreateTokenModal from './CreateTokenModal'

export type AppView = 'marketplace' | 'trade'

export default function Navbar({
  view,
  setView,
}: {
  view: AppView
  setView: (v: AppView) => void
}) {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold text-white tracking-tight">LaunchT</span>

          <nav className="flex items-center gap-1 rounded-lg bg-zinc-900 p-1">
            {(
              [
                { id: 'marketplace', label: 'Marketplace' },
                { id: 'trade', label: 'Trade' },
              ] as { id: AppView; label: string }[]
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  view === id
                    ? 'bg-zinc-700 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 active:bg-violet-800"
            >
              + Create Token
            </button>
            <WalletMultiButton style={{ height: '36px', fontSize: '13px' }} />
          </div>
        </div>
      </header>

      <CreateTokenModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </>
  )
}
