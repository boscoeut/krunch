import Box from '@mui/joy/Box';
import Table from '@mui/joy/Table';
import Link from '@mui/joy/Link';
import KSheet from './KSheet';
import PageHeader from './PageHeader';
import {useKrunchStore} from '../hooks/useKrunchStore';
import { MARKETS } from 'utils/dist/constants';
export default function Contracts() {

    const {  } = useKrunchStore((state) => ({
        
    }))

    type Contract = {
        name: string,
        address: string,
        link: string
    }

    const explorer = 'https://explorer.solana.com'
    const allContracts:Array<Contract> = MARKETS.map(map=> {return { 
        name: `${map.name}`,
        address: map.feedAddress,
        link: `${explorer}address/${map.feedAddress}`
       }})
   

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
                            <th>Type</th>
                            <th>Address</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allContracts.map(c => {
                            return <tr key={c.name}>
                                <td>{c.name}</td>
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