import Typography from '@mui/joy/Typography';
import {useKrunchStore} from '../hooks/useKrunchStore';
import Box from '@mui/joy/Box';
import '../index.css';

export default function Stat({title}:{title:string}) {
    const { appInfo
    } = useKrunchStore((state) => ({
        appInfo: state.appInfo
    }))
    return (
        <Box>
        <Typography level='h4' sx={{textTransform:'capitalize' ,color:appInfo.logoColor,fontFamily:'BrunoAceSC'}}>{title}</Typography>
        <Typography level='h1' sx={{textTransform:'capitalize' ,color:appInfo.logoColor,fontFamily:'BrunoAceSC'}}>$100.33</Typography>
        </Box>
    )
} 