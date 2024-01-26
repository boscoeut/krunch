import { Sheet } from '@mui/joy';
import Box from '@mui/joy/Box';
import CssBaseline from '@mui/joy/CssBaseline';
import { CssVarsProvider, extendTheme } from '@mui/joy/styles';
import { Navigate, Route, Routes } from 'react-router-dom';
import Account from './components/Account';
import Contracts from './components/Contracts';
import Documentation from './components/Documentation';
import Markets from './components/Markets';
import Yields from './components/Yields';
import Pool from './components/Pool';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import UserPositions from './components/UserPositions';
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
                    mainChannel: colors.logoColor,
                    500: colors.logoColor
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
                    //  500:'#440808',
                },
            }
        }
    }
});

export default function App() {
    return (
        <CssVarsProvider defaultMode='dark' disableTransitionOnChange theme={theme}>
            <CssBaseline />
            <Box flexDirection={'row'} sx={{ display: 'flex', height: '100vh' }}>
                <Sidebar />

                <Sheet sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    border: 'none',
                    borderLeft: '0px solid',
                    borderColor: 'divider',
                }}>
                    <Toolbar />
                    <Routes >
                        <Route path="/welcome" Component={Welcome} />
                        <Route path="/home" Component={Account} />
                        <Route path="/pool" Component={Pool} />
                        <Route path="/documentation" Component={Documentation} />
                        <Route path="/contracts" Component={Contracts} />
                        <Route path="/positions" Component={UserPositions} />
                        <Route path="/markets" Component={Markets} />
                        <Route path="/yield" Component={Yields} />
                        <Route path="/" element={<Navigate replace to="/home" />} />
                    </Routes>
                </Sheet>
            </Box>
        </CssVarsProvider>
    );
}