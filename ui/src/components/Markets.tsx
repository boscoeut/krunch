import '@fontsource/inter';
import MarketDialog from './MarketDialog';

import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import { useState } from 'react';
import { renderItem, formatCurrency } from '../utils';
import '../App.css';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { MARKET_WEIGHT_DECIMALS, LEVERAGE_DECIMALS, FEE_DECIMALS } from 'utils/dist/constants';

export default function Markets() {
    const markets = useKrunchStore(state => state.markets)
    const [open, setOpen] = useState(false);

    return (
        <Box>
            <Table>
                <thead>
                    <tr>
                        <th>Market</th>
                        <th>Index</th>
                        <th>Type</th>

                        <th>Token Amt</th>
                        <th>Price</th>
                        <th>Collateral Available</th>

                        <th>Leverage</th>
                        <th>Maker Fee</th>
                        <th>Taker Fee</th>
                    </tr>
                </thead>
                <tbody>
                    {markets.map(row => {
                        return <tr key={row.marketIndex}>
                            <td>{row.name}</td>
                            <td>{row.marketIndex}</td>
                            <td>{row.marketType}</td>

                            <td>{renderItem(row.tokenAmount)}</td>
                            <td>{formatCurrency(row.price || 0)}</td>
                            <td>{renderItem(row.marketTotal || 0)}</td>
                
                            <td>{renderItem(row.leverage, LEVERAGE_DECIMALS)}x</td>
                            <td>{renderItem(row.makerFee, FEE_DECIMALS)}</td>
                            <td>{renderItem(row.takerFee, FEE_DECIMALS)}</td>
                        </tr>


                    })}
                </tbody>
            </Table>
            <MarketDialog open={open} setOpen={setOpen} />
        </Box>
    );
}