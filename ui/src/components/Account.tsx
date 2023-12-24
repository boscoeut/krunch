import Box from '@mui/joy/Box';
import { useKrunchStore } from "../hooks/useKrunchStore";
import AccountDetails from './AccountDetails';
import Positions from './Positions';
import WalletBalances from './WalletBalances';

export default function Account() {
    const positions = useKrunchStore(state => state.positions)
    const isAdmin = useKrunchStore(state => state.isAdmin)
    return (
        <Box>
            <AccountDetails />
            <Positions positions={positions} />
            {!isAdmin && <WalletBalances/>}
        </Box>
    );
}