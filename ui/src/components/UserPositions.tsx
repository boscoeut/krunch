import Box from '@mui/joy/Box';
import Stack from '@mui/joy/Stack';
import { AMOUNT_DECIMALS } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, formatPercent } from '../utils';
import Positions from './Positions';
import Stat from './Stat';

export default function UserPositions() {
    const userAccount = useKrunchStore(state => state.userAccount)
    const userUnrealizedPnl = useKrunchStore(state => state.userUnrealizedPnl)
    const positions = useKrunchStore(state => state.positions)
    
    return (
        <Box>
            <Stack direction={"row"} >
                <Stat numValue={userUnrealizedPnl} title="Unrealized Pnl" value={formatCurrency(userUnrealizedPnl)} />
                <Stat numValue={userAccount.rebates || 0} title="Rebates Earned" value={formatCurrency(userAccount.rebates / AMOUNT_DECIMALS)} />
                <Stat numValue={userUnrealizedPnl} title="Trading ROI" value={formatPercent(userUnrealizedPnl / (Math.abs(userAccount.basis) / AMOUNT_DECIMALS))} />
            </Stack>
            <Positions positions={positions} />
        </Box>
    );
}