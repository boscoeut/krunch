import Typography from '@mui/joy/Typography';
import {useKrunchStore} from '../hooks/useKrunchStore';
import '../index.css';

export default function PageHeader({title}:{title:string}) {
    const { appInfo
    } = useKrunchStore((state) => ({
        appInfo: state.appInfo
    }))
    return (
        <Typography level='h3' sx={{textTransform:'capitalize' ,color:appInfo.logoColor,fontFamily:'BrunoAceSC'}}>{title}</Typography>
    )
} 