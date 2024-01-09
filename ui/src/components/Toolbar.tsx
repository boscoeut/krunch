
import Box from '@mui/joy/Box';
import Sheet from '@mui/joy/Sheet';
import Button from '@mui/joy/Button';
import ButtonGroup from '@mui/joy/ButtonGroup';
import Dropdown from '@mui/joy/Dropdown';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import Menu from '@mui/joy/Menu';
import MenuButton from '@mui/joy/MenuButton';
import MenuItem from '@mui/joy/MenuItem';
import { useState } from 'react';
import { AMOUNT_DECIMALS, AUTO_REFRESH_INTERVAL } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from '../hooks/useProgram';
import { formatCurrency, ICONS } from '../utils';
import ClaimDialog from './ClaimDialog';
import DepositDialog from './DepositDialog';
import MarketDialog from './MarketDialog';
import TradeDialog from './TradeDialog';
import UpdateExchangeDialog from './UpdateExchangeDialog';
import WithdrawDialog from './WithdrawDialog';
import useActiveTabEvent from '../hooks/useActiveTabEvent';
import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

export default function Toolbar() {
    const { getProgram, getProvider } = useProgram() // initialize the program (do not remove)
    const wallet = useWallet();

    const [updateExchangeDialogOpen, setUpdateExchangeDialogOpen] = useState(false);
    const [claimDialogOpen, setClaimDialogOpen] = useState(false);
    const [marketDialogOpen, setMarketDialogOpen] = useState(false);
    const refreshAll = useKrunchStore((state: any) => state.refreshAll)
    const toggleAutoRefresh = useKrunchStore((state: any) => state.toggleAutoRefresh)
    const autoRefresh = useKrunchStore((state: any) => state.autoRefresh)
    const isAdmin = useKrunchStore((state: any) => state.isAdmin)
    const setup = useKrunchStore((state: any) => state.setup)
    const walletState = useWalletModal();
    const userAccountValue = useKrunchStore((state: any) => state.userAccountValue)
    const userRewardsAvailable = useKrunchStore(state => state.userRewardsAvailable)
    const withdrawDialogOpen = useKrunchStore(state => state.withdrawDialogOpen)
    const setWithdrawDialogOpen = useKrunchStore(state => state.setWithdrawDialogOpen)
    const setTradeDialogOpen = useKrunchStore(state => state.setTradeDialogOpen)
    const setDepositDialogOpen = useKrunchStore(state => state.setDepositDialogOpen)
    const depositDialogOpen = useKrunchStore(state => state.depositDialogOpen)
    const tradeDialogOpen = useKrunchStore(state => state.tradeDialogOpen)
    const refresh = async () => {
        if (wallet.connected) {
            const program = await getProgram()
            const provider = await getProvider()
            refreshAll()
        }
    }
    const initApp = async () => {
        const program = await getProgram()
        const provider = await getProvider()
        setup()
    }

    const toggleConnect = () => {
        if (wallet.connected) {
            wallet.disconnect();
        } else {
            walletState.setVisible(true);
        }
    }


    useActiveTabEvent(async () => {
        await refresh()
    }, AUTO_REFRESH_INTERVAL);

    useEffect(() => {
        // Run the function when the component is mounted
        refresh()
    }, [wallet.connected]);

    return (
        <Sheet variant="outlined" sx={{
            borderLeft: 'none',
            borderRight: 'none'
        }} >
            <Box gap={1} flex={1} display={'flex'}>
                {!wallet.connected &&  <ButtonGroup  variant='plain'><Button
                    startDecorator={<ICONS.CONNECT />}
                    size="sm"
                    sx={{padding:1,paddingLeft:2,paddingRight:2}}
                    variant='plain'
                    onClick={() => toggleConnect()}
                >
                    Connect
                </Button></ButtonGroup>}
                {wallet.connected && <ButtonGroup  variant='plain'>
                    <Button
                        sx={{padding:1,paddingLeft:2,paddingRight:2}}
                        startDecorator={<ICONS.REWARDS />}
                        size="md"
                        onClick={() => setClaimDialogOpen(true)}
                    >
                        {`Claim Rewards: ${formatCurrency(userRewardsAvailable / AMOUNT_DECIMALS)}`}
                    </Button>

                    <Dropdown>
                        <MenuButton
                            size="sm"
                            variant='plain'
                            sx={{padding:1,paddingLeft:2,paddingRight:2}}   
                            startDecorator={<ICONS.WALLET />}
                            endDecorator={<ICONS.ARROW_DROP_DOWN />}
                        >Wallet: {formatCurrency(userAccountValue / AMOUNT_DECIMALS)}</MenuButton>
                        <Menu>
                            <MenuItem onClick={() => setDepositDialogOpen(true)}><ListItemDecorator><ICONS.DEPOSIT /></ListItemDecorator>Deposit</MenuItem>
                            <MenuItem onClick={() => setWithdrawDialogOpen(true)}><ListItemDecorator><ICONS.WITHDRAW /></ListItemDecorator>Withdraw</MenuItem>
                        </Menu>
                    </Dropdown>
                    <Button
                        startDecorator={<ICONS.TRADE />}
                        size="sm"
                        sx={{padding:1,paddingLeft:2,paddingRight:2}}
                        variant='plain'
                        onClick={() => setTradeDialogOpen(true)}
                    >
                        Trade
                    </Button>
                </ButtonGroup>
                }
                <Box flex={1}></Box>
                {isAdmin && wallet.connected && <Dropdown>
                    <MenuButton
                        size="sm"
                        variant='plain'
                        sx={{padding:1,paddingLeft:2,paddingRight:2}}
                        startDecorator={<ICONS.SETTINGS />}
                        endDecorator={<ICONS.ARROW_DROP_DOWN />}
                    >Settings</MenuButton>
                    <Menu>
                        <MenuItem onClick={() => initApp()}><ListItemDecorator><ICONS.SETTINGS /></ListItemDecorator>Setup</MenuItem>
                        <MenuItem onClick={() => setUpdateExchangeDialogOpen(true)}><ListItemDecorator><ICONS.UPDATE_EXCHANGE /></ListItemDecorator>Update Exchange</MenuItem>
                        <MenuItem onClick={() => setMarketDialogOpen(true)}><ListItemDecorator><ICONS.MARKET /></ListItemDecorator>Update Market</MenuItem>
                        <MenuItem onClick={() => refresh()}><ListItemDecorator><ICONS.REFRESH /></ListItemDecorator>Refresh (Auto = {autoRefresh ? 'On' : 'Off'})</MenuItem>
                        <MenuItem onClick={() => toggleAutoRefresh()}><ListItemDecorator><ICONS.AUTO_REFRESH /></ListItemDecorator>Toggle Refresh (Auto = {autoRefresh ? 'On' : 'Off'})</MenuItem>
                    </Menu>
                </Dropdown>}
            </Box>
            <TradeDialog open={tradeDialogOpen} setOpen={setTradeDialogOpen} />
            <MarketDialog open={marketDialogOpen} setOpen={setMarketDialogOpen} />
            <DepositDialog open={depositDialogOpen} setOpen={setDepositDialogOpen} />
            <ClaimDialog open={claimDialogOpen} setOpen={setClaimDialogOpen} />
            <WithdrawDialog open={withdrawDialogOpen} setOpen={setWithdrawDialogOpen} />
            <UpdateExchangeDialog open={updateExchangeDialogOpen} setOpen={setUpdateExchangeDialogOpen} />
        </Sheet>
    );
}