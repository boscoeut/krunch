import '@fontsource/inter';
import MarketDialog from './MarketDialog';

import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Table from '@mui/joy/Table';
import { useState } from 'react';
import { FEE_DECIMALS, LEVERAGE_DECIMALS, MARKET_WEIGHT_DECIMALS } from 'utils/dist/constants';
import '../App.css';
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from "../hooks/useProgram";
import { renderItem } from '../utils';

export default function Markets() {
    const { getProgram } = useProgram();
    const markets = useKrunchStore(state => state.markets)
    const getPrice = useKrunchStore(state => state.getPrice)
    const [open, setOpen] = useState(false);

    async function checkPrice(feedAddress: string) {
        const program = await getProgram()
        getPrice(program, feedAddress)
    }

    return (
        <Box>
            <Table>
                <thead>
                    <tr>
                        <th>Market</th>
                        <th>Index</th>
                        <th>Weight</th>
                        <th>Leverage</th>
                        <th>Basis</th>
                        <th>Fees</th>
                        <th>Maker Fee</th>
                        <th>Taker Fee</th>
                        <th>Margin Used</th>
                        <th>Token Amt</th>
                        <th>Address</th>
                    </tr>
                </thead>
                <tbody>
                    {markets.map(row => {
                        return <tr key={row.name}>
                            <td>{renderItem(row.name)}</td>
                            <td>{row.marketIndex}</td>
                            <td>{renderItem(row.marketWeight, MARKET_WEIGHT_DECIMALS)}</td>
                            <td>{renderItem(row.leverage, LEVERAGE_DECIMALS)}</td>
                            <td>{renderItem(row.basis)}</td>
                            <td>{renderItem(row.fees)}</td>
                            <td>{renderItem(row.makerFee, FEE_DECIMALS)}</td>
                            <td>{renderItem(row.takerFee, FEE_DECIMALS)}</td>
                            <td>{renderItem(row.marginUsed)}</td>
                            <td>{renderItem(row.tokenAmount)}</td>
                            <td>
                                <Button onClick={async () => checkPrice(row.feedAddress?.toString())}>{row.feedAddress?.toString().substring(0, 10)}</Button>
                            </td>
                        </tr>
                    })}
                </tbody>
            </Table>
            <MarketDialog open={open} setOpen={setOpen} />
        </Box>
    );
}