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
import Input from '@mui/joy/Input';
import Chip from '@mui/joy/Chip';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Stack from '@mui/joy/Stack';
import { useKrunchStore } from "../hooks/useKrunchStore";
import * as React from 'react';
import { AMOUNT_DECIMALS, CHAINLINK_PROGRAM, EXCHANGE_POSITIONS, MARKETS } from 'utils/dist/constants';
import { fetchOrCreateAccount, findAddress } from "utils/dist/utils";
import useProgram from '../hooks/useProgram';
import { Tab } from "@mui/joy";
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

  const selectedMarket = MARKETS.find((position) => position.marketIndex === Number(marketIndex))
  const selectedExchangeMarket  = exchangeBalances.find((position) => position.market === selectedMarket?.name)
  const tradeValue = Number(amount) * (selectedExchangeMarket?.price || 0)
  const feeRate =0.01
  const fee = Math.abs(tradeValue) * feeRate  
  const total = Math.abs(tradeValue) + fee

  console.log('selectedExchangeMarket', selectedExchangeMarket)
  
  const handleSubmit = async () => {
    const market = MARKETS.find((market) => market.marketIndex === Number(marketIndex))
    const position = EXCHANGE_POSITIONS.find((position) => position.market === market?.name)
    try {
      setSubmitting(true)
      if (position) {
        // Handle form submission here
        const provider = await getProvider()
        const program = await getProgram()

        const index = Number(marketIndex)
        console.log('executeTrade', marketIndex)

        await fetchOrCreateAccount(program, 'userPosition',
          ['user_position',
            provider.wallet.publicKey,
            index],
          'addUserPosition', [new anchor.BN(index)],
          {
            userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
            market: await findAddress(program, ['market', index]),
          });

        await fetchOrCreateAccount(program, 'userAccount',
          ['user_account',
            provider.wallet.publicKey],
          'createUserAccount', []);

        const tx = await program.methods.executeTrade(
          new anchor.BN(marketIndex),
          new anchor.BN(Number(amount) * AMOUNT_DECIMALS)
        ).accounts({
          market: await findAddress(program, ['market', index]),
          exchange: await findAddress(program, ['exchange']),
          userPosition: await findAddress(program, ['user_position', provider.wallet.publicKey, index]),
          userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
          chainlinkFeed: position.feedAddress,
          chainlinkProgram: CHAINLINK_PROGRAM,
        }).rpc();
        console.log("executeTrade", tx);
        setOpen(false)
      }
    } catch (e) {
      console.log("error", e);
    } finally {
      setSubmitting(false)
    }
  };

  let submitMessage = 'Execute Trade'
  let errorMessage = ''
  let canSubmit = !submitting
  let selectedBalance = 0.6

  if (selectedBalance < Number(amount)) {
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
              <FormControl error={!canSubmit}>
                <FormLabel>Amount</FormLabel>
                <Input autoFocus required value={amount} onChange={(e: any) => setAmount(e.target.value)} />
                {!canSubmit && <FormHelperText>
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
                    <td>Price</td>
                    <td>{`${selectedExchangeMarket?.price || 0}`}</td>
                  </tr>
                  <tr>
                    <td>Value</td>
                    <td>{formatCurrency(tradeValue,4)}</td>
                  </tr>
                  <tr>
                    <td>Fee <Chip color={fee > 0 ? "danger":"success"}>Rate: {formatPercent(feeRate)}</Chip></td>
                    <td>{formatCurrency(fee,4)}</td>
                  </tr>
                  <tr>
                    <th>Total</th>
                    <th>{formatCurrency(total,4)}</th>
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