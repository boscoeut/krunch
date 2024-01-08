import '@fontsource/inter';
import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import '../App.css';
import Button from '@mui/joy/Button';
import { renderItem, formatCurrency } from '../utils';
import SectionHeader from './SectionHeader';
import { AMOUNT_DECIMALS } from 'utils/dist/constants';
import PriceLabel from './PriceLabel';
import StaticPriceLabel from './StaticPriceLabel';
import { useKrunchStore } from '../hooks/useKrunchStore';

export default function PoolPositions({ positions }: { positions: Array<any> }) {
    const openPositions = positions.filter(p => p.tokenAmount?.toNumber() != 0)
    const setTradeDialogOpen = useKrunchStore(state => state.setTradeDialogOpen)
    
    return (
        <Box display={openPositions.length > 0 ? 'inherit':'none'}>
            <Table>
                <thead>
                    <tr>
                        <th colSpan={7}><SectionHeader title="Open Positions" /></th>
                    </tr>
                    <tr>
                        <th>Market</th>
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
                            <td><Button onClick={()=>setTradeDialogOpen(true)} size='sm' variant='plain'>{row.market} </Button></td>
                            <td>{renderItem(row.basis)}</td>
                            <td>{renderItem(row.tokenAmount, AMOUNT_DECIMALS, 4)}</td>
                            <td>{formatCurrency(entryPrice)}</td>
                            <td><PriceLabel value={row.price}>{formatCurrency(row.price || 0)}</PriceLabel></td>
                            <td>{formatCurrency(row.currValue)}</td>
                            <td><StaticPriceLabel value={row.unrealizedPnl}>{formatCurrency(row.unrealizedPnl || 0)}</StaticPriceLabel></td>
                        </tr>
                    })}
                    {openPositions.length === 0 && <tr><td colSpan={11}>No Positions</td></tr>}
                </tbody>
            </Table>
        </Box>
    );
}