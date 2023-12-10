import * as anchor from "@coral-xyz/anchor";
import useProgram from './useProgram';
import { sha256 } from "js-sha256"
import { PublicKey } from '@solana/web3.js';
const bs58 = require('bs58')

const useAccounts = () => {
    const { getProgram, getProvider } = useProgram();

    const decodeAccount = async (name: string, data: Buffer) => {
        const program = await getProgram();
        const acct = await program.coder.accounts.decode(name, Buffer.from(data))
        return acct;
    }


    function sighash(nameSpace: string, ixName: string): Buffer {
        let name = ixName;
        let preimage = `${nameSpace}:${name}`;
        return Buffer.from(sha256.digest(preimage)).slice(0, 8);
    }

    const lookupAccounts = async (type:string,publicKey?: PublicKey) => {
        const program = await getProgram();
        const provider = await getProvider();
        const ixBuffer = sighash('account', type)
        const filters = [
            {
                memcmp: {
                    offset: 0, // byte offset within the account's data
                    bytes: bs58.encode(ixBuffer)
                },
            }
        ];

        if (publicKey){
            filters.push({
                memcmp: {
                    offset: 8, // byte offset within the account's data
                    bytes: publicKey.toBase58()
                },
            })
        }

        const accounts = await provider.connection.getProgramAccounts(
            program.programId, {
            filters,
        });

        const decodedAccounts= await Promise.all(accounts.map(async (account) => {
            return await decodeAccount(type, account.account.data)
        }));

        console.log('decodedAccounts By Key '+type, decodedAccounts);  
        return decodedAccounts
    }

    return {
        decodeAccount,
        fetchAccount,
        lookupAccounts,
        findAddress,
        fetchOrCreateAccount
    };
};
export default useAccounts;
