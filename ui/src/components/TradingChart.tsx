import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import Stack from '@mui/joy/Stack';
import { useEffect, useRef, useState } from 'react';
import { AMOUNT_DECIMALS, TV_MARKETS } from 'utils/dist/constants';
import { useKrunchStore } from '../hooks/useKrunchStore';
import '../index.css';
import { formatCurrency, renderItem } from '../utils';
import PriceLabel from './PriceLabel';
import { Typography } from '@mui/joy';
import { ErrorBoundary } from "react-error-boundary";
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';

export default function TradingChart({ symbol }: { symbol: string }) {
    const markets = useKrunchStore(state => state.markets)
    const appInfo = useKrunchStore(state => state.appInfo)
    const [selectedMarket, setSelectedMarket] = useState(markets[0]);
    const container: any = useRef();
    const [mounted, setMounted] = useState(false);
    let symbolMap: any = TV_MARKETS
    let useEffectCount = 0

    useEffect(() => {
        console.log('useEffect', mounted)
        setMounted(true);
        if (useEffectCount ===0 ){
            useEffectCount++
            console.log('bout to refresh chart', selectedMarket.name    )
            const tvSymbol = symbolMap[selectedMarket.name] as string || "SOLUSD"            
            refreshChart(tvSymbol)
        }
    }, []);

    

    let entryPrice = 0
    if (selectedMarket) {
        entryPrice = Math.abs(selectedMarket.tokenAmount === 0 ? 0 : (selectedMarket.basis || 0) / (selectedMarket.tokenAmount || 0))
    }

    const refreshChart = (chartSymbol: string) => {
        const script = document.createElement("script");
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
        script.type = "text/javascript";
        script.async = false;
        script.innerHTML = `
            {
              "autosize": true,
              "symbol": "${chartSymbol}",
              "interval": "D",
              "timezone": "Etc/UTC",
              "theme": "dark",
              "style": "1",
              "locale": "en",
              "enable_publishing": false,
              "toolbar_bg": "#0b0d0e",
              "backgroundColor": "#000000",
              "allow_symbol_change": false,
              "hide_top_toolbar": false,
              "withdateranges": true,
              "hide_legend": true,
              "save_image": false
            }`;
        if (container.current) {
            container.current.appendChild(script);
        }
    }

    const changeMarket = (market: any) => {       
        if (market !== selectedMarket) {
            const tvSymbol = symbolMap[market.name] as string || "SOLUSD"            
            container.current.innerHTML = ''
            refreshChart(tvSymbol)
            setSelectedMarket(market)
        }
    }

    if (!selectedMarket) {
        return <></>
    }
    return (
        <Stack>
            <Box>
                <Table>
                    <thead>
                        <tr>
                            <th><Typography level='h4' sx={{ textTransform: 'capitalize', fontFamily: 'BrunoAceSC' }}>{selectedMarket.name}</Typography></th>
                            <th>Price: <PriceLabel value={selectedMarket.price}>{formatCurrency(selectedMarket.price || 0)}</PriceLabel></th>
                            <th>Amount: <br/>{renderItem(selectedMarket.tokenAmount,AMOUNT_DECIMALS,4)}</th>
                            <th>Basis: <br/>{renderItem(selectedMarket.basis)}</th>
                            <th>Curr Value: <br/>{formatCurrency(selectedMarket.currValue || 0)}</th>
                            <th>Unrealized Pnl: <br/>{formatCurrency(selectedMarket.unrealizedPnl || 0)}</th>
                            <th>Entry Price: <br/>{formatCurrency(entryPrice || 0)}</th>   
                            <th style={{flex:1}}>&nbsp;</th>                         
                        </tr>
                    </thead>
                </Table>
            </Box>
            <Box flex={1} display={'flex'}>
                {/* Markets */}
                <Box sx={{background:appInfo.toolbarBackground,borderWidth:'thin',
                    borderLeftWidth:0, 
                    borderRightWidth:0, 
                    borderStyle:'solid', 
                    borderColor:appInfo.toolbarBorderColor}}><Table 
                        style={{ width: 'auto' }}>
                    <thead style={{background:appInfo.toolbarBackground}}>
                        <tr style={{background:appInfo.toolbarBackground}}>
                            <th colSpan={2} style={{ width: '100px',background:appInfo.toolbarBackground }}>Available Markets</th>                    
                        </tr>
                    </thead>
                    <tbody>
                        {markets.map((row: any) => {
                            return <tr key={row.marketIndex}>
                                <td style={{ width: '100px'}} onClick={() => changeMarket(row)}>
                                    <Typography startDecorator={row.name === selectedMarket.name && <ChevronRightRoundedIcon/>}>{row.name}</Typography>
                                </td>
                                <td style={{ width: '125px'}}><PriceLabel value={row.price}>{formatCurrency(row.price || 0)}</PriceLabel></td>
                            </tr>
                        })}
                    </tbody>
                </Table></Box>            
                {/* Chart */}

                <Box flex={1} height={500}>
                    <ErrorBoundary fallback={<div>Something went wrong</div>}>
                        <div
                            ref={container}
                            style={{ height: "100%", width: "100%" }} />
                    </ErrorBoundary>
                </Box>
            </Box>
        </Stack>
    )
} 