import Box from '@mui/joy/Box';
import Stack from '@mui/joy/Stack';
import { AMOUNT_DECIMALS } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, formatPercent } from '../utils';
import TradingChart from './TradingChart';
import Positions from './Positions';
import Stat from './Stat';
import SubStat from './SubStat';

export default function UserPositions() {
    const userAccount = useKrunchStore(state => state.userAccount)
    const userUnrealizedPnl = useKrunchStore(state => state.userUnrealizedPnl)
    const positions = useKrunchStore(state => state.positions)

    return (
        <Box>
            <Stack direction={"row"} >
                <SubStat numValue={userUnrealizedPnl} title="Unrealized Pnl" value={formatCurrency(userUnrealizedPnl)} />
                <SubStat numValue={userAccount.rewards || 0} title="Rewards Earned" value={formatCurrency(userAccount.rewards / AMOUNT_DECIMALS)} />
                <SubStat numValue={userAccount.rebates || 0} title="Rebates Earned" value={formatCurrency(userAccount.rebates / AMOUNT_DECIMALS)} />
                <SubStat numValue={userUnrealizedPnl} title="Trading ROI" value={formatPercent(userUnrealizedPnl / (Math.abs(userAccount.basis) / AMOUNT_DECIMALS))} />
            </Stack>
            <Box margin={1}>
                <TradingChart symbol={'BTC/USD'} />
            </Box>
            <Box margin={1}>
                <Positions positions={positions} />
            </Box>
        </Box>
    );
}