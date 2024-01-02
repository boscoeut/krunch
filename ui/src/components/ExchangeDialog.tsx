/* eslint-disable jsx-a11y/anchor-is-valid */
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Stack from '@mui/joy/Stack';
import FormHelperText from '@mui/joy/FormHelperText';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import * as React from 'react';
import { EXCHANGE_POSITIONS } from "utils/dist/constants";
import { useKrunchStore } from "../hooks/useKrunchStore";
import { set } from '@coral-xyz/anchor/dist/cjs/utils/features';

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

  const closeDialog = () => {
    setSubmitting(false)
    setOpen(false)
    setErrorMessage('')
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      await exchangeDepositOrWithdraw(market, Number(amount))
      setOpen(false)
    } catch (e: any) {
      setErrorMessage(e.message)
      console.log("error", e);
    } finally {
      setSubmitting(false)
    }
  };

  const properties = [
    { label: 'Amount', value: amount, onChange: setAmount, type: 'number' },
    { label: 'Market', value: market, onChange: setMarket, type: 'markets' },
  ]

  return (
    <React.Fragment>
      <Modal open={open} onClose={() => closeDialog()}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Exchange Withdraw</DialogTitle>
          <DialogContent>Withdraw from the exchange.</DialogContent>
          <form
            onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              await handleSubmit();
            }}
          >
            <Stack spacing={2}>
              {properties.map((property) => {
                return (
                  <Box key={property.label}>
                    {property.type === 'markets' && <FormControl key={property.label}>
                      <FormLabel>{property.label}</FormLabel>
                      <Select value={property.value} onChange={(e: any, newValue: any) => {
                        property.onChange(newValue)
                      }}>
                        {EXCHANGE_POSITIONS.map((position) => {
                          return <Option key={position.market} value={position.market} >{position.market}</Option>
                        })}
                      </Select>

                    </FormControl>}
                    {property.type === 'number' && <FormControl key={property.label}>
                      <FormLabel>{property.label}</FormLabel>
                      <Input autoFocus required value={property.value} onChange={(e: any) => property.onChange(e.target.value)} />
                    </FormControl>}
                  </Box>
                );
              })}
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