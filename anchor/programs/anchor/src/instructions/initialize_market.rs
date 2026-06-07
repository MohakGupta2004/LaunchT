use anchor_lang::prelude::*;

use crate::error::LaunchpadError;
use crate::{InitializeMarket, InitializeMarketParams};

pub fn handler(ctx: Context<InitializeMarket>, params: InitializeMarketParams) -> Result<()> {
    require!(params.base_price > 0, LaunchpadError::InvalidTokenPrice);

    let vault_amount = ctx.accounts.vault.amount;
    let market = &mut ctx.accounts.market;

    market.token_mint = ctx.accounts.token_mint.key();
    market.token_reserve = vault_amount;
    market.sol_reserve = 0;
    // Account for tokens already circulating via legacy invest() calls.
    market.tokens_outstanding = ctx.accounts.project.sold_tokens;
    market.total_supply = ctx.accounts.project.total_tokens_for_sale;
    market.base_price = params.base_price;
    market.price_increment = params.price_increment;
    market.creator_fee_bps = params.creator_fee_bps;
    market.bump = ctx.bumps.market;
    market.treasury_bump = ctx.bumps.treasury;

    msg!(
        "Market initialized: base_price={} lamports, increment={} lamports/token, reserve={} tokens",
        params.base_price,
        params.price_increment,
        vault_amount,
    );
    Ok(())
}
