"use client"
import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import AppTitle from './AppTitle';
import { useColorScheme } from '@mui/joy';

export default function Logo() {
    const { mode } = useColorScheme();
    const color = mode == 'dark' ? 'black' : 'white';
    return (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <img alt='White Logo' src={'/logoWhite.png'} width={30} height={30} hidden={color === 'white'} />
            <img alt='Logo' src={'/logo.png'} width={30} height={30} hidden={color === 'black'} />
            <Typography level="h2"><AppTitle /></Typography>
        </Box>
    );
}
