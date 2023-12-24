import Box from '@mui/joy/Box';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { renderItem } from '../utils';
import Table from '@mui/joy/Table';

export default function AccountDetails() {
    const userAccount = useKrunchStore(state => state.userAccount)
    const userCollateral = useKrunchStore(state => state.userCollateral)
    const userCurrentValue = useKrunchStore(state => state.userCurrentValue)
    const userUnrealizedPnl = useKrunchStore(state => state.userUnrealizedPnl)
    const userRewardsAvailable = useKrunchStore(state => state.userRewardsAvailable)
    const exchangeRewardsAvailable = useKrunchStore(state => state.exchangeRewardsAvailable)
    const total = Number(userAccount.collateralValue)
        +Number(userAccount.fees)
        +Number(userAccount.rebates)
        +Number(userAccount.rewards)
        +Number(userAccount.pnl)

        let lastRewardsClaimed = 'Never'
        if (userAccount.lastRewardsClaim) {
            lastRewardsClaimed = `${new Date(userAccount.lastRewardsClaim?.toNumber()*1000).toLocaleDateString()} ${new Date(userAccount.lastRewardsClaim?.toNumber()*1000).toLocaleTimeString()}`
        }
   
    const values = [{
        key:'Rewards',
        value: '',
        indent: 0
    },{
        key:'User Rewards Available',
        value: renderItem(userRewardsAvailable),
        indent: 1
    },{
        key:'Total Rewards Available',
        value: renderItem(exchangeRewardsAvailable),
        indent: 1
    },{
        key:'Last User Rewards Claim',
        value: lastRewardsClaimed,
        indent:1
    },{
        key:'Account Value',
        value: renderItem(total)
    },{
        key:'+ Amount Deposited',
        value: renderItem(userAccount.collateralValue),
        indent:1
    },{
        key:'+ Pnl',
        value: renderItem(userAccount.pnl),
        indent:1
    },{
        key:'+ Rebates Earned',
        value: renderItem(userAccount.rebates),
        indent:1
    },{
        key:'+ Rewards Earned',
        value: renderItem(userAccount.rewards),
        indent:1
    },{
        key:'- Fees Paid',
        value: renderItem(userAccount.fees),
        indent:1
    },{
        key:'Trading',
        value: ''
    },{
        key:'Unrealized Pnl',
        value: renderItem(userUnrealizedPnl,1),
        indent:1
    },{
        key:'+ Open Position Current Value',
        value: renderItem(userCurrentValue,1),
        indent:2
    },{
        key:'- Open Position Basis',
        value: renderItem(userAccount.basis),
        indent:2
    },{
        key:'Margin Used',
        value: renderItem(userAccount.marginUsed),
        indent:1
    },{
        key:'Margin Available',
        value: renderItem(userCollateral),
        indent:1
    }]
    return (
        <Box>
            <Table>
                <thead>
                    <tr>
                        <th>Account Details</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {values.map(row => {
                        return <tr key={row.key}>
                            <td style={{paddingLeft:`${(row.indent || 0) * 25+6}px`}}>{row.key}</td>
                            <td>{row.value}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
        </Box>
    );
}