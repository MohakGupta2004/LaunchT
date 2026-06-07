use anchor_lang::prelude::*;

/// Bonding curve market for a token.
/// PDA seeds: ["market", token_mint]
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub token_mint: Pubkey,
    /// Tokens in vault available for purchase.
    pub token_reserve: u64,
    /// Lamports in treasury available for sell payouts.
    pub sol_reserve: u64,
    /// Net tokens outstanding in trader wallets (buy: +n, sell: -n).
    pub tokens_outstanding: u64,
    /// Total tokens this market was seeded with.
    pub total_supply: u64,
    /// Lamports per token when tokens_outstanding = 0.
    pub base_price: u64,
    /// Lamports added to price per token outstanding (curve slope).
    pub price_increment: u64,
    pub bump: u8,
    /// Stored so buy/sell can validate treasury PDA without re-derivation.
    pub treasury_bump: u8,
    /// Basis points of each buy sent to the project creator (100 = 1%).
    pub creator_fee_bps: u16,
}

/// Minimal program-owned SOL vault.
/// PDA seeds: ["treasury", token_mint]
/// Lamports above rent-exempt minimum = tradeable reserve.
#[account]
#[derive(InitSpace)]
pub struct Treasury {}
