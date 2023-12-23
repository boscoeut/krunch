import Check from '@mui/icons-material/Check';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import Button from '@mui/joy/Button';
import Card from '@mui/joy/Card';
import CardActions from '@mui/joy/CardActions';
import Divider from '@mui/joy/Divider';
import List from '@mui/joy/List';
import ListItem from '@mui/joy/ListItem';
import ListItemDecorator from '@mui/joy/ListItemDecorator';
import Stack from '@mui/joy/Stack';
import Typography from '@mui/joy/Typography';
import { useKrunchStore } from '../hooks/useKrunchStore';
import AppTitle from './AppTitle';

export default function WelcomeCards() {
    const {
        appInfo } = useKrunchStore((state) => ({
            appInfo: state.appInfo
        }))
    const leverage = 10

    const learnMore = async () => {
        //setActivePage('documentation')

    }
    const startNow = async () => {
        
    }

    return (
        <Stack spacing={2} direction={"column"}>
            <Card size="lg" variant="outlined">

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
                        Non Upgradeable Smart Contract
                    </ListItem>
                    <ListItem>
                        <ListItemDecorator>
                            <Check />
                        </ListItemDecorator>
                        100% of all fees go to users of the protocol
                    </ListItem>
                    <ListItem>
                        <ListItemDecorator>
                            <Check />
                        </ListItemDecorator>
                        Invest in the Trading Pool to earn fees
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
                        Earn fee rebates by providing liquidity
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

                        endDecorator={<LoginRoundedIcon />}
                    >
                        Start now
                    </Button>
                </CardActions>
            </Card>
        </Stack>
    )
} 