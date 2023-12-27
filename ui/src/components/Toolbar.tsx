import CandlestickChartRoundedIcon from '@mui/icons-material/CandlestickChartRounded';
import Button from '@mui/joy/Button';
import Stack from '@mui/joy/Stack';
import Box from '@mui/joy/Box';
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
import { formatCurrency } from '../utils';
import TradeDialog from './TradeDialog';
import { AMOUNT_DECIMALS } from 'utils/dist/constants';
import ClaimDialog from './ClaimDialog';

export default function Toolbar() {
    const { getProgram, getProvider } = useProgram() // initialize the program (do not remove)
    const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
    const [claimDialogOpen, setClaimDialogOpen] = useState(false);
    const [marketDialogOpen, setMarketDialogOpen] = useState(false);
    const [accountDialogOpen, setAccountDialogOpen] = useState(false);
    const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);
    const refreshAll = useKrunchStore((state: any) => state.refreshAll)
    const claimRewards = useKrunchStore((state: any) => state.claimRewards)
    const isAdmin = useKrunchStore((state: any) => state.isAdmin)
    const userRewardsAvailable = useKrunchStore(state => state.userRewardsAvailable)
    const refresh = async () => {
        const program = await getProgram()
        const provider = await getProvider()
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

            </Box>
            <TradeDialog open={tradeDialogOpen} setOpen={setTradeDialogOpen} />
            <MarketDialog open={marketDialogOpen} setOpen={setMarketDialogOpen} />
            <AccountDialog open={accountDialogOpen} setOpen={setAccountDialogOpen} />
            <ExchangeDialog open={exchangeDialogOpen} setOpen={setExchangeDialogOpen} />
            <ClaimDialog open={claimDialogOpen} setOpen={setClaimDialogOpen} />
        </>
    );
}