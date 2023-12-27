import { Stack } from '@mui/joy';
import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import { AMOUNT_DECIMALS } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, renderItem, formatNumber, formatPercent } from '../utils';
import SectionHeader from './SectionHeader';
import Stat from './Stat';
import SubStat from './SubStat';

export default function AccountDetails() {
    const userAccount = useKrunchStore(state => state.userAccount)
    const userCollateral = useKrunchStore(state => state.userCollateral)
    const userCurrentValue = useKrunchStore(state => state.userCurrentValue)
    const userUnrealizedPnl = useKrunchStore(state => state.userUnrealizedPnl)
    const userRewardsAvailable = useKrunchStore(state => state.userRewardsAvailable)
    const exchangeRewardsAvailable = useKrunchStore(state => state.exchangeRewardsAvailable)
    const total = Number(userAccount.collateralValue)
        + Number(userAccount.fees)
        + Number(userAccount.rebates)
        + Number(userAccount.rewards)
        + Number(userAccount.pnl)

    let lastRewardsClaimed = 'Never'
    if (userAccount.lastRewardsClaim?.toNumber() > 0) {
        lastRewardsClaimed = `${new Date(userAccount.lastRewardsClaim?.toNumber() * 1000).toLocaleDateString()} ${new Date(userAccount.lastRewardsClaim?.toNumber() * 1000).toLocaleTimeString()}`
    }

    console.log('userUnrealizedPnl / AMOUNT_DECIMALS',userUnrealizedPnl / AMOUNT_DECIMALS)
    console.log('userUnrealizedPnl',userUnrealizedPnl)

    return (
        <Box>
            <Stack direction={"row"} >
                <Stat numValue={total} title="Account Value" value={total / AMOUNT_DECIMALS} />
                <Stat numValue={userRewardsAvailable} title="Pending Rewards" value={userRewardsAvailable / AMOUNT_DECIMALS} />
                <Stat numValue={userUnrealizedPnl} title="Unrealized Pnl" value={userUnrealizedPnl} />
            </Stack>
            <Stack direction={"row"} >
                <SubStat numValue={(total / userAccount.collateralValue)-1} title="Account ROI" value={formatPercent((total / userAccount.collateralValue)-1)} />
                <SubStat numValue={userAccount.rewards+userAccount.rebates} title="Rewards + Rebates" value={formatCurrency(userAccount.rewards / AMOUNT_DECIMALS+userAccount.rebates / AMOUNT_DECIMALS)} />
                <SubStat numValue={userUnrealizedPnl} title="Trading ROI" value={formatPercent(userUnrealizedPnl/(Math.abs(userAccount.basis)/AMOUNT_DECIMALS))} />
            </Stack>
            <Stack direction="column" spacing={2}>
                <Table>
                    <thead>
                        <tr>
                            <th style={{ width: 225 }}><SectionHeader title="Account Value" /></th>
                            <th><SectionHeader title={formatCurrency(total / AMOUNT_DECIMALS)} /></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>+ Amount Deposited</td>
                            <td>{formatCurrency(userAccount.collateralValue / AMOUNT_DECIMALS)}</td>
                        </tr>
                        <tr>
                            <td>+ Pnl</td>
                            <td>{formatCurrency(userAccount.pnl / AMOUNT_DECIMALS)}</td>
                        </tr>
                        <tr>
                            <td>+ Rebates Earned</td>
                            <td>{formatCurrency(userAccount.rebates / AMOUNT_DECIMALS)}</td>
                        </tr>
                        <tr>
                            <td>+ Rewards Earned</td>
                            <td>{formatCurrency(userAccount.rewards / AMOUNT_DECIMALS)}</td>
                        </tr>
                        <tr>
                            <td>- Fees</td>
                            <td>{formatCurrency(userAccount.fees / AMOUNT_DECIMALS)}</td>
                        </tr>
                        <tr>

                        </tr>
                    </tbody>
                </Table>
                <Table>
                    <thead>
                        <tr>
                            <th style={{ width: 225 }}><SectionHeader title="Rewards Earned" /></th>
                            <th><SectionHeader title={formatCurrency(userAccount.rewards / AMOUNT_DECIMALS)} /></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Rewards Earned</td>
                            <td>{formatCurrency(userAccount.rewards / AMOUNT_DECIMALS)}</td>
                        </tr>
                        <tr>
                            <td>Rewards Available</td>
                            <td>{formatCurrency(userRewardsAvailable / AMOUNT_DECIMALS)}</td>
                        </tr>
                        <tr>
                            <td>Total Available</td>
                            <td>{formatCurrency(exchangeRewardsAvailable / AMOUNT_DECIMALS)}</td>
                        </tr>
                        <tr>
                            <td>Last Claim Date</td>
                            <td>{lastRewardsClaimed}</td>
                        </tr>
                    </tbody>
                </Table>

                <Table>
                    <thead>
                        <tr>
                            <th style={{ width: 225 }}><SectionHeader title="Unrealized Pnl" /></th>
                            <th><SectionHeader title={formatCurrency(userUnrealizedPnl)} /></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Open Position Current Value</td>
                            <td>{formatCurrency(userCurrentValue / AMOUNT_DECIMALS)}</td>
                        </tr>
                        <tr>
                            <td>Open Position Basis</td>
                            <td>{formatCurrency(userAccount.basis / AMOUNT_DECIMALS)}</td>
                        </tr>
                        <tr>
                            <td>Margin Used</td>
                            <td>{formatCurrency(userAccount.marginUsed / AMOUNT_DECIMALS)}</td>
                        </tr>
                        <tr>
                            <td>Margin Available</td>
                            <td>{formatCurrency(userCollateral / AMOUNT_DECIMALS)}</td>
                        </tr>
                    </tbody>
                </Table>
            </Stack>
        </Box>
    );
}