import Box from '@mui/joy/Box';
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from "../hooks/useProgram";
import useAccounts from "../hooks/useAccounts";
import Button from '@mui/joy/Button';

export default function Account() {
    const refreshUserAccount = useKrunchStore(state => state.refreshUserAccount)
    const refreshPositions = useKrunchStore(state => state.refreshPositions)
    const userAccount = useKrunchStore(state => state.userAccount)
    const userStableBalance = useKrunchStore(state => state.userStableBalance)
    const positions = useKrunchStore(state => state.positions)
    const { findAddress, fetchOrCreateAccount, fetchAccount } = useAccounts();
    const { getProgram, getProvider, wallet } = useProgram();
    
    async function getAccount() {
        const provider = await getProvider()
        refreshUserAccount(provider,fetchOrCreateAccount)
        refreshPositions(provider,fetchOrCreateAccount,findAddress)
    }
    return (
        <Box>
            <Button onClick={getAccount}>Get Account</Button>
            <div>Balance: {userStableBalance}</div>
            <div>Fees: {userAccount.fees?.toString()}</div>
            <>
            {positions.map((position) => {
                return <div key={position.marketIndex} >{position.market}: {position.marketIndex.toString()} </div>
            })}
            </>
        </Box>
    );
}