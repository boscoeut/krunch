import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { renderItem } from '../utils';
import { LEVERAGE_DECIMALS, MARKETS, AMOUNT_DECIMALS } from 'utils/dist/constants';
import Stat from './Stat';
import { Stack } from '@mui/joy';

export default function PoolDetails() {
    const exchange = useKrunchStore(state => state.exchange)
    const exchangeCollateral = useKrunchStore(state => state.exchangeCollateral)
    const exchangeCurrentValue = useKrunchStore(state => state.exchangeCurrentValue)
    const exchangeUnrealizedPnl = useKrunchStore(state => state.exchangeUnrealizedPnl)
    const exchangeRewardsAvailable = useKrunchStore(state => state.exchangeRewardsAvailable)
    const total = Number(exchange.collateralValue)
        +Number(exchange.fees)
        +Number(exchange.amountWithdrawn)
        +Number(exchange.amountDeposited)
        +Number(exchange.rebates)
        +Number(exchange.rewards)
        +Number(exchange.pnl)

    let lastRewardsClaimed = 'Never'
    if (exchange.lastRewardsClaim) {
        lastRewardsClaimed = `${new Date(exchange.lastRewardsClaim?.toNumber()*1000).toLocaleDateString()} ${new Date(exchange.lastRewardsClaim?.toNumber()*1000).toLocaleTimeString()}`
    }
    const values = [{
        key:'Pool Value',
        value: renderItem(total),
        indent: 0
    },{
        key:'+ User Deposits',
        value: renderItem(exchange.collateralValue),
        indent: 1
    },{
        key:'+ Pnl',
        value: renderItem(exchange.pnl),
        indent: 1
    },{
        key:'+ Fees Earned',
        value: renderItem(exchange.fees),
        indent:1
    },{
        key:'+ Amount Deposited',
        value: renderItem(exchange.amountDeposited),
        indent: 1
    },{
        key:'- Rebates Paid',
        value: renderItem(exchange.rebates),
        indent: 1
    },{
        key:'- Rewards Paid',
        value: renderItem(exchange.rewards),
        indent: 1
    },{
        key:'- Amount Withdrawn',
        value: renderItem(exchange.amountWithdrawn),
        indent: 1
    },{
        key:'Trading',
        value: ''
    },{
        key:'Unrealized Pnl',
        value: renderItem(exchangeUnrealizedPnl,1),
        indent:1
    },{
        key:'+ Open Position Basis',
        value: renderItem(exchange.basis),
        indent:2
    },{
        key:'- Open Position Current Value',
        value: renderItem(exchangeCurrentValue,1),
        indent:2
    },{
        key:'Margin Used',
        value: renderItem(exchange.marginUsed),
        indent: 1
    },{
        key:'Margin Available',
        value: renderItem(exchangeCollateral),
        indent: 1
    },{
        key:'Leverage',
        value: renderItem(exchange.leverage,LEVERAGE_DECIMALS),
        indent: 1
    },{
        key:'# of Markets',
        indent: 1,
        value: MARKETS.length
    },{
        key:'Rewards',
        value: ''
    },{
        key:'Total Rewards Available',
        value: renderItem(exchangeRewardsAvailable),
        indent: 1
    },{
        key:'Last Rewards Claim',
        value: lastRewardsClaimed,
        indent:1
    },{
        key:'Reward Frequency',
        value: `${renderItem(exchange.rewardFrequency?.toNumber()/(24*60*60/(400/1000)),1)}x a day`,
        indent:1
    }]
    return (
        <Box><Stack direction={"row"} >
        <Stat title="Pool Value" value={total / AMOUNT_DECIMALS} />
        <Stat title="Rewards" value={exchangeRewardsAvailable / AMOUNT_DECIMALS} />
        <Stat title="Unrealized Pnl" value={exchangeUnrealizedPnl / AMOUNT_DECIMALS} />

    </Stack>
             <Table>
                <thead>
                    <tr>
                        <th style={{width:225}}>Pool Details</th>
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