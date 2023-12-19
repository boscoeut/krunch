import Box from '@mui/joy/Box';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { renderItem } from '../utils';
import Table from '@mui/joy/Table';

export default function AccountDetails() {
    const userAccount = useKrunchStore(state => state.userAccount)
    const total = Number(userAccount.collateralValue)
        +Number(userAccount.fees)
        +Number(userAccount.pnl)
    const values = [{
        key:'Curr Value',
        value: renderItem(total)
    },{
        key:'Collateral Value',
        value: renderItem(userAccount.collateralValue)
    },{
        key:'Fees Paid',
        value: renderItem(userAccount.fees)
    },{
        key:'Pnl',
        value: renderItem(userAccount.pnl)
    },{
        key:'Basis',
        value: renderItem(userAccount.basis)
    },{
        key:'Margin Used',
        value: renderItem(userAccount.marginUsed)
    },]
    return (
        <Box>
            <Table>
                <thead>
                    <tr>
                        <th>Account Details</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {values.map(row => {
                        return <tr key={row.key}>
                            <td>{row.key}</td>
                            <td>{row.value}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
        </Box>
    );
}