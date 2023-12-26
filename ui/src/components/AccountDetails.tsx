import { Stack } from '@mui/joy';
import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import { AMOUNT_DECIMALS } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, renderItem } from '../utils';

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
    if (userAccount.lastRewardsClaim) {
        lastRewardsClaimed = `${new Date(userAccount.lastRewardsClaim?.toNumber() * 1000).toLocaleDateString()} ${new Date(userAccount.lastRewardsClaim?.toNumber() * 1000).toLocaleTimeString()}`
    }

    return (
        <Box>
            <Stack direction={"row"}>
                <Box flex={1} display="flex" justifyContent="space-between">ACCOUNT VALUE</Box>
                <Box flex={1} display="flex" justifyContent="space-between">ACCOUNT VALUE</Box>
                <Box flex={1} display="flex" justifyContent="space-between">ACCOUNT VALUE</Box>
            </Stack>
            <Stack direction="column" spacing={2}>
                <Table>
                    <thead>
                        <tr>
                            <th>Account Value</th>
                            <th>+ Amount Deposited</th>
                            <th>+ Pnl</th>
                            <th>+ Rebates Earned</th>
                            <th>+ Rewards Earned</th>
                            <th>- Fees</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>{formatCurrency(total / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(userAccount.collateralValue / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(userAccount.pnl / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(userAccount.rebates / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(userAccount.rewards / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(userAccount.fees / AMOUNT_DECIMALS)}</td>

                        </tr>
                    </tbody>
                </Table>
                <Table>
                    <thead>
                        <tr>
                            <th>Rewards Earned</th>
                            <th>Rewards Available</th>
                            <th>Total Available</th>
                            <th>Last Claim Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>{formatCurrency(userAccount.rewards / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(userRewardsAvailable / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(exchangeRewardsAvailable / AMOUNT_DECIMALS)}</td>
                            <td>{lastRewardsClaimed}</td>
                        </tr>
                    </tbody>
                </Table>

                <Table>
                    <thead>
                        <tr>
                            <th>Unrealized Pnl</th>
                            <th>Open Position Current Value</th>
                            <th>Open Position Basis</th>
                            <th>Margin Used</th>
                            <th>Margin Available</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>{formatCurrency(userUnrealizedPnl / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(userCurrentValue / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(userAccount.basis / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(userAccount.marginUsed / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(userCollateral / AMOUNT_DECIMALS)}</td>
                        </tr>
                    </tbody>
                </Table>
            </Stack>
        </Box>
    );
}