import Check from '@mui/icons-material/Check';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import Button from '@mui/joy/Button';
import Card from '@mui/joy/Card';
import Box from '@mui/joy/Box';
import CardActions from '@mui/joy/CardActions';
import Divider from '@mui/joy/Divider';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import Stack from '@mui/joy/Stack';
import Typography from '@mui/joy/Typography';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useNavigate } from 'react-router-dom';
import { useKrunchStore } from '../hooks/useKrunchStore';
import AppTitle from './AppTitle';

export default function WelcomeCards() {
    const wallet = useWallet();
    const walletState = useWalletModal();
    const navigate = useNavigate();
    const {
        appInfo } = useKrunchStore((state) => ({
            appInfo: state.appInfo
        }))
    const leverage = 10

    const learnMore = async () => {
        navigate('/documentation')

    }
    const startNow = async () => {
        walletState.setVisible(true);
    }

    return (
        <Box sx={{
            minHeight: 0,
            flexGrow: 1,
            overflow: 'hidden auto',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <Stack spacing={2} direction={"column"}>
                <Card size="lg" variant="plain">
                    <Typography level="h2"><AppTitle variant='welcome' /></Typography>
                    <Divider inset="none" />
                    <List size="sm" sx={{ mx: 'calc(-1 * var(--ListItem-paddingX))' }}>
                        <ListItem>
                            <ListItemDecorator>
                                <Check />
                            </ListItemDecorator>
                            No Liquidations
                        </ListItem>
                        <ListItem>
                            <ListItemDecorator>
                                <Check />
                            </ListItemDecorator>
                            No Funding Fees
                        </ListItem>
                        <ListItem>
                            <ListItemDecorator>
                                <Check />
                            </ListItemDecorator>
                            Trade Long or Short Positions on Crypto, Equities and Forex
                        </ListItem>
                        <ListItem>
                            <ListItemDecorator>
                                <Check />
                            </ListItemDecorator>
                            Earn trading rebates by providing liquidity
                        </ListItem>
                        <ListItem>
                            <ListItemDecorator>
                                <Check />
                            </ListItemDecorator>
                            Trade up to {`${leverage}`}x Leverage
                        </ListItem>
                        <ListItem>
                            <ListItemDecorator>
                                <Check />
                            </ListItemDecorator>
                            Low Fees
                        </ListItem>
                        <ListItem>
                            <ListItemDecorator>
                                <Check />
                            </ListItemDecorator>
                            Rewards are paid out to those who hold deposits (fee and pool pnl distribution)
                        </ListItem>
                    </List>
                    <Divider inset="none" />
                    <CardActions>
                        <Button
                            onClick={learnMore}
                            sx={{ mr: 'auto' }}
                            variant="soft"
                            color="neutral"
                        >
                            Learn More
                        </Button>
                        <Button
                            onClick={startNow}
                            variant="soft"
                            sx={{ display: wallet.connected ? 'none' : 'inline' }}
                            endDecorator={<LoginRoundedIcon />}
                        >
                            Start now
                        </Button>
                    </CardActions>
                </Card>
            </Stack>
        </Box>
    )
} 