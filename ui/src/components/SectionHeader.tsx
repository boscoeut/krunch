import Typography from '@mui/joy/Typography';
import {useKrunchStore} from '../hooks/useKrunchStore';
import '../index.css';

export default function SectionHeader({title, fontSize="1.1em"}:{title:string, fontSize?:string}) {
    const { appInfo
    } = useKrunchStore((state) => ({
        appInfo: state.appInfo
    }))
    return (
        <Typography fontSize={fontSize} sx={{textTransform:'capitalize' ,color:appInfo.logoColor,fontFamily:'BrunoAceSC'}}>{title}</Typography>
    )
} 