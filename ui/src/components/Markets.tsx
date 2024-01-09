import '@fontsource/inter';
import MarketDialog from './MarketDialog';

import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import Button from '@mui/joy/Button';
import { FEE_DECIMALS, LEVERAGE_DECIMALS } from 'utils/dist/constants';
import '../App.css';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, formatNumber, formatPercent, renderItem } from '../utils';
import SectionHeader from './SectionHeader';
import PriceLabel from './PriceLabel';

export default function Markets() {
    const markets = useKrunchStore(state => state.markets)
    const setTradeDialogOpen = useKrunchStore(state => state.setTradeDialogOpen)

    return (
        <Box sx={{
            minHeight: 0,
            flexGrow: 1,
            overflow: 'hidden auto',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <Table>
                <thead>
                    <tr>
                        <th colSpan={7}><SectionHeader title="Available Markets" /></th>
                    </tr>
                    <tr>
                        <th style={{ width: '100px' }}>Market</th>
                        <th style={{ width: '75px' }}>Type</th>
                        <th>Net Amount</th>
                        <th>Price</th>
                        <th>Leverage</th>
                        <th>Maker Fee</th>
                        <th>Taker Fee</th>
                    </tr>
                </thead>
                <tbody>
                    {markets.map(row => {
                        return <tr key={row.marketIndex}>
                            <td><Button onClick={()=>setTradeDialogOpen(true)} size='sm' variant='plain'>{row.name} </Button></td>
                            <td>{row.marketType}</td>
                            <td>{renderItem(row.tokenAmount)}</td>
                            <td><PriceLabel value={row.price}>{formatCurrency(row.price || 0)}</PriceLabel></td>
                            <td>{formatNumber((row.leverage || 0) / LEVERAGE_DECIMALS, 0)}x</td>
                            <td>{formatPercent((row.makerFee || 0) / FEE_DECIMALS)}</td>
                            <td>{formatPercent((row.takerFee || 0) / FEE_DECIMALS)}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
        </Box>
    );
}