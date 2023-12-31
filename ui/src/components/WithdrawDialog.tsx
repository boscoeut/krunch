/* eslint-disable jsx-a11y/anchor-is-valid */
import InfoOutlined from '@mui/icons-material/InfoOutlined';
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
import KLabel from './KLabel';
import Table from '@mui/joy/Table';
import * as React from 'react';
import { AMOUNT_DECIMALS, EXCHANGE_POSITIONS } from "utils/dist/constants";
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, formatNumber } from '../utils';

export interface WithdrawDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function WithdrawDialog({ open, setOpen }: WithdrawDialogProps) {
  const [market, setMarket] = React.useState('USDC/USD');
  const [amount, setAmount] = React.useState('0');
  const [submitting, setSubmitting] = React.useState(false);
  const userBalances = useKrunchStore(state => state.userBalances)
  const withdraw = useKrunchStore(state => state.withdraw)
  const userAccountValue = useKrunchStore(state => state.userAccountValue)
  const withdrawValue=Number(amount) 
  const selectedMarket = userBalances.find((position) => position.market === market)
  const balanceAfterWithdraw = userAccountValue/AMOUNT_DECIMALS - withdrawValue

  const tokenAmount = Number(amount) / (selectedMarket?.price || 0)
  const tokenPhrase = `Receive ${formatNumber(tokenAmount,5)} ${selectedMarket?.market.replace("/USD","")} Tokens`
  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      await withdraw(market, Number(amount))
      setOpen(false)
    } catch (e) {
      console.log("error", e);
    } finally {
      setSubmitting(false)
    }
  };

  let submitMessage = 'Withdraw'
  let errorMessage = ''
  let canSubmit = !submitting
  const selectedBalance = userAccountValue / AMOUNT_DECIMALS
  if (Number(selectedBalance.toFixed(2)) < Number(amount)) {
    canSubmit = false
    submitMessage = 'Insufficient Balance'
    errorMessage = submitMessage
  }

  if ( Number(amount)<=0) {
    canSubmit = false
    submitMessage = 'Amount must be greater than 0'
    errorMessage = submitMessage
  }

  if (submitting) {
    submitMessage = 'Withdrawing...'
  }

  const setMax = () => {
    setAmount(Number(userAccountValue / AMOUNT_DECIMALS).toFixed(2))
  }

  return (
    <React.Fragment>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Withdraw Funds</DialogTitle>
          <DialogContent>Enter Withdraw Details</DialogContent>
          <form
            onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              await handleSubmit();
            }}
          >
            <Stack spacing={2}>
              <FormControl error={!canSubmit}>
                <FormLabel>Amount <Chip onClick={setMax} color="success">Max {formatCurrency(userAccountValue / AMOUNT_DECIMALS)} </Chip></FormLabel>
                <Input autoFocus required value={amount} onChange={(e: any) => setAmount(e.target.value)} />
                {!canSubmit && <FormHelperText>
                  <InfoOutlined />
                  {errorMessage}
                </FormHelperText>}
              </FormControl>
              <FormControl>
                <FormLabel>Token to Receive</FormLabel>
                <Select value={market} onChange={(e: any, newValue: any) => {
                  setMarket(newValue)
                }}>
                  {EXCHANGE_POSITIONS.map((position) => {
                    return <Option key={position.market} value={position.market} >{position.market.replace("USD/","")}</Option>
                  })}
                </Select>
              </FormControl>
              <Button disabled={!canSubmit} type="submit">{submitMessage}</Button>

              <FormControl>
                <Table>
                <tbody>
                  <tr>
                    <td style={{width:175}}>Current Balance</td>
                    <td>{formatCurrency(userAccountValue/AMOUNT_DECIMALS)}</td>
                  </tr>
                  <tr>
                    <td>Withdraw Amount</td>
                    <td><KLabel numValue={Number(amount)*-1}>{formatCurrency(withdrawValue)}</KLabel> <span style={{paddingLeft:10, fontSize:'0.9em'}}>({tokenPhrase}) (Current Price = {formatNumber(selectedMarket?.price || 0,4)})</span></td>
                  </tr>
                  <tr>
                    <td>Balance After Withdraw</td>
                    <td><KLabel fontWeight='bold' numValue={balanceAfterWithdraw}>{formatCurrency(balanceAfterWithdraw)}</KLabel></td> 
                  </tr>
                </tbody>
                </Table>                  
              </FormControl>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </React.Fragment>
  );
}