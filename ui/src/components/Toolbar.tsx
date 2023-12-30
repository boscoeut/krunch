import CandlestickChartRoundedIcon from '@mui/icons-material/CandlestickChartRounded';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
// icons
import AccountBalanceRounded from '@mui/icons-material/AccountBalanceRounded';
import CurrencyExchangeRounded from '@mui/icons-material/CurrencyExchangeRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import QueryStatsRounded from '@mui/icons-material/QueryStatsRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import UploadRoundedIcon from '@mui/icons-material/UploadRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import UpdateRounded from '@mui/icons-material/UpdateRounded';
import { useState } from 'react';
import { AMOUNT_DECIMALS } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from '../hooks/useProgram';
import { formatCurrency } from '../utils';
import DepositDialog from './DepositDialog';
import WithdrawDialog from './WithdrawDialog';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import ClaimDialog from './ClaimDialog';
import ExchangeDialog from './ExchangeDialog';
import UpdateExchangeDialog from './UpdateExchangeDialog';
import MarketDialog from './MarketDialog';
import TradeDialog from './TradeDialog';
import Dropdown from '@mui/joy/Dropdown';
import Menu from '@mui/joy/Menu';
import MenuButton from '@mui/joy/MenuButton';
import ButtonGroup from '@mui/joy/ButtonGroup';
import MenuItem from '@mui/joy/MenuItem';


export default function Toolbar() {
    const { getProgram, getProvider } = useProgram() // initialize the program (do not remove)
    const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
    const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
    const [updateExchangeDialogOpen, setUpdateExchangeDialogOpen] = useState(false);
    const [claimDialogOpen, setClaimDialogOpen] = useState(false);
    const [marketDialogOpen, setMarketDialogOpen] = useState(false);
    const [depositDialogOpen, setDepositDialogOpen] = useState(true);
    const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);
    const refreshAll = useKrunchStore((state: any) => state.refreshAll)
    const isAdmin = useKrunchStore((state: any) => state.isAdmin)
    const setup = useKrunchStore((state: any) => state.setup)
    const userAccountValue = useKrunchStore((state: any) => state.userAccountValue)
    const userRewardsAvailable = useKrunchStore(state => state.userRewardsAvailable)
    const refresh = async () => {
        const program = await getProgram()
        const provider = await getProvider()
        refreshAll()
    }
    const initApp = async () => {
        const program = await getProgram()
        const provider = await getProvider()
        setup()
    }
    return (
        <>
            <Box gap={1} flex={1} display={'flex'}>
                <ButtonGroup color="success" variant='solid'>
                    <Button
                        color="success"
                        startDecorator={<EmojiEventsRounded />}
                        size="sm"
                        onClick={() => setClaimDialogOpen(true)}
                    >
                        {`Claim Rewards: ${formatCurrency(userRewardsAvailable / AMOUNT_DECIMALS)}`}
                    </Button>
                    <Button
                        color="success"
                        startDecorator={<QueryStatsRounded />}
                        size="sm"
                        onClick={() => setTradeDialogOpen(true)}
                    >
                        Trade
                    </Button>

                    <Dropdown>
                        <MenuButton
                            size="sm"
                            variant='solid'
                            startDecorator={<CurrencyExchangeRounded />}
                            endDecorator={<ArrowDropDown />}
                            color="success">Wallet: {formatCurrency(userAccountValue / AMOUNT_DECIMALS)}</MenuButton>
                        <Menu>
                            <MenuItem onClick={() => setDepositDialogOpen(true)}><ListItemDecorator><UploadRoundedIcon /></ListItemDecorator>Deposit</MenuItem>
                            <MenuItem onClick={() => setWithdrawDialogOpen(true)}><ListItemDecorator><DownloadRoundedIcon /></ListItemDecorator>Withdraw</MenuItem>
                        </Menu>
                    </Dropdown>

                    <Button
                        color="success"
                        startDecorator={<RefreshRoundedIcon />}
                        size="sm"
                        onClick={() => refresh()}
                    >Refresh</Button>
                </ButtonGroup>
                <Box flex={1}></Box>
                <Dropdown>
                    <MenuButton
                        size="sm"
                        variant='solid'
                        startDecorator={<SettingsRoundedIcon />}
                        endDecorator={<ArrowDropDown />}
                        color="danger">Settings</MenuButton>
                    <Menu>
                        <MenuItem onClick={() => initApp()}><ListItemDecorator><SettingsRoundedIcon /></ListItemDecorator>Setup</MenuItem>
                        {isAdmin && <MenuItem onClick={() => setExchangeDialogOpen(true)}><ListItemDecorator><CurrencyExchangeRounded /></ListItemDecorator>Exchange Deposit/Withdraw</MenuItem>}
                        {isAdmin && <MenuItem onClick={() => setUpdateExchangeDialogOpen(true)}><ListItemDecorator><UpdateRounded /></ListItemDecorator>Update Exchange</MenuItem>}
                        {isAdmin && <MenuItem onClick={() => setMarketDialogOpen(true)}><ListItemDecorator><CandlestickChartRoundedIcon /></ListItemDecorator>Update Market</MenuItem>}
                    </Menu>
                </Dropdown>

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