import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import CssBaseline from '@mui/joy/CssBaseline';
import Stack from '@mui/joy/Stack';
import Typography from '@mui/joy/Typography';
import { CssVarsProvider } from '@mui/joy/styles';
// icons
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Account from './components/Account';
import Documentation from './components/Documentation';
import Header from './components/Header';
import Markets from './components/Markets';
import Pool from './components/Pool';
import Settings from './components/Settings';
import Sidebar from './components/Sidebar';
import TradeDialog from './components/TradeDialog';
import MarketDialog from './components/MarketDialog';
import AccountDialog from './components/AccountDialog';
import ExchangeDialog from './components/ExchangeDialog';
import { useKrunchStore } from "./hooks/useKrunchStore";
import { useState } from 'react';
import useProgram from './hooks/useProgram';  
import PageHeader from './components/PageHeader';

export default function App() {
    const location = useLocation();
    const {getProgram, getProvider} = useProgram() // initialize the program (do not remove)
    const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
    const [marketDialogOpen, setMarketDialogOpen] = useState(false);
    const [accountDialogOpen, setAccountDialogOpen] = useState(false);
    const [exchangeDialogOpen, setExchangeDialogOpen] = useState(false);
    const refreshAll = useKrunchStore(state => state.refreshAll)
    const claimRewards = useKrunchStore(state => state.claimRewards)
    const refresh = async()=>{
        const program = await getProgram()
        const provider = await getProvider()        
        console.log("APP: program", program)
        console.log("APP: provider", provider)
        refreshAll()
    }
    const claim = async()=>{
        await claimRewards()
    }
    return (
        <CssVarsProvider disableTransitionOnChange>
            <CssBaseline />
            <Box sx={{ display: 'flex', minHeight: '100vh' }}>
                <Header />
                <Sidebar />
                <Box
                    component="main"
                    className="MainContent"
                    sx={{
                        px: {
                            xs: 2,
                            md: 6,
                        },
                        pt: {
                            xs: 'calc(12px + var(--Header-height))',
                            sm: 'calc(12px + var(--Header-height))',
                            md: 3,
                        },
                        pb: {
                            xs: 2,
                            sm: 2,
                            md: 3,
                        },
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: 0,
                        height: '100dvh',
                        gap: 1,
                    }}
                >

                    <Box
                        sx={{
                            display: 'flex',
                            my: 1,
                            gap: 1,
                            flexDirection: { xs: 'column', sm: 'row' },
                            alignItems: { xs: 'start', sm: 'center' },
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                        }}
                    >
                        <PageHeader title={location.pathname} />
                        <Stack direction={"row"} spacing={1}>
                        <Button
                                color="primary"
                                startDecorator={<DownloadRoundedIcon />}
                                size="sm"
                                onClick={() => setMarketDialogOpen(true)}
                            >
                                Market
                            </Button>
                            <Button
                                color="primary"
                                startDecorator={<DownloadRoundedIcon />}
                                size="sm"
                                onClick={() => setTradeDialogOpen(true)}
                            >
                                Trade
                            </Button>
                            <Button
                                color="primary"
                                startDecorator={<DownloadRoundedIcon />}
                                size="sm"
                                onClick={() => setAccountDialogOpen(true)}
                            >
                                Deposit
                            </Button>
                            <Button
                                color="primary"
                                startDecorator={<DownloadRoundedIcon />}
                                size="sm"
                                onClick={() => setExchangeDialogOpen(true)}
                            >
                                Exchange
                            </Button>
                            <Button
                                color="primary"
                                startDecorator={<RefreshRoundedIcon />}
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
                    </Box>
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        overflowY: 'auto',
                    }}>
                        <Routes >
                            <Route path="/home" Component={Account} />
                            <Route path="/pool" Component={Pool} />
                            <Route path="/settings" Component={Settings} />
                            <Route path="/documentation" Component={Documentation} />
                            <Route path="/markets" Component={Markets} />
                            <Route path="/" element={<Navigate replace to="/home" />} />
                        </Routes>
                    </Box>
                </Box>
            </Box>
            <TradeDialog open={tradeDialogOpen} setOpen={setTradeDialogOpen} />
            <MarketDialog open={marketDialogOpen} setOpen={setMarketDialogOpen} />
            <AccountDialog open={accountDialogOpen} setOpen={setAccountDialogOpen} />
            <ExchangeDialog open={exchangeDialogOpen} setOpen={setExchangeDialogOpen} />
        </CssVarsProvider>
    );
}