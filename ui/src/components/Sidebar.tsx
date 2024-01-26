import Box from '@mui/joy/Box';
import Divider from '@mui/joy/Divider';
import GlobalStyles from '@mui/joy/GlobalStyles';
import IconButton from '@mui/joy/IconButton';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import ListItemButton, { listItemButtonClasses } from '@mui/joy/ListItemButton';
import ListItemContent from '@mui/joy/ListItemContent';
import Sheet from '@mui/joy/Sheet';
import Stack from '@mui/joy/Stack';
import Typography from '@mui/joy/Typography';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useLocation, useNavigate } from 'react-router-dom';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { SHOW_LIGHT_MODE } from 'utils/dist/constants';
import Logo from './Logo';
import * as React from 'react';
import {ICONS} from '../utils';
import { useColorScheme } from '@mui/joy/styles';

export default function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const wallet = useWallet();
    const walletState = useWalletModal();
    const provider = useKrunchStore(state => state.provider)
    const [mounted, setMounted] = React.useState(false);
    const { mode, setMode } = useColorScheme();
    const showLightModeToggle = SHOW_LIGHT_MODE;

    React.useEffect(() => {
        setMounted(true);
    }, []);
    const toggleConnect = () => {
        if (wallet.connected) {
            wallet.disconnect();
        } else {
            walletState.setVisible(true);
        }
    }

    const pages = [{
        path: '/welcome',
        name: 'Welcome',
        icon: <ICONS.HOME />,
        onclick: () => navigate('/welcome')
    }, {
        path: '/positions',
        name: 'Trade',
        icon: <ICONS.TRADE />,
        onclick: () => navigate('/positions')
    }, {
        path: '/home',
        name: 'Account',
        icon: <ICONS.ACCOUNT />,
        onclick: () => navigate('/home')
    }, {
        path: '/pool',
        name: 'Pool',
        icon: <ICONS.POOL />,
        onclick: () => navigate('/pool')
    }, {
        path: '/markets',
        name: 'Markets',
        icon: <ICONS.MARKET />,
        onclick: () => navigate('/markets')
    }, {
        path: '/yield',
        name: 'Yields',
        icon: <ICONS.YIELD />,
        onclick: () => navigate('/yield')
    }]

    const bottomPages = [{
        path: '/contracts',
        name: 'Contracts',
        icon: <ICONS.CONTRACTS />,
        onclick: () => navigate('/contracts')
    }, {
        path: '/documentation',
        name: 'Documentation',
        icon: <ICONS.DOCUMENTATION />,
        onclick: () => navigate('/documentation')
    }]
    if (mounted && showLightModeToggle) {
        bottomPages.push({
            path: '/new-path',
            name: mode === 'dark' ? 'Light Mode' : 'Dark Mode',
            icon: mode === 'dark' ? <ICONS.LIGHT_MODE /> : <ICONS.DARK_MODE />,
            onclick: () => {
                if (mode === 'light') {
                    setMode('dark');
                } else {
                    setMode('light');
                }
            }
        });
    }
    return (
        <Sheet sx={{
            width: 'var(--Sidebar-width)',
            top: 0,
            p: 2,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            borderRight: '1px solid',
            borderColor: 'divider',
        }}>
             <GlobalStyles
                styles={(theme) => ({
                    ':root': {
                        '--Sidebar-width': '220px',
                    },
                })}
            />
            <Box onClick={() => navigate('/home')} sx={{ cursor: 'pointer', display: 'flex', gap: 1, alignItems: 'center' }}>
                <Logo />
            </Box>

            <Box
                sx={{
                    minHeight: 0,
                    overflow: 'hidden auto',
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    [`& .${listItemButtonClasses.root}`]: {
                        gap: 1.5,
                    },
                }}
            >
                <List
                    size="sm"
                    sx={{
                        gap: 1,
                        '--List-nestedInsetStart': '30px',
                        '--ListItem-radius': (theme) => theme.vars.radius.sm,
                    }}
                >
                    {pages.map((page) => (<ListItem key={page.name}>
                        <ListItemButton selected={location.pathname.startsWith(page.path)}
                            onClick={page.onclick}>
                            {page.icon}
                            <ListItemContent>
                                <Typography level="title-sm">{page.name}</Typography>
                            </ListItemContent>
                        </ListItemButton>
                    </ListItem>))}
                </List>

                <List
                    size="sm"
                    sx={{
                        mt: 'auto',
                        flexGrow: 0,
                        '--ListItem-radius': (theme) => theme.vars.radius.sm,
                        '--List-gap': '8px',
                        mb: 2,
                    }}
                >

                    {bottomPages.map((page) => (<ListItem key={page.name}>
                        <ListItemButton selected={location.pathname.startsWith(page.path)}
                            onClick={page.onclick}>
                            {page.icon}
                            <ListItemContent>
                                <Typography level="title-sm">{page.name}</Typography>
                            </ListItemContent>
                        </ListItemButton>
                    </ListItem>))}

                </List>
            </Box>
            <Divider />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    {wallet.connected &&
                        <>
                            <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} level="title-sm">Account: {wallet.publicKey?.toString()}</Typography>
                            <Typography display={provider.connection?.rpcEndpoint ? 'inline' : 'none'} sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} level="body-xs">RPC: {provider.connection?.rpcEndpoint}</Typography>
                        </>
                    }
                    {!wallet.connected &&
                        <>
                            <Typography onClick={toggleConnect} level="body-xs">Connect to Wallet</Typography>
                        </>
                    }
                </Box>
                <Stack direction={'row-reverse'}>
                    <IconButton onClick={toggleConnect} size="sm" variant="plain" color="neutral">
                        {!wallet.connected &&
                            <ICONS.LOGOUT />
                        }
                        {wallet.connected &&
                            <ICONS.LOGIN />
                        }
                    </IconButton>

                </Stack>
            </Box>
        </Sheet>
    );
}