import Box from '@mui/joy/Box';
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from "../hooks/useProgram";
import useAccounts from "../hooks/useAccounts";
import Button from '@mui/joy/Button';
import Typography from '@mui/joy/Typography';
import {findAddress, fetchOrCreateAccount, fetchAccount} from "utils/dist/utils";   

export default function Pool() {
    const refreshPool = useKrunchStore(state => state.refreshPool)
    const refreshMarkets = useKrunchStore(state => state.refreshMarkets)
    const markets = useKrunchStore(state => state.markets)
    const exchangeBalances = useKrunchStore(state => state.exchangeBalances)
    const exchange = useKrunchStore(state => state.exchange)
    const { getProgram, getProvider, wallet } = useProgram();
    
    async function getPool() {
        const provider = await getProvider()
        refreshPool(provider,fetchOrCreateAccount, findAddress)
        refreshMarkets(fetchAccount)
    }
    return (
        <Box>
            <Button onClick={getPool}>Get Pool</Button>
            <div>Fees: {exchange.fees?.toString()}</div>

            <Typography variant="outlined">Markets</Typography>
            <>
            {markets.map((market) => {
                return <div key={market.marketIndex} >{market.name}: {market.marketIndex.toString()} </div>
            })}
            </>

            <Typography variant="outlined">Pool Balances</Typography>
            <>
            {exchangeBalances.map((market) => {
                return <div key={market.market} >{market.market}: {market.balance/market.decimals} </div>
            })}
            </>
        </Box>
    );
}