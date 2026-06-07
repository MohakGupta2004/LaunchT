use anchor_lang::prelude::*;

/// One Project account per token mint.
/// PDA seeds: ["project", token_mint]
/// Invested SOL lives in this account's lamports (above rent-exempt minimum).
/// raised_amount tracks the withdrawable balance; it decrements on withdrawal.
#[account]
#[derive(InitSpace)]
pub struct Project {
    /// Original creator; only they may deposit tokens and withdraw SOL.
    pub owner: Pubkey,
    /// The SPL mint this project sells.
    pub token_mint: Pubkey,
    #[max_len(50)]
    pub name: String,
    #[max_len(10)]
    pub symbol: String,
    #[max_len(200)]
    pub description: String,
    /// Fundraising goal in lamports.
    pub target_raise: u64,
    /// Lamports currently raised (decremented on withdrawal).
    pub raised_amount: u64,
    /// Lamports per smallest token unit (e.g., 1_000_000 lamports per token with 9 decimals).
    pub token_price: u64,
    /// Number of tokens (raw units) offered for sale.
    pub total_tokens_for_sale: u64,
    /// Tokens already allocated to investors.
    pub sold_tokens: u64,
    pub created_at: i64,
    pub is_active: bool,
    /// True after owner calls deposit_tokens; investing requires this.
    pub tokens_deposited: bool,
    /// Canonical bump for this PDA (stored to avoid re-derivation in CPIs).
    pub bump: u8,
    /// Canonical bump for the vault token account PDA; set in deposit_tokens.
    pub vault_bump: u8,
}
