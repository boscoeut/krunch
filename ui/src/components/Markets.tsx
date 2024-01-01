import '@fontsource/inter';
import MarketDialog from './MarketDialog';

import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import { useState } from 'react';
import { AMOUNT_DECIMALS, FEE_DECIMALS, LEVERAGE_DECIMALS } from 'utils/dist/constants';
import '../App.css';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, formatNumber, formatPercent, renderItem } from '../utils';
import SectionHeader from './SectionHeader';

export default function Markets() {
    const markets = useKrunchStore(state => state.markets)
    const [open, setOpen] = useState(false);

    return (
        <Box>
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
                            <td>{row.name}</td>
                            <td>{row.marketType}</td>
                            <td>{renderItem(row.tokenAmount)}</td>
                            <td>{formatCurrency(row.price || 0)}</td>
                            <td>{formatNumber((row.leverage || 0) / LEVERAGE_DECIMALS, 0)}x</td>
                            <td>{formatPercent((row.makerFee || 0) / FEE_DECIMALS)}</td>
                            <td>{formatPercent((row.takerFee || 0) / FEE_DECIMALS)}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
            <MarketDialog open={open} setOpen={setOpen} />
        </Box>
    );
}