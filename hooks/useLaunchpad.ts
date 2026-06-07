/**
 * React hooks for the Launchpad Anchor program.
 *
 * Prerequisites:
 *   1. Run `anchor build` in /anchor to generate the IDL at
 *      anchor/target/idl/launchpad.json
 *   2. Copy that IDL to utils/launchpad_idl.json (or import path of your choice)
 *   3. Install: pnpm add @coral-xyz/anchor @solana/spl-token
 *      (or if your workspace uses @anchor-lang/core, swap the import)
 *
 * Network: currently set to localnet — change RPC_URL for devnet.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, BN } from "@anchor-lang/core";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { fetchDigitalAsset, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import IDL_JSON from "@/utils/launchpad_idl.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IDL = IDL_JSON as any;
const PROGRAM_ID = new PublicKey(IDL.address);

// ─── PDA helpers ──────────────────────────────────────────────────────────────

const PROJECT_SEED = Buffer.from("project");
const VAULT_SEED = Buffer.from("vault");
const INVESTMENT_SEED = Buffer.from("investment");
const MARKET_SEED = Buffer.from("market");
const TREASURY_SEED = Buffer.from("treasury");

export async function findProjectPda(tokenMint: PublicKey): Promise<PublicKey> {
  const [pda] = PublicKey.findProgramAddressSync(
    [PROJECT_SEED, tokenMint.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export async function findVaultPda(projectPda: PublicKey): Promise<PublicKey> {
  const [pda] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, projectPda.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export async function findInvestmentPda(
  projectPda: PublicKey,
  investor: PublicKey
): Promise<PublicKey> {
  const [pda] = PublicKey.findProgramAddressSync(
    [INVESTMENT_SEED, projectPda.toBuffer(), investor.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function findMarketPda(tokenMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [MARKET_SEED, tokenMint.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function findTreasuryPda(tokenMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [TREASURY_SEED, tokenMint.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

// ─── Bonding curve math (mirrors on-chain compute_buy_cost / compute_sell_payout)

/** ∫[s → s+n] (base + increment·x) dx = base·n + increment·n·(2s+n)/2 */
export function computeBuyCost(
  basePrice: BN,
  priceIncrement: BN,
  tokensOutstanding: BN,
  n: BN
): BN {
  const linear = basePrice.mul(n);
  const twoSPlusN = tokensOutstanding.muln(2).add(n);
  const curve = priceIncrement.mul(n).mul(twoSPlusN).divn(2);
  return linear.add(curve);
}

/** ∫[s-n → s] (base + increment·x) dx = base·n + increment·n·(2s-n)/2 */
export function computeSellPayout(
  basePrice: BN,
  priceIncrement: BN,
  tokensOutstanding: BN,
  n: BN
): BN {
  const linear = basePrice.mul(n);
  const twoSMinusN = tokensOutstanding.muln(2).sub(n);
  const curve = priceIncrement.mul(n).mul(twoSMinusN).divn(2);
  return linear.add(curve);
}

/** Spot price in lamports at current outstanding supply. */
export function spotPriceLamports(
  basePrice: BN,
  priceIncrement: BN,
  tokensOutstanding: BN
): BN {
  return basePrice.add(priceIncrement.mul(tokensOutstanding));
}

// ─── Provider helper ──────────────────────────────────────────────────────────

function useProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const walletKey = wallet.publicKey?.toBase58();

  return useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(
      connection,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wallet as any,
      AnchorProvider.defaultOptions()
    );
    // Anchor 1.0: Program(idl, provider) — programId embedded in IDL.address
    return new Program(IDL, provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, walletKey]);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProjectAccount = {
  publicKey: PublicKey;
  owner: PublicKey;
  tokenMint: PublicKey;
  imageUrl?: string;
  metadataUri?: string;
  name: string;
  symbol: string;
  description: string;
  targetRaise: BN;
  raisedAmount: BN;
  tokenPrice: BN;
  totalTokensForSale: BN;
  soldTokens: BN;
  createdAt: BN;
  isActive: boolean;
  tokensDeposited: boolean;
  progressPercent: number;
};

export type InvestmentAccount = {
  publicKey: PublicKey;
  investor: PublicKey;
  project: PublicKey;
  amountInvested: BN;
  tokensAllocated: BN;
  tokensClaimed: BN;
  timestamp: BN;
};

async function fetchTokenMetadataImage(
  rpcEndpoint: string,
  tokenMint: PublicKey
): Promise<{ imageUrl?: string; metadataUri?: string }> {
  try {
    const umi = createUmi(rpcEndpoint).use(mplTokenMetadata());
    const asset = await fetchDigitalAsset(umi, umiPublicKey(tokenMint.toBase58()));
    const metadataUri = asset.metadata.uri.replace(/\0/g, "").trim();
    if (!metadataUri) return {};

    const res = await fetch(metadataUri);
    if (!res.ok) return { metadataUri };

    const metadata = (await res.json()) as { image?: string };
    return { metadataUri, imageUrl: metadata.image };
  } catch {
    return {};
  }
}

// ─── useProjects ──────────────────────────────────────────────────────────────

export function useProjects() {
  const program = useProgram();
  const { connection } = useConnection();
  const [projects, setProjects] = useState<ProjectAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!program) return;
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await (program.account as any).project.all();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: ProjectAccount[] = raw.map((p: any) => {
        const acc = p.account as any;
        const raised = acc.raisedAmount as BN;
        const target = acc.targetRaise as BN;
        const progress = target.isZero()
          ? 0
          : Math.min(100, raised.muln(100).div(target).toNumber());
        return {
          publicKey: p.publicKey,
          owner: acc.owner as PublicKey,
          tokenMint: acc.tokenMint as PublicKey,
          name: acc.name as string,
          symbol: acc.symbol as string,
          description: acc.description as string,
          targetRaise: target,
          raisedAmount: raised,
          tokenPrice: acc.tokenPrice as BN,
          totalTokensForSale: acc.totalTokensForSale as BN,
          soldTokens: acc.soldTokens as BN,
          createdAt: acc.createdAt as BN,
          isActive: acc.isActive as boolean,
          tokensDeposited: acc.tokensDeposited as boolean,
          progressPercent: progress,
        };
      });
      const withImages = await Promise.all(
        mapped.map(async (project) => ({
          ...project,
          ...(await fetchTokenMetadataImage(connection.rpcEndpoint, project.tokenMint)),
        }))
      );
      setProjects(withImages);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [program, connection.rpcEndpoint]);

  useEffect(() => { fetch(); }, [fetch]);

  return { projects, loading, error, refetch: fetch };
}

// ─── useProject ───────────────────────────────────────────────────────────────

export function useProject(tokenMint: PublicKey | null) {
  const program = useProgram();
  const [project, setProject] = useState<ProjectAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!program || !tokenMint) return;
    setLoading(true);
    setError(null);
    try {
      const pda = await findProjectPda(tokenMint);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acc = await (program.account as any).project.fetch(pda) as any;
      const raised = acc.raisedAmount as BN;
      const target = acc.targetRaise as BN;
      const progress = target.isZero()
        ? 0
        : Math.min(100, raised.muln(100).div(target).toNumber());
      setProject({
        publicKey: pda,
        owner: acc.owner as PublicKey,
        tokenMint: acc.tokenMint as PublicKey,
        name: acc.name as string,
        symbol: acc.symbol as string,
        description: acc.description as string,
        targetRaise: target,
        raisedAmount: raised,
        tokenPrice: acc.tokenPrice as BN,
        totalTokensForSale: acc.totalTokensForSale as BN,
        soldTokens: acc.soldTokens as BN,
        createdAt: acc.createdAt as BN,
        isActive: acc.isActive as boolean,
        tokensDeposited: acc.tokensDeposited as boolean,
        progressPercent: progress,
      });
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [program, tokenMint?.toBase58()]);

  useEffect(() => { fetch(); }, [fetch]);

  return { project, loading, error, refetch: fetch };
}

// ─── useCreateProject ─────────────────────────────────────────────────────────

export type CreateProjectArgs = {
  tokenMint: PublicKey;
  name: string;
  symbol: string;
  description: string;
  targetRaiseSol: number;
  tokenPriceLamports: number;
  totalTokensForSale: number;
};

export function useCreateProject() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createProject = useCallback(
    async (args: CreateProjectArgs) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const projectPda = await findProjectPda(args.tokenMint);

        const txSig = await program.methods
          .createProject({
            name: args.name,
            symbol: args.symbol,
            description: args.description,
            targetRaise: new BN(args.targetRaiseSol * LAMPORTS_PER_SOL),
            tokenPrice: new BN(args.tokenPriceLamports),
            totalTokensForSale: new BN(args.totalTokensForSale),
          })
          .accounts({
            owner: publicKey,
            tokenMint: args.tokenMint,
            project: projectPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        return { txSig, projectPda };
      } catch (e) {
        setError(e as Error);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [program, publicKey]
  );

  return { createProject, loading, error };
}

// ─── useDepositTokens ─────────────────────────────────────────────────────────

export function useDepositTokens() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const depositTokens = useCallback(
    async (tokenMint: PublicKey, ownerTokenAccount: PublicKey) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const projectPda = await findProjectPda(tokenMint);
        const vaultPda = await findVaultPda(projectPda);

        const txSig = await program.methods
          .depositTokens()
          .accounts({
            owner: publicKey,
            tokenMint,
            project: projectPda,
            ownerTokenAccount,
            vault: vaultPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        return { txSig };
      } catch (e) {
        setError(e as Error);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [program, publicKey]
  );

  return { depositTokens, loading, error };
}

// ─── useInvest ────────────────────────────────────────────────────────────────

export function useInvest() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const invest = useCallback(
    async (tokenMint: PublicKey, amountSol: number) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const projectPda = await findProjectPda(tokenMint);
        const investmentPda = await findInvestmentPda(projectPda, publicKey);
        const amountLamports = new BN(amountSol * LAMPORTS_PER_SOL);

        const txSig = await program.methods
          .invest(amountLamports)
          .accounts({
            investor: publicKey,
            project: projectPda,
            investment: investmentPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        return { txSig, investmentPda };
      } catch (e) {
        setError(e as Error);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [program, publicKey]
  );

  return { invest, loading, error };
}

// ─── useInvestments ───────────────────────────────────────────────────────────

export function useInvestments(walletAddress?: PublicKey) {
  const program = useProgram();
  const { publicKey } = useWallet();
  const investor = walletAddress ?? publicKey;
  const [investments, setInvestments] = useState<InvestmentAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!program || !investor) return;
    setLoading(true);
    setError(null);
    try {
      // Filter by investor pubkey at offset 8 (after 8-byte discriminator).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await (program.account as any).investment.all([
        { memcmp: { offset: 8, bytes: investor.toBase58() } },
      ]);
      setInvestments(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw.map((i: any) => {
          const acc = i.account as InvestmentAccount;
          return {
            publicKey: i.publicKey,
            investor: acc.investor,
            project: acc.project,
            amountInvested: acc.amountInvested,
            tokensAllocated: acc.tokensAllocated,
            tokensClaimed: acc.tokensClaimed,
            timestamp: acc.timestamp,
          };
        })
      );
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [program, investor?.toBase58()]);

  useEffect(() => { fetch(); }, [fetch]);

  return { investments, loading, error, refetch: fetch };
}

// ─── useClaimTokens ───────────────────────────────────────────────────────────

export function useClaimTokens() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const claimTokens = useCallback(
    async (tokenMint: PublicKey) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const projectPda = await findProjectPda(tokenMint);
        const vaultPda = await findVaultPda(projectPda);
        const investmentPda = await findInvestmentPda(projectPda, publicKey);
        const investorAta = await getAssociatedTokenAddress(tokenMint, publicKey);

        const txSig = await program.methods
          .claimTokens()
          .accounts({
            investor: publicKey,
            tokenMint,
            project: projectPda,
            investment: investmentPda,
            vault: vaultPda,
            investorAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        return { txSig };
      } catch (e) {
        setError(e as Error);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [program, publicKey]
  );

  return { claimTokens, loading, error };
}

// ─── useWithdraw ──────────────────────────────────────────────────────────────

export function useWithdraw() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const withdraw = useCallback(
    async (tokenMint: PublicKey, amountSol: number) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const projectPda = await findProjectPda(tokenMint);

        const txSig = await program.methods
          .withdrawFunds(new BN(amountSol * LAMPORTS_PER_SOL))
          .accounts({
            owner: publicKey,
            project: projectPda,
          })
          .rpc();

        return { txSig };
      } catch (e) {
        setError(e as Error);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [program, publicKey]
  );

  return { withdraw, loading, error };
}

// ─── Market types ─────────────────────────────────────────────────────────────

export type MarketAccount = {
  publicKey: PublicKey;
  tokenMint: PublicKey;
  tokenReserve: BN;
  solReserve: BN;
  tokensOutstanding: BN;
  totalSupply: BN;
  basePrice: BN;
  priceIncrement: BN;
  /** Basis points of each buy sent to creator. */
  creatorFeeBps: number;
  /** Spot price in lamports for a single token at current supply. */
  spotPriceLamports: BN;
  /** Spot price in SOL. */
  spotPriceSol: number;
  /** Market cap = tokensOutstanding * spotPrice (in SOL). */
  marketCapSol: number;
  /** SOL in treasury (in SOL). */
  treasurySol: number;
};

// ─── useMarkets (all) ────────────────────────────────────────────────────────

export function useMarkets() {
  const program = useProgram();
  const [markets, setMarkets] = useState<MarketAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!program) return;
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await (program.account as any).market.all();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: MarketAccount[] = raw.map((m: any) => {
        const acc = m.account as any;
        const bp = acc.basePrice as BN;
        const pi = acc.priceIncrement as BN;
        const outstanding = acc.tokensOutstanding as BN;
        const spot = spotPriceLamports(bp, pi, outstanding);
        return {
          publicKey: m.publicKey,
          tokenMint: acc.tokenMint as PublicKey,
          tokenReserve: acc.tokenReserve as BN,
          solReserve: acc.solReserve as BN,
          tokensOutstanding: outstanding,
          totalSupply: acc.totalSupply as BN,
          basePrice: bp,
          priceIncrement: pi,
          creatorFeeBps: acc.creatorFeeBps as number ?? 0,
          spotPriceLamports: spot,
          spotPriceSol: spot.toNumber() / LAMPORTS_PER_SOL,
          marketCapSol:
            outstanding.mul(spot).div(new BN(LAMPORTS_PER_SOL)).toNumber(),
          treasurySol: (acc.solReserve as BN).toNumber() / LAMPORTS_PER_SOL,
        };
      });
      setMarkets(mapped);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => { fetch(); }, [fetch]);

  return { markets, loading, error, refetch: fetch };
}

// ─── useMarket ────────────────────────────────────────────────────────────────

export function useMarket(tokenMint: PublicKey | null) {
  const program = useProgram();
  const [market, setMarket] = useState<MarketAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!program || !tokenMint) return;
    setLoading(true);
    setError(null);
    try {
      const marketPda = findMarketPda(tokenMint);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acc = await (program.account as any).market.fetch(marketPda) as any;
      const bp = acc.basePrice as BN;
      const pi = acc.priceIncrement as BN;
      const outstanding = acc.tokensOutstanding as BN;
      const spot = spotPriceLamports(bp, pi, outstanding);
      setMarket({
        publicKey: marketPda,
        tokenMint: acc.tokenMint as PublicKey,
        tokenReserve: acc.tokenReserve as BN,
        solReserve: acc.solReserve as BN,
        tokensOutstanding: outstanding,
        totalSupply: acc.totalSupply as BN,
        basePrice: bp,
        priceIncrement: pi,
        creatorFeeBps: acc.creatorFeeBps as number ?? 0,
        spotPriceLamports: spot,
        spotPriceSol: spot.toNumber() / LAMPORTS_PER_SOL,
        marketCapSol:
          outstanding.mul(spot).div(new BN(LAMPORTS_PER_SOL)).toNumber(),
        treasurySol: (acc.solReserve as BN).toNumber() / LAMPORTS_PER_SOL,
      });
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [program, tokenMint?.toBase58()]);

  useEffect(() => { fetch(); }, [fetch]);

  return { market, loading, error, refetch: fetch };
}

// ─── useInitializeMarket ──────────────────────────────────────────────────────

export function useInitializeMarket() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const initializeMarket = useCallback(
    async (
      tokenMint: PublicKey,
      basePriceLamports: number,
      priceIncrementLamports: number,
      creatorFeeBps = 250,
    ) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const projectPda = await findProjectPda(tokenMint);
        const vaultPda = await findVaultPda(projectPda);
        const marketPda = findMarketPda(tokenMint);
        const treasuryPda = findTreasuryPda(tokenMint);

        const txSig = await program.methods
          .initializeMarket({
            basePrice: new BN(basePriceLamports),
            priceIncrement: new BN(priceIncrementLamports),
            creatorFeeBps,
          })
          .accounts({
            owner: publicKey,
            tokenMint,
            project: projectPda,
            market: marketPda,
            treasury: treasuryPda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        return { txSig, marketPda, treasuryPda };
      } catch (e) {
        setError(e as Error);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [program, publicKey]
  );

  return { initializeMarket, loading, error };
}

// ─── useBuy ───────────────────────────────────────────────────────────────────

export function useBuy() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Buy `tokenAmount` tokens.
   * @param creator      Project owner pubkey — receives creator fee on-chain.
   * @param slippageBps  Basis points of slippage tolerance (default 100 = 1%).
   */
  const buy = useCallback(
    async (tokenMint: PublicKey, tokenAmount: BN, creator: PublicKey, slippageBps = 100) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const projectPda = await findProjectPda(tokenMint);
        const vaultPda = await findVaultPda(projectPda);
        const marketPda = findMarketPda(tokenMint);
        const treasuryPda = findTreasuryPda(tokenMint);
        const buyerAta = await getAssociatedTokenAddress(tokenMint, publicKey);

        // Fetch current market state for slippage calc.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mkt = await (program.account as any).market.fetch(marketPda) as any;
        const cost = computeBuyCost(
          mkt.basePrice as BN,
          mkt.priceIncrement as BN,
          mkt.tokensOutstanding as BN,
          tokenAmount
        );
        // max_cost with slippage applied (round up to nearest lamport).
        const maxCost = cost.muln(10_000 + slippageBps).divn(10_000).addn(1);

        const txSig = await program.methods
          .buy(tokenAmount, maxCost)
          .accounts({
            buyer: publicKey,
            tokenMint,
            project: projectPda,
            creator,
            market: marketPda,
            treasury: treasuryPda,
            vault: vaultPda,
            buyerAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        return { txSig, cost, maxCost };
      } catch (e) {
        setError(e as Error);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [program, publicKey]
  );

  return { buy, loading, error };
}

// ─── useSell ──────────────────────────────────────────────────────────────────

export function useSell() {
  const program = useProgram();
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Sell `tokenAmount` tokens.
   * @param slippageBps  Basis points of slippage tolerance (default 100 = 1%).
   */
  const sell = useCallback(
    async (tokenMint: PublicKey, sellerAta: PublicKey, tokenAmount: BN, slippageBps = 100) => {
      if (!program || !publicKey) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const projectPda = await findProjectPda(tokenMint);
        const vaultPda = await findVaultPda(projectPda);
        const marketPda = findMarketPda(tokenMint);
        const treasuryPda = findTreasuryPda(tokenMint);

        // Fetch current market state for slippage calc.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mkt = await (program.account as any).market.fetch(marketPda) as any;
        const payout = computeSellPayout(
          mkt.basePrice as BN,
          mkt.priceIncrement as BN,
          mkt.tokensOutstanding as BN,
          tokenAmount
        );
        // min_payout after slippage (round down).
        const minPayout = payout.muln(10_000 - slippageBps).divn(10_000);

        const txSig = await program.methods
          .sell(tokenAmount, minPayout)
          .accounts({
            seller: publicKey,
            tokenMint,
            project: projectPda,
            market: marketPda,
            treasury: treasuryPda,
            vault: vaultPda,
            sellerAta,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        return { txSig, payout, minPayout };
      } catch (e) {
        setError(e as Error);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [program, publicKey]
  );

  return { sell, loading, error };
}
