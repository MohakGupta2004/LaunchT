use anchor_lang::prelude::*;
use anchor_spl::token::{spl_token, transfer as spl_transfer, Transfer as SplTransfer};

use crate::error::LaunchpadError;
use crate::Sell;

pub fn handler(ctx: Context<Sell>, token_amount: u64, min_payout: u64) -> Result<()> {
    require!(token_amount > 0, LaunchpadError::ZeroInvestment);

    let base_price = ctx.accounts.market.base_price;
    let price_increment = ctx.accounts.market.price_increment;
    let tokens_outstanding = ctx.accounts.market.tokens_outstanding;
    let sol_reserve = ctx.accounts.market.sol_reserve;

    require!(
        ctx.accounts.seller_ata.amount >= token_amount,
        LaunchpadError::InsufficientSellerBalance
    );
    // Prevent outstanding counter underflow — can't sell more than in circulation.
    require!(
        tokens_outstanding >= token_amount,
        LaunchpadError::ExceedsTokenLimit
    );

    let payout =
        compute_sell_payout(base_price, price_increment, tokens_outstanding, token_amount)?;
    require!(payout >= min_payout, LaunchpadError::SlippageExceeded);
    require!(sol_reserve >= payout, LaunchpadError::InsufficientTreasury);

    // Tokens: seller ATA → vault (seller signs; no PDA needed for receive side).
    spl_transfer(
        CpiContext::new(
            spl_token::id(),
            SplTransfer {
                from: ctx.accounts.seller_ata.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        token_amount,
    )?;

    // SOL: treasury → seller (direct lamport manipulation; treasury is program-owned).
    // Compute new balances before taking any mutable borrows.
    let new_treasury = ctx
        .accounts
        .treasury
        .to_account_info()
        .lamports()
        .checked_sub(payout)
        .ok_or(LaunchpadError::Overflow)?;
    let new_seller = ctx
        .accounts
        .seller
        .to_account_info()
        .lamports()
        .checked_add(payout)
        .ok_or(LaunchpadError::Overflow)?;

    **ctx
        .accounts
        .treasury
        .to_account_info()
        .try_borrow_mut_lamports()? = new_treasury;
    **ctx
        .accounts
        .seller
        .to_account_info()
        .try_borrow_mut_lamports()? = new_seller;

    let market = &mut ctx.accounts.market;
    market.token_reserve = market
        .token_reserve
        .checked_add(token_amount)
        .ok_or(LaunchpadError::Overflow)?;
    market.sol_reserve = market
        .sol_reserve
        .checked_sub(payout)
        .ok_or(LaunchpadError::Overflow)?;
    market.tokens_outstanding = market
        .tokens_outstanding
        .checked_sub(token_amount)
        .ok_or(LaunchpadError::Overflow)?;

    msg!("Sell: {} tokens, payout {} lamports", token_amount, payout);
    Ok(())
}

/// ∫[s-n → s] (base_price + price_increment·x) dx
/// = base_price·n + price_increment·n·(2s - n) / 2
/// Precondition: n <= tokens_outstanding (enforced by caller).
fn compute_sell_payout(
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
    let two_s_minus_n = s
        .checked_mul(2)
        .and_then(|v| v.checked_sub(n))
        .ok_or(error!(LaunchpadError::Overflow))?;
    let curve = pi
        .checked_mul(n)
        .and_then(|v| v.checked_mul(two_s_minus_n))
        .and_then(|v| v.checked_div(2))
        .ok_or(error!(LaunchpadError::Overflow))?;

    let total = linear
        .checked_add(curve)
        .ok_or(error!(LaunchpadError::Overflow))?;

    u64::try_from(total).map_err(|_| error!(LaunchpadError::Overflow))
}
