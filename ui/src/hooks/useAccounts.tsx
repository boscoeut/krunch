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

    const fetchAccount = async (name: string, seeds: Array<String|PublicKey|Number>) => {
        const program = await getProgram();
        const address = await findAddress(seeds);
        console.log('fetchAccount',name)
        const acct = await program.account[name].fetch(address);
        return acct;
    }

    const fetchOrCreateAccount = async (name: string, 
        seeds: Array<String|PublicKey|Number>, 
        createMethod:string,
        args:Array<any>,
        additionalAccounts?:any) => {
        const program = await getProgram();
        const address = await findAddress(seeds);
        try {
            const acct = await program.account[name].fetch(address);
            return acct;
        } catch (err) {
            console.log("Account not found: ", err);
            console.log('Initializing '+name);
            const accounts = {[name]:address,...(additionalAccounts || {}),}
            console.log('Initializing accounts '+JSON.stringify(accounts));
            const tx = await program?.methods[createMethod](...args).accounts(accounts).rpc();
            console.log("fetchOrCreateAccount", tx);
            return await program.account[name].fetch(address);
        }
    }

    const findAddress = async (args: Array<String|PublicKey|Number>) => {
        const buffer = args.map((arg) => {
            if (typeof arg === 'string') {
                return Buffer.from(arg)
            }else if (arg instanceof PublicKey) {
                return arg.toBuffer()
            }else if (typeof arg === 'number') {
                return new anchor.BN(arg.toString()).toArrayLike(Buffer, "le", 2)
            }else {
                console.log("invalid type", arg)    
                throw new Error("invalid type")
            }
        });
        const program = await getProgram();
        const [account] =
            await anchor.web3.PublicKey.findProgramAddress(
                buffer,
                program.programId as any
            );
       return account
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
