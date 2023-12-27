/* eslint-disable jsx-a11y/anchor-is-valid */
import * as anchor from "@coral-xyz/anchor";
import Button from '@mui/joy/Button';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import { useKrunchStore } from "../hooks/useKrunchStore";
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


export interface ClaimDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function ClaimDialog({ open, setOpen }: ClaimDialogProps) {
  const [marketIndex, setMarketIndex] = React.useState('1');
  const [amount, setAmount] = React.useState('0.5');
  const [submitting, setSubmitting] = React.useState(false);
  const claimRewards = useKrunchStore((state: any) => state.claimRewards)
  const userRewardsAvailable = useKrunchStore(state => state.userRewardsAvailable)

  const handleSubmit = async () => {
    const market = MARKETS.find((market) => market.marketIndex === Number(marketIndex))
    const position = EXCHANGE_POSITIONS.find((position) => position.market === market?.name)
    try {
      setSubmitting(true)
      await claimRewards()
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
          <DialogTitle>Claim Rewards</DialogTitle>
          <DialogContent>Claim Krunch Rewards</DialogContent>
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
              <Button disabled={submitting} type="submit">{submitting ? 'Claiming Rewards..' : 'Claim Rewards'}</Button>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </React.Fragment>
  );
}