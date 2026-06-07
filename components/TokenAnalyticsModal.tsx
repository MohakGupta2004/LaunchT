'use client'
import { useMemo, useState } from 'react'
import { BN } from '@anchor-lang/core'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import Modal from './Modal'
import {
  computeBuyCost,
  computeSellPayout,
  type ProjectAccount,
  type MarketAccount,
} from '@/hooks/useLaunchpad'

function solFmt(n: number) {
  if (n === 0) return '0'
  if (n < 0.000001) return n.toExponential(4)
  if (n < 0.001) return n.toFixed(8)
  return n.toFixed(6)
}

function numFmt(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function CopyAddress({ label, address }: { label: string; address: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-zinc-800/50 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
        <p className="text-xs font-mono text-zinc-300 break-all">{address}</p>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(address)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className="shrink-0 px-2 py-1 rounded bg-zinc-700 text-xs text-zinc-400 hover:bg-zinc-600 hover:text-white transition-colors"
      >
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  )
}

// Chart constants
const W = 380
const H = 120
const PAD = { l: 52, r: 12, t: 14, b: 24 }
const plotW = W - PAD.l - PAD.r
const plotH = H - PAD.t - PAD.b

export default function TokenAnalyticsModal({
  project,
  market,
  isOpen,
  onClose,
}: {
  project: ProjectAccount
  market: MarketAccount
  isOpen: boolean
  onClose: () => void
}) {
  const [calcAmount, setCalcAmount] = useState('')
  const [calcSol, setCalcSol] = useState('')

  const supplyPercent = market.totalSupply.isZero()
    ? 0
    : Math.min(100, market.tokensOutstanding.muln(100).div(market.totalSupply).toNumber())

  const creatorFeePercent = (market.creatorFeeBps / 100).toFixed(2)

  // Bonding curve chart data
  const chartData = useMemo(() => {
    const total = market.totalSupply.toNumber()
    if (total === 0) return null

    const base = market.basePrice.toNumber() / LAMPORTS_PER_SOL
    const inc = market.priceIncrement.toNumber() / LAMPORTS_PER_SOL
    const outstanding = market.tokensOutstanding.toNumber()

    const POINTS = 50
    const step = total / POINTS
    const pts = Array.from({ length: POINTS + 1 }, (_, i) => ({
      supply: i * step,
      price: base + inc * (i * step),
    }))

    const minPrice = pts[0].price
    const maxPrice = pts[pts.length - 1].price
    const priceRange = maxPrice - minPrice || minPrice || 1

    const toX = (s: number) => PAD.l + (s / total) * plotW
    const toY = (p: number) =>
      PAD.t + plotH - ((p - minPrice) / priceRange) * plotH * 0.85

    const linePoints = pts
      .map((p) => `${toX(p.supply).toFixed(1)},${toY(p.price).toFixed(1)}`)
      .join(' ')

    // Area under "already bought" region
    const boughtPts = pts.filter((p) => p.supply <= outstanding)
    if (outstanding > 0 && boughtPts[boughtPts.length - 1].supply < outstanding) {
      boughtPts.push({ supply: outstanding, price: base + inc * outstanding })
    }
    const boughtArea =
      boughtPts.length > 1
        ? `M${toX(0).toFixed(1)},${(PAD.t + plotH).toFixed(1)} ` +
          boughtPts
            .map((p) => `L${toX(p.supply).toFixed(1)},${toY(p.price).toFixed(1)}`)
            .join(' ') +
          ` L${toX(outstanding).toFixed(1)},${(PAD.t + plotH).toFixed(1)} Z`
        : ''

    const nowX = toX(outstanding)
    const nowY = toY(base + inc * outstanding)

    // Y-axis labels (3 ticks)
    const yTicks = [0, 0.5, 1].map((f) => ({
      y: PAD.t + plotH * (1 - f * 0.85),
      val: minPrice + priceRange * f,
    }))

    return {
      linePoints,
      boughtArea,
      nowX,
      nowY,
      yTicks,
      total,
      outstanding,
      base,
      inc,
      minPrice,
      maxPrice,
    }
  }, [market])

  // Price milestones
  const milestones = useMemo(() => {
    const total = market.totalSupply.toNumber()
    const base = market.basePrice.toNumber() / LAMPORTS_PER_SOL
    const inc = market.priceIncrement.toNumber() / LAMPORTS_PER_SOL
    return [0, 25, 50, 75, 100].map((pct) => ({
      pct,
      price: base + inc * Math.floor((total * pct) / 100),
      reached: supplyPercent >= pct,
    }))
  }, [market, supplyPercent])

  // Calculator: raw units → SOL cost
  const tokensToCost = useMemo(() => {
    const n = parseInt(calcAmount, 10)
    if (!n || n <= 0) return null
    const bnN = new BN(n)
    if (market.tokenReserve.lt(bnN)) return { error: 'Not enough tokens available' }
    try {
      const cost = computeBuyCost(
        market.basePrice,
        market.priceIncrement,
        market.tokensOutstanding,
        bnN
      )
      const feeSol =
        market.creatorFeeBps > 0
          ? (cost.toNumber() / LAMPORTS_PER_SOL) * (market.creatorFeeBps / 10000)
          : 0
      return {
        totalSol: cost.toNumber() / LAMPORTS_PER_SOL,
        feeSol,
        netSol: cost.toNumber() / LAMPORTS_PER_SOL - feeSol,
      }
    } catch {
      return null
    }
  }, [calcAmount, market])

  // Calculator: SOL budget → max tokens (binary search on BN)
  const solToTokens = useMemo(() => {
    const sol = parseFloat(calcSol)
    if (!sol || sol <= 0) return null
    const budget = new BN(Math.floor(sol * LAMPORTS_PER_SOL))
    const maxAvail = market.tokenReserve.toNumber()
    if (maxAvail === 0) return { tokens: 0 }

    let lo = 0,
      hi = Math.min(maxAvail, 1_000_000_000)
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2)
      try {
        const cost = computeBuyCost(
          market.basePrice,
          market.priceIncrement,
          market.tokensOutstanding,
          new BN(mid)
        )
        if (cost.lte(budget)) lo = mid
        else hi = mid - 1
      } catch {
        hi = mid - 1
      }
    }
    // Also compute what selling those tokens gives back
    let sellPayout: number | null = null
    if (lo > 0) {
      try {
        const newOutstanding = market.tokensOutstanding.add(new BN(lo))
        const payout = computeSellPayout(
          market.basePrice,
          market.priceIncrement,
          newOutstanding,
          new BN(lo)
        )
        sellPayout = payout.toNumber() / LAMPORTS_PER_SOL
      } catch {
        // ignore
      }
    }
    return { tokens: lo, sellPayout }
  }, [calcSol, market])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${project.name} — Analytics`}>
      <div className="space-y-5">
        {/* Token identity */}
        <div className="flex items-start gap-3">
          {project.imageUrl && (
            <img
              src={project.imageUrl}
              alt={project.name}
              className="w-14 h-14 rounded-xl object-cover shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-white">{project.name}</span>
              <span className="text-xs font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                {project.symbol}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 font-medium">
                Live
              </span>
            </div>
            {project.description && (
              <p className="text-sm text-zinc-400 mt-1">{project.description}</p>
            )}
          </div>
        </div>

        {/* Addresses */}
        <div className="space-y-2">
          <CopyAddress
            label="Token address (mint)"
            address={project.tokenMint.toBase58()}
          />
          <CopyAddress
            label="Market address"
            address={market.publicKey.toBase58()}
          />
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              label: 'Buy price now',
              value: `${solFmt(market.spotPriceSol)} SOL`,
              sub: 'per unit',
              accent: false,
            },
            {
              label: 'Total market value',
              value: `${market.marketCapSol.toFixed(3)} SOL`,
              sub: 'all circulating tokens',
              accent: false,
            },
            {
              label: 'Tokens circulating',
              value: numFmt(market.tokensOutstanding.toNumber()),
              sub: `${supplyPercent}% of total supply`,
              accent: false,
            },
            {
              label: 'Tokens left to buy',
              value: numFmt(market.tokenReserve.toNumber()),
              sub: 'available right now',
              accent: false,
            },
            {
              label: 'Sell pool (SOL)',
              value: `${market.treasurySol.toFixed(3)} SOL`,
              sub: 'paid out when you sell',
              accent: false,
            },
            {
              label: 'Creator fee',
              value: `${creatorFeePercent}%`,
              sub: 'on each buy',
              accent: false,
            },
          ].map(({ label, value, sub }) => (
            <div
              key={label}
              className="rounded-lg bg-zinc-800/60 border border-zinc-700/30 px-3 py-2.5"
            >
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-sm font-bold text-white mt-0.5">{value}</p>
              <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Supply bar */}
        <div>
          <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
            <span>Supply circulating</span>
            <span className="font-medium text-zinc-400">{supplyPercent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-700 to-violet-500 transition-all duration-500"
              style={{ width: `${supplyPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-600 mt-1">
            <span>{numFmt(market.tokensOutstanding.toNumber())} in circulation</span>
            <span>{numFmt(market.totalSupply.toNumber())} total</span>
          </div>
        </div>

        {/* Bonding curve chart */}
        {chartData && (
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Price curve — how price moves with demand
            </p>
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-3">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map((f) => (
                  <line
                    key={f}
                    x1={PAD.l}
                    y1={(PAD.t + plotH * (1 - f * 0.85)).toFixed(1)}
                    x2={W - PAD.r}
                    y2={(PAD.t + plotH * (1 - f * 0.85)).toFixed(1)}
                    stroke="#27272a"
                    strokeWidth="0.5"
                  />
                ))}

                {/* Available region (right of now) */}
                <rect
                  x={chartData.nowX.toFixed(1)}
                  y={PAD.t}
                  width={(W - PAD.r - chartData.nowX).toFixed(1)}
                  height={plotH}
                  fill="#7c3aed08"
                />

                {/* Bought area fill */}
                {chartData.boughtArea && (
                  <path d={chartData.boughtArea} fill="#7c3aed18" />
                )}

                {/* Price line */}
                <polyline
                  points={chartData.linePoints}
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Current supply marker */}
                <line
                  x1={chartData.nowX.toFixed(1)}
                  y1={PAD.t}
                  x2={chartData.nowX.toFixed(1)}
                  y2={PAD.t + plotH}
                  stroke="#a78bfa"
                  strokeWidth="1"
                  strokeDasharray="3,2"
                />

                {/* Current price dot */}
                <circle
                  cx={chartData.nowX.toFixed(1)}
                  cy={chartData.nowY.toFixed(1)}
                  r="3.5"
                  fill="#a78bfa"
                  stroke="#18181b"
                  strokeWidth="1.5"
                />

                {/* "now" label */}
                <text
                  x={Math.min(chartData.nowX + 5, W - PAD.r - 24).toFixed(1)}
                  y={(PAD.t + 9).toFixed(1)}
                  fontSize="7.5"
                  fill="#a78bfa"
                  fontWeight="600"
                >
                  now
                </text>

                {/* Y-axis ticks */}
                {chartData.yTicks.map(({ y, val }, i) => (
                  <g key={i}>
                    <line
                      x1={PAD.l - 3}
                      y1={y.toFixed(1)}
                      x2={PAD.l}
                      y2={y.toFixed(1)}
                      stroke="#3f3f46"
                      strokeWidth="1"
                    />
                    <text
                      x={PAD.l - 5}
                      y={(y + 3).toFixed(1)}
                      textAnchor="end"
                      fontSize="7"
                      fill="#52525b"
                    >
                      {val < 0.0001 ? val.toExponential(1) : solFmt(val)}
                    </text>
                  </g>
                ))}

                {/* X-axis labels */}
                <text
                  x={PAD.l}
                  y={H - 4}
                  fontSize="7"
                  fill="#52525b"
                >
                  0
                </text>
                <text
                  x={W - PAD.r}
                  y={H - 4}
                  textAnchor="end"
                  fontSize="7"
                  fill="#52525b"
                >
                  {numFmt(chartData.total)} units
                </text>

                {/* Axis lines */}
                <line
                  x1={PAD.l}
                  y1={PAD.t}
                  x2={PAD.l}
                  y2={PAD.t + plotH}
                  stroke="#3f3f46"
                  strokeWidth="0.5"
                />
                <line
                  x1={PAD.l}
                  y1={PAD.t + plotH}
                  x2={W - PAD.r}
                  y2={PAD.t + plotH}
                  stroke="#3f3f46"
                  strokeWidth="0.5"
                />
              </svg>

              <div className="flex items-center justify-between text-xs text-zinc-600 mt-1 px-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-violet-600/30 inline-block" />
                  bought
                </span>
                <span>price rises as demand grows →</span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-violet-900/20 inline-block" />
                  available
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Price milestones */}
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
            Price at each demand level
          </p>
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">
                    Supply sold
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">
                    Price per unit
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {milestones.map(({ pct, price, reached }) => (
                  <tr
                    key={pct}
                    className={`border-b border-zinc-800/50 last:border-0 transition-colors ${
                      reached ? 'bg-violet-950/15' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-sm text-zinc-300 font-medium">{pct}%</td>
                    <td className="px-3 py-2 text-right font-mono text-sm text-zinc-300">
                      {solFmt(price)} SOL
                    </td>
                    <td className="px-3 py-2 text-right">
                      {pct === 0 ? (
                        <span className="text-xs text-zinc-600">starting price</span>
                      ) : reached ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-violet-900/30 text-violet-400">
                          passed
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-600">upcoming</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cost calculator */}
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
            Cost calculator
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Tokens → SOL */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
              <p className="text-xs font-medium text-zinc-400">
                How much will X units cost?
              </p>
              <input
                type="number"
                min="1"
                step="1"
                value={calcAmount}
                onChange={(e) => setCalcAmount(e.target.value)}
                placeholder="units, e.g. 1000"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20"
              />
              {tokensToCost && (
                <div
                  className={`rounded-lg px-3 py-2.5 space-y-1 ${
                    tokensToCost.error
                      ? 'bg-red-950/30 border border-red-900/40'
                      : 'bg-emerald-950/20 border border-emerald-900/30'
                  }`}
                >
                  {tokensToCost.error ? (
                    <p className="text-xs text-red-400">{tokensToCost.error}</p>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Total cost</span>
                        <span className="font-bold text-white">
                          {solFmt(tokensToCost.totalSol!)} SOL
                        </span>
                      </div>
                      {tokensToCost.feeSol! > 0 && (
                        <div className="flex justify-between text-xs text-zinc-500">
                          <span>Creator fee ({creatorFeePercent}%)</span>
                          <span>{solFmt(tokensToCost.feeSol!)} SOL</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* SOL → tokens */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
              <p className="text-xs font-medium text-zinc-400">
                How many units for X SOL?
              </p>
              <input
                type="number"
                min="0"
                step="any"
                value={calcSol}
                onChange={(e) => setCalcSol(e.target.value)}
                placeholder="SOL, e.g. 0.5"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20"
              />
              {solToTokens && (
                <div className="rounded-lg bg-violet-950/20 border border-violet-900/30 px-3 py-2.5 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Max units</span>
                    <span className="font-bold text-white">
                      {numFmt(solToTokens.tokens)}
                    </span>
                  </div>
                  {solToTokens.sellPayout != null && solToTokens.tokens > 0 && (
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>Sell back for</span>
                      <span>{solFmt(solToTokens.sellPayout)} SOL</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Plain-language explainer */}
        <div className="rounded-xl border border-zinc-700/40 bg-zinc-900/30 px-4 py-3.5 space-y-2">
          <p className="text-xs font-semibold text-zinc-400">What you should know before buying</p>
          <ul className="space-y-1.5 text-xs text-zinc-500">
            <li className="flex gap-2">
              <span className="text-violet-500 shrink-0">↑</span>
              <span>
                Price goes up every time someone buys. Early buyers pay less.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-violet-500 shrink-0">↓</span>
              <span>
                You can sell back anytime. You receive SOL from the sell pool.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-zinc-600 shrink-0">!</span>
              <span>
                The sell pool holds less SOL than the total market value. Large sells
                may be limited by available pool balance.
              </span>
            </li>
            {market.creatorFeeBps > 0 && (
              <li className="flex gap-2">
                <span className="text-zinc-600 shrink-0">%</span>
                <span>
                  {creatorFeePercent}% of each buy goes to the creator. Sells are not charged a fee.
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </Modal>
  )
}
