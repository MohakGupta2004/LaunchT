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

// ─── useProjects ──────────────────────────────────────────────────────────────

export function useProjects() {
  const program = useProgram();
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
      setProjects(mapped);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [program]);

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
