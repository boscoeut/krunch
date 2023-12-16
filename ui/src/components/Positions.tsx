import '@fontsource/inter';

import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import '../App.css';
import { renderItem } from '../utils';

export default function Positions({ positions }: { positions: Array<any> }) {

    console.log('positions', positions)
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
                        <th>Token Amt</th>
                    </tr>
                </thead>
                <tbody>
                    {positions.map(row => {
                        return <tr key={row.marketIndex}>
                            <td>{row.market}</td>
                            <td>{row.marketIndex}</td>
                            <td>{renderItem(row.marginUsed)}</td>
                            <td>{renderItem(row.pnl)}</td>
                            <td>{renderItem(row.fees)}</td>
                            <td>{renderItem(row.tokenAmount)}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
        </Box>
    );
}