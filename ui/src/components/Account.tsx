import Box from '@mui/joy/Box';
import { useKrunchStore } from "../hooks/useKrunchStore";
import AccountDetails from './AccountDetails';
import Positions from './Positions';

export default function Account() {
    const positions = useKrunchStore(state => state.positions)
    return (
        <Box>
            <AccountDetails />
            <Positions positions={positions} />
        </Box>
    );
}