import Typography from '@mui/joy/Typography';
import {useKrunchStore} from '../hooks/useKrunchStore';
import '../index.css';

export default function AppTitle({variant="title",message}:{variant?:'title'|'doc'|'welcome'|'message',message?:string}) {
    const { appInfo
    } = useKrunchStore((state) => ({
        appInfo: state.appInfo
    }))
    return (
        <>
        {variant==='welcome' && <Typography sx={{textTransform:'capitalize' ,color:appInfo.logoColor,fontFamily:'BrunoAceSC'}}>{appInfo.appTitle} <Typography 
            sx={(theme) => ({ color: theme.vars.palette.text.secondary, display:'inline-block' })}
            style={{ textTransform:'capitalize', fontFamily:'BrunoAceSC'}}>{appInfo.appSubTitle}</Typography>   </Typography>}
        {variant==='title' && <Typography sx={{textTransform:'capitalize' ,color:appInfo.logoColor,fontFamily:'BrunoAceSC'}}>{appInfo.appTitle}</Typography>}
        {variant==='doc' && <Typography sx={{color:appInfo.logoColor,fontFamily:'BrunoAceSC', display:'inline-block'}}>{appInfo.docAppReference}</Typography>}
        {variant==='message' && <Typography sx={{color:appInfo.logoColor,fontFamily:'BrunoAceSC', display:'inline-block'}}>{message || ''}</Typography>}
         </>
    )
} 