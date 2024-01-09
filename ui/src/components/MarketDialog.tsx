/* eslint-disable jsx-a11y/anchor-is-valid */
import Button from '@mui/joy/Button';
import Chip from '@mui/joy/Chip';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormControl from '@mui/joy/FormControl';
import FormHelperText from '@mui/joy/FormHelperText';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Stack from '@mui/joy/Stack';
import * as React from 'react';
import { FEE_DECIMALS, LEVERAGE_DECIMALS, MARKET_WEIGHT_DECIMALS, SOL_USD_FEED } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { ICONS } from '../utils';

export interface MarketDialogProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function MarketDialog({ open, setOpen }: MarketDialogProps) {
  const [name, setName] = React.useState('SOL');
  const [errorMessage, setErrorMessage] = React.useState('');
  const [marketIndex, setMarketIndex] = React.useState('1');
  const [marketWeight, setMarketWeight] = React.useState('1');
  const [leverage, setLeverage] = React.useState('10');
  const [takerFee, setTakerFee] = React.useState('0.02');
  const [makerFee, setMakerFee] = React.useState('0.01');
  const [feedAddress, setFeedAddress] = React.useState(SOL_USD_FEED.toString());
  const [submitting, setSubmitting] = React.useState(false);
  const updateMarket = useKrunchStore(state => state.updateMarket)
  const markets = useKrunchStore(state => state.markets)

  const closeDialog = () => {
    setSubmitting(false)
    setErrorMessage('')
    setOpen(false)
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      await updateMarket(name,
        Number(marketIndex),
        Number(marketWeight),
        Number(leverage),
        Number(takerFee),
        Number(makerFee),
        feedAddress)
      closeDialog()
    } catch (e: any) {
      setErrorMessage(e.message)
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

  const refresh = () => {
    const selectedMarket = markets.find((position) => position.name === name)
    if (selectedMarket) {
      setMarketIndex(selectedMarket.marketIndex.toString())
      setName(selectedMarket.name)
      setMarketWeight(`${(selectedMarket.marketWeight || 0) / MARKET_WEIGHT_DECIMALS}`)
      setLeverage(`${(selectedMarket.leverage || 0) / LEVERAGE_DECIMALS}`)
      setTakerFee(`${(selectedMarket.takerFee || 0) / FEE_DECIMALS}`)
      setMakerFee(`${(selectedMarket.makerFee || 0) / FEE_DECIMALS}`)
      setFeedAddress(selectedMarket.feedAddress.toString())
    } else {
      setMarketIndex('-1')
    }
  }

  return (
    <React.Fragment>
      <Modal open={open} onClose={() => closeDialog()}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Update Market</DialogTitle>
          <DialogContent>Enter Market Details <Chip onClick={refresh} color='success'>Refresh</Chip></DialogContent>
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
              {errorMessage && <FormControl error={!!errorMessage}>
                <FormHelperText>
                  <ICONS.INFO />
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