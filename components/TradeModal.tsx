'use client'
import { useEffect, useState, useMemo } from 'react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { BN } from '@anchor-lang/core'
import { toast } from 'sonner'
import { useWallet } from '@solana/wallet-adapter-react'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import Modal from './Modal'
import {
  useBuy,
  useSell,
  useMarket,
  useInitializeMarket,
  computeBuyCost,
  computeSellPayout,
  spotPriceLamports,
  type ProjectAccount,
} from '@/hooks/useLaunchpad'

type Tab = 'buy' | 'sell'

function solFmt(n: number) {
  if (n === 0) return '0'
  if (n < 0.000001) return n.toExponential(4)
  if (n < 0.001) return n.toFixed(8)
  return n.toFixed(6)
}

export default function TradeModal({
  project,
  initialTab = 'buy',
  isOpen,
  onClose,
  onSuccess,
}: {
  project: ProjectAccount
  initialTab?: Tab
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [amount, setAmount] = useState('')
  const [initBasePrice, setInitBasePrice] = useState('0.001')
  const [initIncrement, setInitIncrement] = useState('0.0001')
  const [initFeeBps, setInitFeeBps] = useState('0')
  const { publicKey } = useWallet()
  const { buy, loading: buying } = useBuy()
  const { sell, loading: selling } = useSell()
  const { initializeMarket, loading: initializing } = useInitializeMarket()
  const { market, loading: marketLoading, refetch } = useMarket(
    isOpen ? project.tokenMint : null
  )

  const isOwner = publicKey?.toBase58() === project.owner.toBase58()

  useEffect(() => {
    if (!isOpen) return
    setTab(initialTab)
    setAmount('')
  }, [initialTab, isOpen])

  const handleInitMarket = async () => {
    try {
      const baseLamports = Math.round(parseFloat(initBasePrice) * LAMPORTS_PER_SOL)
      const incLamports = Math.round(parseFloat(initIncrement) * LAMPORTS_PER_SOL)
      const feeBps = Math.min(10_000, Math.max(0, parseInt(initFeeBps, 10) || 0))
      await initializeMarket(project.tokenMint, baseLamports, incLamports, feeBps)
      toast.success('Market initialized')
      refetch()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Initialize failed')
    }
  }

  const n = useMemo(() => {
    const v = parseInt(amount, 10)
    return v > 0 ? new BN(v) : null
  }, [amount])

  const preview = useMemo(() => {
    if (!market || !n) return null
    try {
      if (tab === 'buy') {
        if (market.tokenReserve.lt(n)) return null
        const cost = computeBuyCost(
          market.basePrice,
          market.priceIncrement,
          market.tokensOutstanding,
          n
        )
        const newOutstanding = market.tokensOutstanding.add(n)
        const newPrice = spotPriceLamports(
          market.basePrice,
          market.priceIncrement,
          newOutstanding
        )
        return {
          lamports: cost,
          sol: cost.toNumber() / LAMPORTS_PER_SOL,
          newPriceSol: newPrice.toNumber() / LAMPORTS_PER_SOL,
          insufficient: false,
        }
      } else {
        if (market.tokensOutstanding.lt(n)) return null
        const payout = computeSellPayout(
          market.basePrice,
          market.priceIncrement,
          market.tokensOutstanding,
          n
        )
        if (market.solReserve.lt(payout))
          return { lamports: payout, sol: payout.toNumber() / LAMPORTS_PER_SOL, newPriceSol: 0, insufficient: true }
        const newOutstanding = market.tokensOutstanding.sub(n)
        const newPrice = spotPriceLamports(
          market.basePrice,
          market.priceIncrement,
          newOutstanding
        )
        return {
          lamports: payout,
          sol: payout.toNumber() / LAMPORTS_PER_SOL,
          newPriceSol: newPrice.toNumber() / LAMPORTS_PER_SOL,
          insufficient: false,
        }
      }
    } catch {
      return null
    }
  }, [market, n, tab])

  const handleBuy = async () => {
    if (!n || !publicKey) return
    try {
      const { txSig, cost } = await buy(project.tokenMint, n, project.owner)
      toast.success(
        `Bought ${n.toNumber().toLocaleString()} ${project.symbol}`,
        { description: `${solFmt(cost.toNumber() / LAMPORTS_PER_SOL)} SOL · ${txSig.slice(0, 8)}…` }
      )
      setAmount('')
      refetch()
      onSuccess?.()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Buy failed')
    }
  }

  const handleSell = async () => {
    if (!n || !publicKey) return
    try {
      const sellerAta = await getAssociatedTokenAddress(project.tokenMint, publicKey)
      const { txSig, payout } = await sell(project.tokenMint, sellerAta, n)
      toast.success(
        `Sold ${n.toNumber().toLocaleString()} ${project.symbol}`,
        { description: `+${solFmt(payout.toNumber() / LAMPORTS_PER_SOL)} SOL · ${txSig.slice(0, 8)}…` }
      )
      setAmount('')
      refetch()
      onSuccess?.()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Sell failed')
    }
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    setAmount('')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Trade ${project.name} (${project.symbol})`}>
      {/* Market stats bar */}
      {marketLoading ? (
        <div className="h-16 rounded-xl bg-zinc-900 animate-pulse mb-4" />
      ) : market ? (
        <div className="mb-5 grid grid-cols-3 gap-2">
          {[
            { label: 'Current unit price', value: `${solFmt(market.spotPriceSol)} SOL` },
            { label: 'Market value', value: `${market.marketCapSol.toFixed(3)} SOL` },
            { label: 'Sell payout pool', value: `${market.treasurySol.toFixed(3)} SOL` },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-center"
            >
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-sm font-semibold text-white mt-0.5 truncate">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-4 space-y-4">
          <div className="rounded-xl border border-yellow-900/40 bg-yellow-950/10 px-4 py-3 text-sm text-yellow-400">
            No market initialized yet.{' '}
            {isOwner ? 'Set the starting price and price increment to open trading.' : 'The project owner must open trading first.'}
          </div>
          {isOwner && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <p className="text-sm font-semibold text-white">Initialize Market</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Base price (SOL)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={initBasePrice}
                    onChange={(e) => setInitBasePrice(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Price increment (SOL)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={initIncrement}
                    onChange={(e) => setInitIncrement(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Creator fee (bps)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="10000"
                    value={initFeeBps}
                    onChange={(e) => setInitFeeBps(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-600">
                Base price is the starting SOL price per raw unit. Increment is added to the unit price as more raw units are bought. Fee: {((parseInt(initFeeBps) || 0) / 100).toFixed(2)}% of each buy goes to the creator.
              </p>
              <button
                onClick={handleInitMarket}
                disabled={initializing}
                className="w-full rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-500 active:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {initializing ? 'Initializing…' : 'Open Trading'}
              </button>
            </div>
          )}
        </div>
      )}

      {market && (
        <>
          {/* Buy / Sell tabs */}
          <div className="flex rounded-lg bg-zinc-900 p-1 mb-5 gap-1">
            {(['buy', 'sell'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors capitalize ${
                  tab === t
                    ? t === 'buy'
                      ? 'bg-emerald-700 text-white shadow'
                      : 'bg-rose-700 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="block text-sm text-zinc-400">
                {tab === 'buy' ? 'Tokens to buy' : 'Tokens to sell'}{' '}
                <span className="text-zinc-600">(raw units)</span>
              </label>
            </div>
            <input
              type="number"
              step="1"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter raw units, e.g. 1000"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20"
            />
            <p className="mt-1.5 text-xs text-zinc-600">
              Raw units are the smallest token amount. With 9 decimals, 1 full token equals 1,000,000,000 raw units.
            </p>
          </div>

          {/* Trade preview */}
          {n && !preview && !market.tokenReserve.ltn(0) && (
            <div className="mb-4 rounded-lg border border-zinc-800 px-4 py-3 text-sm text-zinc-500 text-center">
              {tab === 'buy'
                ? 'Insufficient token reserve'
                : 'Amount exceeds circulating supply'}
            </div>
          )}

          {preview && (
            <div
              className={`mb-4 rounded-lg border px-4 py-3 ${
                preview.insufficient
                  ? 'border-red-900/60 bg-red-950/20'
                  : tab === 'buy'
                  ? 'border-emerald-900/50 bg-emerald-950/20'
                  : 'border-rose-900/50 bg-rose-950/20'
              }`}
            >
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-400">
                  {tab === 'buy' ? 'SOL you will pay' : 'SOL you will receive'}
                </span>
                <span
                  className={`font-bold text-base ${
                    preview.insufficient
                      ? 'text-red-400'
                      : tab === 'buy'
                      ? 'text-emerald-300'
                      : 'text-rose-300'
                  }`}
                >
                  {solFmt(preview.sol)} SOL
                </span>
              </div>
              {preview.insufficient ? (
                <p className="text-xs text-red-400">
                  Treasury has insufficient SOL for this payout
                </p>
              ) : (
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Price after trade</span>
                  <span className="text-zinc-400">{solFmt(preview.newPriceSol)} SOL</span>
                </div>
              )}
            </div>
          )}

          {/* Action */}
          <div className="flex gap-3">
            <button
              onClick={tab === 'buy' ? handleBuy : handleSell}
              disabled={
                (tab === 'buy' ? buying : selling) ||
                !n ||
                !preview ||
                preview.insufficient
              }
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                tab === 'buy'
                  ? 'bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800'
                  : 'bg-rose-700 hover:bg-rose-600 active:bg-rose-800'
              }`}
            >
              {tab === 'buy'
                ? buying ? 'Buying…' : 'Buy'
                : selling ? 'Selling…' : 'Sell'}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="mt-3 text-center text-xs text-zinc-600">
            1% slippage tolerance · Linear bonding curve
          </p>
        </>
      )}
    </Modal>
  )
}
