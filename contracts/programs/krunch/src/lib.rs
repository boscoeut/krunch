use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Transfer as SplTransfer};
use chainlink_solana as chainlink;

pub mod state;
use state::*;

declare_id!("6zYPKjtGyPSZq6pP2U9ahNZAnaTtoVK9f1BMkEL2cix5");
const LEVERAGE_DECIMALS: u128 = 10u128.pow(4);
const MARKET_WEIGHT_DECIMALS: u128 = 10u128.pow(4);
const FEE_DECIMALS: u128 = 10u128.pow(4);
const AMOUNT_NUM_DECIMALS: u8 = 9;
const ONE_YEAR: u64 = 365 * 24 * 60 * 60;
// const ONE_YEAR: u64 = 1 * 60 * 60; // one hour for testing
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
        market_weight: u16,
        chainlink_program: Pubkey,
    ) -> Result<()> {
        let exchange = &mut ctx.accounts.exchange;
        exchange.admin = ctx.accounts.admin.key.to_owned();
        exchange.margin_used = 0;
        exchange.number_of_markets = 0;
        exchange.market_weight = market_weight;
        exchange.basis = 0;
        exchange.pnl = 0;
        exchange.fees = 0;
        exchange.rebates = 0;
        exchange.rewards = 0;
        exchange.leverage = leverage;
        exchange.collateral_value = 0;
        exchange.reward_frequency = reward_frequency;
        exchange.reward_rate = reward_rate;
        exchange.test_mode = test_mode;
        exchange.chainlink_program = chainlink_program;
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

    pub fn update_exchange(
        ctx: Context<UpdateExchange>,
        test_mode: bool,
        reward_frequency: u64,
        reward_rate: u64,
        leverage: u32,
        market_weight: u16,
    ) -> Result<()> {
        let exchange = &mut ctx.accounts.exchange;
        exchange.test_mode = test_mode;
        exchange.reward_frequency = reward_frequency;
        exchange.reward_rate = reward_rate;
        exchange.leverage = leverage;
        exchange.market_weight = market_weight;
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

        let exchange_total = calculate_exchange_balance_available(&exchange);
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
        execute_claim(user_account, exchange, true)?;
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
        let exchange = &mut ctx.accounts.exchange;

        execute_claim(user_account, exchange, false)?;

        user_account.collateral_value += collateral_amount as i64;
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
        let exchange_total = calculate_exchange_balance_available(&exchange);
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

    pub fn add_yield_market(
        ctx: Context<AddYieldMarket>,
        market_index: u16,
        chainlink_feed: Pubkey,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_unix_timestamp = clock.unix_timestamp;

        let market = &mut ctx.accounts.yield_market;
        market.market_index = market_index;
        market.long_basis = 0;
        market.short_basis = 0;
        market.long_token_amount = 0;
        market.short_token_amount = 0;
        market.long_funding = 0;
        market.short_funding = 0;
        market.short_fees = 0;
        market.long_fees = 0;
        market.last_claim_date = current_unix_timestamp;
        market.chainlink_feed = chainlink_feed;
        Ok(())
    }

    pub fn update_yield(
        ctx: Context<UpdateYield>,
        market_index: u16,
        long_token_amount: i64,
        short_token_amount: i64,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_unix_timestamp = clock.unix_timestamp;
        let yield_market = &mut ctx.accounts.yield_market;
        let user_yield_position = &mut ctx.accounts.user_yield_position;
        let exchange = &ctx.accounts.exchange;

        if long_token_amount + user_yield_position.long_token_amount < 0 {
            return err!(KrunchErrors::YieldAmountInsufficient);
        }
        if long_token_amount + yield_market.long_token_amount < 0 {
            return err!(KrunchErrors::YieldAmountInsufficient);
        }
        if short_token_amount + user_yield_position.short_token_amount < 0 {
            return err!(KrunchErrors::YieldAmountInsufficient);
        }
        if short_token_amount + yield_market.short_token_amount < 0 {
            return err!(KrunchErrors::YieldAmountInsufficient);
        }

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

        let user_long_basis =
            (current_price as i128 * long_token_amount as i128) / 10i128.pow(price_decimals.into());
        let user_short_basis = (current_price as i128 * short_token_amount as i128)
            / 10i128.pow(price_decimals.into());

        let market_long_basis =
            (current_price as i128 * long_token_amount as i128) / 10i128.pow(price_decimals.into());
        let market_short_basis = (current_price as i128 * short_token_amount as i128)
            / 10i128.pow(price_decimals.into());

        // calculate funding
        let long_current_value = (current_price as i128 * yield_market.long_token_amount as i128)
            / 10i128.pow(price_decimals.into());
        let short_current_value = (current_price as i128 * yield_market.short_token_amount as i128)
            / 10i128.pow(price_decimals.into());
        let old_long_basis = yield_market.long_basis + yield_market.long_funding;
        let old_short_basis = yield_market.short_basis + yield_market.short_funding;
        let long_pnl = long_current_value - old_long_basis as i128;
        let short_pnl = old_short_basis as i128 - short_current_value;

        let amount;
        let max_amount;
        let elapsed_time: i64 = current_unix_timestamp - yield_market.last_claim_date;
        let mut long_user_yield_amount = 0;
        let mut long_yield_amount = 0;
        let mut short_user_yield_amount = 0;
        let mut short_yield_amount = 0;

        if long_pnl > short_pnl {
            amount = long_pnl - short_pnl;
            if (amount as i64) > old_short_basis {
                max_amount = old_short_basis.into();
            } else {
                max_amount = amount;
            }
            if yield_market.long_token_amount > 0 && user_yield_position.long_token_amount > 0 {
                long_yield_amount =
                    get_ratio(max_amount as i128, elapsed_time as i128, ONE_YEAR as i128);
                long_user_yield_amount = get_ratio(
                    long_yield_amount as i128,
                    user_yield_position.long_token_amount as i128,
                    yield_market.long_token_amount as i128,
                );
                short_yield_amount = -1 * long_yield_amount;
                short_user_yield_amount = -1 * long_user_yield_amount;
            }
        } else {
            amount = short_pnl - long_pnl;
            if (amount as i64) > old_long_basis {
                max_amount = old_long_basis.into();
            } else {
                max_amount = amount;
            }
            if yield_market.short_token_amount > 0 && user_yield_position.short_token_amount > 0 {
                short_yield_amount =
                    get_ratio(max_amount as i128, elapsed_time as i128, ONE_YEAR as i128);
                short_user_yield_amount = get_ratio(
                    short_yield_amount as i128,
                    user_yield_position.short_token_amount as i128,
                    yield_market.short_token_amount as i128,
                );
                long_yield_amount = -1 * short_yield_amount;
                long_user_yield_amount = -1 * short_user_yield_amount;
            }
        }
        user_yield_position.long_funding += long_user_yield_amount as i64;
        user_yield_position.short_funding += short_user_yield_amount as i64;
        user_yield_position.market_index = market_index;
        user_yield_position.long_token_amount += long_token_amount;
        user_yield_position.short_token_amount += short_token_amount;
        user_yield_position.long_fees = 0;
        user_yield_position.short_fees = 0;
        user_yield_position.long_basis += user_long_basis as i64;
        user_yield_position.short_basis += user_short_basis as i64;
        user_yield_position.last_claim_date = current_unix_timestamp;

        yield_market.long_funding += long_yield_amount as i64;
        yield_market.short_funding += short_yield_amount as i64;
        yield_market.long_fees = 0;
        yield_market.short_fees = 0;
        yield_market.long_token_amount += long_token_amount;
        yield_market.short_token_amount += short_token_amount;
        yield_market.long_basis += market_long_basis as i64;
        yield_market.short_basis += market_short_basis as i64;
        yield_market.last_claim_date = current_unix_timestamp;
        Ok(())
    }

    pub fn add_yield(ctx: Context<AddYield>, market_index: u16) -> Result<()> {
        let user_yield_position = &mut ctx.accounts.user_yield_position;
        user_yield_position.market_index = market_index;
        user_yield_position.owner = ctx.accounts.owner.key.to_owned();
        Ok(())
    }
}

fn calculate_exchange_balance_available(exchange: &Exchange) -> i128 {
    let exchange_total = calculate_exchange_total(&exchange);
    return exchange_total * exchange.market_weight as i128 / MARKET_WEIGHT_DECIMALS as i128
        + exchange.margin_used as i128;
}

fn calculate_exchange_total(exchange: &Exchange) -> i128 {
    let exchange_hard_amount = exchange.collateral_value;
    let exchange_total =
        exchange_hard_amount as i128 * exchange.leverage as i128 / LEVERAGE_DECIMALS as i128;
    return exchange_total;
}

fn exchange_rewards_available(exchange: &Exchange) -> i128 {
    let exchange_total = exchange.pnl + exchange.rewards + exchange.fees + exchange.rebates;
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
fn get_ratio(num1: i128, num: i128, denom: i128) -> i128 {
    if denom == 0 {
        return 0;
    }
    return ((num1 * num * AMOUNT_DECIMALS as i128) / denom) / AMOUNT_DECIMALS as i128;
    // return 1;
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

fn execute_claim(
    user_account: &mut UserAccount,
    exchange: &mut Exchange,
    throw_error: bool,
) -> Result<i128> {
    let clock = Clock::get()?;
    let current_unix_timestamp = clock.unix_timestamp;
    if user_account.last_rewards_claim + exchange.reward_frequency as i64 > current_unix_timestamp {
        if throw_error {
            return err!(KrunchErrors::RewardsClaimUnavailable);
        } else {
            return Ok(0);
        }
    }
    let user_total = calculate_user_total(&user_account, exchange.leverage.into())
        - user_account.rewards as i128; // don't double count rewards
    let exchange_total = calculate_exchange_total(&exchange);
    let exchange_rewards = exchange_rewards_available(&exchange);
    // get % or rewards available
    let amount = (exchange_rewards * user_total) / exchange_total;
    if amount < 0 {
        if throw_error {
            return err!(KrunchErrors::NoRewardsAvailable);
        } else {
            return Ok(0);
        }
    }
    exchange.rewards -= amount as i64;
    user_account.rewards += amount as i64;
    exchange.last_rewards_claim = current_unix_timestamp;
    user_account.last_rewards_claim = current_unix_timestamp;
    return Ok(amount);
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
    #[msg("Yield Amount Insufficient")]
    YieldAmountInsufficient,
}
