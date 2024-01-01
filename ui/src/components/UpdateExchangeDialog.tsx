/* eslint-disable jsx-a11y/anchor-is-valid */
import Button from '@mui/joy/Button';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Modal from '@mui/joy/Modal';
import Input from '@mui/joy/Input';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Stack from '@mui/joy/Stack';
import Switch from '@mui/joy/Switch';
import * as React from 'react';
import { AMOUNT_DECIMALS, EXCHANGE_LEVERAGE, REWARD_FREQUENCY, REWARD_RATE, SLOTS_PER_DAY } from "utils/dist/constants";
import { useKrunchStore } from "../hooks/useKrunchStore";
import { FormHelperText } from '@mui/joy';

export interface UpdateExchangeDialogProps {
    open: boolean;
    setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function UpdateExchangeDialog({ open, setOpen }: UpdateExchangeDialogProps) {

    const [submitting, setSubmitting] = React.useState(false);
    const updateExchange = useKrunchStore((state: any) => state.updateExchange)
    const exchange = useKrunchStore((state: any) => state.exchange)
    const [testMode, setTestMode] = React.useState(exchange.testMode as boolean || false);
    let slotsIn24Hours = REWARD_FREQUENCY;
    const [rewardFrequency, setRewardFrequency] = React.useState(slotsIn24Hours);
    const [rewardRate, setRewardRate] = React.useState(REWARD_RATE/ AMOUNT_DECIMALS);
    const [leverage, setLeverage] = React.useState(EXCHANGE_LEVERAGE);

    const handleSubmit = async () => {
        try {
            setSubmitting(true)
            await updateExchange(testMode, rewardRate * AMOUNT_DECIMALS, rewardFrequency, leverage)
        } catch (e) {
            console.log("error", e);
        } finally {
            setSubmitting(false)
        }
    };

    return (
        <React.Fragment>
            <Modal open={open} onClose={() => setOpen(false)}>
                <ModalDialog>
                    <ModalClose />
                    <DialogTitle>Update Exchange</DialogTitle>
                    <DialogContent>Enter Exchange Details</DialogContent>
                    <form
                        onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
                            event.preventDefault();
                            await handleSubmit();
                        }}
                    >
                        <Stack spacing={2}>
                            <FormControl>
                                <FormLabel>Test Mode? <Switch sx={{ paddingLeft: 2 }}
                                    checked={testMode}
                                    onChange={() => setTestMode(!testMode)}></Switch> </FormLabel>
                            </FormControl>
                            <FormControl>
                                <FormLabel>Reward Rate</FormLabel>
                                <Input required value={rewardRate} onChange={(e: any) => setRewardRate(e.target.value)} />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Reward Frequency</FormLabel>
                                <Input required value={rewardFrequency} onChange={(e: any) => setRewardFrequency(e.target.value)} />
                                <FormHelperText>{Number(Number(rewardFrequency)/SLOTS_PER_DAY).toFixed(4)} = {rewardFrequency} / SLOTS_PER_DAY ({SLOTS_PER_DAY})</FormHelperText>
                            </FormControl>
                            <FormControl>
                                <FormLabel>Leverage</FormLabel>
                                <Input required value={leverage} onChange={(e: any) => setLeverage(e.target.value)} />
                            </FormControl>
                            <Button disabled={submitting} type="submit">{submitting ? 'Submitting...' : 'Submit'}</Button>
                        </Stack>
                    </form>
                </ModalDialog>
            </Modal>
        </React.Fragment>
    );
}