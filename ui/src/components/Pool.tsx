import Box from '@mui/joy/Box';
import { useKrunchStore } from "../hooks/useKrunchStore";
import ExchangeBalances from './ExchangeBalances';
import PoolDetails from './PoolDetails';
import PoolPositions from './PoolPositions';

export default function Pool() {
    const markets = useKrunchStore(state => state.markets)
    
    return (
        <Box>
            <PoolDetails />
            <PoolPositions positions={markets} />
            <ExchangeBalances />
        </Box>
    );
}