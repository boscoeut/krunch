/* eslint-disable jsx-a11y/anchor-is-valid */
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
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
import Typography from '@mui/joy/Typography';
import * as React from 'react';
import { AMOUNT_DECIMALS, EXCHANGE_POSITIONS } from "utils/dist/constants";
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency, renderItem, formatNumber } from '../utils';
import KLabel from './KLabel';

export interface DepositDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function DepositDialog({ open, setOpen }: DepositDialogProps) {
  const [market, setMarket] = React.useState('USDC/USD');
  const [amount, setAmount] = React.useState('0');
  const [submitting, setSubmitting] = React.useState(false);
  const userAccountValue = useKrunchStore(state => state.userAccountValue)

  const userBalances = useKrunchStore(state => state.userBalances)
  const deposit = useKrunchStore(state => state.deposit)

  const selectedMarket = userBalances.find((position) => position.market === market)
  const selectedBalance = (selectedMarket?.balance || 0) / (10 ** (selectedMarket?.decimals || 1))

  const depositValue=Number(amount) * (selectedMarket?.price || 0  )
  const balanceAfterDeposit = userAccountValue/AMOUNT_DECIMALS + depositValue


  const handleSubmit = async () => {
    const position = EXCHANGE_POSITIONS.find((position) => position.market === market)

    try {
      setSubmitting(true)
      if (position) {
        await deposit(market, Number(amount))
        setOpen(false)
      }
    } catch (e) {
      console.log("error", e);
    } finally {
      setSubmitting(false)
    }
  };

  const properties = [
    { label: 'Amount', value: amount, onChange: setAmount, type: 'number' },
    { label: `Token to Deposit`, value: market, onChange: setMarket, type: 'markets' },
  ]

  let submitMessage = 'Deposit'
  let errorMessage = ''
  let canSubmit = !submitting

  if (selectedBalance < Number(amount)) {
    canSubmit = false
    submitMessage = 'Insufficient Balance'
    errorMessage = submitMessage
  }
  if (Number(amount) <= 0) {
    canSubmit = false
    submitMessage = 'Amount must be greater than 0'
    errorMessage = submitMessage
  }
  if (submitting) {
    submitMessage = 'Depositing...'
  }

  return (
    <React.Fragment>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Deposit Funds</DialogTitle>
          <DialogContent>Enter Deposit Details</DialogContent>
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
                          return <Option key={position.market} value={position.market} >{position.market.replace("/USD", "")}</Option>
                        })}
                      </Select>

                    </FormControl>}
                    {property.type === 'number' && <FormControl key={property.label} error={!canSubmit && !submitting}>
                      <FormLabel>{property.label}</FormLabel>
                      <Input
                        autoFocus required
                        value={property.value}
                        onChange={(e: any) => property.onChange(e.target.value)} />
                      {!canSubmit && !submitting && <FormHelperText>
                        <InfoOutlined />
                        {errorMessage}
                      </FormHelperText>}
                    </FormControl>}
                  </Box>
                );
              })}

              <FormControl>
                <Table>
                <tbody>
                  <tr>
                    <td style={{width:175}}>Current Balance</td>
                    <td>{formatCurrency(userAccountValue/AMOUNT_DECIMALS)}</td>
                  </tr>
                  <tr>
                    <td>Deposit Amount</td>
                    <td><KLabel numValue={Number(amount)}>{formatCurrency(depositValue)}</KLabel><span style={{paddingLeft:10, fontSize:'0.9em'}}>(Current Price = {formatNumber(selectedMarket?.price || 0,4)})</span></td>
                  </tr>
                  <tr>
                    <td>Balance After Deposit</td>
                    <td><KLabel fontWeight='bold' numValue={Number(amount)}>{formatCurrency(balanceAfterDeposit)}</KLabel></td> 
                  </tr>
                </tbody>
                </Table>                  
              </FormControl>
              <Button disabled={!canSubmit} type="submit">{submitMessage}</Button>
              <Table>
                <thead>
                  <tr>
                    <th style={{ width: 125 }}>In Wallet</th>
                    <th>Available to Deposit</th>
                    <th>Current Price</th>
                    <th>Current Value</th>
                  </tr>
                </thead>
                <tbody>
                  {userBalances.map((item) => {
                    const tokenAmount = item.balance / (10 ** item.decimals)
                    const amount = item.balance !== 0 ? renderItem(item.balance || 0, 10 ** item.decimals) : 0
                    let color:'neutral'|'primary'|'success'|'danger' = 'neutral'
                    if (item.market === selectedMarket?.market) {
                      color = 'primary'
                    }
                    return (
                      <tr key={item.market} style={{fontWeight: item.market === selectedMarket?.market ? 'bold':'normal'}}>
                        <td><Typography color={color}>{item.market.replace("/USD", "")}</Typography></td>
                        <td><Typography color={color}>{amount}</Typography></td>
                        <td><Typography color={color}>{formatNumber(item.price, 4)}</Typography></td>
                        <td><Typography color={color}>{formatCurrency(tokenAmount * (item.price || 0), 4)}</Typography></td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>

             
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </React.Fragment>
  );
}