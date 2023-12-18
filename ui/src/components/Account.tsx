import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import { useKrunchStore } from "../hooks/useKrunchStore";
import AccountDetails from './AccountDetails';
import Positions from './Positions';
import WalletBalances from './WalletBalances';

export default function Account() {
    const positions = useKrunchStore(state => state.positions)
    return (
        <Box>
            <AccountDetails />
            <Typography variant="outlined">Markets</Typography>
            <Positions positions={positions} />
            <WalletBalances/>
        </Box>
    );
}