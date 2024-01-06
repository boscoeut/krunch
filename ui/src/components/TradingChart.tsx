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
    const [selectedMarket, setSelectedMarket] = useState(markets[0]);
    const container: any = useRef();
    let symbolMap: any = TV_MARKETS

    let tvSymbol = symbolMap[selectedMarket.name] as string || "SOLUSD"
    let entryPrice = 0
    if (selectedMarket) {
        tvSymbol = symbolMap[selectedMarket.name] as string || "SOLUSD"
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
        console.log('changeMarket', market)
        if (market !== selectedMarket) {
            setSelectedMarket(market)
            container.current.innerHTML = ''
            refreshChart(tvSymbol)
        }
    }

    useEffect(() => {
        // strict mode is on so it calls useEffect twice
        // refreshChart(tvSymbol)
    }, []);

    if (!selectedMarket || !tvSymbol) {
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
                <Box sx={{background:'#131723',borderWidth:'thin',borderRightWidth:0, borderStyle:'solid', borderColor:'#8c919763'}}><Table style={{ width: 'auto' }}>
                    <thead style={{background:'#131723'}}>
                        <tr style={{background:'#131723'}}>
                            <th colSpan={2} style={{ width: '100px',background:'#131723' }}>Available Markets</th>                    
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
                <Box flex={1} height={450}>
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