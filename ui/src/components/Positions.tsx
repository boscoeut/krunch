import '@fontsource/inter';

import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import '../App.css';
import { renderItem, formatCurrency } from '../utils';
import SectionHeader from './SectionHeader';
import { AMOUNT_DECIMALS } from 'utils/dist/constants';

export default function Positions({ positions }: { positions: Array<any> }) {
    const openPositions = positions.filter(p => p.tokenAmount?.toNumber() != 0)

    return (
        <Box>
            <Table>
                <thead>
                    <tr>
                        <th colSpan={7}><SectionHeader title="Open Positions" /></th>
                    </tr>
                    <tr>
                        <th>Market</th>
                        <th>Amount</th>
                        <th>Basis</th>
                        <th>Curr Value</th>
                        <th>Unrealized Pnl</th>
                        <th>Entry Price</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>
                    {openPositions.map(row => {
                        const entryPrice = Math.abs(row.tokenAmount === 0 ? 0 : row.basis / row.tokenAmount)
                        return <tr key={row.marketIndex}>
                            <td>{row.market}</td>
                            <td>{renderItem(row.tokenAmount,AMOUNT_DECIMALS,4)}</td>
                            <td>{renderItem(row.basis)}</td>
                            <td>{formatCurrency(row.currValue)}</td>
                            <td>{formatCurrency(row.unrealizedPnl)}</td>
                            <td>{formatCurrency(entryPrice)}</td>
                            <td>{formatCurrency(row.price || 0)}</td>
                        </tr>
                    })}
                    {openPositions.length === 0 && <tr><td colSpan={7}>No Open Positions</td></tr>}
                </tbody>
            </Table>
        </Box>
    );
}