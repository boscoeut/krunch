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
                        <th colSpan={9}><SectionHeader title="Yields" /></th>
                    </tr>
                    <tr>
                        <th style={{ width: '100px' }}>Market</th>
                        <th>Price</th>        
                        <th>Long Amount</th>
                        <th>Long Basis</th>
                        <th>Long Value</th>
                        <th>Long Funding</th>
                        <th>Short Amount</th>
                        <th>Short Basis</th>
                        <th>Short Funding</th>
                    </tr>
                </thead>
                <tbody>
                    {markets.map(row => {
                        // console.log('yield', row  )
                        return <tr key={row.marketIndex}>
                            <td><Button onClick={()=>setYieldDialogOpen(true)} size='sm' variant='plain'>{row.name} </Button></td>
                            <td><PriceLabel value={row.price}>{formatCurrency(row.price || 0)}</PriceLabel></td>
                            <td>{renderItem(row.userPosition?.longTokenAmount)} / {renderItem(row.longTokenAmount)}</td>
                            <td>{formatCurrency((row.longBasis?.toNumber() || 0) / AMOUNT_DECIMALS)}</td>
                            <td>{formatCurrency(row.currentLongValue || 0)}</td>
                            <td>{renderItem(row.longFunding)}</td>
                            <td>{renderItem(row.shortTokenAmount)}</td>
                            <td>{renderItem(row.shortBasis)}</td>
                            <td>{renderItem(row.shortFunding)}</td>
                        </tr>
                    })}
                </tbody>
            </Table>
        </Box>
    );
}