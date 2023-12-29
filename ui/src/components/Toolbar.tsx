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
import { useState } from 'react';
import { AMOUNT_DECIMALS } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from '../hooks/useProgram';
import { formatCurrency } from '../utils';
import AccountDialog from './AccountDialog';
import ClaimDialog from './ClaimDialog';
import ExchangeDialog from './ExchangeDialog';
import MarketDialog from './MarketDialog';
import TradeDialog from './TradeDialog';

export default function Toolbar() {
    const { getProgram, getProvider } = useProgram() // initialize the program (do not remove)
    const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
    const [claimDialogOpen, setClaimDialogOpen] = useState(false);
    const [marketDialogOpen, setMarketDialogOpen] = useState(false);
    const [accountDialogOpen, setAccountDialogOpen] = useState(false);
    const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);
    const refreshAll = useKrunchStore((state: any) => state.refreshAll)
    const isAdmin = useKrunchStore((state: any) => state.isAdmin)
    const setup = useKrunchStore((state: any) => state.setup)
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
                <Button
                    color="success"
                    startDecorator={<EmojiEventsRounded />}
                    size="sm"
                    onClick={() => setClaimDialogOpen(true)}
                >
                    {`Claim ${formatCurrency(userRewardsAvailable / AMOUNT_DECIMALS)}`}
                </Button>
                <Button
                    color="success"
                    startDecorator={<QueryStatsRounded />}
                    size="sm"
                    onClick={() => setTradeDialogOpen(true)}
                >
                    Trade
                </Button>
                <Button
                    color="success"
                    startDecorator={<AccountBalanceRounded />}
                    size="sm"
                    onClick={() => setAccountDialogOpen(true)}
                >
                    Wallet
                </Button>


                <Button
                    color="success"
                    startDecorator={<RefreshRoundedIcon />}
                    size="sm"
                    onClick={() => refresh()}
                >Refresh</Button>

                <Box flex={1}></Box>

                {isAdmin && <><Button
                    startDecorator={<CandlestickChartRoundedIcon />}
                    size="sm"
                    color="danger"
                    onClick={() => setMarketDialogOpen(true)}
                >
                    Market
                </Button>
                    <Button
                        startDecorator={<CurrencyExchangeRounded />}
                        size="sm"
                        color="danger"
                        onClick={() => setExchangeDialogOpen(true)}
                    >
                        Exchange
                    </Button>
                </>}
                <Button
                    startDecorator={<SettingsRoundedIcon />}
                    size="sm"
                    color="danger"
                    onClick={() => initApp()}
                >
                    Setup
                </Button>

            </Box>
            <TradeDialog open={tradeDialogOpen} setOpen={setTradeDialogOpen} />
            <MarketDialog open={marketDialogOpen} setOpen={setMarketDialogOpen} />
            <AccountDialog open={accountDialogOpen} setOpen={setAccountDialogOpen} />
            <ExchangeDialog open={exchangeDialogOpen} setOpen={setExchangeDialogOpen} />
            <ClaimDialog open={claimDialogOpen} setOpen={setClaimDialogOpen} />
        </>
    );
}