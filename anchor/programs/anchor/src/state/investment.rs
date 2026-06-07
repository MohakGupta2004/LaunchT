use anchor_lang::prelude::*;

/// One Investment account per (project, investor) pair.
/// PDA seeds: ["investment", project, investor]
/// A second investment by the same wallet accumulates into this account.
#[account]
#[derive(InitSpace)]
pub struct Investment {
    pub investor: Pubkey,
    pub project: Pubkey,
    /// Total lamports invested across all invest() calls.
    pub amount_invested: u64,
    /// Total tokens allocated (cumulative).
    pub tokens_allocated: u64,
    /// Tokens already claimed via claim_tokens().
    pub tokens_claimed: u64,
    /// Timestamp of first investment.
    pub timestamp: i64,
    pub bump: u8,
}
