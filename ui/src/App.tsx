import Box from '@mui/joy/Box';
import CssBaseline from '@mui/joy/CssBaseline';
import { CssVarsProvider } from '@mui/joy/styles';
// icons
import { useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Account from './components/Account';
import Contracts from './components/Contracts';
import Documentation from './components/Documentation';
import Header from './components/Header';
import Markets from './components/Markets';
import PageHeader from './components/PageHeader';
import Pool from './components/Pool';
import Settings from './components/Settings';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import Welcome from './components/Welcome';

export default function App() {
    const location = useLocation();
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
                        <PageHeader title={location.pathname} />
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