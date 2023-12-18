/* eslint-disable jsx-a11y/anchor-is-valid */
import * as anchor from "@coral-xyz/anchor";
import Button from '@mui/joy/Button';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Stack from '@mui/joy/Stack';
import * as React from 'react';
import { FEE_DECIMALS, LEVERAGE_DECIMALS, MARKET_WEIGHT_DECIMALS, PRICE_DECIMALS } from 'utils/dist/constants';
import { fetchAccount, findAddress } from "utils/dist/utils";
import useProgram from '../hooks/useProgram';
import { PublicKey } from "@solana/web3.js";

export interface MarketDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function MarketDialog({ open, setOpen }: MarketDialogProps) {
  const [name, setName] = React.useState('SOL');
  const [marketIndex, setMarketIndex] = React.useState('1');
  const [marketWeight, setMarketWeight] = React.useState('.1');
  const [leverage, setLeverage] = React.useState('1');
  const [takerFee, setTakerFee] = React.useState('0.2');
  const [makerFee, setMakerFee] = React.useState('0.1'); 
  const [feedAddress, setFeedAddress] = React.useState('716hFAECqotxcXcj8Hs8nr7AG6q9dBw2oX3k3M8V7uGq');
  const {getProgram} = useProgram();


  const handleSubmit = async () => {
    // Handle form submission here

    let accountExists = false;
    console.log('handleSubmit', marketIndex)
    const program = await getProgram(); // Replace 'getProgram' with the correct function name or define the 'getProgram' function.

    try{
      await fetchAccount(program,'market',['market', Number(marketIndex)])
      accountExists = true;
    }catch(x){
      // create account
    }
    if (accountExists){
      const tx = await program.methods.updateMarket(
        new anchor.BN(marketIndex),
        new anchor.BN(Number(makerFee) * FEE_DECIMALS),
        new anchor.BN(Number(takerFee) * FEE_DECIMALS),
        new anchor.BN(Number(leverage) * LEVERAGE_DECIMALS),
        new anchor.BN(Number(marketWeight) * MARKET_WEIGHT_DECIMALS),
      ).accounts({
        market: await findAddress(program,['market', Number(marketIndex)]),
        exchange: await findAddress(program,['exchange'])
      }).rpc();
      console.log("updateMarket", tx);
      const acct: any = await fetchAccount(program,'market',
        ['market',Number(marketIndex)]);
      console.log('updateMarket', acct)
      setOpen(false)
    }else{
      const tx = await program.methods.addMarket(
        new anchor.BN(marketIndex),
        new anchor.BN(Number(makerFee) * FEE_DECIMALS),
        new anchor.BN(Number(takerFee) * FEE_DECIMALS),
        new anchor.BN(Number(leverage) * LEVERAGE_DECIMALS),
        new anchor.BN(Number(marketWeight) * MARKET_WEIGHT_DECIMALS),
        new PublicKey(feedAddress), 
      ).accounts({
        market: await findAddress(program,['market', Number(marketIndex)]),
        exchange: await findAddress(program,['exchange'])
      }).rpc();
      console.log("updateMarket", tx);
      const acct: any = await fetchAccount(program,'market',
        ['market',Number(marketIndex)]);
      console.log('updateMarket', acct)
      setOpen(false)
    }
  };

  const properties = [
    { label: 'Name', value: name, onChange: setName },
    { label: 'Index', value: marketIndex, onChange: setMarketIndex },
    { label: 'Weight', value: marketWeight, onChange: setMarketWeight },
    { label: 'Leverage', value: leverage, onChange: setLeverage },
    { label: 'Taker Fee', value: takerFee, onChange: setTakerFee },
    { label: 'Maker Fee', value: makerFee, onChange: setMakerFee },
    { label: 'Feed Address', value: feedAddress, onChange: setFeedAddress },
  ]

  return (
    <React.Fragment>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Update Market</DialogTitle>
          <DialogContent>Market Details</DialogContent>
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