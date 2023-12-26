import { Stack } from '@mui/joy';
import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import { AMOUNT_DECIMALS } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, renderItem } from '../utils';
import Stat from './Stat';

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
            <Stack direction={"row"} >
                <Stat title="Account Value" value={total / AMOUNT_DECIMALS} />
                <Stat title="Rewards" value={userRewardsAvailable / AMOUNT_DECIMALS} />
                <Stat title="Unrealized Pnl" value={userUnrealizedPnl / AMOUNT_DECIMALS} />

            </Stack>
            <Stack direction="column" spacing={2}>
                <Table>
                    <thead>
                        <tr>
                            <th>Account Details</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Account Value</td>
                            <td>{formatCurrency(total / AMOUNT_DECIMALS)}</td>
                        </tr>
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
                            <th>Rewards</th>
                            <th></th>
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
                            <th>Trading</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Unrealized Pnl</td>
                            <td>{formatCurrency(userUnrealizedPnl / AMOUNT_DECIMALS)}</td>
                        </tr>
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