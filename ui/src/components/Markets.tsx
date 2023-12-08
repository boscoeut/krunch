import '@fontsource/inter';
import MarketDialog from './MarketDialog';

import Typography from '@mui/joy/Typography';
import Box from '@mui/joy/Box';
import { PublicKey } from "@solana/web3.js";
import '../App.css';
import Table from '@mui/joy/Table';
import useProgram from "../hooks/useProgram";
import useAccounts from "../hooks/useAccounts";
import { useState } from 'react';
import * as anchor from "@coral-xyz/anchor";
import Button from '@mui/joy/Button';
import { useKrunchStore } from "../hooks/useKrunchStore";
const AMOUNT_DECIMALS = 10 ** 9;

export default function Markets() {
    const { getProgram, getProvider, wallet } = useProgram();
    const { findAddress, fetchOrCreateAccount, fetchAccount } = useAccounts();
    const [temp, setTemp] = useState({} as any);
    const markets = useKrunchStore(state => state.markets)
    const getPrice = useKrunchStore(state => state.getPrice)
    const refreshMarkets = useKrunchStore(state => state.refreshMarkets)
    const [open, setOpen] = useState(false);

    const renderItem = (item: any, decimals = AMOUNT_DECIMALS) => {
        if (!item) {
            return ""
        } else if (item instanceof PublicKey) {
            return `${item.toString()}`
        } else if (item instanceof anchor.BN) {
            return `${(item.toNumber() / decimals).toFixed(3)}`
        } else if (typeof item === 'number') {
            return `${(item / decimals).toFixed(3)}`
        } else {
            return `${item.toString()}`
        }
    }

    async function getAccounts() {
        await refreshMarkets(fetchAccount)
    }

    async function checkPrice(feedAddress:string    ) {
        const program =await getProgram()
        getPrice(program,feedAddress)
    }

    return (
        <Box>
            <Button onClick={()=>setOpen(true)}>Open Dialog</Button>
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
                                <Button onClick={async ()=>checkPrice(row.feedAddress?.toString())}>{row.feedAddress?.toString().substring(0,10)}</Button>
                            </td>
                        </tr>
                    })}
                </tbody>
            </Table>
            <MarketDialog open={open} setOpen={setOpen}/>
        </Box>
    );
}