import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import { useKrunchStore } from "../hooks/useKrunchStore";
import Table from '@mui/joy/Table';
import { renderItem } from '../utils';
import { MARKET_WEIGHT_DECIMALS } from 'utils/dist/constants';
export default function PoolDetails() {
    const exchange = useKrunchStore(state => state.exchange)
    const values = [{
        key:'Collateral Value',
        value: renderItem(exchange.collateralValue)
    },{
        key:'Fees Paid',
        value: renderItem(exchange.fees)
    },{
        key:'Margin Used',
        value: renderItem(exchange.marginUsed)
    },{
        key:'Pnl',
        value: renderItem(exchange.pnl)
    },{
        key:'Basis',
        value: renderItem(exchange.basis)
    },{
        key:'# of Markets',
        value: exchange.numberOfMarkets
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