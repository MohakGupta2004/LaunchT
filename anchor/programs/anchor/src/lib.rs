pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

pub use constants::*;
pub use error::*;
pub use state::*;

// ─── Params ───────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateProjectParams {
    pub name: String,
    pub symbol: String,
    pub description: String,
    /// Fundraising goal in lamports.
    pub target_raise: u64,
    /// Lamports per smallest token unit.
    pub token_price: u64,
    /// Raw token units offered for sale.
    pub total_tokens_for_sale: u64,
}

// ─── Account Contexts ─────────────────────────────────────────────────────────
// ALL #[derive(Accounts)] structs must live at the crate root so that
// Anchor's macro places __client_accounts_* at `crate::` where the generated
// `accounts` module can find them via `pub use crate::__client_accounts_*::*`.

#[derive(Accounts)]
#[instruction(params: CreateProjectParams)]
pub struct CreateProject<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: We only store the mint address; validated by Token program when
    /// deposit_tokens runs.
    pub token_mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Project::INIT_SPACE,
        seeds = [PROJECT_SEED, token_mint.key().as_ref()],
        bump,
    )]
    pub project: Account<'info, Project>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositTokens<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [PROJECT_SEED, token_mint.key().as_ref()],
        bump = project.bump,
        has_one = owner @ LaunchpadError::Unauthorized,
        has_one = token_mint @ LaunchpadError::NoTokensAvailable,
        constraint = project.is_active @ LaunchpadError::ProjectNotActive,
        constraint = !project.tokens_deposited @ LaunchpadError::TokensAlreadyDeposited,
    )]
    pub project: Account<'info, Project>,

    /// Owner's token account; must hold at least total_tokens_for_sale.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    /// Vault token account PDA controlled by the project PDA.
    #[account(
        init,
        payer = owner,
        seeds = [VAULT_SEED, project.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = project,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Invest<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    /// Project PDA also acts as treasury — invested SOL lands here.
    #[account(
        mut,
        seeds = [PROJECT_SEED, project.token_mint.as_ref()],
        bump = project.bump,
        constraint = project.is_active @ LaunchpadError::ProjectNotActive,
        constraint = project.tokens_deposited @ LaunchpadError::TokensNotDeposited,
    )]
    pub project: Account<'info, Project>,

    #[account(
        init_if_needed,
        payer = investor,
        space = 8 + Investment::INIT_SPACE,
        seeds = [INVESTMENT_SEED, project.key().as_ref(), investor.key().as_ref()],
        bump,
    )]
    pub investment: Account<'info, Investment>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimTokens<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    pub token_mint: Account<'info, Mint>,

    /// Project PDA is vault authority; its seeds sign the token transfer.
    #[account(
        seeds = [PROJECT_SEED, token_mint.key().as_ref()],
        bump = project.bump,
        has_one = token_mint @ LaunchpadError::NoTokensAvailable,
        constraint = project.tokens_deposited @ LaunchpadError::TokensNotDeposited,
    )]
    pub project: Account<'info, Project>,

    #[account(
        mut,
        seeds = [INVESTMENT_SEED, project.key().as_ref(), investor.key().as_ref()],
        bump = investment.bump,
        has_one = investor @ LaunchpadError::Unauthorized,
        has_one = project @ LaunchpadError::Unauthorized,
    )]
    pub investment: Account<'info, Investment>,

    #[account(
        mut,
        seeds = [VAULT_SEED, project.key().as_ref()],
        bump = project.vault_bump,
        token::mint = token_mint,
        token::authority = project,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Investor's ATA; created if it doesn't exist.
    #[account(
        init_if_needed,
        payer = investor,
        associated_token::mint = token_mint,
        associated_token::authority = investor,
    )]
    pub investor_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawFunds<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PROJECT_SEED, project.token_mint.as_ref()],
        bump = project.bump,
        has_one = owner @ LaunchpadError::Unauthorized,
    )]
    pub project: Account<'info, Project>,
}

// ─── Program ──────────────────────────────────────────────────────────────────

declare_id!("DYRJEMtEpkyrd4cpvjbGzf9Pg4CJ89JTm6id14PVmnWu");

#[program]
pub mod launchpad {
    use super::*;

    /// Register a token mint as an investable project.
    pub fn create_project(
        ctx: Context<CreateProject>,
        params: CreateProjectParams,
    ) -> Result<()> {
        instructions::create_project::handler(ctx, params)
    }

    /// Project owner transfers sale tokens into the vault PDA.
    /// Must be called before investors can invest.
    pub fn deposit_tokens(ctx: Context<DepositTokens>) -> Result<()> {
        instructions::deposit_tokens::handler(ctx)
    }

    /// Investor sends SOL; receives a token allocation recorded on-chain.
    pub fn invest(ctx: Context<Invest>, amount_in_lamports: u64) -> Result<()> {
        instructions::invest::handler(ctx, amount_in_lamports)
    }

    /// Investor claims all unclaimed allocated tokens to their ATA.
    pub fn claim_tokens(ctx: Context<ClaimTokens>) -> Result<()> {
        instructions::claim_tokens::handler(ctx)
    }

    /// Project owner withdraws SOL from the project PDA (treasury).
    pub fn withdraw_funds(ctx: Context<WithdrawFunds>, amount: u64) -> Result<()> {
        instructions::withdraw_funds::handler(ctx, amount)
    }
}
