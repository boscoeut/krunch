use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{mint_to, Mint, MintTo, Token, TokenAccount},
};
#[derive(Accounts)]
pub struct Calculate<'info> {
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CalculateFee<'info> {
    system_program: Program<'info, System>,
}

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
}

// data validation

// data validation
#[derive(Accounts)]
#[instruction(market_index: u16)]
pub struct GetAvailableCollateral<'info> {
    #[account()]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"market".as_ref(), market_index.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        seeds = [b"user_account".as_ref(),owner.key().as_ref()],
        bump)]
    pub user_account: Account<'info, UserAccount>,
    #[account(
        seeds = [b"user_position".as_ref(),owner.key().as_ref(),market_index.to_le_bytes().as_ref()],
        bump)]
    pub user_position: Account<'info, UserPosition>,
    #[account(
        seeds = [b"exchange".as_ref()],
        bump
    )]
    pub exchange: Account<'info, Exchange>
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
        bump)]
    pub user_account: Account<'info, UserAccount>,
    system_program: Program<'info, System>,
    #[account(mut)]
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
        bump)]
    pub user_account: Account<'info, UserAccount>,
    system_program: Program<'info, System>,

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
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub mint: Account<'info, Mint>,
   
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
                + 8 // current_price:u64
                + 2 // taker_fee:i16
                + 2 // maker_fee:i16
                + 2 // leverage:u16
                + 8 // margin_used:i64
                + 32 // feed_address:Pubkey
        ,
        seeds = [b"market".as_ref(), market_index.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut, 
        seeds = [b"exchange".as_ref()],
        bump
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
                + 32 // tokenMint:Pubkey
                + 2 // active:bool
                + 2 // treasuryWeight:u16
        ,
        seeds = [b"exchange_position".as_ref(), token_mint.as_ref()],
        bump
    )]
    pub exchange_treasury_position: Account<'info, ExchangeTreasuryPosition>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(tokenMint: Pubkey)]
pub struct UpdateExchangeTreasuryPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut, 
        seeds = [b"exchange_position".as_ref(), tokenMint.as_ref()],
        bump
    )]
    pub exchange_treasury_position: Account<'info, ExchangeTreasuryPosition>,
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
}

#[account]
pub struct ExchangeTreasuryPosition {
    pub token_mint: Pubkey,
    pub active: bool,
    pub treasury_weight: u16,
}

#[account]
pub struct Market {
    pub market_index: u16,
    pub market_weight: u16,
    pub token_amount: i64,
    pub basis: i64,
    pub pnl: i64,
    pub fees: i64,
    pub current_price: u64,
    pub taker_fee: i16,
    pub maker_fee: i16,
    pub leverage: u16,
    pub margin_used: i64,
    pub feed_address: Pubkey,
}

#[account]
pub struct UserAccount {
    pub owner: Pubkey,
    pub collateral_value: i64,
    pub margin_used: i64,
    pub basis: i64,
    pub pnl: i64,
    pub fees: i64,
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
}

