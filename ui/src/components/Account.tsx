import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import { fetchOrCreateAccount, findAddress } from "utils/dist/utils";
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from "../hooks/useProgram";
import Typography from '@mui/joy/Typography';
import Positions from './Positions';
import { renderItem } from '../utils';

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
    console.log("userAccount", userAccount  )
    return (
        <Box>
            <Button onClick={getAccount}>Get Account</Button>
            <Typography variant="outlined">Details</Typography>
            <div>collateralValue: {renderItem(userAccount.collateralValue)}</div>
            <div>Fees: {renderItem(userAccount.fees)}</div>
            <div>marginUsed: {renderItem(userAccount.marginUsed)}</div>
            <div>pnl: {renderItem(userAccount.pnl)}</div>
            <div>basis: {renderItem(userAccount.basis)}</div>

            <Typography variant="outlined">Markets</Typography>
            <Positions positions={positions} />
            <Typography variant="outlined">User Balances</Typography>
            <>
            {userBalances.map((userBalance) => {
                return <div key={userBalance.market} >{userBalance.market}: {renderItem(userBalance.balance,10**userBalance.decimals)}</div>
            })}
            </>
        </Box>
    );
}