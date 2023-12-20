import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { renderItem } from '../utils';
import { LEVERAGE_DECIMALS } from 'utils/dist/constants';
export default function PoolDetails() {
    const exchange = useKrunchStore(state => state.exchange)
    const exchangeCollateral = useKrunchStore(state => state.exchangeCollateral)
    const total = Number(exchange.collateralValue)
    +Number(exchange.fees)
    +Number(exchange.rebates)
    +Number(exchange.pnl)
    const values = [{
        key:'Curr Value',
        value: renderItem(total)
    },{
        key:'Collateral Value',
        value: renderItem(exchange.collateralValue)
    },{
        key:'Fees Earned',
        value: renderItem(exchange.fees)
    },{
        key:'Rebates Paid',
        value: renderItem(exchange.rebates)
    },{
        key:'Pnl',
        value: renderItem(exchange.pnl)
    },{
        key:'Margin Used',
        value: renderItem(exchange.marginUsed)
    },{
        key:'Margin Available',
        value: renderItem(exchangeCollateral)
    },{
        key:'Basis',
        value: renderItem(exchange.basis)
    },{
        key:'# of Markets',
        value: exchange.numberOfMarkets
    },{
        key:'Leverage',
        value: renderItem(exchange.leverage,LEVERAGE_DECIMALS)
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
                            <td>{row.key}</td>
                            <td>{row.value}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
        </Box>
    );
}