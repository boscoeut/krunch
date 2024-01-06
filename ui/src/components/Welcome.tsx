import Box from '@mui/joy/Box';
import WelcomeCards from './WelcomeCards';
export default function Welcome() {

    return (
        <Box sx={{
            minHeight: 0,
            flexGrow: 1,
            overflow: 'hidden auto',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <WelcomeCards />
        </Box>
    );
}