use anchor_lang::prelude::*;


#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AvailableCollateral {
    pub user_collateral_available: i64,
    pub market_collateral_available: i64,
    pub max_market_collateral_available: i64,
    pub exchange_collateral_available: i64,
}

