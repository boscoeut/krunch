/* eslint-disable jsx-a11y/anchor-is-valid */
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Chip from '@mui/joy/Chip';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Stack from '@mui/joy/Stack';
import FormHelperText from '@mui/joy/FormHelperText';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import * as React from 'react';
import { EXCHANGE_POSITIONS, AMOUNT_DECIMALS } from "utils/dist/constants";
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, formatNumber } from '../utils';

export interface ExchangeDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function ExchangeDialog({ open, setOpen }: ExchangeDialogProps) {
  const [market, setMarket] = React.useState('USDC/USD');
  const [amount, setAmount] = React.useState('0');
  const exchangeDepositOrWithdraw = useKrunchStore(state => state.exchangeDepositOrWithdraw)
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const exchangeBalances = useKrunchStore(state => state.exchangeBalances)
  const selectedExchangeMarket = exchangeBalances.find((position) => position.market === market)
  const amountAvailable = selectedExchangeMarket?.balance || 0

  const closeDialog = () => {
    setSubmitting(false)
    setOpen(false)
    setErrorMessage('')
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      setErrorMessage('')
      await exchangeDepositOrWithdraw(market, Number(amount))
      closeDialog()
    } catch (e: any) {
      setErrorMessage(e.message)
      console.log("error", e);
    } finally {
      setSubmitting(false)
      setErrorMessage('')
    }
  };
  const setMax = () => {
    setAmount(Number(-1 * amountAvailable / 10 ** (selectedExchangeMarket?.decimals || 0)).toFixed(selectedExchangeMarket?.decimals || 0))
  }

  const title = Number(amount) > 0 ? `Exchange ${market.replace("/USD", "")} Desposit` : `Exchange ${market.replace("/USD", "")} Withdrawal`

  return (
    <React.Fragment>
      <Modal open={open} onClose={() => closeDialog()}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>Deposit or Withdraw from the exchange.</DialogContent>
          <form
            onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              await handleSubmit();
            }}
          >
            <Stack spacing={2}>

              <FormControl>
                <FormLabel>Amount <Chip onClick={setMax} color="success">Max {formatNumber(amountAvailable / 10 ** (selectedExchangeMarket?.decimals || 1), selectedExchangeMarket?.decimals || 1)} </Chip></FormLabel>
                <Input autoFocus required value={amount} onChange={(e: any) => setAmount(e.target.value)} />
              </FormControl>
              <FormControl>
                <FormLabel>Token</FormLabel>
                <Select value={market} onChange={(e: any, newValue: any) => {
                  setMarket(newValue)
                }}>
                  {EXCHANGE_POSITIONS.map((position) => {
                    return <Option key={position.market} value={position.market} >{position.market.replace("/USD", "")}</Option>
                  })}
                </Select>
              </FormControl>
              <Button disabled={submitting} type="submit">{submitting ? 'Submitting...' : 'Submit'}</Button>
              {errorMessage && <FormControl error={!!errorMessage}>
                <FormHelperText>
                  <InfoOutlined />
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