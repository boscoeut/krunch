/* eslint-disable jsx-a11y/anchor-is-valid */
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
import { SOL_USD_FEED } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";

export interface MarketDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function MarketDialog({ open, setOpen }: MarketDialogProps) {
  const [name, setName] = React.useState('SOL');
  const [marketIndex, setMarketIndex] = React.useState('1');
  const [marketWeight, setMarketWeight] = React.useState('1');
  const [leverage, setLeverage] = React.useState('10');
  const [takerFee, setTakerFee] = React.useState('0.02');
  const [makerFee, setMakerFee] = React.useState('0.01');
  const [feedAddress, setFeedAddress] = React.useState(SOL_USD_FEED.toString());
  const [submitting, setSubmitting] = React.useState(false);
  const updateMarket = useKrunchStore(state => state.updateMarket)

  const handleSubmit = async () => {
    // Handle form submission here
    try {
      setSubmitting(true)
      await updateMarket(name,
        Number(marketIndex),
        Number(marketWeight),
        Number(leverage),
        Number(takerFee),
        Number(makerFee),
        feedAddress)
      setOpen(false)
    } catch (e) {
      console.log("error", e);
    } finally {
      setSubmitting(false)
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
              <Button disabled={submitting} type="submit">{submitting ? 'Submitting...' : 'Submit'}</Button>
            </Stack>
          </form>
        </ModalDialog>
      </Modal>
    </React.Fragment>
  );
}