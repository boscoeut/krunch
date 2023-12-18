import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import { useKrunchStore } from "../hooks/useKrunchStore";

export default function PoolDetails() {
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
        </Box>
    );
}