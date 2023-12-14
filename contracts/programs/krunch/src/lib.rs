use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{mint_to, transfer, Mint, MintTo, Token, TokenAccount, Transfer as SplTransfer},
};
use chainlink_solana as chainlink;

pub mod state;
pub mod utils;
use state::*;
use utils::*;

// declare_id!("5DLAQZJ4hPpgur3XAyot61xCHuykBeDhVVyopWtcWNkm"); // codespaces
declare_id!("EnZBKfVmLQre1x8K42DJtEzNe8AbRHoWacxkLMf3fr52"); // local

#[program]
pub mod krunch {
    use super::*;

    const MARKET_WEIGHT_DECIMALS: u64 = 10u64.pow(4);
    const FEE_DECIMALS: u64 = 10u64.pow(4);
    const LEVERAGE_DECIMALS: u64 = 10u64.pow(4);
    const AMOUNT_NUM_DECIMALS:u8 = 9;
    const AMOUNT_DECIMALS: u64 = 10u64.pow(AMOUNT_NUM_DECIMALS as u32);
    const PRICE_DECIMALS: u64 = 10u64.pow(9);
    const STABLE_DECIMALS: u64 = 10u64.pow(6);
    const STABLE_CONVERSION: u32 = 3;

    pub fn initialize_exchange(ctx: Context<InitializeExchange>) -> Result<()> {
        let exchange = &mut ctx.accounts.exchange;
        exchange.admin = ctx.accounts.admin.key.to_owned();
        exchange.margin_used = 0;
        exchange.number_of_markets = 0;
        exchange.market_weight = 0;
        exchange.basis = 0;
        exchange.pnl = 0;
        exchange.fees = 0;
        exchange.collateral_value = 0;
        Ok(())
    }

    pub fn create_user_account(ctx: Context<CreateUserAccount>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        user_account.owner = ctx.accounts.owner.key.to_owned();
        user_account.collateral_value = 0;
        Ok(())
    }

    pub fn calculate(_ctx: Context<Calculate>) -> Result<i64> {
        Ok(115)
    }

    pub fn calculate_fee(
        _ctx: Context<CalculateFee>,
        price: i64,
        amount: i64,
        fee_rate: i64,
    ) -> Result<i64> {
        let basis =
            (amount.abs() as f64 / AMOUNT_DECIMALS as f64) * (price as f64 / PRICE_DECIMALS as f64);
        let fee = (fee_rate as f64) / FEE_DECIMALS as f64;
        let total = (basis * fee * AMOUNT_DECIMALS as f64) as i64;
        Ok(total).into()
    }

    pub fn update_market(
        ctx: Context<UpdateMarket>,
        _market_index: u16,
        price: u64,
        maker_fee: i16,
        taker_fee: i16,
        leverage: u16,
        market_weight: u16,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        market.current_price = price;
        market.taker_fee = taker_fee;
        market.maker_fee = maker_fee;
        market.leverage = leverage;
        market.market_weight = market_weight;
        Ok(())
    }

    pub fn execute_trade(
        ctx: Context<ExecuteTrade>,
        _market_index: u16,
        amount: i64,
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let user_position = &mut ctx.accounts.user_position;
        let market = &mut ctx.accounts.market;
        let exchange = &mut ctx.accounts.exchange;

        let price = get_current_price(market.current_price);
        let fbasis =
            (amount as f64 / AMOUNT_DECIMALS as f64) * (price as f64 / PRICE_DECIMALS as f64);
        msg!("basis is {}", fbasis);

        let mut fee_rate: i64 = market.taker_fee.into();
        let fee_token_delta = market.token_amount + amount;
        if fee_token_delta.abs() < market.token_amount.abs() {
            // maker
            fee_rate = market.maker_fee.into();
        }
        let fee_percent = (fee_rate as f64) / FEE_DECIMALS as f64;
        let fee = (fbasis.abs() * fee_percent * AMOUNT_DECIMALS as f64) as i64;
        let basis = (fbasis * AMOUNT_DECIMALS as f64) as i64;

        // update fees
        market.fees += fee;
        exchange.fees += fee;
        user_account.fees += fee * -1;
        user_position.fees += fee * -1;

        // update balances
        let basis_before = user_position.basis;
        let token_amount_before = user_position.token_amount;

        let mut token_delta = 0;
        if ((user_position.token_amount < 0 && amount > 0)
            || (user_position.token_amount > 0 && amount < 0))
        {
            token_delta = user_position.token_amount.abs().min(amount.abs());
        }
        market.token_amount -= amount;
        user_position.token_amount += amount;

        // update collateral value
        let f_leverage = market.leverage as f64 / LEVERAGE_DECIMALS as f64;
        let f_margin_basis = (user_position.token_amount as f64 / AMOUNT_DECIMALS as f64)
            * (price as f64 / PRICE_DECIMALS as f64);

        let margin_used = ((f_margin_basis.abs() / f_leverage) * AMOUNT_DECIMALS as f64) as i64;
        let f_delta = user_position.margin_used.abs() - margin_used;

        user_position.margin_used = margin_used * -1;
        user_account.margin_used += f_delta;
        market.margin_used += f_delta;
        exchange.margin_used += f_delta;

        // update token basis
        user_position.basis -= basis;
        user_account.basis -= basis;
        market.basis += basis;
        exchange.basis += basis;

        if token_delta != 0 {
            let avg_price = basis_before.abs() as f64 / token_amount_before.abs() as f64;
            let abasis = (avg_price * token_delta as f64) as i64;

            let mut tbasis = (token_delta.abs() as f64 / AMOUNT_DECIMALS as f64)
                * (price as f64 / PRICE_DECIMALS as f64);
            tbasis = tbasis * AMOUNT_DECIMALS as f64;

            let mut pnl = abasis - tbasis as i64;
            // if (token_delta<0){
            //     pnl = tbasis - abasis as i64;
            // }

            user_position.basis -= pnl as i64;
            user_position.pnl += pnl as i64;

            user_account.basis -= pnl as i64;
            user_account.pnl += pnl as i64;

            market.basis += pnl as i64;
            market.pnl -= pnl as i64;

            exchange.basis += pnl as i64;
            exchange.pnl -= pnl as i64;
        }

        let exchange_total =
            exchange.pnl + exchange.fees + exchange.margin_used + exchange.collateral_value;
        if exchange_total < 0 {
            return err!(KrunchErrors::ExchangeMarginInsufficient);
        }

        let m_weight = market.market_weight as f64 / MARKET_WEIGHT_DECIMALS as f64;
        let max_market_collateral = exchange_total as f64 * m_weight;
        let market_total =
            market.pnl + market.fees + market.margin_used + max_market_collateral as i64;
        if market_total < 0 {
            // return err!(KrunchErrors::MarketMarginInsufficient);
        }

        let user_total = user_account.pnl
            + user_account.fees
            + user_account.margin_used
            + user_account.collateral_value;
        if user_total < 0 {
            return err!(KrunchErrors::UserMarginInsufficient);
        }

        Ok(())
    }

    pub fn available_collateral(
        ctx: Context<GetAvailableCollateral>,
        _market_index: u16,
    ) -> Result<AvailableCollateral> {
        let user_account = &ctx.accounts.user_account;
        let user_position = &ctx.accounts.user_position;
        let market = &ctx.accounts.market;
        let exchange = &ctx.accounts.exchange;

        let exchange_total =
            exchange.basis + exchange.fees + exchange.margin_used + exchange.collateral_value;
        let m_weight = market.market_weight as f64 / MARKET_WEIGHT_DECIMALS as f64;
        let max_market_collateral = exchange_total as f64 * m_weight;
        let market_total =
            market.basis + market.fees + market.margin_used + max_market_collateral as i64;
        let user_total = user_account.basis
            + user_account.fees
            + user_account.margin_used
            + user_account.collateral_value;

        let result = AvailableCollateral {
            user_collateral_available: user_total,
            market_collateral_available: market_total,
            max_market_collateral_available: max_market_collateral as i64,
            exchange_collateral_available: exchange_total,
        };
        Ok(result)
    }

    pub fn add_exchange_position(
        ctx: Context<AddExchangeTreasuryPosition>,
        token_mint: Pubkey,
        active: bool,
        treasury_weight: u16,
        decimals:u8,
        feed_address: Pubkey,
    ) -> Result<()> {
        let position = &mut ctx.accounts.exchange_treasury_position;
        position.token_mint = token_mint;
        position.active = active;   
        position.treasury_weight = treasury_weight;
        position.decimals = decimals;
        position.feed_address = feed_address;
        Ok(())
    }

    pub fn update_exchange_position(
        ctx: Context<UpdateExchangeTreasuryPosition>,
        _token_mint: Pubkey,
        active: bool,
        treasury_weight: u16,
        decimals:u8,
        feed_address: Pubkey,
    ) -> Result<()> {
        let position = &mut ctx.accounts.exchange_treasury_position;
        position.active = active;   
        position.treasury_weight = treasury_weight;
        position.decimals = decimals;
        position.feed_address = feed_address;
        Ok(())
    }

    pub fn add_market(
        ctx: Context<AddMarket>,
        market_index: u16,
        taker_fee: i16,
        maker_fee: i16,
        leverage: u16,
        market_weight: u16,
        feed_address: Pubkey,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        market.market_index = market_index;
        market.token_amount = 0;
        market.maker_fee = maker_fee;
        market.taker_fee = taker_fee;
        market.leverage = leverage;
        market.market_weight = market_weight;
        market.feed_address = feed_address; 
        Ok(())
    }

    pub fn add_user_position(ctx: Context<AddUserPosition>, market_index: u16) -> Result<()> {
        let user_position = &mut ctx.accounts.user_position;
        user_position.market_index = market_index;
        user_position.token_amount = 0;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
         // get price
         let round = chainlink::latest_round_data(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;
        let price_decimals = chainlink::decimals(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;
        let price_print = Decimal::new(round.answer, u32::from(price_decimals));

        
        let total = (amount as u128 * round.answer as u128) / 10u128.pow(price_decimals.into());
        let collateral_amount = total; // TODO REMOVE

        // update collateral value
        let user_account = &mut ctx.accounts.user_account;
        user_account.collateral_value += collateral_amount as i64;

        let exchange = &mut ctx.accounts.exchange;
        exchange.collateral_value += collateral_amount as i64;

        // do token transfer
        let decimals = &ctx.accounts.exchange_treasury_position.decimals;
        let conversion = AMOUNT_NUM_DECIMALS-decimals;
        let tokenAmount = amount / 10u64.pow(conversion.into()); 

        let destination = &ctx.accounts.escrow_account;
        let source = &ctx.accounts.user_token_account;
        let token_program = &ctx.accounts.token_program;
        let authority = &ctx.accounts.owner;

        let cpi_accounts = SplTransfer {
            from: source.to_account_info().clone(),
            to: destination.to_account_info().clone(),
            authority: authority.to_account_info().clone(),
        };
        let cpi_program = token_program.to_account_info();
        transfer(
            CpiContext::new(cpi_program, cpi_accounts),
            tokenAmount.try_into().unwrap(),
        )?;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let exchange = &mut ctx.accounts.exchange;

        if user_account.collateral_value < amount as i64 {
            return err!(KrunchErrors::UserAccountValueInsufficient);
        }

        if exchange.collateral_value < amount as i64{
            return err!(KrunchErrors::ExchangeValueInsufficient);
        }

        user_account.collateral_value -= amount as i64;
        exchange.collateral_value -= amount as i64;

        // token transfer
        let decimals = &ctx.accounts.exchange_treasury_position.decimals;
        let conversion = AMOUNT_NUM_DECIMALS-decimals;
        let tokenAmount = amount / 10u64.pow(conversion.into());
        let source = &ctx.accounts.escrow_account;
        let destination = &ctx.accounts.user_token_account;
        let token_program = &ctx.accounts.token_program;
        let authority = &ctx.accounts.exchange;
        let mint = &ctx.accounts.mint;

        let cpi_accounts = SplTransfer {
            from: source.to_account_info().clone(),
            to: destination.to_account_info().clone(),
            authority: authority.to_account_info().clone(),
        };
        let cpi_program = token_program.to_account_info();
        let bump = ctx.bumps.exchange;
        let seeds = &[b"exchange".as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        transfer(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds),
            tokenAmount.try_into().unwrap(),
        )?;

        Ok(())
    }

    pub fn get_price(ctx: Context<GetPrice>) -> Result<DataFeed> {
        let round = chainlink::latest_round_data(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;

        let description = chainlink::description(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;

        let decimals = chainlink::decimals(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;
        // write the latest price to the program output
        let decimal_print = Decimal::new(round.answer, u32::from(decimals));
        msg!("{} price is {}", description, decimal_print);
        Ok(DataFeed {
            round: round.answer,
            description,
            decimals: decimals.into(),
        })
    }

}

#[error_code]
pub enum KrunchErrors {
    #[msg("User margin is insufficient")]
    UserMarginInsufficient,
    #[msg("Market margin is insufficient")]
    MarketMarginInsufficient,
    #[msg("Market margin is Exceeded")]
    MaxMarketMarginExceeded,
    #[msg("Exchange margin is insufficient")]
    ExchangeMarginInsufficient,
    #[msg("Exchange value is insufficient")]
    ExchangeValueInsufficient,
    #[msg("User Account value is insufficient")]
    UserAccountValueInsufficient,
}
