use anchor_lang::prelude::*;
use anchor_spl::token::{spl_token, transfer, Transfer as SplTransfer};

use crate::error::LaunchpadError;
use crate::DepositTokens;

pub fn handler(ctx: Context<DepositTokens>) -> Result<()> {
    let total_tokens = ctx.accounts.project.total_tokens_for_sale;

    require!(
        ctx.accounts.owner_token_account.amount >= total_tokens,
        LaunchpadError::InsufficientOwnerBalance
    );

    transfer(
        CpiContext::new(
            spl_token::id(),
            SplTransfer {
                from: ctx.accounts.owner_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        total_tokens,
    )?;

    let project = &mut ctx.accounts.project;
    project.tokens_deposited = true;
    project.vault_bump = ctx.bumps.vault;

    msg!("Deposited {} tokens into vault", total_tokens);
    Ok(())
}
