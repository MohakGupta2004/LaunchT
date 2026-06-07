'use client'
import { useState, useMemo } from 'react'
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react'
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { UnsafeBurnerWalletAdapter } from '@solana/wallet-adapter-wallets'
import '@solana/wallet-adapter-react-ui/styles.css'
import Navbar from '@/components/Navbar'
import Marketplace from '@/components/Marketplace'
import MyInvestments from '@/components/MyInvestments'

type AppView = 'marketplace' | 'investments'

function AppContent() {
  const { connected } = useWallet()
  const [view, setView] = useState<AppView>('marketplace')

  if (!connected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950">
        <div className="text-center space-y-8 px-4">
          <div className="space-y-3">
            <h1 className="text-6xl font-bold tracking-tight text-white">LaunchT</h1>
            <p className="text-zinc-400 text-lg">Launch and invest in Solana tokens</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <WalletMultiButton />
            <p className="text-xs text-zinc-600">Connect your Solana wallet to get started</p>
          </div>
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto pt-4">
            {[
              { label: 'Create', desc: 'Launch your SPL token and list it on the marketplace' },
              { label: 'Invest', desc: 'Discover projects and invest SOL to earn token allocations' },
              { label: 'Claim', desc: 'Claim your token allocation once you\'ve invested' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center">
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar view={view} setView={setView} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {view === 'marketplace' ? <Marketplace /> : <MyInvestments />}
      </main>
    </div>
  )
}

const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_URL ?? 'http://localhost:8899'

export default function Home() {
  const wallets = useMemo(() => [new UnsafeBurnerWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AppContent />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
