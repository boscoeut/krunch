use anchor_lang::prelude::*;

pub fn get_current_price(current_price: u64) -> i64 {
    return current_price.try_into().unwrap();
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AvailableCollateral {
    pub user_collateral_available: i64,
    pub market_collateral_available: i64,
    pub max_market_collateral_available: i64,
    pub exchange_collateral_available: i64,
}

