import { useState, useEffect } from 'react';
import { useKrunchStore } from "../hooks/useKrunchStore";
import Typeography from '@mui/joy/Typography';
import NorthIcon from '@mui/icons-material/North';
import SouthIcon from '@mui/icons-material/South';

function StaticPriceLabel({ children, value = 0 }: { children:any, value: number | undefined }) {
    let color = 'inherit'
    let decorator = null
    const appInfo = useKrunchStore(state => state.appInfo);
    const previousValue = 0;

    if (value > previousValue) {
        color = appInfo.logoColor
        decorator = <NorthIcon style={{ color: appInfo.logoColor }} />
    } else if (value < previousValue) {
        color = appInfo.dangerColor;
        decorator = <SouthIcon style={{ color: appInfo.dangerColor }} />
    } 
    return <Typeography style={{ color }} endDecorator={decorator}>{children} </Typeography>;
}

export default StaticPriceLabel;