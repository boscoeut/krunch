import '@fontsource/inter';
import MarketDialog from './MarketDialog';

import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Table from '@mui/joy/Table';
import { useState } from 'react';
import { fetchAccount } from "utils/dist/utils";
import '../App.css';
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from "../hooks/useProgram";
import { renderItem } from '../utils';

export default function Markets() {
    const { getProgram } = useProgram();

    const markets = useKrunchStore(state => state.markets)
    const getPrice = useKrunchStore(state => state.getPrice)
    const refreshMarkets = useKrunchStore(state => state.refreshMarkets)
    const [open, setOpen] = useState(false);

    async function getAccounts() {
        refreshMarkets(fetchAccount)
    }

    async function checkPrice(feedAddress: string) {
        const program = await getProgram()
        getPrice(program, feedAddress)
    }

    return (
        <Box>
            <Button size="sm" variant="soft" onClick={getAccounts}>Refresh Accounts</Button>
            <Table>
                <thead>
                    <tr>
                        <th>Market</th>
                        <th>Index</th>
                        <th>Weight</th>
                        <th>Leverage</th>
                        <th>Basis</th>
                        <th>Price</th>
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
                            <td>{row.leverage}</td>
                            <td>{row.marketWeight}</td>
                            <td>{renderItem(row.basis)}</td>
                            <td>{renderItem(row.currentPrice)}</td>
                            <td>{renderItem(row.fees)}</td>
                            <td>{row.makerFee}</td>
                            <td>{row.takerFee}</td>
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