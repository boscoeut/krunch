/* eslint-disable jsx-a11y/anchor-is-valid */
import * as anchor from "@coral-xyz/anchor";
import Button from '@mui/joy/Button';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';

import Select from '@mui/joy/Select';
import Option from '@mui/joy/Option';
import Input from '@mui/joy/Input';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Stack from '@mui/joy/Stack';
import * as React from 'react';
import { AMOUNT_DECIMALS, CHAINLINK_PROGRAM, EXCHANGE_POSITIONS, MARKETS } from 'utils/dist/constants';
import { fetchOrCreateAccount, findAddress } from "utils/dist/utils";
import useProgram from '../hooks/useProgram';
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

  const properties = [
    { label: 'Index', value: marketIndex, onChange: setMarketIndex, type: 'markets' },
    { label: 'Amount', value: amount, onChange: setAmount, type: 'number' },
  ]

  return (
    <React.Fragment>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Trade</DialogTitle>
          <DialogContent>Trade Details.</DialogContent>
          <form
            onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              await handleSubmit();
            }}
          >
            <Stack spacing={2}>
              {properties.map((property) => {
                return (
                  <>
                    {property.type === 'markets' && <FormControl key={property.label}>
                      <FormLabel>{property.label}</FormLabel>
                      <Select value={`${property.value}`} onChange={(e: any, newValue: any) => {
                        property.onChange(newValue)
                      }}>
                        {MARKETS.map((position) => {
                          return <Option value={`${position.marketIndex}`} >{position.name}</Option>
                        })}
                      </Select>

                    </FormControl>}
                    {property.type === 'number' && <FormControl key={property.label}>
                      <FormLabel>{property.label}</FormLabel>
                      <Input autoFocus required value={property.value} onChange={(e: any) => property.onChange(e.target.value)} />
                    </FormControl>}
                  </>

                );
              })}
              <Button disabled={submitting} type="submit">{submitting ? 'Submitting...' : 'Submit'}</Button>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </React.Fragment>
  );
}