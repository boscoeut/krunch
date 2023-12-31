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
import * as React from 'react';
import { AMOUNT_DECIMALS, EXCHANGE_POSITIONS } from "utils/dist/constants";
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency } from '../utils';

export interface WithdrawDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function WithdrawDialog({ open, setOpen }: WithdrawDialogProps) {
  const [market, setMarket] = React.useState('USDC/USD');
  const [amount, setAmount] = React.useState('1000');
  const [submitting, setSubmitting] = React.useState(false);
  const withdraw = useKrunchStore(state => state.withdraw)
  const userAccountValue = useKrunchStore(state => state.userAccountValue)

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

  const properties = [
    { label: 'Amount', value: amount, onChange: setAmount, type: 'number' },
    { label: "Token to Receive", value: market, onChange: setMarket, type: 'markets' },
  ]

  let submitMessage = 'Withdraw'
  let errorMessage = ''
  let canSubmit = !submitting

  const selectedBalance = userAccountValue / AMOUNT_DECIMALS
  if (selectedBalance < Number(amount)) {
    canSubmit = false
    submitMessage = 'Insufficient Balance'
    errorMessage = submitMessage
  }
  if (submitting) {
    submitMessage = 'Withdrawing...'
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
                <FormLabel>Amount <Chip color="success">Max {formatCurrency(userAccountValue / AMOUNT_DECIMALS)} </Chip></FormLabel>
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
                    return <Option key={position.market} value={position.market} >{position.market}</Option>
                  })}
                </Select>
              </FormControl>
              <Button disabled={!canSubmit} type="submit">{submitMessage}</Button>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </React.Fragment>
  );
}