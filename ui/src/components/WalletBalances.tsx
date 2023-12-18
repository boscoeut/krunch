import Box from '@mui/joy/Box';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { renderItem } from '../utils';
import Table from '@mui/joy/Table';

export default function WalletBalances() {
    const userBalances = useKrunchStore(state => state.userBalances)
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
                    {userBalances.map(row => {
                        return <tr key={row.market}>
                            <td>{row.market}</td>
                            <td>{renderItem(row.balance, 10 ** row.decimals)}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
        </Box>
    );
}