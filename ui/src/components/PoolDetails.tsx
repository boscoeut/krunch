import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { renderItem } from '../utils';
export default function PoolDetails() {
    const exchange = useKrunchStore(state => state.exchange)
    const total = Number(exchange.collateralValue)
    +Number(exchange.fees)
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
        key:'Pnl',
        value: renderItem(exchange.pnl)
    },{
        key:'Margin Used',
        value: renderItem(exchange.marginUsed)
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