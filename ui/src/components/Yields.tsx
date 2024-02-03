import '@fontsource/inter';

import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import Button from '@mui/joy/Button';
import { AMOUNT_DECIMALS, FEE_DECIMALS, LEVERAGE_DECIMALS } from 'utils/dist/constants';
import '../App.css';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, formatNumber, formatPercent, renderItem } from '../utils';
import SectionHeader from './SectionHeader';
import PriceLabel from './PriceLabel';
import moment from 'moment';

export default function Yields() {
    const markets = useKrunchStore(state => state.yieldMarkets)
    const setYieldDialogOpen = useKrunchStore(state => state.setYieldDialogOpen)

    return (
        <Box sx={{
            minHeight: 0,
            flexGrow: 1,
            overflow: 'hidden auto',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <Table>
                <thead>
                    <tr>
                        <th colSpan={10}><SectionHeader title="Yields" /></th>
                    </tr>
                    <tr>
                        <th style={{ width: '100px' }}>Market</th>
                        <th>Price</th>        
                        <th>Long Amount</th>
                        <th>Long Basis</th>
                        <th>Long Pnl</th>
                        <th>Long Funding</th>
                        <th>Long Yield</th>
                        <th>Short Amount</th>
                        <th>Short Basis</th>
                        <th>Short Funding</th>
                        <th>Short Pnl</th>
                        <th>Short Yield</th>
                    </tr>
                </thead>
                <tbody>
                    {markets.map(row => {
                        const price = row.price || 0
                        const userLongTokenAmount = row.userPosition?.longTokenAmount?.toNumber() || 0  
                        const userShortTokenAmount = row.userPosition?.shortTokenAmount?.toNumber() || 0  
                        const longTokenAmount = row.longTokenAmount?.toNumber() || 0  
                        const shortTokenAmount = row.shortTokenAmount?.toNumber() || 0  
                        const shortBasis = row.shortBasis?.toNumber() || 0  
                        const longBasis = row.longBasis?.toNumber() || 0  
                        const longFunding = row.longFunding?.toNumber() || 0  
                        const shortFunding = row.shortFunding?.toNumber() || 0  
                        const userLongBasis = price * userLongTokenAmount
                        const userShortBasis = price * userShortTokenAmount
                        const longCurrentValue = price * longTokenAmount
                        const shortCurrentValue = price * shortTokenAmount
                        const oldLongBasis = longBasis + longFunding
                        const oldShortBasis = shortBasis + shortFunding
                        const longPnl = longCurrentValue - oldLongBasis
                        const shortPnl = oldShortBasis - shortCurrentValue
                        const lastClaimDate = (row.lastClaimDate || 0)*1000
                        
                        const elapsedTime = Date.now() - lastClaimDate
                        let longUserYieldAmount = 0
                        let longYieldAmount = 0
                        let shortYieldAmount = 0
                        let shortUserYieldAmount = 0
                        const ONE_YEAR = 1 * 24 * 60 * 60 * 1000
                        // const ONE_YEAR = 365 * 24 * 60 * 60 * 1000
                        
                        if (longPnl > shortPnl) {
                            const amount = longPnl - shortPnl
                            let maxAmount = amount
                            if (amount > oldShortBasis){
                                maxAmount = oldShortBasis
                            }
                            if (longTokenAmount > 0 && userLongTokenAmount > 0){
                                longYieldAmount = maxAmount * (elapsedTime / ONE_YEAR)
                                longUserYieldAmount = longYieldAmount * (userLongTokenAmount / longTokenAmount)
                                shortYieldAmount = -1* longYieldAmount
                                shortUserYieldAmount = -1* longUserYieldAmount
                            }
                        }else{
                            const amount = shortPnl - longPnl
                            let maxAmount = amount
                            if (amount > oldLongBasis){
                                maxAmount = oldLongBasis
                            }
                            if (shortTokenAmount > 0 && userShortTokenAmount > 0){
                                shortYieldAmount = maxAmount * (elapsedTime / ONE_YEAR)
                                shortUserYieldAmount = shortYieldAmount * (userShortTokenAmount / shortTokenAmount)
                                longYieldAmount = -1* shortYieldAmount
                                longUserYieldAmount = -1* shortUserYieldAmount
                            }
                        }

                        const longEntry = (row.longBasis?.toNumber() || 0) / (row.longTokenAmount?.toNumber() || 0    )
                        const shortEntry = (row.shortBasis?.toNumber() || 0) / (row.shortTokenAmount?.toNumber() || 0    )
                        const longAPR =  (longYieldAmount + longFunding) / oldLongBasis
                        const shortAPR = (shortYieldAmount + shortFunding) / oldShortBasis

                        return <tr key={row.marketIndex}>                            
                            <td><Button onClick={()=>setYieldDialogOpen(true)} size='sm' variant='plain'>{row.name} </Button></td>
                            <td><PriceLabel value={row.price}>{formatCurrency(row.price || 0)}</PriceLabel></td>
                            <td>{renderItem(row.userPosition?.longTokenAmount)} /<br/> {renderItem(row.longTokenAmount)}</td>
                            <td>{formatCurrency((row.longBasis?.toNumber() || 0) / AMOUNT_DECIMALS)} /<br/> {formatNumber(longEntry)}</td>
                            <td>{renderItem(longPnl)}</td>
                            <td>{renderItem(row.longFunding)}</td>
                            <td>{renderItem(longUserYieldAmount)} /<br/> {renderItem(longYieldAmount)} /<br/> {formatPercent(longAPR)}</td>
                            <td>{renderItem(row.userPosition?.shortTokenAmount)} / {renderItem(row.shortTokenAmount)} </td>
                            <td>{formatCurrency((row.shortBasis?.toNumber() || 0) / AMOUNT_DECIMALS)} /<br/> {formatNumber(shortEntry)}</td>
                            <td>{renderItem(row.shortFunding)}</td>
                            <td>{renderItem(shortPnl)}</td>
                            <td>{renderItem(shortUserYieldAmount)} /<br/> {renderItem(shortYieldAmount)} /<br/> {formatPercent(shortAPR)}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
        </Box>
    );
}