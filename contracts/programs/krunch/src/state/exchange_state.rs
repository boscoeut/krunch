use anchor_lang::prelude::*;
use anchor_spl::{
    token::{ Mint, Token, TokenAccount},
};

#[derive(Accounts)]
pub struct InitializeExchange<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init, 
        payer = admin,
        seeds = [b"exchange".as_ref()],
        bump,
        space = 8 
                + 32 // admin:Pubkey
                + 8 // margin_used:i64
                + 2 // number_of_markets:i16
                + 2 // market_weight:i16
                + 8 // basis:i64
                + 8 // pnl:i64
                + 8 // fees:i64
                + 8 // collateral_value:i64
                + 4 // leverage:u32
                + 8 // rebates:i64
                + 8 // amount_withdrawn:i64
                + 8 // amount_deposited:i64
                + 8 // rewards:i64
                + 8 // last_rewards_claim:i64
            )]
    pub exchange: Account<'info, Exchange>,
    system_program: Program<'info, System>,
}

// data validation
#[derive(Accounts)]
#[instruction(market_index: u16, amount:i64)]
pub struct ExecuteTrade<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut, 
        seeds = [b"market".as_ref(), market_index.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"user_account".as_ref(),owner.key().as_ref()],
        constraint = user_account.owner == owner.key(),
        bump)]
    pub user_account: Account<'info, UserAccount>,
    #[account(
        mut,
        seeds = [b"user_position".as_ref(),owner.key().as_ref(),market_index.to_le_bytes().as_ref()],
        bump)]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        mut, 
        seeds = [b"exchange".as_ref()],
        bump
    )]
    pub exchange: Account<'info, Exchange>,
    system_program: Program<'info, System>,
    /// CHECK: We're reading data from this chainlink feed account
    pub chainlink_feed: AccountInfo<'info>,
    /// CHECK: This is the Chainlink program library
    pub chainlink_program: AccountInfo<'info>
}

// data validation
#[derive(Accounts)]
#[instruction(market_index: u16, price:i64)]
pub struct UpdateMarket<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut, 
        seeds = [b"market".as_ref(), market_index.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut, 
        seeds = [b"exchange".as_ref()],
        bump,
        constraint = exchange.admin == owner.key(),
    )]
    pub exchange: Account<'info, Exchange>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut, 
        seeds = [b"exchange".as_ref()],
        bump
    )]
    pub exchange: Account<'info, Exchange>,
    #[account(
        mut,
        seeds = [b"user_account".as_ref(),owner.key().as_ref()],
        constraint = user_account.owner == owner.key(),
        bump)]
    pub user_account: Account<'info, UserAccount>,
    system_program: Program<'info, System>,
    #[account(mut,
        constraint = user_token_account.owner == owner.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [
            exchange.key().as_ref(),
            mint.key().as_ref()],
        bump,
        token::mint=mint,
        token::authority=exchange,
    )]
    pub escrow_account: Account<'info, TokenAccount>,
    #[account(
        mut, 
        seeds = [b"exchange_position".as_ref(), mint.key().as_ref()],
        bump
    )]
    pub exchange_treasury_position: Account<'info, ExchangeTreasuryPosition>,
    /// CHECK: We're reading data from this chainlink feed account
    pub chainlink_feed: AccountInfo<'info>,
    /// CHECK: This is the Chainlink program library
    pub chainlink_program: AccountInfo<'info>
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut, 
        seeds = [b"exchange".as_ref()],
        bump
    )]
    pub exchange: Account<'info, Exchange>,
    #[account(
        mut,
        seeds = [b"user_account".as_ref(),owner.key().as_ref()],
        constraint = user_account.owner == owner.key(),
        bump)]
    pub user_account: Account<'info, UserAccount>,
    system_program: Program<'info, System>,
    #[account(mut,
        constraint = user_token_account.owner == owner.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [
            exchange.key().as_ref(),
            mint.key().as_ref()],
        bump,
        token::mint=mint,
        token::authority=exchange,
    )]
    pub escrow_account: Account<'info, TokenAccount>,
    #[account(
        mut, 
        seeds = [b"exchange_position".as_ref(), mint.key().as_ref()],
        bump
    )]
    pub exchange_treasury_position: Account<'info, ExchangeTreasuryPosition>,
    /// CHECK: We're reading data from this chainlink feed account
    pub chainlink_feed: AccountInfo<'info>,
    /// CHECK: This is the Chainlink program library
    pub chainlink_program: AccountInfo<'info>
   
}

#[derive(Accounts)]
pub struct ExchangeTransaction<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut, 
        seeds = [b"exchange".as_ref()],
        constraint = exchange.admin == owner.key(),
        bump
    )]
    pub exchange: Account<'info, Exchange>,
    system_program: Program<'info, System>,
    #[account(mut,
        constraint = user_token_account.owner == owner.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [
            exchange.key().as_ref(),
            mint.key().as_ref()],
        bump,
        token::mint=mint,
        token::authority=exchange,
    )]
    pub escrow_account: Account<'info, TokenAccount>,
    #[account(
        mut, 
        seeds = [b"exchange_position".as_ref(), mint.key().as_ref()],
        bump
    )]
    pub exchange_treasury_position: Account<'info, ExchangeTreasuryPosition>,
    /// CHECK: We're reading data from this chainlink feed account
    pub chainlink_feed: AccountInfo<'info>,
    /// CHECK: This is the Chainlink program library
    pub chainlink_program: AccountInfo<'info>
   
}

#[derive(Accounts)]
pub struct CreateUserAccount<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init, 
        payer = owner,
        seeds = [b"user_account".as_ref(),owner.key().as_ref()],
        bump,
        space = 8 
                + 32 // owner:Pubkey
                + 8 // collateral_value:i64
                + 8 // margin_used:i64
                + 8 // basis:i64
                + 8 // pnl:i64
                + 8 // fees:i64
                + 8 // rebates:i64
                + 8 // rewards:i64
                + 8 // last_rewards_claim:i64
            )]
    pub user_account: Account<'info, UserAccount>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_index: u16)]
pub struct AddMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init, 
        payer = admin,
        space = 8 
                + 2 // market_index:u16
                + 2 // market_weight:u16
                + 8 // token_amount:i64
                + 8 // basis:i64
                + 8 // pnl:i64
                + 8 // fees:i64
                + 2 // taker_fee:i16
                + 2 // maker_fee:i16
                + 4 // leverage:u32
                + 8 // margin_used:i64
                + 32 // feed_address:Pubkey
                + 8 // rebates:i64
        ,
        seeds = [b"market".as_ref(), market_index.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut, 
        seeds = [b"exchange".as_ref()],
        bump,
        constraint = exchange.admin == admin.key(),
    )]
    pub exchange: Account<'info, Exchange>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey)]
pub struct AddExchangeTreasuryPosition<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init, 
        payer = admin,
        space = 8 
                + 32 // token_mint:Pubkey
                + 2 // active:bool
                + 2 // treasuryWeight:u16,
                + 1 // decimals:u8
                + 32 // feed_address:Pubkey
        ,
        seeds = [b"exchange_position".as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub exchange_treasury_position: Account<'info, ExchangeTreasuryPosition>,
    #[account(
        mut, 
        seeds = [b"exchange".as_ref()],
        bump,
        constraint = exchange.admin == admin.key(),
    )]
    pub exchange: Account<'info, Exchange>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey)]
pub struct UpdateExchangeTreasuryPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut, 
        seeds = [b"exchange_position".as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub exchange_treasury_position: Account<'info, ExchangeTreasuryPosition>,
    #[account(
        mut, 
        seeds = [b"exchange".as_ref()],
        bump,
        constraint = exchange.admin == owner.key(),
    )]
    pub exchange: Account<'info, Exchange>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_index: u16)]
pub struct AddUserPosition<'info> {
    #[account(mut)]
    owner: Signer<'info>,
    #[account(
        init, 
        payer = owner,
        space = 8
                + 32 // owner:Pubkey
                + 2 // market_index:u16
                + 8 // token_amount:i64
                + 8 // basis:i64
                + 8 // pnl:i64
                + 8 // fees:i64
                + 8 // margin_used:i64
                + 8 // rebates:i64
        ,
        seeds = [b"user_position".as_ref(),owner.key().as_ref(), market_index.to_le_bytes().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        mut,
        seeds = [b"user_account".as_ref(),owner.key().as_ref()],
        bump)]
    pub user_account: Account<'info, UserAccount>,
    #[account(
        mut, 
        seeds = [b"market".as_ref(), market_index.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    system_program: Program<'info, System>,
}

// Data structures
#[account]
pub struct Exchange {
    pub admin: Pubkey,
    pub margin_used: i64,
    pub number_of_markets: u16,
    pub market_weight: u16,
    pub basis: i64,
    pub pnl: i64, 
    pub fees: i64,
    pub collateral_value: i64,
    pub leverage: u32,
    pub rebates: i64,
    pub amount_withdrawn: i64,
    pub amount_deposited: i64,
    pub rewards: i64,
    pub last_rewards_claim: i64,
}

#[account]
pub struct ExchangeTreasuryPosition {
    pub token_mint: Pubkey,
    pub active: bool,
    pub treasury_weight: u16,
    pub decimals: u8,
    pub feed_address: Pubkey,
}

#[account]
pub struct Market {
    pub market_index: u16,
    pub market_weight: u16,
    pub token_amount: i64,
    pub basis: i64,
    pub pnl: i64,
    pub fees: i64,
    pub taker_fee: i16,
    pub maker_fee: i16,
    pub leverage: u32,
    pub margin_used: i64,
    pub feed_address: Pubkey,
    pub rebates: i64,
}

#[account]
pub struct UserAccount {
    pub owner: Pubkey,
    pub collateral_value: i64,
    pub margin_used: i64,
    pub basis: i64,
    pub pnl: i64,
    pub fees: i64,
    pub rebates: i64,
    pub rewards: i64,
    pub last_rewards_claim: i64,
}

#[account]
pub struct UserPosition {
    pub owner: Pubkey,
    pub market_index: u16,
    pub token_amount: i64,
    pub basis: i64,
    pub pnl: i64,
    pub fees: i64,
    pub margin_used: i64,
    pub rebates: i64,
}

