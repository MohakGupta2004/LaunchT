use anchor_lang::prelude::*;
use anchor_spl::token::{spl_token, transfer, Transfer as SplTransfer};

use crate::constants::PROJECT_SEED;
use crate::error::LaunchpadError;
use crate::ClaimTokens;

pub fn handler(ctx: Context<ClaimTokens>) -> Result<()> {
    let unclaimed = ctx
        .accounts
        .investment
        .tokens_allocated
        .checked_sub(ctx.accounts.investment.tokens_claimed)
        .ok_or(LaunchpadError::Overflow)?;

    require!(unclaimed > 0, LaunchpadError::NothingToClaim);

    // Project PDA is the vault authority — sign with its seeds.
    let token_mint_key = ctx.accounts.project.token_mint;
    let project_seeds: &[&[u8]] = &[
        PROJECT_SEED,
        token_mint_key.as_ref(),
        &[ctx.accounts.project.bump],
    ];
    let signer = &[project_seeds];

    transfer(
        CpiContext::new_with_signer(
            spl_token::id(),
            SplTransfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.investor_ata.to_account_info(),
                authority: ctx.accounts.project.to_account_info(),
            },
            signer,
        ),
        unclaimed,
    )?;

    ctx.accounts.investment.tokens_claimed = ctx
        .accounts
        .investment
        .tokens_claimed
        .checked_add(unclaimed)
        .ok_or(LaunchpadError::Overflow)?;

    msg!("Claimed {} tokens", unclaimed);
    Ok(())
}
