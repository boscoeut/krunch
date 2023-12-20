import BrightnessAutoRoundedIcon from '@mui/icons-material/BrightnessAutoRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SupportRoundedIcon from '@mui/icons-material/SupportRounded';
import Box from '@mui/joy/Box';
import Stack from '@mui/joy/Stack';
import Divider from '@mui/joy/Divider';
import GlobalStyles from '@mui/joy/GlobalStyles';
import IconButton from '@mui/joy/IconButton';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import ListItemButton, { listItemButtonClasses } from '@mui/joy/ListItemButton';
import ListItemContent from '@mui/joy/ListItemContent';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useLocation, useNavigate } from 'react-router-dom';
import { closeSidebar } from '../utils';
import ColorSchemeToggle from './ColorSchemeToggle';
import { useKrunchStore } from "../hooks/useKrunchStore";

export default function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const wallet = useWallet();
    const walletState = useWalletModal();
    const provider = useKrunchStore(state => state.provider)
    const toggleConnect = () => {
        if (wallet.connected) {
            wallet.disconnect();
        } else {
            walletState.setVisible(true);
        }
    }
    return (
        <Sheet
            className="Sidebar"
            sx={{
                position: {
                    xs: 'fixed',
                    md: 'sticky',
                },
                transform: {
                    xs: 'translateX(calc(100% * (var(--SideNavigation-slideIn, 0) - 1)))',
                    md: 'none',
                },
                transition: 'transform 0.4s, width 0.4s',
                zIndex: 1000,
                height: '100dvh',
                width: 'var(--Sidebar-width)',
                top: 0,
                p: 2,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                borderRight: '1px solid',
                borderColor: 'divider',
            }}
        >
            <GlobalStyles
                styles={(theme) => ({
                    ':root': {
                        '--Sidebar-width': '220px',
                        [theme.breakpoints.up('lg')]: {
                            '--Sidebar-width': '240px',
                        },
                    },
                })}
            />
            <Box
                className="Sidebar-overlay"
                sx={{
                    position: 'fixed',
                    zIndex: 1250,
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    opacity: 'var(--SideNavigation-slideIn)',
                    backgroundColor: 'var(--joy-palette-background-backdrop)',
                    transition: 'opacity 0.4s',
                    transform: {
                        xs: 'translateX(calc(100% * (var(--SideNavigation-slideIn, 0) - 1) + var(--SideNavigation-slideIn, 0) * var(--Sidebar-width, 0px)))',
                        lg: 'translateX(-100%)',
                    },
                }}
                onClick={() => closeSidebar()}
            />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Stack sx={{cursor:'pointer', pointerEvents: 'auto'}} onClick={() => navigate("/home")} alignContent={'center'} alignItems={'center'} spacing={1} direction={'row'}>
                    <IconButton variant="soft" color="primary" size="sm">
                        <BrightnessAutoRoundedIcon />
                    </IconButton>
                    <Typography level="title-lg">Krunch</Typography>
                </Stack>
                <ColorSchemeToggle sx={{ ml: 'auto' }} />
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
                    <ListItem>
                        <ListItemButton selected={location.pathname.startsWith('/home')} onClick={() => navigate("/home")}>
                            <HomeRoundedIcon />
                            <ListItemContent>
                                <Typography level="title-sm">Account</Typography>
                            </ListItemContent>
                        </ListItemButton>
                    </ListItem>


                    <ListItem>
                        <ListItemButton selected={location.pathname.startsWith('/markets')} onClick={() => navigate("/markets")}>
                            <DashboardRoundedIcon />
                            <ListItemContent>
                                <Typography level="title-sm">Markets</Typography>
                            </ListItemContent>
                        </ListItemButton>
                    </ListItem>

                    <ListItem>
                        <ListItemButton selected={location.pathname.startsWith('/pool')} onClick={() => navigate("/pool")}>
                            <GroupRoundedIcon />
                            <ListItemContent>
                                <Typography level="title-sm">Pool</Typography>
                            </ListItemContent>
                        </ListItemButton>
                    </ListItem>

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
                    <ListItem>
                        <ListItemButton selected={location.pathname.startsWith('/documentation')} onClick={() => navigate("/documentation")}>
                            <SupportRoundedIcon />
                            Documentation
                        </ListItemButton>
                    </ListItem>
                    <ListItem>
                        <ListItemButton selected={location.pathname.startsWith('/settings')} onClick={() => navigate("/settings")}>
                            <SettingsRoundedIcon />
                            Settings
                        </ListItemButton>
                    </ListItem>
                </List>
            </Box>
            <Divider />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    {wallet.connected &&
                        <>
                        <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} level="title-sm">Account: {wallet.publicKey?.toString()}</Typography>
                        <Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} level="body-xs">RPC: {provider.connection?.rpcEndpoint}</Typography>
                        </>
                    }
                    {!wallet.connected &&
                        <>
                        <Typography onClick={toggleConnect} level="body-xs">Connect to Wallet</Typography>
                        </>
                    }
                </Box>
                <IconButton onClick={toggleConnect} size="sm" variant="plain" color="neutral">
                    {!wallet.connected &&
                        <LogoutRoundedIcon />
                    }
                    {wallet.connected &&
                        <LoginRoundedIcon />
                    }
                </IconButton>
            </Box>
        </Sheet>
    );
}