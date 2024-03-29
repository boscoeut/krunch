import Typography from '@mui/joy/Typography';
import Box from '@mui/joy/Box';
import { useKrunchStore } from '../hooks/useKrunchStore';
import '../index.css';

export default function KLabel({ children, numValue = 0, fontWeight= 'normal', endDecorator }: { endDecorator?:any, children: any | number, numValue?: number, fontWeight?: 'bold'|'normal' }) {
    const { appInfo
    } = useKrunchStore((state) => ({
        appInfo: state.appInfo
    }))
    let color = appInfo.logoColor
    if (numValue < 0) {
        color = appInfo.dangerColor
    }
    return (
        <Typography 
            endDecorator={endDecorator} 
            fontWeight={fontWeight} 
            sx={{ color, display:'inline' }}>{children}</Typography>
    )
} 