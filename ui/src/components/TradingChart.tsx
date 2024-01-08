import DoubleArrowRoundedIcon from '@mui/icons-material/DoubleArrowRounded';
import { Typography } from '@mui/joy';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Input from '@mui/joy/Input';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import HighlightOffRoundedIcon from '@mui/icons-material/HighlightOffRounded';
import Table from '@mui/joy/Table';
import { useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from "react-error-boundary";
import { AMOUNT_DECIMALS, TV_MARKETS } from 'utils/dist/constants';
import { useKrunchStore } from '../hooks/useKrunchStore';
import '../index.css';
import { formatCurrency, renderItem } from '../utils';
import PriceLabel from './PriceLabel';
import SectionHeader from './SectionHeader';

export default function TradingChart() {
    const markets = useKrunchStore(state => state.markets)
    const appInfo = useKrunchStore(state => state.appInfo)
    const setTradeDialogOpen = useKrunchStore(state => state.setTradeDialogOpen)
    const [selectedMarket, setSelectedMarket] = useState(markets[0]);
    const container: any = useRef();
    const [mounted, setMounted] = useState(false);
    const [filter, setFilter] = useState('');
    let symbolMap: any = TV_MARKETS
    let useEffectCount = 0
    let marketDetails = markets.find((market) => market.name === selectedMarket.name) || markets[0]

    useEffect(() => {
        setMounted(true);
        if (useEffectCount === 0 && !mounted) {
            useEffectCount++
            const tvSymbol = symbolMap[marketDetails.name] as string || "SOLUSD"
            refreshChart(tvSymbol)
        }
    }, []);



    let entryPrice = 0
    if (marketDetails) {
        entryPrice = Math.abs(marketDetails.tokenAmount === 0 ? 0 : (marketDetails.basis || 0) / (marketDetails.tokenAmount || 0))
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
              "hide_volume": true,

              "withdateranges": true,
              "hide_legend": true,
              "save_image": false
            }`;
        if (container.current) {
            container.current.appendChild(script);
        }
    }

    const changeMarket = (market: any) => {
        if (market !== marketDetails) {
            const tvSymbol = symbolMap[market.name] as string || "SOLUSD"
            container.current.innerHTML = ''
            refreshChart(tvSymbol)
            setSelectedMarket(market)
        }
    }

    if (!selectedMarket) {
        return <></>
    }

    let marketsToList = markets.filter((market) => {
        return market.name.toLowerCase().includes(filter.toLowerCase())
    })

    return (
        <Box
            display={'flex'}
            flexDirection={'column'}
            overflow={'hidden'}
            flexGrow={1}>
            <Box style={{
                borderStyle: 'solid',
                borderWidth: 0,
                borderTopWidth: 'thin',
                borderBottomWidth: 0,
                borderColor: appInfo.toolbarBorderColor
            }}>
                <Table>
                    <thead>
                        <tr >
                            <th><Button onClick={()=>setTradeDialogOpen(true)} variant="plain"><Typography level='h4' sx={{ textTransform: 'capitalize', fontFamily: 'BrunoAceSC' }}>{marketDetails.name}</Typography></Button></th>
                            <th>Price: <PriceLabel value={marketDetails.price}>{formatCurrency(marketDetails.price || 0)}</PriceLabel></th>
                            <th>Amount: <br />{renderItem(marketDetails.tokenAmount || 0, AMOUNT_DECIMALS, 4)}</th>
                            <th>Basis: <br />{renderItem(marketDetails.basis || 0)}</th>
                            <th>Curr Value: <br />{formatCurrency(marketDetails.currValue || 0)}</th>
                            <th>Unrealized Pnl: <br />{formatCurrency(marketDetails.unrealizedPnl || 0)}</th>
                            <th>Entry Price: <br />{formatCurrency(entryPrice || 0)}</th>
                            <th style={{ flex: 1 }}>&nbsp;</th>
                        </tr>
                    </thead>
                </Table>
            </Box>
            <Box flex={1} flexGrow={1} overflow={'hidden'} display={'flex'}>
                {/* MarketList */}                
                <Box sx={{
                    background: appInfo.toolbarBackground, borderWidth: 'thin',
                    borderLeftWidth: 0,
                    width:240,
                    borderRightWidth: 0,
                    borderBottomWidth:'thin',
                    borderStyle: 'solid',
                    borderColor: appInfo.toolbarBorderColor,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'auto'
                }}>
                    <Input 
                                        onChange={(e:any)=>{setFilter(e.target.value)}} 
                                        value={filter} 
                                        
                                        sx={{m:0, opacity:0.75,pt:1,pb:1.1,
                                            borderColor: appInfo.toolbarBorderColor,
                                            borderBottomWidth: 'thin',
                                            borderBottomStyle: 'solid',
                                            borderRadius:0,
                                             background: appInfo.toolbarBackground,  }} 
                                        endDecorator={filter && <HighlightOffRoundedIcon onClick={()=>{setFilter('')}}/>}
                                        startDecorator={<FilterListRoundedIcon />} size='sm' variant='plain' placeholder='Available Markets' />
                    <Table stickyHeader size='sm'
                       >
                        <thead >
                            <tr>
                                <th>
                                    Market
                                </th>
                                <th>Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {marketsToList.map((row: any) => {
                                return <tr key={row.marketIndex} style={{ cursor: 'pointer' }} >
                                    <td style={{ width: '100px' }} onClick={() => changeMarket(row)}>
                                        <Button size='sm' variant='plain'><Typography startDecorator={row.name === marketDetails.name && <DoubleArrowRoundedIcon />}>{row.name}</Typography></Button>
                                    </td>
                                    <td style={{ width: '125px' }}><PriceLabel value={row.price}>{formatCurrency(row.price || 0)}</PriceLabel></td>
                                </tr>
                            })}                         
                        </tbody>
                    </Table>
                </Box>

                {/* Chart */}
                <Box flexGrow={1} >
                    <ErrorBoundary fallback={<div>Something went wrong</div>}>
                        <div
                            ref={container}
                            style={{ height: "100%", width: "100%" }} />
                    </ErrorBoundary>
                </Box>
            </Box>
        </Box>
    )
} 