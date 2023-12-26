import Box from '@mui/joy/Box';
import CssBaseline from '@mui/joy/CssBaseline';
import { CssVarsProvider, extendTheme } from '@mui/joy/styles';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Account from './components/Account';
import Contracts from './components/Contracts';
import Documentation from './components/Documentation';
import Header from './components/Header';
import Markets from './components/Markets';
import Pool from './components/Pool';
import Settings from './components/Settings';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import Welcome from './components/Welcome';
import { colors } from './utils';

const theme = extendTheme({
    colorSchemes: {
        dark: {
            palette: {
                background: {
                    // body: '#3b3a3a',
                    // surface:'#2f2e2e',
                },
                primary: {
                    // mainChannel: 'red', // Change this to the color you want for primary in dark mode
                },
                success: {
                    mainChannel:colors.logoColor,
                    500:colors.logoColor
                    // mainChannel: '#440808', // Change this to the color you want for errors in dark mode
                    // 50:'#440808',
                    // 100:'#440808',
                    // 200:'#440808',
                    // 300:'#440808',
                    // 400:'#440808',
                    // 500:'#440808', // Replace '#123456' with the color you want for success in dark mode
                },
                danger: {
                    //mainChannel: '#440808', // Change this to the color you want for errors in dark mode
                    // 50:'#440808',
                    // 100:'#440808',
                    // 200:'#440808',
                    // 300:'#440808',
                    // 400:'#440808',
                    // 500:'#440808',
                },
            }
        }
    }
});

export default function App() {
    const location = useLocation();
    return (
        <CssVarsProvider disableTransitionOnChange theme={theme}>
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
                    {location.pathname !== '/welcome' && <Box
                        sx={{
                            display: 'flex',
                            my: 1,
                            gap: 1,
                            flexDirection: { xs: 'column', sm: 'row' },
                            alignItems: { xs: 'start', sm: 'center' },
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                        }}
                        hidden={true}
                    >
                        {/* <PageHeader title={location.pathname} />*/}
                        <Toolbar />

                    </Box>}
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        overflowY: 'auto',
                    }}>
                        <Routes >
                            <Route path="/welcome" Component={Welcome} />
                            <Route path="/home" Component={Account} />
                            <Route path="/pool" Component={Pool} />
                            <Route path="/settings" Component={Settings} />
                            <Route path="/documentation" Component={Documentation} />
                            <Route path="/contracts" Component={Contracts} />
                            <Route path="/markets" Component={Markets} />
                            <Route path="/" element={<Navigate replace to="/home" />} />
                        </Routes>
                    </Box>
                </Box>
            </Box>
        </CssVarsProvider>
    );
}