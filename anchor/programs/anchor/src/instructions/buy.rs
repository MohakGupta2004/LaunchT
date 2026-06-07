use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer as sol_transfer, Transfer as SolTransfer};
use anchor_spl::token::{spl_token, transfer as spl_transfer, Transfer as SplTransfer};

use crate::constants::PROJECT_SEED;
use crate::error::LaunchpadError;
use crate::Buy;

pub fn handler(ctx: Context<Buy>, token_amount: u64, max_cost: u64) -> Result<()> {
    require!(token_amount > 0, LaunchpadError::ZeroInvestment);

    // Snapshot state before any mutations.
    let base_price = ctx.accounts.market.base_price;
    let price_increment = ctx.accounts.market.price_increment;
    let tokens_outstanding = ctx.accounts.market.tokens_outstanding;
    let token_reserve = ctx.accounts.market.token_reserve;
    let creator_fee_bps = ctx.accounts.market.creator_fee_bps as u64;
    let project_bump = ctx.accounts.project.bump;
    let token_mint_key = ctx.accounts.token_mint.key();

    require!(token_reserve >= token_amount, LaunchpadError::ExceedsTokenLimit);

    let cost = compute_buy_cost(base_price, price_increment, tokens_outstanding, token_amount)?;
    require!(cost > 0, LaunchpadError::InsufficientAmount);
    require!(cost <= max_cost, LaunchpadError::SlippageExceeded);

    // Split cost: fee → creator, remainder → treasury.
    let creator_fee = cost
        .checked_mul(creator_fee_bps)
        .and_then(|v| v.checked_div(10_000))
        .unwrap_or(0);
    let treasury_amount = cost.checked_sub(creator_fee).ok_or(LaunchpadError::Overflow)?;

    // SOL: buyer → treasury.
    sol_transfer(
        CpiContext::new(
            anchor_lang::solana_program::system_program::id(),
            SolTransfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        treasury_amount,
    )?;

    // SOL: buyer → creator fee.
    if creator_fee > 0 {
        sol_transfer(
            CpiContext::new(
                anchor_lang::solana_program::system_program::id(),
                SolTransfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.creator.to_account_info(),
                },
            ),
            creator_fee,
        )?;
    }

    // Tokens: vault → buyer ATA (project PDA signs as vault authority).
    spl_transfer(
        CpiContext::new_with_signer(
            spl_token::id(),
            SplTransfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.buyer_ata.to_account_info(),
                authority: ctx.accounts.project.to_account_info(),
            },
            &[&[PROJECT_SEED, token_mint_key.as_ref(), &[project_bump]]],
        ),
        token_amount,
    )?;

    let market = &mut ctx.accounts.market;
    market.token_reserve = market
        .token_reserve
        .checked_sub(token_amount)
        .ok_or(LaunchpadError::Overflow)?;
    // Only treasury_amount enters the sell-payout reserve (fee goes to creator).
    market.sol_reserve = market
        .sol_reserve
        .checked_add(treasury_amount)
        .ok_or(LaunchpadError::Overflow)?;
    market.tokens_outstanding = market
        .tokens_outstanding
        .checked_add(token_amount)
        .ok_or(LaunchpadError::Overflow)?;

    msg!(
        "Buy: {} tokens for {} lamports ({} fee to creator)",
        token_amount,
        cost,
        creator_fee,
    );
    Ok(())
}

/// ∫[s → s+n] (base_price + price_increment·x) dx
/// = base_price·n + price_increment·n·(2s + n) / 2
fn compute_buy_cost(
    base_price: u64,
    price_increment: u64,
    tokens_outstanding: u64,
    n: u64,
) -> Result<u64> {
    let s = tokens_outstanding as u128;
    let n = n as u128;
    let bp = base_price as u128;
    let pi = price_increment as u128;

    let linear = bp.checked_mul(n).ok_or(error!(LaunchpadError::Overflow))?;
    let two_s_plus_n = s
        .checked_mul(2)
        .and_then(|v| v.checked_add(n))
        .ok_or(error!(LaunchpadError::Overflow))?;
    let curve = pi
        .checked_mul(n)
        .and_then(|v| v.checked_mul(two_s_plus_n))
        .and_then(|v| v.checked_div(2))
        .ok_or(error!(LaunchpadError::Overflow))?;

    let total = linear
        .checked_add(curve)
        .ok_or(error!(LaunchpadError::Overflow))?;

    u64::try_from(total).map_err(|_| error!(LaunchpadError::Overflow))
}
