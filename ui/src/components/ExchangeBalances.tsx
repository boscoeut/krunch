import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import { useKrunchStore } from "../hooks/useKrunchStore";

export default function ExchangeBalances() {
    const exchangeBalances = useKrunchStore(state => state.exchangeBalances)

    return (
        <Box>
              <Typography variant="outlined">Pool Balances</Typography>
            <>
                {exchangeBalances.map((market) => {
                    return <div key={market.market} >{market.market}: {market.balance / (10 ** market.decimals)} </div>
                })}
            </>
        </Box>
    );
}