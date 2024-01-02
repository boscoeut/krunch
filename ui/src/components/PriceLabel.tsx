import { useState, useEffect } from 'react';
import { useKrunchStore } from "../hooks/useKrunchStore";
import Typeography from '@mui/joy/Typography';
import NorthIcon from '@mui/icons-material/North';
import SouthIcon from '@mui/icons-material/South';

function PriceLabel({ children, value = 0 }: { children:any, value: number | undefined }) {
    const [previousValue, setPreviousValue] = useState(value);
    const [color, setColor] = useState('inherit');
    const [decorator, setDecorator] = useState(null as any);
    const appInfo = useKrunchStore(state => state.appInfo);

    useEffect(() => {
        if (value > previousValue) {
            setColor(appInfo.logoColor);
            setDecorator(<NorthIcon style={{ color: appInfo.logoColor }} />)  
        } else if (value < previousValue) {
            setColor(appInfo.dangerColor);
            setDecorator(<SouthIcon style={{ color: appInfo.dangerColor }} />)  
        } else {
            setColor('inherit');
            setDecorator(null);
        }
        setPreviousValue(value);
    }, [value]);

    return <Typeography style={{ color }} endDecorator={decorator}>{children} </Typeography>;
}

export default PriceLabel;