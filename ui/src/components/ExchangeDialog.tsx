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
import { PublicKey } from "@solana/web3.js";
import * as React from 'react';
import { CHAINLINK_PROGRAM, EXCHANGE_POSITIONS,AMOUNT_DECIMALS } from "utils/dist/constants";
import { findAddress } from "utils/dist/utils";
import useProgram from '../hooks/useProgram';
const { getOrCreateAssociatedTokenAccount } = require("@solana/spl-token");

export interface ExchangeDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function ExchangeDialog({ open, setOpen }: ExchangeDialogProps) {
  const [market, setMarket] = React.useState('USDC/USD');
  const [amount, setAmount] = React.useState('-1000');
  const { getProgram, getProvider } = useProgram();

  const handleSubmit = async () => {
    const position = EXCHANGE_POSITIONS.find((position) => position.market === market)
    
    if (position) {
      console.log("position", position);
      const program = await getProgram(); // Replace 'getProgram' with the correct function name or define the 'getProgram' function.
      const provider = await getProvider(); // Replace 'getProgram' with the correct function name or define the 'getProgram' function.
  
      let tokenAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection, //connection
        provider.wallet.publicKey, //payer
        position.mint, //mint
        provider.wallet.publicKey, //owner
      )

      const exchangeAddress = await findAddress(program, ['exchange'])
      const escrowAccount = await findAddress(program, [
        exchangeAddress,
        position.mint])

      const transactionAmount = Number(amount) * AMOUNT_DECIMALS
      console.log("transactionAmount", transactionAmount);

      const method = transactionAmount > 0 ? 'exchangeDeposit' : 'exchangeWithdraw'

      const tx = await program.methods[method](
        new anchor.BN(Math.abs(transactionAmount))
      ).accounts({
        userTokenAccount: new PublicKey(tokenAccount.address.toString()),
        mint: position.mint,
        exchange: exchangeAddress,
        escrowAccount,
        exchangeTreasuryPosition: await findAddress(program, ['exchange_position', position.mint]),
        owner: provider.wallet.publicKey,
        chainlinkFeed: position.feedAddress,
        chainlinkProgram: CHAINLINK_PROGRAM,
      }).rpc();
      console.log("transactionAmount tx", tx);
      setOpen(false)
    }
  };

  const properties = [
    { label: 'Amount', value: amount, onChange: setAmount },
    { label: 'Market', value: market, onChange: setMarket },
  ]

  return (
    <React.Fragment>
      <Modal open={open} onClose={() => setOpen(false)}>
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