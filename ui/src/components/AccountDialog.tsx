/* eslint-disable jsx-a11y/anchor-is-valid */
import Button from '@mui/joy/Button';
import Divider from '@mui/joy/Divider';
import ModalClose from '@mui/joy/ModalClose';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import useProgram from '../hooks/useProgram';
import * as anchor from "@coral-xyz/anchor";
import Stack from '@mui/joy/Stack';
import useAccounts from '../hooks/useAccounts';
import Sheet from '@mui/joy/Sheet';
import Typography from '@mui/joy/Typography';
import TextField from '@mui/joy/TextField'; // Import TextField from Joy UI
import * as React from 'react';
import { PRICE_DECIMALS, FEE_DECIMALS, MARKET_WEIGHT_DECIMALS, AMOUNT_DECIMALS, LEVERAGE_DECIMALS} from '../constants';
// icons


export interface AccountDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function AccountDialog({ open, setOpen }: AccountDialogProps) {
  const [name, setName] = React.useState('SOL');
  const [marketIndex, setMarketIndex] = React.useState('1');
  const [marketWeight, setMarketWeight] = React.useState('.1');
  const [leverage, setLeverage] = React.useState('1');
  const [takerFee, setTakerFee] = React.useState('0.2');
  const [makerFee, setMakerFee] = React.useState('0.1');
  const [price, setPrice] = React.useState('100');
  const {getProgram, getProvider, wallet} = useProgram();
  const { findAddress, fetchOrCreateAccount, fetchAccount } = useAccounts();

  const handleSubmit = async () => {
    // Handle form submission here
    console.log('handleSubmit', marketIndex)
    const program = await getProgram(); // Replace 'getProgram' with the correct function name or define the 'getProgram' function.
    const tx = await program.methods.updateMarket(
      new anchor.BN(marketIndex),
      new anchor.BN(Number(price) * PRICE_DECIMALS),
      new anchor.BN(Number(makerFee) * FEE_DECIMALS),
      new anchor.BN(Number(takerFee) * FEE_DECIMALS),
      new anchor.BN(Number(leverage) * LEVERAGE_DECIMALS),
      new anchor.BN(Number(marketWeight) * MARKET_WEIGHT_DECIMALS),
    ).accounts({
      market: await findAddress(['market', Number(marketIndex)]),
      exchange: await findAddress(['exchange']),
    }).rpc();
    console.log("updateMarket", tx);
    const acct: any = await fetchAccount('market',
      ['market',
        marketIndex]);
    console.log('updateMarket', acct)
    setOpen(false)
  };

  const properties = [
    { label: 'Name', value: name, onChange: setName },
    { label: 'Index', value: marketIndex, onChange: setMarketIndex },
    { label: 'Weight', value: marketWeight, onChange: setMarketWeight },
    { label: 'Leverage', value: leverage, onChange: setLeverage },
    { label: 'Taker Fee', value: takerFee, onChange: setTakerFee },
    { label: 'Maker Fee', value: makerFee, onChange: setMakerFee },
    { label: 'Price', value: price, onChange: setPrice },
  ]

  return (
    <React.Fragment>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Deposit/Withdraw</DialogTitle>
          <DialogContent>Fill in the information of the project.</DialogContent>
          <form
            onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              await handleSubmit();
            }}
          >
            <Stack spacing={2}>
              {properties.map((property) => {
                return (
                  <FormControl key={property.label}>
                    <FormLabel>{property.label}</FormLabel>
                    <Input autoFocus required value={property.value} onChange={(e: any) => property.onChange(e.target.value)} />
                  </FormControl>
                );
              })}
              <Button type="submit">Submit</Button>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </React.Fragment>
  );
}