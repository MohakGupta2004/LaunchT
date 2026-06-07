use anchor_lang::prelude::*;

#[error_code]
pub enum LaunchpadError {
    #[msg("Project is not active")]
    ProjectNotActive,
    #[msg("Investment amount too small to purchase any tokens")]
    InsufficientAmount,
    #[msg("Tokens not yet deposited into vault by project owner")]
    TokensNotDeposited,
    #[msg("No tokens left for sale")]
    NoTokensAvailable,
    #[msg("Investment would exceed remaining token supply")]
    ExceedsTokenLimit,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Unauthorized: caller is not the project owner")]
    Unauthorized,
    #[msg("Requested withdrawal exceeds raised amount on record")]
    InsufficientTreasury,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Token price must be greater than zero")]
    InvalidTokenPrice,
    #[msg("Target raise must be greater than zero")]
    InvalidTargetRaise,
    #[msg("Total tokens for sale must be greater than zero")]
    InvalidTokenSupply,
    #[msg("Name exceeds 50 characters")]
    NameTooLong,
    #[msg("Symbol exceeds 10 characters")]
    SymbolTooLong,
    #[msg("Description exceeds 200 characters")]
    DescriptionTooLong,
    #[msg("Tokens have already been deposited into the vault")]
    TokensAlreadyDeposited,
    #[msg("Investment amount must be greater than zero")]
    ZeroInvestment,
    #[msg("Owner token account has insufficient balance")]
    InsufficientOwnerBalance,
}
