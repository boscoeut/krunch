/* eslint-disable jsx-a11y/anchor-is-valid */
import * as anchor from "@coral-xyz/anchor";
import Button from '@mui/joy/Button';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormLabel from '@mui/joy/FormLabel';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import FormControl from '@mui/joy/FormControl';
import FormHelperText from '@mui/joy/FormHelperText';
import Select from '@mui/joy/Select';
import Option from '@mui/joy/Option';
import Table from '@mui/joy/Table';
import KLabel from "./KLabel";
import Input from '@mui/joy/Input';
import Chip from '@mui/joy/Chip';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Stack from '@mui/joy/Stack';
import { useKrunchStore } from "../hooks/useKrunchStore";
import * as React from 'react';
import { AMOUNT_DECIMALS, CHAINLINK_PROGRAM, EXCHANGE_POSITIONS, FEE_DECIMALS, MARKETS } from 'utils/dist/constants';
import { fetchOrCreateAccount, findAddress } from "utils/dist/utils";
import useProgram from '../hooks/useProgram';
import { Tab, Typography } from "@mui/joy";
import { formatCurrency, formatPercent } from "../utils";
// icons


export interface TradeDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function TradeDialog({ open, setOpen }: TradeDialogProps) {
  const [marketIndex, setMarketIndex] = React.useState('1');
  const [amount, setAmount] = React.useState('0.5');
  const { getProgram, getProvider } = useProgram();
  const [submitting, setSubmitting] = React.useState(false);
  const exchangeBalances = useKrunchStore(state => state.exchangeBalances)
  const markets = useKrunchStore(state => state.markets)
  const userCollateral = useKrunchStore(state => state.userCollateral)
  const executeTrade = useKrunchStore(state => state.executeTrade)

  const selectedMarket = markets.find((position) => position.marketIndex === Number(marketIndex))
  const selectedExchangeMarket = exchangeBalances.find((position) => position.market === selectedMarket?.name)
  const tradeValue = Number(amount) * (selectedExchangeMarket?.price || 0)
  const marketTokenAmount = (selectedMarket?.tokenAmount || 0) / AMOUNT_DECIMALS

  let feeRate = (selectedMarket?.takerFee || 0) / FEE_DECIMALS || 0

  const nAmount = Number(amount) 
  if ((nAmount > 0 && nAmount <= marketTokenAmount) || (nAmount < 0 && nAmount >= marketTokenAmount)) {
     feeRate = (selectedMarket?.makerFee || 0) / FEE_DECIMALS || 0
  }

  const fee = Math.abs(tradeValue) * feeRate
  const total = Math.abs(tradeValue) + fee
  const maxTrade = userCollateral / AMOUNT_DECIMALS || 0

  console.log('selectedMarket', selectedMarket)
  console.log('selectedExchangeMarket', selectedExchangeMarket)

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      await executeTrade(Number(marketIndex), Number(amount))
      setOpen(false)
    } catch (e) {
      console.log("error", e);
    } finally {
      setSubmitting(false)
    }
  };

  let submitMessage = 'Execute Trade'
  let errorMessage = ''
  let canSubmit = !submitting
  let selectedBalance = maxTrade

  if (selectedBalance < Number(total)) {
    canSubmit = false
    submitMessage = 'Insufficient Balance'
    errorMessage = submitMessage
  }
  if (submitting) {
    submitMessage = 'Executing...'
  }

  return (
    <React.Fragment>
      <Modal open={open} onClose={() => setOpen(false)}>
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
              <FormControl error={!canSubmit && !submitting}>
                <FormLabel>Amount</FormLabel>
                <Input autoFocus required value={amount} onChange={(e: any) => setAmount(e.target.value)} />
                {!canSubmit && !submitting && <FormHelperText>
                  <InfoOutlined />
                  {errorMessage}
                </FormHelperText>}
              </FormControl>

              <Table>
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>Trade Details</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Token Amount</td>
                    <td>{`${marketTokenAmount}`}</td>
                  </tr>
                  <tr>
                    <td>Price</td>
                    <td>{`${selectedExchangeMarket?.price || 0}`}</td>
                  </tr>
                  <tr>
                    <td>Value</td>
                    <td>{formatCurrency(tradeValue, 4)}</td>
                  </tr>
                  <tr>
                    <td>{fee > 0 ? 'Fee' : 'Trading Rebate!'}</td>
                    <td><KLabel fontWeight="bold" numValue={fee * -1}>{formatCurrency(fee, 4)}</KLabel>  <Chip color={fee > 0 ? "danger" : "success"}>Rate: {formatPercent(feeRate)}</Chip></td>
                  </tr>
                  <tr>
                    <th>Total </th>
                    <th>{formatCurrency(total, 4)} <Chip color={maxTrade > total ? "success" : "danger"}>Max: {formatCurrency(maxTrade)}</Chip></th>
                  </tr>
                </tbody>
              </Table>

              <Button disabled={!canSubmit} type="submit">{submitMessage}</Button>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </React.Fragment>
  );
}