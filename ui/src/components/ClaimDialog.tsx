/* eslint-disable jsx-a11y/anchor-is-valid */
import Button from '@mui/joy/Button';
import DialogTitle from '@mui/joy/DialogTitle';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Stack from '@mui/joy/Stack';
import Typography from '@mui/joy/Typography';
import * as React from 'react';
import { AMOUNT_DECIMALS, SLOTS_PER_DAY } from 'utils/dist/constants';
import { useKrunchStore } from "../hooks/useKrunchStore";
import { formatCurrency } from '../utils';
import moment from 'moment';
import { FormControl, FormHelperText } from '@mui/joy';

export interface ClaimDialogProps {
    open: boolean;
    setOpen: React.Dispatch<React.SetStateAction<boolean>>; // Definition of setOpen prop    
}

export default function ClaimDialog({ open, setOpen }: ClaimDialogProps) {
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState('');
    const claimRewards = useKrunchStore((state: any) => state.claimRewards)
    const userAccount = useKrunchStore(state => state.userAccount)
    const nextRewardsClaimDate = useKrunchStore(state => state.nextRewardsClaimDate)
    const { appInfo } = useKrunchStore((state) => ({ appInfo: state.appInfo }))
    let color = appInfo.logoColor
    const userRewardsAvailable = useKrunchStore(state => state.userRewardsAvailable)
    let lastRewardsClaimed = 'Never'
    let nextRewardsClaim = 'Now'
    let hasClaimed = false
    if (userAccount.lastRewardsClaim?.toNumber() > 0) {
        lastRewardsClaimed = `${new Date(userAccount.lastRewardsClaim?.toNumber() * 1000).toLocaleDateString()} ${new Date(userAccount.lastRewardsClaim?.toNumber() * 1000).toLocaleTimeString()}`
        hasClaimed = true
    }

    let canClaim = true
    if (nextRewardsClaimDate && nextRewardsClaimDate > new Date()) {
        nextRewardsClaim = `${nextRewardsClaimDate.toLocaleDateString()} ${nextRewardsClaimDate.toLocaleTimeString()}`
        canClaim = false
    }

    const closeDialog = () => { 
        setError('')
        setSubmitting(false)
        setOpen(false)
    }

    const handleSubmit = async () => {
        try {
            setError('')
            setSubmitting(true)
            await claimRewards()
            closeDialog()
        } catch (e: any) {
            console.log("error", e);
            setSubmitting(false)
            setError(e.message)
        } finally {
            setSubmitting(false)
        }
    };
    return (
        <React.Fragment>
            <Modal open={open} onClose={() => closeDialog()}>
                <ModalDialog>
                    <ModalClose />
                    <DialogTitle></DialogTitle>
                    {/* <DialogContent>Claim Krunch Rewards</DialogContent> */}
                    <form
                        onSubmit={async (event: React.FormEvent<HTMLFormElement>) => {
                            event.preventDefault();
                            await handleSubmit();
                        }}
                    >
                        <Stack spacing={2}>
                            <Typography textAlign={'center'} level='h4' sx={{ textTransform: 'capitalize', fontFamily: 'BrunoAceSC' }}>Claimable Rewards</Typography>
                            <Typography textAlign={'center'}
                                level='h1' fontSize={48}
                                sx={{ textTransform: 'capcapitalize', color: color, fontFamily: 'BrunoAceSC' }}>{formatCurrency(userRewardsAvailable / AMOUNT_DECIMALS)}</Typography>
                            {hasClaimed && <Typography textAlign={'center'}>Rewards Last Claimed On: {lastRewardsClaimed}</Typography>}
                            {!canClaim && <Typography textAlign={'center'}>Next Rewards Claim: {nextRewardsClaim}</Typography>}
                            {!canClaim && <Typography style={{ color: appInfo.logoColor }} textAlign={'center'}>Claim {moment(nextRewardsClaimDate).fromNow(false)}</Typography>}
                            <FormControl sx={{display:!!error?'inherit':'none'}} error={!!error}>
                                <FormHelperText>
                                   {error}
                                </FormHelperText>
                            </FormControl>
                            <Button disabled={submitting || !canClaim} type="submit">{submitting ? 'Claiming Rewards...' : 'Claim Rewards'}</Button>
                        </Stack>
                    </form>
                </ModalDialog>
            </Modal>
        </React.Fragment>
    );
}