import Typography from '@mui/joy/Typography';
import { useKrunchStore } from '../hooks/useKrunchStore';
import Box from '@mui/joy/Box';
import { formatCurrency } from '../utils';
import '../index.css';

export default function Stat({ title, value,numValue=0 }: { title: string,value:number,numValue?:number  }) {
    const { appInfo
    } = useKrunchStore((state) => ({
        appInfo: state.appInfo
    }))
    let color = appInfo.logoColor   
    if(numValue < 0) {
        color = appInfo.dangerColor
    }   
    return (
        <Box padding={2} justifyContent={'center'} alignItems={'center'} flex={1} alignContent={'center'}>
            <Typography textAlign={'center'} level='h1' fontSize={48} sx={{ textTransform: 'capitalize', color: color, fontFamily: 'BrunoAceSC' }}>{formatCurrency(value)}</Typography>
            <Typography textAlign={'center'} level='h4' sx={{ textTransform: 'capitalize', fontFamily: 'BrunoAceSC' }}>{title}</Typography>
        </Box>
    )
} 