import Typography from '@mui/joy/Typography';
import { useKrunchStore } from '../hooks/useKrunchStore';
import Box from '@mui/joy/Box';
import { formatCurrency, formatPercent } from '../utils';
import '../index.css';

export default function SubStat({ title, value, numValue=0 }: { title: string,value:string|number,numValue?:number }) {
    const { appInfo
    } = useKrunchStore((state) => ({
        appInfo: state.appInfo
    }))
    let color = appInfo.logoColor
    if (numValue < 0) {
        color = appInfo.dangerColor
    }
    return (
        <Box padding={2} justifyContent={'center'} alignItems={'center'} flex={1} alignContent={'center'}>
            <Typography textAlign={'center'} level='h1' fontSize={30} 
                sx={{ color, textTransform: 'capitalize', fontFamily: 'BrunoAceSC' }}>{value}</Typography>
            <Typography textAlign={'center'} level='h4' fontSize={'1em'} 
                sx={{ textTransform: 'capitalize', fontFamily: 'BrunoAceSC' }}>{`${title}`}</Typography>
        </Box>
    )
} 