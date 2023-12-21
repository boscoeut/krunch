import '@fontsource/inter';

import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import '../App.css';
import { renderItem, formatCurrency } from '../utils';

export default function Positions({ positions }: { positions: Array<any> }) {

    console.log('positions', positions)
    return (
        <Box>
            <Table>
                <thead>
                    <tr>
                        <th>Market</th>
                        <th>Index</th>
                        <th>MarginUsed</th>
                        <th>Pnl</th>
                        <th>Fees</th>
                        <th>Rebates</th>
                        <th>Rewards</th>
                        <th>Basis</th>
                        <th>Token Amt</th>
                        <th>Entry Price</th>
                        <th>Price</th>
                        <th>Curr Value</th>
                        <th>Unrealized Pnl</th>
                    </tr>
                </thead>
                <tbody>
                    {positions.map(row => {
                        const entryPrice = Math.abs(row.tokenAmount === 0 ? 0 : row.basis / row.tokenAmount)
                        return <tr key={row.marketIndex}>
                            <td>{row.market}</td>
                            <td>{row.marketIndex}</td>
                            <td>{renderItem(row.marginUsed)}</td>
                            <td>{renderItem(row.pnl)}</td>
                            <td>{renderItem(row.fees)}</td>
                            <td>{renderItem(row.rebates)}</td>
                            <td>{renderItem(row.rewards)}</td>
                            <td>{renderItem(row.basis)}</td>
                            <td>{renderItem(row.tokenAmount)}</td>
                            <td>{formatCurrency(entryPrice)}</td>
                            <td>{formatCurrency(row.price || 0)}</td>
                            <td>{formatCurrency(row.currValue)}</td>
                            <td>{formatCurrency(row.unrealizedPnl)}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
        </Box>
    );
}