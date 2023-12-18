import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import { useKrunchStore } from "../hooks/useKrunchStore";

export default function ExchangeBalances() {
    const exchangeBalances = useKrunchStore(state => state.exchangeBalances)

    return (
        <Box>
            <Table>
                <thead>
                    <tr>
                        <th>Token</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {exchangeBalances.map(row => {
                        return <tr key={row.market}>
                            <td>{row.market}</td>
                            <td>{row.balance / (10 ** row.decimals)}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
        </Box>
    );
}