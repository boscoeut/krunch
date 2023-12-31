import Box from '@mui/joy/Box';
import Link from '@mui/joy/Link';
import Table from '@mui/joy/Table';
import Typography from '@mui/joy/Typography';
import { EXCHANGE_POSITIONS, MARKETS } from 'utils/dist/constants';
import { useKrunchStore } from '../hooks/useKrunchStore';
import idl from '../idl/krunch.json';
import SectionHeader from './SectionHeader';
import { NETWORK_EXPLORER } from 'utils/dist/constants';
export default function Contracts() {

    const appInfo = useKrunchStore(state => state.appInfo)

    type Contract = {
        name: string,
        address: string,
        link: string,
        type: string,
    }

    const explorer = NETWORK_EXPLORER
    const marketContracts: Array<Contract> = MARKETS.map(map => {
        return {
            name: `${map.name}`,
            address: map.feedAddress,
            type: 'Oracle Pride Feed',
            link: `${explorer}address/${map.feedAddress}`
        }
    })

    const exchangeContracts: Array<Contract> = EXCHANGE_POSITIONS.map(map => {
        return {
            name: `${map.market.replace('/USD', '')}`,
            address: map.mint.toString(),
            type: 'Token',
            link: `${explorer}address/${map.mint.toString()}`
        }
    })

    const allContracts = [{
        name: appInfo.appTitle,
        address: idl.metadata.address,
        type: 'Protocol',
        link: `${explorer}address/${idl.metadata.address}`
    }, ...marketContracts, ...exchangeContracts]

    return (
        <Box sx={{
            minHeight: 0,
            flexGrow: 1,
            overflow: 'hidden auto',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <Table aria-label="basic table">
                <thead>
                <tr>
                        <th colSpan={3}><SectionHeader title="Contracts" /></th>
                    </tr>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Address</th>
                    </tr>
                </thead>
                <tbody>
                    {allContracts.map(c => {
                        return <tr key={`${c.name}_${c.type}`}>
                            <td>{c.name}</td>
                            <td>{c.type}</td>
                            <td><Typography sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Link target="_blank" href={c.link} >{c.address}</Link></Typography></td>
                        </tr>
                    })}
                </tbody>
            </Table>

        </Box>
    )
} 