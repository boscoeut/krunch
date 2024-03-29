/* eslint-disable jsx-a11y/anchor-is-valid */
import Button from '@mui/joy/Button';
import Chip from '@mui/joy/Chip';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormControl from '@mui/joy/FormControl';
import FormHelperText from '@mui/joy/FormHelperText';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Stack from '@mui/joy/Stack';
import Table from '@mui/joy/Table';
import * as React from 'react';
import { AMOUNT_DECIMALS, FEE_DECIMALS, MARKETS } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import {ICONS, formatCurrency, formatNumber, formatPercent } from "../utils";
import KLabel from "./KLabel";
import PriceLabel from './PriceLabel';

export interface TradeDialogProps {
  open: boolean;
  setOpen: (open:boolean)=>void; // Definition of setOpen prop    
}

export default function TradeDialog({ open, setOpen }: TradeDialogProps) {
  const [marketIndex, setMarketIndex] = React.useState('1');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [amount, setAmount] = React.useState('0.5');
  const [submitting, setSubmitting] = React.useState(false);
  const exchangeBalances = useKrunchStore(state => state.exchangeBalances)
  const positions = useKrunchStore(state => state.positions)
  const markets = useKrunchStore(state => state.markets)
  const userCollateral = useKrunchStore(state => state.userCollateral)
  const exchangeBalanceAvailable = useKrunchStore(state => state.exchangeBalanceAvailable)
  const executeTrade = useKrunchStore(state => state.executeTrade)
  const selectedMarket = markets.find((position) => position.marketIndex === Number(marketIndex))
  const selectedExchangeMarket = exchangeBalances.find((position) => position.market === selectedMarket?.name)
  const selectedUserBalance = positions.find((position) => position.market === selectedMarket?.name)
  const tradeValue = Number(amount) * (selectedExchangeMarket?.price || 0)
  const marketTokenAmount = (selectedMarket?.tokenAmount || 0) / AMOUNT_DECIMALS
  const userTokenAmount = (selectedUserBalance?.tokenAmount || 0) / AMOUNT_DECIMALS

  let feeRate = (selectedMarket?.takerFee || 0) / FEE_DECIMALS || 0
  const nAmount = Number(amount)
  
  if ((nAmount > 0 && nAmount <= marketTokenAmount && nAmount + marketTokenAmount >=0) 
    || (nAmount < 0 && nAmount >= marketTokenAmount && nAmount + marketTokenAmount <=0)) {
    feeRate = (selectedMarket?.makerFee || 0) / FEE_DECIMALS || 0
  }

  let showMaxTrade =true
  if ((nAmount > 0 && nAmount <= userTokenAmount*-1 && nAmount + userTokenAmount*-1 >=0) 
    || (nAmount < 0 && nAmount >= userTokenAmount*-1 && nAmount + userTokenAmount*-1 <=0)) {
    showMaxTrade = false
  }

  const fee = Math.abs(tradeValue) * feeRate
  const total = Math.abs(tradeValue) + fee
  const maxTrade = Math.min(exchangeBalanceAvailable, showMaxTrade?userCollateral:exchangeBalanceAvailable) / AMOUNT_DECIMALS || 0

  const closeDialog = () => {
    setErrorMessage('')
    setSubmitting(false)
    setOpen(false)
  }

  const closeAmount = () => {
    setAmount(Number(userTokenAmount * -1).toFixed(4))
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      setErrorMessage('')
      await executeTrade(Number(marketIndex), Number(amount))
      closeDialog()
    } catch (e: any) {
      setErrorMessage(e.message)
      console.log("error", e);
    } finally {
      setSubmitting(false)
    }
  };


  let canSubmit = !submitting
  let selectedBalance = maxTrade

  let amountMessage = ''
  if (selectedBalance < Number(total) && showMaxTrade) {
    canSubmit = false
    amountMessage = 'Insufficient Balance'
  }

  let submitMessage = 'Execute Trade'
  if (submitting) {
    submitMessage = 'Executing...'
  }

  return (
    <React.Fragment>
      <Modal open={open} onClose={() => closeDialog()}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Trade</DialogTitle>
          <DialogContent>Enter Trade Details.</DialogContent>
          <form
            onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              await handleSubmit();
            }}
          >
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Market</FormLabel>
                <Select value={`${marketIndex}`} onChange={(e: any, newValue: any) => {
                  setMarketIndex(newValue)
                }}>
                  {MARKETS.map((position) => {
                    return <Option key={`${position.marketIndex}`} value={`${position.marketIndex}`} >{position.name}</Option>
                  })}
                </Select>
              </FormControl>
              <FormControl error={!!amountMessage}>
                <FormLabel>Amount <Chip color='success' onClick={closeAmount} style={{ display: userTokenAmount !== 0 ? 'inherit' : 'none', marginLeft: 10 }}>Current Amount: {userTokenAmount}</Chip></FormLabel>
                <Input autoFocus required value={amount} onChange={(e: any) => setAmount(e.target.value)} />
                {amountMessage && !submitting && <FormHelperText>
                  <ICONS.INFO />
                  {amountMessage}
                </FormHelperText>}
              </FormControl>

              <Table>
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>Trade Details</th>
                    <th style={{ width: 100 }}></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Amount</td>
                    <td>{`${amount}`}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>Price</td>
                    <td><PriceLabel value={selectedExchangeMarket?.price}>{`${formatNumber(selectedExchangeMarket?.price || 0)}`}</PriceLabel></td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>Value</td>
                    <td>{formatCurrency(tradeValue, 4)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td>{fee > 0 ? 'Fee' : <KLabel numValue={fee * -1} endDecorator={<ICONS.MONEY color='success' />}>Trading Rebate</KLabel>}</td>
                    <td><KLabel fontWeight="bold" numValue={fee * -1}>{formatCurrency(fee, 4)}</KLabel>  </td>
                    <td><Chip color={fee > 0 ? "danger" : "success"}>Rate: {formatPercent(feeRate)}</Chip></td>
                  </tr>
                  <tr>
                    <th>Total </th>
                    <th>{formatCurrency(total, 4)} </th>
                    <td>{showMaxTrade && <Chip color={maxTrade > total ? "success" : "danger"}>Max Margin Available: {formatCurrency(maxTrade)}</Chip>}</td>
                  </tr>
                </tbody>
              </Table>
              <Button disabled={!canSubmit} type="submit">{submitMessage}</Button>
              {errorMessage && <FormControl error={!!errorMessage}>
                <FormHelperText>
                  <ICONS.INFO />
                  {errorMessage}
                </FormHelperText>
              </FormControl>}
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </React.Fragment>
  );
}