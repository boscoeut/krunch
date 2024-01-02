use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Transfer as SplTransfer};
use chainlink_solana as chainlink;

pub mod state;
use state::*;

declare_id!("6zYPKjtGyPSZq6pP2U9ahNZAnaTtoVK9f1BMkEL2cix5"); // local
const LEVERAGE_DECIMALS: u128 = 10u128.pow(4);
const MARKET_WEIGHT_DECIMALS: u128 = 10u128.pow(4);
const FEE_DECIMALS: u128 = 10u128.pow(4);
const AMOUNT_NUM_DECIMALS: u8 = 9;
const AMOUNT_DECIMALS: u128 = 10u128.pow(AMOUNT_NUM_DECIMALS as u32);

#[program]
pub mod krunch {
    use super::*;

    pub fn initialize_exchange(
        ctx: Context<InitializeExchange>,
        leverage: u32,
        reward_frequency: u64,
        reward_rate: u64,
        test_mode: bool,
    ) -> Result<()> {
        let exchange = &mut ctx.accounts.exchange;
        exchange.admin = ctx.accounts.admin.key.to_owned();
        exchange.margin_used = 0;
        exchange.number_of_markets = 0;
        exchange.market_weight = 0;
        exchange.basis = 0;
        exchange.pnl = 0;
        exchange.fees = 0;
        exchange.rebates = 0;
        exchange.rewards = 0;
        exchange.leverage = leverage;
        exchange.collateral_value = 0;
        exchange.amount_withdrawn = 0;
        exchange.amount_deposited = 0;
        exchange.reward_frequency = reward_frequency;
        exchange.reward_rate = reward_rate;
        exchange.test_mode = test_mode;
        Ok(())
    }

    pub fn create_user_account(ctx: Context<CreateUserAccount>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        user_account.owner = ctx.accounts.owner.key.to_owned();
        user_account.collateral_value = 0;
        Ok(())
    }

    pub fn update_market(
        ctx: Context<UpdateMarket>,
        _market_index: u16,
        maker_fee: i16,
        taker_fee: i16,
        leverage: u32,
        market_weight: u16,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        market.taker_fee = taker_fee;
        market.maker_fee = maker_fee;
        market.leverage = leverage;
        market.market_weight = market_weight;
        Ok(())
    }

    pub fn update_exchange(ctx: Context<UpdateExchange>, test_mode: bool,reward_frequency: u64,reward_rate: u64, leverage: u32) -> Result<()> {
        let exchange = &mut ctx.accounts.exchange;
        exchange.test_mode = test_mode;
        exchange.reward_frequency = reward_frequency;
        exchange.reward_rate = reward_rate;
        exchange.leverage = leverage;
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

        // get price
        let round = chainlink::latest_round_data(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;
        let price_decimals = chainlink::decimals(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;

        let mut current_price = round.answer;
        if exchange.test_mode {
            let clock = Clock::get()?;
            let current_unix_timestamp = clock.unix_timestamp;
            let last_digit = current_unix_timestamp % 10;
            current_price = (current_price as f64 * (1.0 + (last_digit as f64) / 100.0)) as i128;
        }

        let fbasis = (amount as i128 * current_price as i128) / 10i128.pow(price_decimals.into());
        msg!("basis is {}", fbasis);

        let mut fee_rate: i64 = market.taker_fee.into();

        let fee_token_delta = market.token_amount + amount * -1; // market amounts are stored opposite user positions so flip the sign
        if fee_token_delta.abs() < market.token_amount.abs()
            && amount.abs() <= market.token_amount.abs()
        {
            // maker
            fee_rate = market.maker_fee.into();          
        }
        let fee = ((fbasis.abs() * fee_rate as i128) / FEE_DECIMALS as i128) as i64;

        // update fees
        if fee < 0 {
            exchange.rebates += fee;
            market.rebates += fee;
            user_account.rebates += fee * -1;
            user_position.rebates += fee * -1;
        } else {
            exchange.fees += fee;
            market.fees += fee;
            user_account.fees += fee * -1;
            user_position.fees += fee * -1;
        }

        // update balances
        let basis_before = user_position.basis;
        let token_amount_before = user_position.token_amount;

        let mut token_delta = 0;
        if (user_position.token_amount < 0 && amount > 0)
            || (user_position.token_amount > 0 && amount < 0)
        {
            token_delta = user_position.token_amount.abs().min(amount.abs());
        }
        market.token_amount -= amount;
        user_position.token_amount += amount;

        // update collateral value
        let f_margin_basis = (user_position.token_amount as i128 * current_price as i128)
            / 10i128.pow(price_decimals.into());

        let margin_used = f_margin_basis.abs() as i64;
        let f_delta = user_position.margin_used.abs() - margin_used;

        user_position.margin_used = margin_used * -1;
        user_account.margin_used += f_delta;
        market.margin_used += f_delta;
        exchange.margin_used += f_delta;

        if token_delta != 0 {
            let avg_price = basis_before.abs() as f64 / token_amount_before.abs() as f64;
            let abasis = (avg_price * token_delta as f64) as i64;

            let tbasis = (token_delta.abs() as i128 * current_price as i128)
                / 10i128.pow(price_decimals.into());

            let pnl = abasis - tbasis as i64;
            // if (token_delta<0){
            //     pnl = tbasis - abasis as i64;
            // }
            let basis_adjustment = abasis * -1;

            user_position.basis -= basis_adjustment as i64;
            user_position.pnl += pnl as i64;

            user_account.basis -= basis_adjustment as i64;
            user_account.pnl += pnl as i64;

            market.basis += basis_adjustment as i64;
            market.pnl -= pnl as i64;

            exchange.basis += basis_adjustment as i64;
            exchange.pnl -= pnl as i64;
        }

        // update token basis
        let position_increase = amount.abs() - token_delta.abs();
        let basis_increase =
            (position_increase as i128 * current_price as i128) / 10i128.pow(price_decimals.into());

        user_position.basis -= basis_increase as i64;
        user_account.basis -= basis_increase as i64;
        market.basis += basis_increase as i64;
        exchange.basis += basis_increase as i64;

        let exchange_total = calculate_exchange_total(&exchange);
        if exchange_total < 0 {
            return err!(KrunchErrors::ExchangeMarginInsufficient);
        }

        let market_total = calculate_market_total(&exchange, &market);
        if market_total < 0 {
            return err!(KrunchErrors::MarketMarginInsufficient);
        }

        let user_total = calculate_user_total(&user_account, market.leverage.into());
        if user_total < 0 {
            return err!(KrunchErrors::UserMarginInsufficient);
        }
        Ok(())
    }

    pub fn add_exchange_position(
        ctx: Context<AddExchangeTreasuryPosition>,
        token_mint: Pubkey,
        active: bool,
        treasury_weight: u16,
        decimals: u8,
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
        decimals: u8,
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
        leverage: u32,
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

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        let exchange = &mut ctx.accounts.exchange;
        let clock = Clock::get()?;
        let current_unix_timestamp = clock.unix_timestamp;

        if user_account.last_rewards_claim + exchange.reward_frequency as i64
            > current_unix_timestamp
        {
            return err!(KrunchErrors::RewardsClaimUnavailable);
        }

        let user_total = calculate_user_total(&user_account, exchange.leverage.into())
            - user_account.rewards as i128; // don't double count rewards
        let exchange_total = calculate_exchange_total(&exchange);
        let exchange_rewards = exchange_rewards_available(&exchange);
        // get % or rewards available
        let amount = (exchange_rewards * user_total) / exchange_total;

        if amount < 0 {
            return err!(KrunchErrors::NoRewardsAvailable);
        }
        exchange.rewards -= amount as i64;
        user_account.rewards += amount as i64;
        exchange.last_rewards_claim = current_unix_timestamp;
        user_account.last_rewards_claim = current_unix_timestamp;
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

        let decimals = &ctx.accounts.exchange_treasury_position.decimals;
        let conversion = AMOUNT_NUM_DECIMALS - decimals;

        let total = (amount as u128 * round.answer as u128) / 10u128.pow(price_decimals.into());
        let collateral_amount = total;

        // update collateral value
        let user_account = &mut ctx.accounts.user_account;
        user_account.collateral_value += collateral_amount as i64;

        let exchange = &mut ctx.accounts.exchange;
        exchange.collateral_value += collateral_amount as i64;

        // do token transfer
        let token_amount = (amount as u128) / 10u128.pow(conversion.into());

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
            token_amount.try_into().unwrap(),
        )?;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        // get price
        let round = chainlink::latest_round_data(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;
        let price_decimals = chainlink::decimals(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;

        let user_account = &mut ctx.accounts.user_account;
        let exchange = &mut ctx.accounts.exchange;
        user_account.collateral_value -= amount as i64;
        exchange.collateral_value -= amount as i64;

        // validate enough funds are available
        let exchange_total = calculate_exchange_total(&exchange);
        if exchange_total < 0 {
            return err!(KrunchErrors::ExchangeMarginInsufficient);
        }

        let user_total = calculate_user_total(&user_account, exchange.leverage.into());
        if user_total < 0 {
            return err!(KrunchErrors::UserMarginInsufficient);
        }

        // token transfer
        let decimals = &ctx.accounts.exchange_treasury_position.decimals;
        let conversion = AMOUNT_NUM_DECIMALS - decimals;
        let total = (amount as u128) / 10u128.pow(conversion.into());
        let token_amount =
            (total as u128 * 10u128.pow(price_decimals.into())) / round.answer as u128;
        let source = &ctx.accounts.escrow_account;
        let destination = &ctx.accounts.user_token_account;
        let token_program = &ctx.accounts.token_program;
        let authority = &ctx.accounts.exchange;

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
            token_amount.try_into().unwrap(),
        )?;

        Ok(())
    }

    pub fn exchange_withdraw(ctx: Context<ExchangeTransaction>, amount: u64) -> Result<()> {
        // get price
        let round = chainlink::latest_round_data(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;
        let price_decimals = chainlink::decimals(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;

        let exchange = &mut ctx.accounts.exchange;
        exchange.amount_withdrawn -= amount as i64;

        // validate enough funds are available
        let exchange_total = calculate_exchange_balance_available(&exchange);
        if exchange_total < 0 {
            return err!(KrunchErrors::ExchangeMarginInsufficient);
        }

        // token transfer
        let decimals = &ctx.accounts.exchange_treasury_position.decimals;
        let conversion = AMOUNT_NUM_DECIMALS - decimals;
        let total = (amount as u128) / 10u128.pow(conversion.into());
        let token_amount =
            (total as u128 * 10u128.pow(price_decimals.into())) / round.answer as u128;
        let source = &ctx.accounts.escrow_account;
        let destination = &ctx.accounts.user_token_account;
        let token_program = &ctx.accounts.token_program;
        let authority = &ctx.accounts.exchange;

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
            token_amount.try_into().unwrap(),
        )?;
        Ok(())
    }

    pub fn exchange_deposit(ctx: Context<ExchangeTransaction>, amount: u64) -> Result<()> {
        // get price
        let round = chainlink::latest_round_data(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;
        let price_decimals = chainlink::decimals(
            ctx.accounts.chainlink_program.to_account_info(),
            ctx.accounts.chainlink_feed.to_account_info(),
        )?;

        let total = (amount as u128 * round.answer as u128) / 10u128.pow(price_decimals.into());
        let collateral_amount = total;

        // update amount deposited
        let exchange = &mut ctx.accounts.exchange;
        exchange.amount_deposited += collateral_amount as i64;

        // token transfer
        let decimals = &ctx.accounts.exchange_treasury_position.decimals;
        let conversion = AMOUNT_NUM_DECIMALS - decimals;

        let token_amount = (amount as u128) / 10u128.pow(conversion.into());

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
            token_amount.try_into().unwrap(),
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

fn calculate_exchange_balance_available(exchange: &Exchange) -> i128 {
    let exchange_total = exchange.pnl as i128
        + exchange.rebates as i128
        + exchange.rewards as i128
        + exchange.fees as i128
        + exchange.amount_withdrawn as i128
        + exchange.amount_deposited as i128
        + (exchange.margin_used as i128 * LEVERAGE_DECIMALS as i128 / exchange.leverage as i128);
    return exchange_total;
}

fn calculate_exchange_total(exchange: &Exchange) -> i128 {
    let exchange_hard_amount = exchange.amount_withdrawn
        + exchange.amount_deposited
        + exchange.pnl
        + exchange.rebates
        + exchange.rewards
        + exchange.fees
        + exchange.collateral_value;
    let exchange_total = exchange_hard_amount as i128 * exchange.leverage as i128
        / LEVERAGE_DECIMALS as i128
        + exchange.margin_used as i128;
    return exchange_total;
}

fn exchange_rewards_available(exchange: &Exchange) -> i128 {
    let exchange_total = exchange.pnl + exchange.rewards;
    if exchange_total < 0 {
        return 0;
    } else {
        return (exchange_total as i128 * exchange.reward_rate as i128) / AMOUNT_DECIMALS as i128;
    }
}

fn calculate_market_total(exchange: &Exchange, market: &Market) -> i128 {
    let exchange_total = calculate_exchange_total(&exchange);
    let max_market_collateral =
        (exchange_total as i128 * market.market_weight as i128) / MARKET_WEIGHT_DECIMALS as i128;
    let market_total = max_market_collateral as i128 + market.margin_used as i128;
    return market_total;
}

fn calculate_user_total(user_account: &UserAccount, leverage: i128) -> i128 {
    let user_hard_amount = user_account.pnl
        + user_account.fees
        + user_account.rebates
        + user_account.rewards
        + user_account.collateral_value;
    let user_total = user_hard_amount as i128 * leverage as i128 / LEVERAGE_DECIMALS as i128
        + user_account.margin_used as i128;
    return user_total;
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
    #[msg("Rewards Claim Unavailable")]
    RewardsClaimUnavailable,
    #[msg("No Rewards Available")]
    NoRewardsAvailable,
}
