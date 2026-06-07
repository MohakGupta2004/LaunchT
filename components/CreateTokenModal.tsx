'use client'
import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { toast } from 'sonner'
import { createToken } from '@/utils/createToken'
import { useCreateProject, useDepositTokens, useInitializeMarket } from '@/hooks/useLaunchpad'
import Modal from './Modal'

type Step = 'token' | 'project' | 'done'

const inputCls =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 transition-colors'

export default function CreateTokenModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { createProject, loading: cpLoading } = useCreateProject()
  const { depositTokens, loading: dtLoading } = useDepositTokens()
  const { initializeMarket, loading: imLoading } = useInitializeMarket()

  const [step, setStep] = useState<Step>('token')
  const [mintAddress, setMintAddress] = useState('')
  const [tokenLoading, setTokenLoading] = useState(false)

  // Step 1
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [image, setImage] = useState<File | null>(null)

  // Step 2
  const [description, setDescription] = useState('')
  const [targetRaiseSol, setTargetRaiseSol] = useState('')
  const [tokenPriceLamports, setTokenPriceLamports] = useState('')
  const [tokensForSale, setTokensForSale] = useState('')
  const [depositNow, setDepositNow] = useState(true)
  const [openTradingNow, setOpenTradingNow] = useState(true)
  const [basePriceSol, setBasePriceSol] = useState('0.001')
  const [priceIncrementSol, setPriceIncrementSol] = useState('0.000001')
  const [creatorFeeBps, setCreatorFeeBps] = useState('0')

  const busy = tokenLoading || cpLoading || dtLoading || imLoading

  const uploadImage = async (): Promise<string> => {
    if (!image) throw new Error('No image selected')
    const data = new FormData()
    data.set('file', image)
    data.set('name', name)
    data.set('symbol', symbol)
    const res = await fetch('/api/files', { method: 'POST', body: data })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  }

  const handleCreateToken = async () => {
    if (!name.trim() || !symbol.trim() || !image) {
      toast.error('Fill in name, symbol and select an image')
      return
    }
    if (!wallet.connected) {
      toast.error('Connect your wallet first')
      return
    }
    try {
      setTokenLoading(true)
      const uri = await uploadImage()
      const mint = await createToken({ name, symbol, uri }, connection, wallet)
      setMintAddress(mint.toString())
      toast.success('Token created on-chain!')
      setStep('project')
    } catch (e) {
      console.error(e)
      toast.error('Token creation failed')
    } finally {
      setTokenLoading(false)
    }
  }

  const handleRegisterProject = async () => {
    if (!mintAddress) return
    const targetSol = parseFloat(targetRaiseSol)
    const tokenPrice = parseInt(tokenPriceLamports)
    const forSale = parseInt(tokensForSale)
    const baseLamports = Math.round(parseFloat(basePriceSol) * LAMPORTS_PER_SOL)
    const incrementLamports = Math.round(parseFloat(priceIncrementSol) * LAMPORTS_PER_SOL)
    const feeBps = parseInt(creatorFeeBps, 10)

    if (!description.trim() || !targetSol || !tokenPrice || !forSale) {
      toast.error('Fill in all fields')
      return
    }
    if (openTradingNow && !depositNow) {
      toast.error('Deposit tokens before opening trading')
      return
    }
    if (openTradingNow && (!baseLamports || incrementLamports < 0 || Number.isNaN(feeBps))) {
      toast.error('Fill in valid market parameters')
      return
    }

    try {
      const tokenMint = new PublicKey(mintAddress)
      await createProject({
        tokenMint,
        name,
        symbol,
        description,
        targetRaiseSol: targetSol,
        tokenPriceLamports: tokenPrice,
        totalTokensForSale: forSale,
      })
      toast.success('Project registered on launchpad!')

      if (depositNow && wallet.publicKey) {
        const ownerAta = await getAssociatedTokenAddress(tokenMint, wallet.publicKey)
        await depositTokens(tokenMint, ownerAta)
        toast.success('Tokens deposited into vault')
      }

      if (openTradingNow) {
        await initializeMarket(
          tokenMint,
          baseLamports,
          incrementLamports,
          Math.min(10_000, Math.max(0, feeBps))
        )
        toast.success('Trading market opened')
      }

      setStep('done')
    } catch (e) {
      console.error(e)
      toast.error('Registration failed — check console for details')
    }
  }

  const handleClose = () => {
    setStep('token')
    setMintAddress('')
    setName('')
    setSymbol('')
    setImage(null)
    setDescription('')
    setTargetRaiseSol('')
    setTokenPriceLamports('')
    setTokensForSale('')
    setDepositNow(true)
    setOpenTradingNow(true)
    setBasePriceSol('0.001')
    setPriceIncrementSol('0.000001')
    setCreatorFeeBps('0')
    onClose()
  }

  const titles: Record<Step, string> = {
    token: 'Step 1 — Create Token',
    project: 'Step 2 — Register on Launchpad',
    done: 'Project Launched!',
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={titles[step]}>
      {/* ── Step 1: Token creation ── */}
      {step === 'token' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Token Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. LaunchT Demo Token"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-zinc-600">This is the public name traders will see.</p>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Symbol</label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. LDT"
              maxLength={10}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-zinc-600">Short ticker for the token card and trade modal.</p>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Token Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-700 file:px-3 file:py-1 file:text-sm file:text-white file:cursor-pointer cursor-pointer"
            />
            {image && (
              <p className="mt-1.5 text-xs text-zinc-500">{image.name}</p>
            )}
          </div>
          <p className="text-xs text-zinc-600 bg-zinc-900 rounded-lg p-3 border border-zinc-800">
            This creates an SPL token with 9 decimals and mints the supply to your wallet. After this step, you register it on the marketplace.
          </p>
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleCreateToken}
              disabled={busy}
              className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {tokenLoading ? 'Creating…' : 'Create Token'}
            </button>
            <button
              onClick={handleClose}
              className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Launchpad registration ── */}
      {step === 'project' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3">
            <p className="text-xs text-zinc-500">Mint address</p>
            <p className="text-xs font-mono text-green-400 break-all mt-0.5">
              {mintAddress}
            </p>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short explanation of what this token is for."
              maxLength={200}
              rows={3}
              className={`${inputCls} resize-none`}
            />
            <p className="text-xs text-zinc-600 mt-0.5 text-right">
              {description.length}/200
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Target Raise (SOL)</label>
              <input
                type="number"
                value={targetRaiseSol}
                onChange={(e) => setTargetRaiseSol(e.target.value)}
                placeholder="10"
                min="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">Token Price (lamports)</label>
              <input
                type="number"
                value={tokenPriceLamports}
                onChange={(e) => setTokenPriceLamports(e.target.value)}
                placeholder="1000000"
                min="1"
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-xs text-zinc-600 -mt-2 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            Target raise is the SOL goal shown on the card. Token price is the older fixed-price investment value in lamports, where 1,000,000 lamports = 0.001 SOL per raw unit.
            At 9 decimals, 1&nbsp;SOL would buy{' '}
            {tokenPriceLamports
              ? Math.floor(1_000_000_000 / parseInt(tokenPriceLamports)).toLocaleString()
              : '…'}{' '}
            raw units.
          </p>

          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">
              Tokens for Sale (raw units)
            </label>
            <input
              type="number"
              value={tokensForSale}
              onChange={(e) => setTokensForSale(e.target.value)}
              placeholder="1000000000000000"
              min="1"
              className={inputCls}
            />
            <p className="text-xs text-zinc-600 mt-1">
              Raw units are the smallest on-chain token amount. With 9 decimals, 1 full display token = 1,000,000,000 raw units.
            </p>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={depositNow}
              onChange={(e) => {
                setDepositNow(e.target.checked)
                if (!e.target.checked) setOpenTradingNow(false)
              }}
              className="mt-0.5 rounded border-zinc-600 bg-zinc-800 accent-violet-600"
            />
            <span className="text-sm text-zinc-300 leading-relaxed">
              Deposit tokens into vault now{' '}
              <span className="text-zinc-500">(moves sale tokens into the program vault)</span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={openTradingNow}
              disabled={!depositNow}
              onChange={(e) => setOpenTradingNow(e.target.checked)}
              className="mt-0.5 rounded border-zinc-600 bg-zinc-800 accent-violet-600 disabled:opacity-40"
            />
            <span className="text-sm text-zinc-300 leading-relaxed">
              Open buy/sell trading now{' '}
              <span className="text-zinc-500">(lets traders buy and sell from the curve)</span>
            </span>
          </label>

          {openTradingNow && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Base price (SOL)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={basePriceSol}
                    onChange={(e) => setBasePriceSol(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Increment (SOL)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={priceIncrementSol}
                    onChange={(e) => setPriceIncrementSol(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Fee (bps)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="10000"
                    value={creatorFeeBps}
                    onChange={(e) => setCreatorFeeBps(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-600">
                Base price is the starting SOL price per raw unit. Increment is how much that price increases after each raw unit is bought. Creator fee is a percentage of each buy, in basis points: 100 bps = 1%.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleRegisterProject}
              disabled={busy}
              className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {cpLoading
                ? 'Registering…'
                : dtLoading
                ? 'Depositing tokens…'
                : imLoading
                ? 'Opening market…'
                : 'Register Project'}
            </button>
            <button
              onClick={handleClose}
              className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Done ── */}
      {step === 'done' && (
        <div className="py-8 text-center space-y-4">
          <div className="text-5xl">🚀</div>
          <h3 className="text-lg font-semibold text-white">Project is live!</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Your token project is now listed on the marketplace.
            {openTradingNow
              ? ' Traders can buy and sell it from the Trade screen.'
              : depositNow
              ? ' Open trading from the trade modal when you are ready.'
              : " Remember to deposit tokens from the program owner's wallet before investors can invest."}
          </p>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-left">
            <p className="text-xs text-zinc-500">Mint address</p>
            <p className="text-xs font-mono text-green-400 break-all mt-0.5">
              {mintAddress}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg bg-violet-600 px-8 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
          >
            View Marketplace
          </button>
        </div>
      )}
    </Modal>
  )
}
