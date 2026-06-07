use anchor_lang::prelude::*;

use crate::error::LaunchpadError;
use crate::state::Project;
use crate::WithdrawFunds;

pub fn handler(ctx: Context<WithdrawFunds>, amount: u64) -> Result<()> {
    require!(amount > 0, LaunchpadError::ZeroInvestment);

    require!(
        ctx.accounts.project.raised_amount >= amount,
        LaunchpadError::InsufficientTreasury
    );

    // Ensure project keeps its rent-exempt minimum after withdrawal.
    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(8 + Project::INIT_SPACE);
    let project_info = ctx.accounts.project.to_account_info();
    let current_lamports = project_info.lamports();

    require!(
        current_lamports.saturating_sub(amount) >= min_balance,
        LaunchpadError::InsufficientTreasury
    );

    // Direct lamport manipulation — the only way to debit a program-owned account.
    **project_info.try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += amount;

    ctx.accounts.project.raised_amount = ctx
        .accounts
        .project
        .raised_amount
        .checked_sub(amount)
        .ok_or(LaunchpadError::Overflow)?;

    msg!("Withdrew {} lamports from project treasury", amount);
    Ok(())
}
