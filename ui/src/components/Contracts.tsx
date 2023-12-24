import Box from '@mui/joy/Box';
import Link from '@mui/joy/Link';
import Table from '@mui/joy/Table';
import { EXCHANGE_POSITIONS, MARKETS } from 'utils/dist/constants';
import { useKrunchStore } from '../hooks/useKrunchStore';
import idl from '../idl/krunch.json';
import KSheet from './KSheet';
export default function Contracts() {

    const appInfo = useKrunchStore(state => state.appInfo)

    type Contract = {
        name: string,
        address: string,
        link: string,
        type:string,
    }

    const explorer = 'https://explorer.solana.com/'
    const marketContracts:Array<Contract> = MARKETS.map(map=> {return { 
        name: `${map.name}`,
        address: map.feedAddress,
        type:'Oracle Pride Feed',
        link: `${explorer}address/${map.feedAddress}`
       }})
   
    const exchangeContracts:Array<Contract> = EXCHANGE_POSITIONS.map(map=> {return { 
        name: `${map.market}`,
        address: map.mint.toString(),
        type:'Token',
        link: `${explorer}address/${map.mint.toString()}`
       }})

    const allContracts=[{
        name:appInfo.appTitle,
        address: idl.metadata.address,    
        type:'Protocol',
        link: `${explorer}address/${idl.metadata.address}`
    },...marketContracts,...exchangeContracts]

    return (
        <Box
            sx={{
                flex: 1,
                width: '100%',
                p: 0,
            }}
        >
            <KSheet>
                <Table aria-label="basic table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Address</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allContracts.map(c => {
                            return <tr key={c.name}>
                                <td>{c.name}</td>
                                <td>{c.type}</td>
                                <td style={{
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}><Link target="_blank" href={c.link} >{c.address}</Link></td>
                            </tr>
                        })}
                    </tbody>
                </Table>
            </KSheet>
        </Box>
    )
} 