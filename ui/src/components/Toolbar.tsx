import CandlestickChartRoundedIcon from '@mui/icons-material/CandlestickChartRounded';
import Button from '@mui/joy/Button';
import Stack from '@mui/joy/Stack';
// icons
import AccountBalanceRounded from '@mui/icons-material/AccountBalanceRounded';
import CurrencyExchangeRounded from '@mui/icons-material/CurrencyExchangeRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import QueryStatsRounded from '@mui/icons-material/QueryStatsRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useState } from 'react';
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from '../hooks/useProgram';
import AccountDialog from './AccountDialog';
import ExchangeDialog from './ExchangeDialog';
import MarketDialog from './MarketDialog';
import TradeDialog from './TradeDialog';

export default function Toolbar() {
    const { getProgram, getProvider } = useProgram() // initialize the program (do not remove)
    const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
    const [marketDialogOpen, setMarketDialogOpen] = useState(false);
    const [accountDialogOpen, setAccountDialogOpen] = useState(false);
    const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);
    const refreshAll = useKrunchStore((state: any) => state.refreshAll)
    const claimRewards = useKrunchStore((state: any) => state.claimRewards)
    const isAdmin = useKrunchStore((state: any) => state.isAdmin)
    const refresh = async () => {
        const program = await getProgram()
        const provider = await getProvider()
        console.log("APP: program", program)
        console.log("APP: provider", provider)
        refreshAll()
    }
    const claim = async () => {
        try {
            await claimRewards()
        } catch (e) {
            console.log("claim error", e)
        }
    }
    return (
        <>
            <Stack direction={"row"} spacing={1}>
                {isAdmin && <><Button
                    color="primary"
                    startDecorator={<CandlestickChartRoundedIcon />}
                    size="sm"
                    onClick={() => setMarketDialogOpen(true)}
                >
                    Market
                </Button>
                    <Button
                        color="primary"
                        startDecorator={<CurrencyExchangeRounded />}
                        size="sm"
                        onClick={() => setExchangeDialogOpen(true)}
                    >
                        Exchange
                    </Button>
                </>}

                <Button
                    color="primary"
                    startDecorator={<QueryStatsRounded />}
                    size="sm"
                    onClick={() => setTradeDialogOpen(true)}
                >
                    Trade
                </Button>
                <Button
                    color="primary"
                    startDecorator={<AccountBalanceRounded />}
                    size="sm"
                    onClick={() => setAccountDialogOpen(true)}
                >
                    Deposit
                </Button>

                <Button
                    color="primary"
                    startDecorator={<EmojiEventsRounded />}
                    size="sm"
                    onClick={() => claim()}
                >
                    Claim
                </Button>
                <Button
                    color="primary"
                    startDecorator={<RefreshRoundedIcon />}
                    size="sm"
                    onClick={() => refresh()}
                >
                    Refresh
                </Button>
            </Stack>
            <TradeDialog open={tradeDialogOpen} setOpen={setTradeDialogOpen} />
            <MarketDialog open={marketDialogOpen} setOpen={setMarketDialogOpen} />
            <AccountDialog open={accountDialogOpen} setOpen={setAccountDialogOpen} />
            <ExchangeDialog open={exchangeDialogOpen} setOpen={setExchangeDialogOpen} />
        </>
    );
}