use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::error::LaunchpadError;
use crate::Invest;

pub fn handler(ctx: Context<Invest>, amount_in_lamports: u64) -> Result<()> {
    require!(amount_in_lamports > 0, LaunchpadError::ZeroInvestment);

    let token_price = ctx.accounts.project.token_price;
    let tokens_received = amount_in_lamports
        .checked_div(token_price)
        .ok_or(LaunchpadError::Overflow)?;

    require!(tokens_received > 0, LaunchpadError::InsufficientAmount);

    let remaining = ctx
        .accounts
        .project
        .total_tokens_for_sale
        .checked_sub(ctx.accounts.project.sold_tokens)
        .ok_or(LaunchpadError::Overflow)?;

    require!(remaining >= tokens_received, LaunchpadError::ExceedsTokenLimit);

    // Transfer SOL from investor into the project PDA (treasury).
    // system_program::transfer can credit any account regardless of its owner.
    transfer(
        CpiContext::new(
            anchor_lang::solana_program::system_program::id(),
            Transfer {
                from: ctx.accounts.investor.to_account_info(),
                to: ctx.accounts.project.to_account_info(),
            },
        ),
        amount_in_lamports,
    )?;

    let project = &mut ctx.accounts.project;
    project.raised_amount = project
        .raised_amount
        .checked_add(amount_in_lamports)
        .ok_or(LaunchpadError::Overflow)?;
    project.sold_tokens = project
        .sold_tokens
        .checked_add(tokens_received)
        .ok_or(LaunchpadError::Overflow)?;

    // Initialize investment on first call (zeroed Pubkey = uninitialised sentinel).
    let investment = &mut ctx.accounts.investment;
    let clock = Clock::get()?;

    if investment.investor == Pubkey::default() {
        investment.investor = ctx.accounts.investor.key();
        investment.project = ctx.accounts.project.key();
        investment.tokens_claimed = 0;
        investment.timestamp = clock.unix_timestamp;
        investment.bump = ctx.bumps.investment;
    }

    investment.amount_invested = investment
        .amount_invested
        .checked_add(amount_in_lamports)
        .ok_or(LaunchpadError::Overflow)?;
    investment.tokens_allocated = investment
        .tokens_allocated
        .checked_add(tokens_received)
        .ok_or(LaunchpadError::Overflow)?;

    msg!(
        "Invested {} lamports → {} tokens allocated",
        amount_in_lamports,
        tokens_received
    );
    Ok(())
}
