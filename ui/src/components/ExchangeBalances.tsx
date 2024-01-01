import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, formatNumber } from '../utils';
import SectionHeader from './SectionHeader';

export default function ExchangeBalances() {
    const exchangeBalances = useKrunchStore(state => state.exchangeBalances)
    const treasuryTotal = useKrunchStore(state => state.treasuryTotal)

    return (
        <Box>
            <Table>
                <thead>
                    <tr>
                        <th style={{ width: 225 }} colSpan={1}><SectionHeader title="Pool Treasury" /></th>
                        <th colSpan={3}><SectionHeader title={formatCurrency(treasuryTotal)} /></th>
                    </tr>
                    <tr>
                        <th>Token</th>
                        <th>Amount</th>
                        <th>Price</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    {exchangeBalances.map(row => {
                        return <tr key={row.market}>
                            <td>{row.market.replace("/USD", "")}</td>
                            <td>{formatNumber(row.balance / (10 ** row.decimals),5)}</td>
                            <td>{formatCurrency(row.price || 0)}</td>
                            <td>{formatCurrency(row.currValue || 0)}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
        </Box>
    );
}