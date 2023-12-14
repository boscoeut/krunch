import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import { fetchOrCreateAccount, findAddress } from "utils/dist/utils";
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from "../hooks/useProgram";
import Typography from '@mui/joy/Typography';

export default function Account() {
    const refreshUserAccount = useKrunchStore(state => state.refreshUserAccount)
    const refreshPositions = useKrunchStore(state => state.refreshPositions)
    const userAccount = useKrunchStore(state => state.userAccount)
    const userBalances = useKrunchStore(state => state.userBalances)
    const positions = useKrunchStore(state => state.positions)
    const { getProvider } = useProgram();
    
    async function getAccount() {
        const provider = await getProvider()
        refreshUserAccount(provider,fetchOrCreateAccount, findAddress)
        refreshPositions(provider,fetchOrCreateAccount,findAddress)
    }
    return (
        <Box>
            <Button onClick={getAccount}>Get Account</Button>
            <div>Fees: {userAccount.fees?.toString()}</div>
            <>
            {positions.map((position) => {
                return <div key={position.marketIndex} >{position.market}: {position.marketIndex.toString()} </div>
            })}
            </>

            <Typography variant="outlined">User Balances</Typography>
            <>
            {userBalances.map((market) => {
                return <div key={market.market} >{market.market}: {market.balance/market.decimals} </div>
            })}
            </>
        </Box>
    );
}