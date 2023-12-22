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

                        <th>MarginUsed</th>
                        <th>Pnl</th>
                        <th>Fees</th>
                        <th>Rebates</th>
                        <th>Basis</th>
                        <th>Token Amt</th>
                        <th>Entry Price</th>
                        <th>Price</th>
                        <th>Curr Value</th>
                        <th>Unrealized Pnl</th>
                        <th>Collateral Available</th>

                        <th>Weight</th>
                        <th>Leverage</th>
                        <th>Maker Fee</th>
                        <th>Taker Fee</th>
                        <th>Address</th>
                    </tr>
                </thead>
                <tbody>
                    {markets.map(row => {
                        return <tr key={row.marketIndex}>
                            <td>{row.name}</td>
                            <td>{row.marketIndex}</td>
                            <td>{renderItem(row.marginUsed)}</td>
                            <td>{renderItem(row.pnl)}</td>
                            <td>{renderItem(row.fees)}</td>
                            <td>{renderItem(row.rebates)}</td>
                            <td>{renderItem(row.basis)}</td>
                            <td>{renderItem(row.tokenAmount)}</td>
                            <td>{formatCurrency(row.entryPrice || 0)}</td>
                            <td>{formatCurrency(row.price || 0)}</td>
                            <td>{formatCurrency(row.currValue || 0)}</td>
                            <td>{formatCurrency(row.unrealizedPnl || 0)}</td>
                            <td>{renderItem(row.marketTotal || 0)}</td>

                            <td>{renderItem(row.marketWeight, MARKET_WEIGHT_DECIMALS)}</td>
                            <td>{renderItem(row.leverage, LEVERAGE_DECIMALS)}</td>
                            <td>{renderItem(row.makerFee, FEE_DECIMALS)}</td>
                            <td>{renderItem(row.takerFee, FEE_DECIMALS)}</td>
                            <td>{`${row.feedAddress}`}</td>

                        </tr>


                    })}
                </tbody>
            </Table>
            <MarketDialog open={open} setOpen={setOpen} />
        </Box>
    );
}