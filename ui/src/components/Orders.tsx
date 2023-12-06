import * as React from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { styled } from '@mui/system';
import OrderTable from './OrderTable';
import OrderList from './OrderList';
export default function SimpleCharts() {
    return (
        <div>
            <OrderList />
            <OrderTable />
        </div>

    );
}