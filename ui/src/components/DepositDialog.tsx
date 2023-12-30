/* eslint-disable jsx-a11y/anchor-is-valid */
import * as anchor from "@coral-xyz/anchor";
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
import { PublicKey } from "@solana/web3.js";
import * as React from 'react';
import { AMOUNT_DECIMALS, CHAINLINK_PROGRAM, EXCHANGE_POSITIONS } from "utils/dist/constants";
import { findAddress } from "utils/dist/utils";
import { useKrunchStore } from "../hooks/useKrunchStore";
import useProgram from '../hooks/useProgram';
import { renderItem } from '../utils';

const { getOrCreateAssociatedTokenAccount } = require("@solana/spl-token");
// icons


export interface DepositDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function DepositDialog({ open, setOpen }: DepositDialogProps) {
  const [market, setMarket] = React.useState('USDC/USD');
  const [amount, setAmount] = React.useState('1000');
  const [submitting, setSubmitting] = React.useState(false);
  const { getProgram, getProvider } = useProgram();

  const userBalances = useKrunchStore(state => state.userBalances)

  const selectedMarket = userBalances.find((position) => position.market === market)
  const selectedBalance = (selectedMarket?.balance || 0) / (10 ** (selectedMarket?.decimals || 1))

  const handleSubmit = async () => {
    const position = EXCHANGE_POSITIONS.find((position) => position.market === market)

    try {
      setSubmitting(true)
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

        const method = transactionAmount > 0 ? 'deposit' : 'withdraw'
        console.log(`{${method} of ${position.mint} `);

        const tx = await program.methods[method](
          new anchor.BN(Math.abs(transactionAmount))
        ).accounts({
          userTokenAccount: new PublicKey(tokenAccount.address.toString()),
          mint: position.mint,
          exchange: exchangeAddress,
          escrowAccount,
          userAccount: await findAddress(program, ['user_account', provider.wallet.publicKey]),
          exchangeTreasuryPosition: await findAddress(program, ['exchange_position', position.mint]),
          owner: provider.wallet.publicKey,
          chainlinkFeed: position.feedAddress,
          chainlinkProgram: CHAINLINK_PROGRAM,
        }).rpc();
        console.log("transactionAmount tx", tx);
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
                          return <Option key={position.market} value={position.market} >{position.market}</Option>
                        })}
                      </Select>

                    </FormControl>}
                    {property.type === 'number' && <FormControl key={property.label} error={!canSubmit}>
                      <FormLabel>{property.label}</FormLabel>
                      <Input 
                        autoFocus required
                        value={property.value}
                        onChange={(e: any) => property.onChange(e.target.value)} />
                      {!canSubmit && <FormHelperText>
                        <InfoOutlined />
                        {errorMessage}
                      </FormHelperText>}
                    </FormControl>}
                  </Box>
                );
              })}

              <Table>
                <thead>
                  <tr>
                    <th style={{ width: 225 }}>Token</th>
                    <th>Available to Deposit</th>
                  </tr>
                </thead>
                <tbody>
                  {userBalances.map((item) => {
                    const amount = item.balance !== 0 ? renderItem(item.balance || 0, 10 ** item.decimals) : 0
                    return (
                      <tr key={item.market}>
                        <td>{item.market}</td>
                        <td>{amount}</td>
                      </tr>
                    )
                  })}
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