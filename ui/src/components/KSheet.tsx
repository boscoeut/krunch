import Sheet from '@mui/joy/Sheet';

export default function Account({children,hidden=false}:{children:any,hidden?:boolean}) {
    return (
        <>
        {!hidden && <Sheet  variant='outlined' sx={{ p: 1, borderRadius:10 }}>{children}</Sheet> }
        </>
    )
} 