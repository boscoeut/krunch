import Box from '@mui/joy/Box';
import { useKrunchStore } from "../hooks/useKrunchStore";
import ExchangeBalances from './ExchangeBalances';
import PoolDetails from './PoolDetails';
import Positions from './Positions';

export default function Pool() {
    const markets = useKrunchStore(state => state.markets)
    
    return (
        <Box>
            <PoolDetails />
            <Positions positions={markets} />
            <ExchangeBalances />
        </Box>
    );
}