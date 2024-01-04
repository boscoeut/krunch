import CandlestickChartRoundedIcon from '@mui/icons-material/CandlestickChartRounded';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import CurrencyExchangeRounded from '@mui/icons-material/CurrencyExchangeRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import QueryStatsRounded from '@mui/icons-material/QueryStatsRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import UpdateRounded from '@mui/icons-material/UpdateRounded';
import AutoModeRoundedIcon from '@mui/icons-material/AutoModeRounded';
import ButtonGroup from '@mui/joy/ButtonGroup';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import Dropdown from '@mui/joy/Dropdown';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import Menu from '@mui/joy/Menu';
import MenuButton from '@mui/joy/MenuButton';
import MenuItem from '@mui/joy/MenuItem';
import { useState } from 'react';
import { AMOUNT_DECIMALS } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from '../hooks/useProgram';
import { formatCurrency } from '../utils';
import ClaimDialog from './ClaimDialog';
import DepositDialog from './DepositDialog';
import ExchangeDialog from './ExchangeDialog';
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
    const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
    const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
    const [updateExchangeDialogOpen, setUpdateExchangeDialogOpen] = useState(false);
    const [claimDialogOpen, setClaimDialogOpen] = useState(false);
    const [marketDialogOpen, setMarketDialogOpen] = useState(false);
    const [depositDialogOpen, setDepositDialogOpen] = useState(false);
    const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);
    const refreshAll = useKrunchStore((state: any) => state.refreshAll)
    const toggleAutoRefresh = useKrunchStore((state: any) => state.toggleAutoRefresh)
    const autoRefresh = useKrunchStore((state: any) => state.autoRefresh)
    const isAdmin = useKrunchStore((state: any) => state.isAdmin)
    const setup = useKrunchStore((state: any) => state.setup)
    const walletState = useWalletModal();
    const userAccountValue = useKrunchStore((state: any) => state.userAccountValue)
    const userRewardsAvailable = useKrunchStore(state => state.userRewardsAvailable)
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
        console.log('This message will be logged every 5 seconds if the tab is active: ' + new Date().toLocaleTimeString());
        await refresh()
    }, 2000);

    useEffect(() => {
        // Run the function when the component is mounted
        refresh()
    }, [wallet.connected]);

    return (
        <>
            <Box gap={1} flex={1} display={'flex'}>
                {!wallet.connected && <Button
                    color="success"
                    startDecorator={<LinkRoundedIcon />}
                    size="sm"
                    onClick={() => toggleConnect()}
                >
                    Connect
                </Button>}
                {wallet.connected && <ButtonGroup color="success" variant='solid'>
                    <Button
                        color="success"
                        startDecorator={<EmojiEventsRounded />}
                        size="sm"
                        onClick={() => setClaimDialogOpen(true)}
                    >
                        {`Claim Rewards: ${formatCurrency(userRewardsAvailable / AMOUNT_DECIMALS)}`}
                    </Button>

                    <Dropdown>
                        <MenuButton
                            size="sm"
                            variant='solid'
                            startDecorator={<CurrencyExchangeRounded />}
                            endDecorator={<ArrowDropDown />}
                            color="success">Wallet: {formatCurrency(userAccountValue / AMOUNT_DECIMALS)}</MenuButton>
                        <Menu>
                            <MenuItem onClick={() => setDepositDialogOpen(true)}><ListItemDecorator><AddCircleOutlineRoundedIcon /></ListItemDecorator>Deposit</MenuItem>
                            <MenuItem onClick={() => setWithdrawDialogOpen(true)}><ListItemDecorator><RemoveCircleOutlineRoundedIcon /></ListItemDecorator>Withdraw</MenuItem>
                        </Menu>
                    </Dropdown>
                    <Button
                        color="success"
                        startDecorator={<QueryStatsRounded />}
                        size="sm"
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
                        variant='solid'
                        startDecorator={<SettingsRoundedIcon />}
                        endDecorator={<ArrowDropDown />}
                        color="danger">Settings</MenuButton>
                    <Menu>
                        <MenuItem onClick={() => initApp()}><ListItemDecorator><SettingsRoundedIcon /></ListItemDecorator>Setup</MenuItem>
                        <MenuItem onClick={() => setExchangeDialogOpen(true)}><ListItemDecorator><CurrencyExchangeRounded /></ListItemDecorator>Exchange Deposit/Withdraw</MenuItem>
                        <MenuItem onClick={() => setUpdateExchangeDialogOpen(true)}><ListItemDecorator><UpdateRounded /></ListItemDecorator>Update Exchange</MenuItem>
                        <MenuItem onClick={() => setMarketDialogOpen(true)}><ListItemDecorator><CandlestickChartRoundedIcon /></ListItemDecorator>Update Market</MenuItem>
                        <MenuItem onClick={() => refresh()}><ListItemDecorator><RefreshRoundedIcon /></ListItemDecorator>Refresh (Auto = {autoRefresh ? 'On':'Off'})</MenuItem>
                        <MenuItem onClick={() => toggleAutoRefresh()}><ListItemDecorator><AutoModeRoundedIcon /></ListItemDecorator>Toggle Refresh (Auto = {autoRefresh ? 'On':'Off'})</MenuItem>
                    </Menu>
                </Dropdown>}
            </Box>
            <TradeDialog open={tradeDialogOpen} setOpen={setTradeDialogOpen} />
            <MarketDialog open={marketDialogOpen} setOpen={setMarketDialogOpen} />
            <DepositDialog open={depositDialogOpen} setOpen={setDepositDialogOpen} />
            <ExchangeDialog open={exchangeDialogOpen} setOpen={setExchangeDialogOpen} />
            <ClaimDialog open={claimDialogOpen} setOpen={setClaimDialogOpen} />
            <WithdrawDialog open={withdrawDialogOpen} setOpen={setWithdrawDialogOpen} />
            <UpdateExchangeDialog open={updateExchangeDialogOpen} setOpen={setUpdateExchangeDialogOpen} />
        </>
    );
}