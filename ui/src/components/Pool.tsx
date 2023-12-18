import Box from '@mui/joy/Box';
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from "../hooks/useProgram";
import Button from '@mui/joy/Button';
import Typography from '@mui/joy/Typography';
import {findAddress, fetchOrCreateAccount, fetchAccount} from "utils/dist/utils";   
import Positions from './Positions';

export default function Pool() {
    const markets = useKrunchStore(state => state.markets)
    const exchangeBalances = useKrunchStore(state => state.exchangeBalances)
    const exchange = useKrunchStore(state => state.exchange)
    
    return (
        <Box>
            <Typography variant="outlined">Details</Typography>
            <div>collateralValue: {exchange.collateralValue?.toNumber()/(10**9)}</div>
            <div>number_of_markets: {exchange.numberOfMarkets?.toString()}</div>
            <div>marketWeight: {exchange.marketWeight?.toString()}</div>
            <div>basis: {exchange.basis?.toNumber()/(10**9)}</div>
            <div>fees: {exchange.fees?.toNumber()/(10**9)}</div>
            <div>pnl: {exchange.pnl?.toNumber()/(10**9)}</div>
            <div>margin_used: {exchange.marginUsed?.toNumber()/(10**9)}</div>

            <Typography variant="outlined">Markets</Typography>
            <Positions positions={markets} />

            <Typography variant="outlined">Pool Balances</Typography>
            <>
            {exchangeBalances.map((market) => {
                return <div key={market.market} >{market.market}: {market.balance/(10**market.decimals)} </div>
            })}
            </>
        </Box>
    );
}