use anchor_lang::prelude::*;

use crate::error::LaunchpadError;
use crate::{CreateProject, CreateProjectParams};

pub fn handler(ctx: Context<CreateProject>, params: CreateProjectParams) -> Result<()> {
    require!(params.name.len() <= 50, LaunchpadError::NameTooLong);
    require!(params.symbol.len() <= 10, LaunchpadError::SymbolTooLong);
    require!(params.description.len() <= 200, LaunchpadError::DescriptionTooLong);
    require!(params.token_price > 0, LaunchpadError::InvalidTokenPrice);
    require!(params.target_raise > 0, LaunchpadError::InvalidTargetRaise);
    require!(params.total_tokens_for_sale > 0, LaunchpadError::InvalidTokenSupply);

    let project = &mut ctx.accounts.project;
    let clock = Clock::get()?;

    project.owner = ctx.accounts.owner.key();
    project.token_mint = ctx.accounts.token_mint.key();
    project.name = params.name;
    project.symbol = params.symbol;
    project.description = params.description;
    project.target_raise = params.target_raise;
    project.raised_amount = 0;
    project.token_price = params.token_price;
    project.total_tokens_for_sale = params.total_tokens_for_sale;
    project.sold_tokens = 0;
    project.created_at = clock.unix_timestamp;
    project.is_active = true;
    project.tokens_deposited = false;
    project.bump = ctx.bumps.project;
    project.vault_bump = 0; // set by deposit_tokens

    msg!("Project created: {} ({})", project.name, project.symbol);
    Ok(())
}
