import * as React from 'react';
import { CssVarsProvider } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Breadcrumbs from '@mui/joy/Breadcrumbs';
import Link from '@mui/joy/Link';
import Typography from '@mui/joy/Typography';
// icons
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { Routes, Route, Navigate } from 'react-router-dom';
import useScript from './useScript';
import Sidebar from './components/Sidebar';
import Orders from './components/Orders';
import Header from './components/Header';
import WalletTest from './components/WalletTest';
import Markets from './components/Markets';
import Account from './components/Account';
import Pool from './components/Pool';
import Settings from './components/Settings';
import Documentation from './components/Documentation';
import { useLocation } from 'react-router-dom';

const useEnhancedEffect =
    typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

export default function JoyOrderDashboardTemplate() {
    const status = useScript(`https://unpkg.com/feather-icons`);

    const location = useLocation();
console.log(location.pathname); 

    useEnhancedEffect(() => {
        // Feather icon setup: https://github.com/feathericons/feather#4-replace
        // @ts-ignore
        if (typeof feather !== 'undefined') {
            // @ts-ignore
            feather.replace();
        }
    }, [status]);

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
                        <Typography level="h3">{location.pathname}</Typography>
                        <Button
                            color="primary"
                            startDecorator={<DownloadRoundedIcon />}
                            size="sm"
                        >
                            Test All
                        </Button>
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
                            <Route path="/test" Component={WalletTest} />
                            <Route path="/" element={<Navigate replace to="/home" />} />
                        </Routes>
                    </Box>
                </Box>
            </Box>
        </CssVarsProvider>
    );
}