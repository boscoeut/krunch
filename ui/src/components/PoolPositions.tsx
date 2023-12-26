import '@fontsource/inter';

import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import '../App.css';
import { renderItem, formatCurrency } from '../utils';
import SectionHeader from './SectionHeader';

export default function PoolPositions({ positions }: { positions: Array<any> }) {
    const openPositions = positions.filter(p => p.tokenAmount?.toNumber() != 0)

    return (
        <Box>
            <Table>
                <thead>
                    <tr>
                        <th colSpan={11}><SectionHeader title="Open Positions" /></th>
                    </tr>
                    <tr>
                        <th>Market</th>
                        <th>MarginUsed</th>
                        <th>Pnl</th>
                        <th>Fees</th>
                        <th>Rebates</th>
                        <th>Basis</th>
                        <th>Amount</th>
                        <th>Entry Price</th>
                        <th>Price</th>
                        <th>Curr Value</th>
                        <th>Unrealized Pnl</th>
                    </tr>
                </thead>
                <tbody>
                    {openPositions.map(row => {
                        const entryPrice = Math.abs(row.tokenAmount === 0 ? 0 : row.basis / row.tokenAmount)
                        return <tr key={row.marketIndex}>
                            <td>{row.market}</td>
                            <td>{renderItem(row.marginUsed)}</td>
                            <td>{renderItem(row.pnl)}</td>
                            <td>{renderItem(row.fees)}</td>
                            <td>{renderItem(row.rebates)}</td>
                            <td>{renderItem(row.basis)}</td>
                            <td>{renderItem(row.tokenAmount)}</td>
                            <td>{formatCurrency(entryPrice)}</td>
                            <td>{formatCurrency(row.price || 0)}</td>
                            <td>{formatCurrency(row.currValue)}</td>
                            <td>{formatCurrency(row.unrealizedPnl)}</td>
                        </tr>
                    })}
                    {openPositions.length === 0 && <tr><td colSpan={11}>No Positions</td></tr>}
                </tbody>
            </Table>
        </Box>
    );
}