'use client'
import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { toast } from 'sonner'
import { createToken } from '@/utils/createToken'
import { useCreateProject, useDepositTokens } from '@/hooks/useLaunchpad'
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

  const busy = tokenLoading || cpLoading || dtLoading

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

    if (!description.trim() || !targetSol || !tokenPrice || !forSale) {
      toast.error('Fill in all fields')
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
        toast.success('Tokens deposited into vault — project is now open for investment!')
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
              placeholder="e.g. My Awesome Token"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Symbol</label>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. MAT"
              maxLength={10}
              className={inputCls}
            />
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
            Creates an SPL token with 9 decimals and mints 1,000,000 tokens to your wallet via Metaplex.
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
              placeholder="What does your project do?"
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
            Token price = lamports per raw unit. Example: 1,000,000 lam = 0.001 SOL per raw unit.
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
              Token has 9 decimals — 1 display token = 10⁹ raw units. Minted supply = 10¹⁵ raw units (1,000,000 tokens).
            </p>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={depositNow}
              onChange={(e) => setDepositNow(e.target.checked)}
              className="mt-0.5 rounded border-zinc-600 bg-zinc-800 accent-violet-600"
            />
            <span className="text-sm text-zinc-300 leading-relaxed">
              Deposit tokens into vault now{' '}
              <span className="text-zinc-500">(required before investors can invest)</span>
            </span>
          </label>

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
            {depositNow
              ? ' Investors can find it and start investing right away.'
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
