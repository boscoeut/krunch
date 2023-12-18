import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { renderItem } from '../utils';

export default function AccountDetails() {
    const userAccount = useKrunchStore(state => state.userAccount)
    return (
        <Box>
            <Typography variant="outlined">Details</Typography>
            <div>collateralValue: {renderItem(userAccount.collateralValue)}</div>
            <div>Fees: {renderItem(userAccount.fees)}</div>
            <div>marginUsed: {renderItem(userAccount.marginUsed)}</div>
            <div>pnl: {renderItem(userAccount.pnl)}</div>
            <div>basis: {renderItem(userAccount.basis)}</div>
        </Box>
    );
}