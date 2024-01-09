import { useKrunchStore } from "../hooks/useKrunchStore";
import Typeography from '@mui/joy/Typography';
import { ICONS } from '../utils';   

function StaticPriceLabel({ children, value = 0 }: { children:any, value: number | undefined }) {
    let color = 'inherit'
    let decorator = null
    const appInfo = useKrunchStore(state => state.appInfo);
    const previousValue = 0;

    if (value > previousValue) {
        color = appInfo.logoColor
        decorator = <ICONS.NORTH style={{ color: appInfo.logoColor }} />
    } else if (value < previousValue) {
        color = appInfo.dangerColor;
        decorator = <ICONS.SOUTH style={{ color: appInfo.dangerColor }} />
    } 
    return <Typeography style={{ color }} endDecorator={decorator}>{children} </Typeography>;
}

export default StaticPriceLabel;