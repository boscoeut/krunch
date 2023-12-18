import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { renderItem } from '../utils';

export default function WalletBalances() {
    const userBalances = useKrunchStore(state => state.userBalances)
    return (
        <Box>
             <Typography variant="outlined">Wallet Balances</Typography>
            <>
                {userBalances.map((userBalance) => {
                    return <div key={userBalance.market} >{userBalance.market}: {renderItem(userBalance.balance, 10 ** userBalance.decimals)}</div>
                })}
            </>
        </Box>
    );
}