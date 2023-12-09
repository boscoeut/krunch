import Box from '@mui/joy/Box';
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from "../hooks/useProgram";
import useAccounts from "../hooks/useAccounts";
import Button from '@mui/joy/Button';

export default function Pool() {
    const refreshPool = useKrunchStore(state => state.refreshPool)
    const refreshMarkets = useKrunchStore(state => state.refreshMarkets)
    const exchangeStableBalance = useKrunchStore(state => state.exchangeStableBalance)
    const markets = useKrunchStore(state => state.markets)
    const exchange = useKrunchStore(state => state.exchange)
    const { findAddress, fetchOrCreateAccount, fetchAccount } = useAccounts();
    const { getProgram, getProvider, wallet } = useProgram();
    
    async function getPool() {
        const provider = await getProvider()
        refreshPool(provider,fetchOrCreateAccount, findAddress)
        refreshMarkets(fetchAccount)
    }
    return (
        <Box>
            <Button onClick={getPool}>Get Pool</Button>
            <div>Balance: {exchangeStableBalance}</div>
            <div>Fees: {exchange.fees?.toString()}</div>
            <>
            {markets.map((market) => {
                return <div key={market.marketIndex} >{market.name}: {market.marketIndex.toString()} </div>
            })}
            </>
        </Box>
    );
}