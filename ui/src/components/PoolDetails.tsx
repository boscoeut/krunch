import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { LEVERAGE_DECIMALS, MARKETS, AMOUNT_DECIMALS, SLOTS_PER_DAY } from 'utils/dist/constants';
import Stat from './Stat';
import SubStat from './SubStat';
import { Stack } from '@mui/joy';
import { formatCurrency, renderItem, formatNumber, formatPercent } from '../utils';
import SectionHeader from './SectionHeader';
import moment from 'moment';

export default function PoolDetails() {
    const exchange = useKrunchStore(state => state.exchange)
    const exchangeBalanceAvailable = useKrunchStore(state => state.exchangeBalanceAvailable)
    const poolAccountValue = useKrunchStore(state => state.poolAccountValue)
    const exchangeCurrentValue = useKrunchStore(state => state.exchangeCurrentValue)
    const exchangeUnrealizedPnl = useKrunchStore(state => state.exchangeUnrealizedPnl)
    const exchangeRewardsAvailable = useKrunchStore(state => state.exchangeRewardsAvailable)
   
    let lastRewardsClaimed = 'Never'
    if (exchange.lastRewardsClaim?.toNumber() > 0) {
        lastRewardsClaimed = `${new Date(exchange.lastRewardsClaim?.toNumber() * 1000).toLocaleDateString()} ${new Date(exchange.lastRewardsClaim?.toNumber() * 1000).toLocaleTimeString()}`
    }

    const totalPnl = exchangeUnrealizedPnl + (exchange.pnl?.toNumber() / AMOUNT_DECIMALS || 0)

    return (
        <Box>
            <Stack direction={"row"} >
                <Stat numValue={poolAccountValue} title="Pool Value" value={formatCurrency(poolAccountValue / AMOUNT_DECIMALS)} />
                <Stat numValue={exchange.fees?.toNumber()} title="Fees" value={formatCurrency(exchange.fees?.toNumber()  / AMOUNT_DECIMALS)} />
                <Stat numValue={totalPnl} title="Pnl" value={formatCurrency(totalPnl)} />
            </Stack>
            <Stack direction={"row"} >
                <SubStat numValue={poolAccountValue} title="Pool ROI" value={formatPercent((poolAccountValue / exchange.collateralValue) - 1)} />
                <SubStat numValue={exchange.rewards?.toNumber() + exchange.rebates?.toNumber()} title="Rewards Paid" value={formatCurrency((exchange.rewards || 0 ) / AMOUNT_DECIMALS)} />
                <SubStat numValue={exchange.rebates?.toNumber()} title="Rebates Paid" value={formatCurrency(( exchange.rebates || 0) / AMOUNT_DECIMALS)} />
                <SubStat numValue={exchangeUnrealizedPnl / exchange.basis} title="Pnl ROI" value={formatPercent(exchangeUnrealizedPnl / (Math.abs(exchange.basis) / AMOUNT_DECIMALS))} />
            </Stack>
            <Table>
                <thead>
                    <tr>
                        <th style={{ width: 225 }}><SectionHeader title="Pool Value" /></th>
                        <th><SectionHeader title={formatCurrency(poolAccountValue / AMOUNT_DECIMALS)} /></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>+ User Deposits</td>
                        <td>{formatCurrency(exchange.collateralValue / AMOUNT_DECIMALS)}</td>
                    </tr>
                    <tr>
                        <td>+ Pnl</td>
                        <td>{formatCurrency(exchange.pnl / AMOUNT_DECIMALS)}</td>
                    </tr>
                    <tr>
                        <td>+ Fees Earned</td>
                        <td>{formatCurrency(exchange.fees / AMOUNT_DECIMALS)}</td>
                    </tr>
                    <tr>
                        <td>+ Amount Deposited</td>
                        <td>{formatCurrency(exchange.amountDeposited / AMOUNT_DECIMALS)}</td>
                    </tr>
                    <tr>
                        <td>- Rebates Paid</td>
                        <td>{formatCurrency(exchange.rebates / AMOUNT_DECIMALS)}</td>
                    </tr>
                    <tr>
                        <td>- Rewards Paid</td>
                        <td>{formatCurrency(exchange.rewards / AMOUNT_DECIMALS)}</td>
                    </tr>
                    <tr>
                        <td>- Amount Withdrawn</td>
                        <td>{formatCurrency(exchange.amountWithdrawn / AMOUNT_DECIMALS)}</td>
                    </tr>
                </tbody>
            </Table>

            <Table>
                <thead>
                    <tr>
                        <th style={{ width: 225 }}><SectionHeader title="Total Rewards Paid" /></th>
                        <th><SectionHeader title={formatCurrency(exchange.rewards / AMOUNT_DECIMALS)} /></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Rewards Available</td>
                        <td>{formatCurrency(exchangeRewardsAvailable / AMOUNT_DECIMALS)} = (Fees + Pnl - Rewards Paid - Rebates) * RewardRate</td>
                    </tr>
                    <tr>
                        <td>Last Rewards Claim</td>
                        <td>{lastRewardsClaimed}</td>
                    </tr>
                    <tr>
                        <td>Reward Frequency</td>
                        <td>{`${ exchange.rewardFrequency?.toNumber()} (${moment.duration( exchange.rewardFrequency?.toNumber() /SLOTS_PER_DAY, 'days').humanize()})`}</td>
                    </tr>

                    <tr>
                        <td>Reward Rate</td>
                        <td>{`${formatPercent(exchange.rewardRate?.toNumber() / AMOUNT_DECIMALS)}`}</td>
                    </tr>
                </tbody>
            </Table>

            <Table>
                <thead>
                    <tr>
                        <th style={{ width: 225 }}><SectionHeader title="Unrealized Pnl" /></th>
                        <th><SectionHeader title={formatCurrency(exchangeUnrealizedPnl)} /></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>+ Open Position Basis</td>
                        <td>{formatCurrency(exchange.basis / AMOUNT_DECIMALS)}</td>
                    </tr>
                    <tr>
                        <td>- Open Position Current Value</td>
                        <td>{formatCurrency(exchangeCurrentValue / AMOUNT_DECIMALS)}</td>
                    </tr>
                    <tr>
                        <td>Margin Used</td>
                        <td>{formatCurrency(exchange.marginUsed / AMOUNT_DECIMALS)}</td>
                    </tr>
                    <tr>
                        <td>Margin Available</td>
                        <td>{formatCurrency(exchangeBalanceAvailable / AMOUNT_DECIMALS)}</td>
                    </tr>
                    <tr>
                        <td>Leverage</td>
                        <td>{formatNumber(exchange.leverage / LEVERAGE_DECIMALS, 0)}x</td>
                    </tr>
                    <tr>
                        <td># of Markets</td>
                        <td>{MARKETS.length}</td>
                    </tr>
                </tbody>
            </Table>


        </Box>
    );
}