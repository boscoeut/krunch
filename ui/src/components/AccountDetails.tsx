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
            <Stack direction="column" spacing={2}>
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
                            <td>{renderItem(userAccount.rewards)}</td>
                            <td>{renderItem(userRewardsAvailable)}</td>
                            <td>{renderItem(exchangeRewardsAvailable)}</td>
                            <td>{lastRewardsClaimed}</td>
                        </tr>
                    </tbody>
                </Table>
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
                            <td>{renderItem(total)}</td>
                            <td>{renderItem(userAccount.collateralValue)}</td>
                            <td>{renderItem(userAccount.pnl)}</td>
                            <td>{renderItem(userAccount.rebates)}</td>
                            <td>{renderItem(userAccount.rewards)}</td>
                            <td>{renderItem(userAccount.fees)}</td>

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
                            <td>{renderItem(userUnrealizedPnl)}</td>
                            <td>{renderItem(userCurrentValue)}</td>
                            <td>{renderItem(userAccount.basis)}</td>
                            <td>{formatCurrency(userAccount.marginUsed / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(userCollateral / AMOUNT_DECIMALS)}</td>
                        </tr>
                    </tbody>
                </Table>
            </Stack>
        </Box>
    );
}