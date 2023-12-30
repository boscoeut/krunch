/* eslint-disable jsx-a11y/anchor-is-valid */
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Stack from '@mui/joy/Stack';
import Switch from '@mui/joy/Switch';
import * as React from 'react';
import { useKrunchStore } from "../hooks/useKrunchStore";
// icons


export interface UpdateExchangeDialogProps {
    open: boolean;
    setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function UpdateExchangeDialog({ open, setOpen }: UpdateExchangeDialogProps) {

    const [submitting, setSubmitting] = React.useState(false);
    const updateExchange = useKrunchStore((state: any) => state.updateExchange)
    const exchange = useKrunchStore((state: any) => state.exchange)
    const [testMode, setTestMode] = React.useState(exchange.testMode as boolean || false);

    const handleSubmit = async () => {
        try {
            setSubmitting(true)
            await updateExchange(testMode)
        } catch (e) {
            console.log("error", e);
        } finally {
            setSubmitting(false)
        }
    };

    const properties = [
        { label: 'In Test Mode', value: testMode, onChange: setTestMode, type: 'boolean' },
    ]

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


                            {properties.map((property) => {
                                return (
                                    <Box key={property.label}>
                                        {property.type === 'boolean' && <FormControl key={property.label}>
                                            <FormLabel>{property.label} <Switch sx={{ paddingLeft: 2 }} checked={property.value} onChange={() => setTestMode(!property.value)}></Switch> </FormLabel>

                                        </FormControl>}
                                    </Box>
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